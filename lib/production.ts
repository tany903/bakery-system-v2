import { supabase } from './supabase'
import type { Production, Product } from './supabase'

export interface ProductionWithDetails extends Production {
  products: Product
  produced_by_profile: { full_name: string }
}

export interface ProductionStats {
  totalProduced: number
  uniqueProducts: number
  productionSessions: number
  mostProducedProduct: { name: string; quantity: number } | null
}

export async function recordProduction(
  productId: string,
  quantity: number,
  producedBy: string,
  notes?: string
): Promise<Production> {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (productError || !product) throw new Error('Product not found')

  const newStock = product.production_current_stock + quantity

  const { error: updateError } = await supabase
    .from('products')
    .update({ production_current_stock: newStock })
    .eq('id', productId)

  if (updateError) throw updateError

  const { data: productionRecord, error: productionError } = await supabase
    .from('production')
    .insert({
      product_id: productId,
      quantity_produced: quantity,
      produced_by: producedBy,
      notes: notes || null,
    })
    .select()
    .single()

  if (productionError) throw productionError

  await supabase.from('inventory_transactions').insert({
    product_id: productId,
    transaction_type: 'production',
    location: 'production',
    quantity_before: product.production_current_stock,
    quantity_change: quantity,
    quantity_after: newStock,
    notes: notes || 'Production recorded',
    performed_by: producedBy,
  })

  return productionRecord
}

export async function getAllProductionRecords(): Promise<ProductionWithDetails[]> {
  const { data, error } = await supabase
    .from('production')
    .select('*, products (*), produced_by_profile:profiles!production_produced_by_fkey (full_name)')
    .order('production_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getTodaysProductionRecords(): Promise<ProductionWithDetails[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('production')
    .select('*, products (*), produced_by_profile:profiles!production_produced_by_fkey (full_name)')
    .gte('production_date', today.toISOString())
    .order('production_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getProductionByDateRange(
  startDate: Date,
  endDate: Date
): Promise<ProductionWithDetails[]> {
  const { data, error } = await supabase
    .from('production')
    .select('*, products (*), produced_by_profile:profiles!production_produced_by_fkey (full_name)')
    .gte('production_date', startDate.toISOString())
    .lte('production_date', endDate.toISOString())
    .order('production_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getTodaysProductionStats(): Promise<ProductionStats> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: records, error } = await supabase
    .from('production')
    .select('*, products (name)')
    .gte('production_date', today.toISOString())

  if (error) throw error

  const stats: ProductionStats = {
    totalProduced: 0,
    uniqueProducts: 0,
    productionSessions: records?.length || 0,
    mostProducedProduct: null,
  }

  if (!records || records.length === 0) return stats

  const productTotals: { [key: string]: { name: string; quantity: number } } = {}

  records.forEach((record: any) => {
    stats.totalProduced += record.quantity_produced
    const name = record.products?.name || 'Unknown'
    if (!productTotals[name]) productTotals[name] = { name, quantity: 0 }
    productTotals[name].quantity += record.quantity_produced
  })

  stats.uniqueProducts = Object.keys(productTotals).length

  const arr = Object.values(productTotals)
  if (arr.length > 0) {
    stats.mostProducedProduct = arr.reduce((prev, curr) => prev.quantity > curr.quantity ? prev : curr)
  }

  return stats
}
