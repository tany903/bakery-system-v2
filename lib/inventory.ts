import { supabase } from './supabase'
import type { Product } from './supabase'

export type InventoryTransactionType = 
  | 'adjustment' 
  | 'sale' 
  | 'production' 
  | 'transfer' 
  | 'restock' 
  | 'initial'

export type InventoryLocation = 'shop' | 'production'

export interface InventoryTransaction {
  id: string
  product_id: string
  transaction_type: InventoryTransactionType
  location: InventoryLocation
  quantity_before: number
  quantity_change: number
  quantity_after: number
  notes?: string
  reference_id?: string
  performed_by: string
  created_at: string
  products?: {
    name: string
  }
  profiles?: {
    full_name: string
  }
}

// =============================================
// STOCK ADJUSTMENTS
// =============================================

export async function adjustStock(
  productId: string,
  location: InventoryLocation,
  quantityChange: number,
  notes: string,
  userId: string
): Promise<void> {
  // Get current product
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (productError || !product) throw new Error('Product not found')

  const currentStock = location === 'shop' 
    ? product.shop_current_stock 
    : product.production_current_stock

  const newStock = currentStock + quantityChange

  if (newStock < 0) {
    throw new Error('Cannot reduce stock below 0')
  }

  // Update product stock
  const updateField = location === 'shop' 
    ? 'shop_current_stock' 
    : 'production_current_stock'

  const { error: updateError } = await supabase
    .from('products')
    .update({ [updateField]: newStock })
    .eq('id', productId)

  if (updateError) throw updateError

  // Log transaction
  await logInventoryTransaction({
    product_id: productId,
    transaction_type: 'adjustment',
    location,
    quantity_before: currentStock,
    quantity_change: quantityChange,
    quantity_after: newStock,
    notes,
    performed_by: userId,
  })
}

// =============================================
// STOCK TRANSFER (Production → Shop)
// =============================================

export async function transferStock(
  productId: string,
  quantity: number,
  notes: string,
  userId: string
): Promise<void> {
  // Get current product
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (productError || !product) throw new Error('Product not found')

  if (product.production_current_stock < quantity) {
    throw new Error('Not enough stock in production')
  }

  const newProductionStock = product.production_current_stock - quantity
  const newShopStock = product.shop_current_stock + quantity

  // Update product stocks
  const { error: updateError } = await supabase
    .from('products')
    .update({
      production_current_stock: newProductionStock,
      shop_current_stock: newShopStock,
    })
    .eq('id', productId)

  if (updateError) throw updateError

  // Create transfer record
  const { data: transfer, error: transferError } = await supabase
    .from('inventory_transfers')
    .insert({
      product_id: productId,
      quantity,
      notes,
      transferred_by: userId,
    })
    .select()
    .single()

  if (transferError) throw transferError

  // Log production decrease
  await logInventoryTransaction({
    product_id: productId,
    transaction_type: 'transfer',
    location: 'production',
    quantity_before: product.production_current_stock,
    quantity_change: -quantity,
    quantity_after: newProductionStock,
    notes: `Transferred ${quantity} to shop`,
    reference_id: transfer.id,
    performed_by: userId,
  })

  // Log shop increase
  await logInventoryTransaction({
    product_id: productId,
    transaction_type: 'transfer',
    location: 'shop',
    quantity_before: product.shop_current_stock,
    quantity_change: quantity,
    quantity_after: newShopStock,
    notes: `Received ${quantity} from production`,
    reference_id: transfer.id,
    performed_by: userId,
  })
}

// =============================================
// INVENTORY TRANSACTIONS LOG
// =============================================

async function logInventoryTransaction(transaction: {
  product_id: string
  transaction_type: InventoryTransactionType
  location: InventoryLocation
  quantity_before: number
  quantity_change: number
  quantity_after: number
  notes?: string
  reference_id?: string
  performed_by: string
}): Promise<void> {
  const { error } = await supabase
    .from('inventory_transactions')
    .insert(transaction)

  if (error) {
    console.error('Error logging inventory transaction:', error)
    // Don't throw - logging shouldn't break the main operation
  }
}

export async function getInventoryTransactions(
  productId?: string,
  location?: InventoryLocation,
  limit: number = 50
): Promise<InventoryTransaction[]> {
  let query = supabase
    .from('inventory_transactions')
    .select(`
      *,
      products (name),
      profiles (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (productId) {
    query = query.eq('product_id', productId)
  }

  if (location) {
    query = query.eq('location', location)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getRecentTransactions(limit: number = 20): Promise<InventoryTransaction[]> {
  return getInventoryTransactions(undefined, undefined, limit)
}

// =============================================
// INVENTORY STATS
// =============================================

export interface InventoryStats {
  totalProducts: number
  totalShopStock: number
  totalProductionStock: number
  lowStockShop: number
  lowStockProduction: number
  outOfStockShop: number
  outOfStockProduction: number
}

export async function getInventoryStats(): Promise<InventoryStats> {
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)

  if (error) throw error

  const stats: InventoryStats = {
    totalProducts: products?.length || 0,
    totalShopStock: 0,
    totalProductionStock: 0,
    lowStockShop: 0,
    lowStockProduction: 0,
    outOfStockShop: 0,
    outOfStockProduction: 0,
  }

  products?.forEach(product => {
    stats.totalShopStock += product.shop_current_stock
    stats.totalProductionStock += product.production_current_stock

    if (product.shop_current_stock === 0) stats.outOfStockShop++
    if (product.production_current_stock === 0) stats.outOfStockProduction++

    if (product.shop_current_stock < product.shop_minimum_threshold && product.shop_current_stock > 0) {
      stats.lowStockShop++
    }

    if (product.production_current_stock < product.production_minimum_threshold && product.production_current_stock > 0) {
      stats.lowStockProduction++
    }
  })

  return stats
}

// =============================================
// LOW STOCK ALERTS
// =============================================

export interface LowStockAlert {
  product: Product & { categories?: { name: string } }
  location: InventoryLocation
  currentStock: number
  minimumThreshold: number
  deficit: number
}

export async function getLowStockAlerts(): Promise<LowStockAlert[]> {
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      *,
      categories (
        id,
        name
      )
    `)
    .eq('is_archived', false)

  if (error) throw error

  const alerts: LowStockAlert[] = []

  products?.forEach(product => {
    // Check shop stock
    if (product.shop_current_stock < product.shop_minimum_threshold) {
      alerts.push({
        product,
        location: 'shop',
        currentStock: product.shop_current_stock,
        minimumThreshold: product.shop_minimum_threshold,
        deficit: product.shop_minimum_threshold - product.shop_current_stock,
      })
    }

    // Check production stock
    if (product.production_current_stock < product.production_minimum_threshold) {
      alerts.push({
        product,
        location: 'production',
        currentStock: product.production_current_stock,
        minimumThreshold: product.production_minimum_threshold,
        deficit: product.production_minimum_threshold - product.production_current_stock,
      })
    }
  })

  // Sort by deficit (most critical first)
  return alerts.sort((a, b) => b.deficit - a.deficit)
}