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

export interface ReservationPayment {
  id: string
  reservation_id: string
  payment_type: 'deposit' | 'final'
  amount: number
  received_by: string
  created_at: string
  received_by_profile?: { full_name: string } | null
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
  payments: ReservationPayment[]
  created_by_profile?: { full_name: string } | null
  completed_by_profile?: { full_name: string } | null
}

// Payment row for the manager Payment History report — same shape as
// ReservationPayment, plus the customer name and payment method pulled
// from the parent reservation (needed for the report table/filters
// without re-fetching every reservation).
export interface ReservationPaymentWithDetails extends ReservationPayment {
  reservation?: {
    customer_name: string
    payment_method: 'cash' | 'online' | null
  } | null
}

export interface NewReservationItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
}

// =============================================
// CREATE RESERVATION
// Booking + items + deposit payment record are created atomically via
// the create_reservation_with_deposit() Postgres function, so the
// deposit is recorded the moment the order is placed — never only at
// pickup. payment_method is fixed here and reused for the final payment
// at pickup, since both payments always use the same method.
// =============================================

export async function createReservation(
  items: NewReservationItem[],
  customerName: string,
  createdBy: string,
  paymentMethod: 'cash' | 'online',
  options: {
    customerPhone?: string
    neededBy?: string
    notes?: string
  } = {}
): Promise<ReservationWithDetails> {
  if (!items || items.length === 0) throw new Error('At least one item is required')

  const { data: reservationId, error } = await supabase.rpc(
    'create_reservation_with_deposit',
    {
      p_customer_name: customerName,
      p_customer_phone: options.customerPhone || null,
      p_needed_by: options.neededBy || null,
      p_notes: options.notes || null,
      p_payment_method: paymentMethod,
      p_created_by: createdBy,
      p_items: items.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
    }
  )

  if (error) throw new Error(error.message || 'Failed to create reservation')

  return getReservationById(reservationId as string) as Promise<ReservationWithDetails>
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
      payments:reservation_payments (
        *,
        received_by_profile:profiles!reservation_payments_received_by_fkey (full_name)
      ),
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
      payments:reservation_payments (
        *,
        received_by_profile:profiles!reservation_payments_received_by_fkey (full_name)
      ),
      created_by_profile:profiles!reservations_created_by_fkey (full_name),
      completed_by_profile:profiles!reservations_completed_by_fkey (full_name)
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data as unknown as ReservationWithDetails
}

// =============================================
// GET UPCOMING RESERVATIONS
// Reservations with a needed_by date that aren't finished yet (pending or
// ready) — used by the production alarm hook and the production dashboard
// to surface pickups that are coming due. Ordered soonest-first.
// =============================================

export async function getUpcomingReservations(): Promise<ReservationWithDetails[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      items:reservation_items (*),
      payments:reservation_payments (
        *,
        received_by_profile:profiles!reservation_payments_received_by_fkey (full_name)
      ),
      created_by_profile:profiles!reservations_created_by_fkey (full_name),
      completed_by_profile:profiles!reservations_completed_by_fkey (full_name)
    `)
    .in('status', ['pending', 'ready'])
    .not('needed_by', 'is', null)
    .order('needed_by', { ascending: true })

  if (error) throw error
  return (data as unknown as ReservationWithDetails[]) || []
}

// =============================================
// GET RESERVATION PAYMENT HISTORY (manager reporting)
// Every reservation_payments row (deposit + final) whose created_at falls
// within [startIso, endIso], joined with the receiving cashier's name and
// the parent reservation's customer name / payment method. Powers the
// manager-facing Payment History tab: date-range reconciliation, per-
// cashier breakdown, and CSV export. startIso/endIso must be full ISO
// timestamps (the caller is responsible for turning a date-only picker
// value into a Manila-local day boundary before calling this).
// =============================================

export async function getReservationPaymentHistory(
  startIso: string,
  endIso: string
): Promise<ReservationPaymentWithDetails[]> {
  const { data, error } = await supabase
    .from('reservation_payments')
    .select(`
      *,
      received_by_profile:profiles!reservation_payments_received_by_fkey (full_name),
      reservation:reservations (customer_name, payment_method)
    `)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as ReservationPaymentWithDetails[]) || []
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
// Note: deposit payment history is preserved (not deleted) — cancelling
// does not erase the record that money was received. Refunding it, if
// applicable, is a separate manual step (e.g. a cash_out entry).
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
// Delegates to the complete_reservation_pickup() Postgres function so
// that recording the final payment, creating the sale + sale_items,
// deducting stock, and marking the reservation completed all happen in
// a single atomic transaction — no partial-failure or race conditions.
// The payment method is not asked again here: it's fixed at booking.
// =============================================

export async function completeReservationPickup(
  reservationId: string,
  completedBy: string
): Promise<void> {
  const { error } = await supabase.rpc('complete_reservation_pickup', {
    p_reservation_id: reservationId,
    p_completed_by: completedBy,
  })

  if (error) throw new Error(error.message || 'Failed to complete pickup')
}