import { supabase } from './supabase'
import type { RestockRequest, Product } from './supabase'

export interface RestockRequestItem {
  id: string
  restock_request_id: string
  product_id: string
  requested_quantity: number
  fulfilled_quantity?: number | null
  notes?: string | null
  created_at: string
  products?: Product & { categories: { id: string; name: string } | null }
}

export interface RestockRequestWithDetails extends Omit<RestockRequest, 'product_id' | 'requested_quantity' | 'fulfilled_quantity'> {
  items: RestockRequestItem[]
  requested_by_profile: { full_name: string }
  acknowledged_by_profile?: { full_name: string }
  fulfilled_by_profile?: { full_name: string }
  // Keep these for backward compat but they'll reflect totals
  requested_quantity: number
  fulfilled_quantity?: number | null
  delivery_date?: string | null
}

export interface NewRestockItem {
  product_id: string
  requested_quantity: number
  notes?: string
}

// =============================================
// CREATE RESTOCK REQUEST (multi-product)
// =============================================

export async function createRestockRequest(
  items: NewRestockItem[],
  request_type: 'auto_alert' | 'manual_order',
  requestedBy: string,
  notes?: string,
  delivery_date?: string
): Promise<RestockRequest> {
  if (!items || items.length === 0) throw new Error('At least one item is required')

  const totalRequested = items.reduce((sum, i) => sum + i.requested_quantity, 0)

  // Insert the parent request
  const { data: request, error: requestError } = await supabase
    .from('restock_requests')
    .insert({
      product_id: items.length === 1 ? items[0].product_id : null,
      request_type,
      requested_quantity: totalRequested,
      status: 'requested',
      requested_by: requestedBy,
      notes: notes || null,
      delivery_date: delivery_date || null,
    })
    .select()
    .single()

  if (requestError) {
    console.error('Supabase insert error:', JSON.stringify(requestError))
    throw requestError
  }

  // Insert items
  const itemRows = items.map(item => ({
    restock_request_id: request.id,
    product_id: item.product_id,
    requested_quantity: item.requested_quantity,
    notes: item.notes || null,
  }))

  const { error: itemsError } = await supabase
    .from('restock_request_items')
    .insert(itemRows)

  if (itemsError) {
    console.error('Items insert error:', JSON.stringify(itemsError))
    // Rollback parent
    await supabase.from('restock_requests').delete().eq('id', request.id)
    throw itemsError
  }

  return request
}

// =============================================
// AUTO-GENERATE REQUESTS FOR LOW STOCK
// =============================================

export async function autoGenerateLowStockRequests(
  requestedBy: string
): Promise<RestockRequest[]> {
  const { data: allProducts, error: productsError } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)

  if (productsError) throw productsError

  const lowStockProducts = allProducts?.filter(
    (product) => product.shop_current_stock < product.shop_minimum_threshold
  ) || []

  // Filter out products that already have a pending request
  const eligibleProducts: typeof lowStockProducts = []
  for (const product of lowStockProducts) {
    const { data: existingItem } = await supabase
      .from('restock_request_items')
      .select('id, restock_requests!inner(status)')
      .eq('product_id', product.id)
      .in('restock_requests.status', ['requested', 'acknowledged', 'in_progress'])
      .maybeSingle()

    if (!existingItem) eligibleProducts.push(product)
  }

  if (eligibleProducts.length === 0) return []

  const items: NewRestockItem[] = eligibleProducts.map(product => ({
    product_id: product.id,
    requested_quantity: product.shop_minimum_threshold - product.shop_current_stock,
    notes: 'Auto-generated: Stock below minimum threshold',
  }))

  const request = await createRestockRequest(
    items,
    'auto_alert',
    requestedBy,
    'Auto-generated batch for low stock items'
    // no delivery_date for auto-generated
  )

  return [request]
}

// =============================================
// GET RESTOCK REQUESTS
// =============================================

