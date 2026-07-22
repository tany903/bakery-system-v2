import { supabase } from './supabase'

export interface ReservationItem {
  id: string
  reservation_id: string
  product_id: string
  product_name_snapshot: string
  quantity: number
  unit_price_snapshot: number
  subtotal: number
  created_at: string
}

export interface ReservationWithDetails {
  id: string
  customer_name: string
  customer_phone: string | null
  status: 'pending' | 'ready' | 'completed' | 'cancelled'
  needed_by: string | null
  total_amount: number
  fee_amount: number
  balance_amount: number
  payment_method: 'cash' | 'online' | null
  notes: string | null
  created_by: string | null
  completed_by: string | null
  completed_at: string | null
  sale_id: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  items: ReservationItem[]
  created_by_profile?: { full_name: string } | null
  completed_by_profile?: { full_name: string } | null
}

export interface NewReservationItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
}

// =============================================
// CREATE RESERVATION (fee collected now, at booking)
// =============================================

export async function createReservation(
  items: NewReservationItem[],
  customerName: string,
  createdBy: string,
  options: {
    customerPhone?: string
    neededBy?: string
    notes?: string
  } = {}
): Promise<ReservationWithDetails> {
  if (!items || items.length === 0) throw new Error('At least one item is required')

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const feeAmount = Math.round(totalAmount * 0.5 * 100) / 100
  const balanceAmount = Math.round((totalAmount - feeAmount) * 100) / 100

  const { data: reservation, error: resError } = await supabase
    .from('reservations')
    .insert({
      customer_name: customerName,
      customer_phone: options.customerPhone || null,
      status: 'pending',
      needed_by: options.neededBy || null,
      total_amount: totalAmount,
      fee_amount: feeAmount,
      balance_amount: balanceAmount,
      notes: options.notes || null,
      created_by: createdBy,
    })
    .select()
    .single()

  if (resError) throw resError

  const itemRows = items.map(item => ({
    reservation_id: reservation.id,
    product_id: item.product_id,
    product_name_snapshot: item.product_name,
    quantity: item.quantity,
    unit_price_snapshot: item.unit_price,
    subtotal: item.quantity * item.unit_price,
  }))

  const { error: itemsError } = await supabase
    .from('reservation_items')
    .insert(itemRows)

  if (itemsError) {
    await supabase.from('reservations').delete().eq('id', reservation.id)
    throw itemsError
  }

  return getReservationById(reservation.id) as Promise<ReservationWithDetails>
}

// =============================================
// GET RESERVATIONS
// =============================================

export async function getAllReservations(): Promise<ReservationWithDetails[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      items:reservation_items (*),
      created_by_profile:profiles!reservations_created_by_fkey (full_name),
      completed_by_profile:profiles!reservations_completed_by_fkey (full_name)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as ReservationWithDetails[]) || []
}

export async function getReservationById(id: string): Promise<ReservationWithDetails | null> {
  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      items:reservation_items (*),
      created_by_profile:profiles!reservations_created_by_fkey (full_name),
      completed_by_profile:profiles!reservations_completed_by_fkey (full_name)
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data as unknown as ReservationWithDetails
}

// =============================================
// MARK READY (production — informational only, no stock movement)
// =============================================

export async function markReservationReady(id: string): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// =============================================
// CANCEL RESERVATION
// =============================================

export async function cancelReservation(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('reservations')
    .update({
      status: 'cancelled',
      cancellation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

// =============================================
// COMPLETE PICKUP
// Collects the remaining balance, creates the REAL sale (full amount),
// deducts inventory, and only NOW does this hit cash register / analytics.
// =============================================

export async function completeReservationPickup(
  reservationId: string,
  paymentMethod: 'cash' | 'online',
  completedBy: string
): Promise<void> {
  const reservation = await getReservationById(reservationId)
  if (!reservation) throw new Error('Reservation not found')
  if (reservation.status === 'completed') throw new Error('Reservation already completed')
  if (reservation.status === 'cancelled') throw new Error('Reservation was cancelled')

  // 1. Create the actual sale for the FULL order amount (fee + balance)
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      payment_method: paymentMethod,
      total_amount: reservation.total_amount,
      cashier_id: completedBy,
    })
    .select()
    .single()

  if (saleError || !sale) throw new Error('Failed to create sale')

  const saleItems = reservation.items.map(item => ({
    sale_id: sale.id,
    product_id: item.product_id,
    product_name: item.product_name_snapshot,
    quantity: item.quantity,
    unit_price: item.unit_price_snapshot,
    original_price: item.unit_price_snapshot,
    subtotal: item.subtotal,
    is_old_stock: false,
    discount_pct: 0,
  }))

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(saleItems)

  if (itemsError) {
    await supabase.from('sales').delete().eq('id', sale.id)
    throw new Error('Failed to create sale items')
  }

  // 2. Deduct inventory now (stock reserved conceptually, but only moved at pickup)
  for (const item of reservation.items) {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', item.product_id)
      .single()

    if (productError || !product) throw new Error(`Product not found for ${item.product_name_snapshot}`)

    const newStock = product.shop_current_stock - item.quantity
    if (newStock < 0) {
      throw new Error(`Insufficient stock for ${item.product_name_snapshot}. Available: ${product.shop_current_stock}`)
    }

    await supabase
      .from('products')
      .update({ shop_current_stock: newStock })
      .eq('id', item.product_id)

    await supabase.from('inventory_transactions').insert({
      product_id: item.product_id,
      transaction_type: 'sale',
      location: 'shop',
      quantity_before: product.shop_current_stock,
      quantity_change: -item.quantity,
      quantity_after: newStock,
      notes: `Reservation pickup — ${reservation.customer_name}`,
      reference_id: sale.id,
      performed_by: completedBy,
    })
  }

  // 3. Mark reservation completed and link the sale
  const { error: updateError } = await supabase
    .from('reservations')
    .update({
      status: 'completed',
      payment_method: paymentMethod,
      completed_by: completedBy,
      completed_at: new Date().toISOString(),
      sale_id: sale.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)

  if (updateError) throw updateError
}