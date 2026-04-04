import { supabase } from './supabase'

export type DisposalType = 'pullout' | 'oth'
export type DisposalLocation = 'shop' | 'production'

export interface StockDisposal {
  id: string
  product_id: string
  type: DisposalType
  reason: string
  quantity: number
  location: DisposalLocation
  performed_by: string
  created_at: string
  products?: { name: string; price: number }
  profiles?: { full_name: string }
}

export interface DisposalStats {
  totalPullouts: number
  totalOTH: number
  totalLosses: number
  pulloutValue: number
  othValue: number
  totalLossValue: number
}

const PULLOUT_REASONS = [
  'Mold / spoiled',
  'Dropped / damaged',
  'Wrong bake',
  'Burnt',
  'Expired',
  'Other',
]

const OTH_REASONS = [
  'Customer goodwill',
  'Staff meal',
  'Sampling / tasting',
  'Complaint resolution',
  'Other',
]

export { PULLOUT_REASONS, OTH_REASONS }

export async function createDisposal(
  productId: string,
  type: DisposalType,
  reason: string,
  quantity: number,
  location: DisposalLocation,
  performedBy: string
): Promise<void> {
  // Get current product stock
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (productError || !product) throw new Error('Product not found')

  const stockField = location === 'shop' ? 'shop_current_stock' : 'production_current_stock'
  const currentStock = product[stockField]

  if (currentStock < quantity) throw new Error(`Only ${currentStock} units available`)

  const newStock = currentStock - quantity

  // Deduct stock
  const { error: updateError } = await supabase
    .from('products')
    .update({ [stockField]: newStock })
    .eq('id', productId)

  if (updateError) throw updateError

  // Log disposal
  const { error: disposalError } = await supabase
    .from('stock_disposals')
    .insert({
      product_id: productId,
      type,
      reason,
      quantity,
      location,
      performed_by: performedBy,
    })

  if (disposalError) throw disposalError

  // Log inventory transaction
  await supabase.from('inventory_transactions').insert({
    product_id: productId,
    transaction_type: type === 'pullout' ? 'pullout' : 'oth',
    location,
    quantity_before: currentStock,
    quantity_change: -quantity,
    quantity_after: newStock,
    notes: `${type === 'pullout' ? 'Pull-out' : 'On the house'}: ${reason}`,
    performed_by: performedBy,
  })
}

export async function getDisposalStats(startDate: Date, endDate: Date): Promise<DisposalStats> {
  const { data, error } = await supabase
    .from('stock_disposals')
    .select('*, products (name, price)')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  if (error) throw error

  const stats: DisposalStats = {
    totalPullouts: 0,
    totalOTH: 0,
    totalLosses: 0,
    pulloutValue: 0,
    othValue: 0,
    totalLossValue: 0,
  }

  ;(data || []).forEach(d => {
    const value = (d.products?.price || 0) * d.quantity
    if (d.type === 'pullout') {
      stats.totalPullouts += d.quantity
      stats.pulloutValue += value
    } else {
      stats.totalOTH += d.quantity
      stats.othValue += value
    }
  })

  stats.totalLosses = stats.totalPullouts + stats.totalOTH
  stats.totalLossValue = stats.pulloutValue + stats.othValue

  return stats
}

export async function getDisposalHistory(limit = 50): Promise<StockDisposal[]> {
  const { data, error } = await supabase
    .from('stock_disposals')
    .select('*, products (name, price), profiles (full_name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}