export async function getAllRestockRequests(): Promise<RestockRequestWithDetails[]> {
  const { data, error } = await supabase
    .from('restock_requests')
    .select(`
      *,
      items:restock_request_items (
        *,
        products (
          *,
          categories (id, name)
        )
      ),
      requested_by_profile:profiles!restock_requests_requested_by_fkey (full_name),
      acknowledged_by_profile:profiles!restock_requests_acknowledged_by_fkey (full_name),
      fulfilled_by_profile:profiles!restock_requests_fulfilled_by_fkey (full_name)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as unknown as RestockRequestWithDetails[]
}

export async function getPendingRestockRequests(): Promise<RestockRequestWithDetails[]> {
  const { data, error } = await supabase
    .from('restock_requests')
    .select(`
      *,
      items:restock_request_items (
        *,
        products (
          *,
          categories (id, name)
        )
      ),
      requested_by_profile:profiles!restock_requests_requested_by_fkey (full_name),
      acknowledged_by_profile:profiles!restock_requests_acknowledged_by_fkey (full_name),
      fulfilled_by_profile:profiles!restock_requests_fulfilled_by_fkey (full_name)
    `)
    .in('status', ['requested', 'acknowledged', 'in_progress'])
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as unknown as RestockRequestWithDetails[]
}

export async function getRestockRequestsByStatus(
  status: 'requested' | 'acknowledged' | 'in_progress' | 'fulfilled' | 'partially_fulfilled' | 'declined'
): Promise<RestockRequestWithDetails[]> {
  const { data, error } = await supabase
    .from('restock_requests')
    .select(`
      *,
      items:restock_request_items (
        *,
        products (
          *,
          categories (id, name)
        )
      ),
      requested_by_profile:profiles!restock_requests_requested_by_fkey (full_name),
      acknowledged_by_profile:profiles!restock_requests_acknowledged_by_fkey (full_name),
      fulfilled_by_profile:profiles!restock_requests_fulfilled_by_fkey (full_name)
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as unknown as RestockRequestWithDetails[]
}

// =============================================
// UPDATE REQUEST STATUS
// =============================================

export async function acknowledgeRequest(
  requestId: string,
  acknowledgedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('restock_requests')
    .update({
      status: 'acknowledged',
      acknowledged_by: acknowledgedBy,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (error) throw error
}

export async function fulfillRequest(
  requestId: string,
  fulfilledQuantity: number,
  fulfilledBy: string,
  notes?: string,
  itemFulfillments?: { item_id: string; quantity: number }[]
): Promise<void> {
  const { data: request, error: requestError } = await supabase
    .from('restock_requests')
    .select('*, items:restock_request_items(*, products(*))')
    .eq('id', requestId)
    .single()

  if (requestError || !request) throw new Error('Request not found')

  const totalRequested = request.requested_quantity
  const status = fulfilledQuantity < totalRequested ? 'partially_fulfilled' : 'fulfilled'

  const { error: updateError } = await supabase
    .from('restock_requests')
    .update({
      status,
      fulfilled_quantity: fulfilledQuantity,
      fulfilled_by: fulfilledBy,
      completed_at: new Date().toISOString(),
      notes: notes || null,
    })
    .eq('id', requestId)

  if (updateError) throw updateError

  // Update item fulfilled quantities if provided
  if (itemFulfillments && itemFulfillments.length > 0) {
    for (const itemFulfill of itemFulfillments) {
      await supabase
        .from('restock_request_items')
        .update({ fulfilled_quantity: itemFulfill.quantity })
        .eq('id', itemFulfill.item_id)
    }
  }

  // Transfer stock for each item
  const items = (request as any).items || []
  for (const item of items) {
    let qtyToFulfill = item.requested_quantity
    if (itemFulfillments) {
      const match = itemFulfillments.find(f => f.item_id === item.id)
      if (match) qtyToFulfill = match.quantity
    }
    if (qtyToFulfill > 0) {
      await transferStockToShop(
        item.product_id,
        qtyToFulfill,
        fulfilledBy,
        `Restock request #${requestId.slice(0, 8)} fulfilled`
      )
    }
  }
}

export async function declineRequest(
  requestId: string,
  fulfilledBy: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('restock_requests')
    .update({
      status: 'declined',
      fulfilled_by: fulfilledBy,
      completed_at: new Date().toISOString(),
      notes: reason,
    })
    .eq('id', requestId)

  if (error) throw error
}

// =============================================
// STOCK TRANSFER HELPER
// =============================================

async function transferStockToShop(
  productId: string,
  quantity: number,
  transferredBy: string,
  notes: string
): Promise<void> {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (productError || !product) throw new Error('Product not found')

  if (product.production_current_stock < quantity) {
    throw new Error(`Insufficient production stock for "${product.name}". Available: ${product.production_current_stock}`)
  }

  const newProductionStock = product.production_current_stock - quantity
  const newShopStock = product.shop_current_stock + quantity

  const { error: updateError } = await supabase
    .from('products')
    .update({
      production_current_stock: newProductionStock,
      shop_current_stock: newShopStock,
    })
    .eq('id', productId)

  if (updateError) throw updateError

  await supabase.from('inventory_transactions').insert({
    product_id: productId,
    transaction_type: 'transfer',
    location: 'production',
    quantity_before: product.production_current_stock,
    quantity_change: -quantity,
    quantity_after: newProductionStock,
    notes: `${notes} (transfer out)`,
    performed_by: transferredBy,
  })

  await supabase.from('inventory_transactions').insert({
    product_id: productId,
    transaction_type: 'transfer',
    location: 'shop',
    quantity_before: product.shop_current_stock,
    quantity_change: quantity,
    quantity_after: newShopStock,
    notes: `${notes} (transfer in)`,
    performed_by: transferredBy,
  })
}

// =============================================
// GET REQUEST STATS
// =============================================

export interface RestockStats {
  total: number
  requested: number
  acknowledged: number
  inProgress: number
  fulfilled: number
  partial: number
  declined: number
}

export async function getRestockStats(): Promise<RestockStats> {
  const { data, error } = await supabase
    .from('restock_requests')
    .select('status')

  if (error) throw error

  const stats: RestockStats = {
    total: data?.length || 0,
    requested: 0,
    acknowledged: 0,
    inProgress: 0,
    fulfilled: 0,
    partial: 0,
    declined: 0,
  }

  data?.forEach((request) => {
    switch (request.status) {
      case 'requested':           stats.requested++;     break
      case 'acknowledged':        stats.acknowledged++;  break
      case 'in_progress':         stats.inProgress++;    break
      case 'fulfilled':           stats.fulfilled++;     break
      case 'partially_fulfilled': stats.partial++;       break
      case 'declined':            stats.declined++;      break
    }
  })

  return stats
}
