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

// NOTE: these fetch functions exclude voided records (is_voided = false),
// matching the convention used throughout analytics.ts and cash-register.ts.
// The one place that intentionally needs raw, unfiltered production rows —
// the manager's Transactions page, to display voided entries with
// strikethrough styling and a "Voided" badge — queries Supabase directly and
// does not go through these functions, so this filter doesn't affect it.

export async function getAllProductionRecords(): Promise<ProductionWithDetails[]> {
  const { data, error } = await supabase
    .from('production')
    .select('*, products (*), produced_by_profile:profiles!production_produced_by_fkey (full_name)')
    .eq('is_voided', false)
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
    .eq('is_voided', false)
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
    .eq('is_voided', false)
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
    .eq('is_voided', false)

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

// =============================================
// FRESHNESS / LAPSE MONITORING
// =============================================

// A product is considered "lapsed" (past its freshness window) this many
// hours after its most recent logged production run — regardless of how
// much of that batch is still in stock. Used to flag pull-outs due to
// freshness rather than damage/spoilage/etc.
export const FRESHNESS_LAPSE_HOURS = 5

export interface FreshnessStatus {
  lapsed: boolean
  // Hours since the most recent production run, rounded to 1 decimal.
  // Null when the product has no production record at all (nothing to
  // measure freshness against).
  hoursSinceProduction: number | null
}

// Most recent (non-voided) production timestamp for a single product, or
// null if it has never been produced. Kept as a single-product lookup
// (rather than fetching all products) since it's only called on demand,
// right when the Pull-out modal opens for that product.
export async function getLatestProductionDate(productId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('production')
    .select('production_date')
    .eq('product_id', productId)
    .eq('is_voided', false)
    .order('production_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.production_date || null
}

// Pure function — given a production timestamp (or null), says whether the
// product has passed its freshness window and how long it's been.
export function getFreshnessStatus(latestProductionDate: string | null): FreshnessStatus {
  if (!latestProductionDate) return { lapsed: false, hoursSinceProduction: null }
  const hoursSince = (Date.now() - new Date(latestProductionDate).getTime()) / (1000 * 60 * 60)
  return {
    lapsed: hoursSince >= FRESHNESS_LAPSE_HOURS,
    hoursSinceProduction: Math.round(hoursSince * 10) / 10,
  }
}