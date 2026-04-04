import { supabase } from './supabase'
import type { Sale, SaleItem, Product } from './supabase'

export interface CartItem {
  product: Product
  quantity: number
  subtotal: number
  isOldStock?: boolean      // day-old — 50% off
  discountPct?: number      // custom discount (e.g. bulk) 0-100
}

export interface SaleWithItems extends Sale {
  sale_items: SaleItem[]
}

export interface SalesStats {
  totalSales: number
  totalAmount: number
  cashSales: number
  onlineSales: number
  itemsSold: number
  averageTransaction: number
}

// =============================================
// HELPERS
// =============================================

export function getEffectivePrice(item: CartItem): number {
  const base = item.product.price
  if (item.isOldStock) return base * 0.5
  if (item.discountPct && item.discountPct > 0) return base * (1 - item.discountPct / 100)
  return base
}

export function getItemSubtotal(item: CartItem): number {
  return getEffectivePrice(item) * item.quantity
}

export async function getMaxDiscountPct(): Promise<number> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'max_discount_pct')
    .single()
  return data ? parseInt(data.value) : 30
}

// =============================================
// CREATE SALE
// =============================================

export async function createSale(
  items: CartItem[],
  paymentMethod: 'cash' | 'online',
  cashierId: string
): Promise<Sale> {
  const totalAmount = items.reduce((sum, item) => sum + getItemSubtotal(item), 0)

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      payment_method: paymentMethod,
      total_amount: totalAmount,
      cashier_id: cashierId,
    })
    .select()
    .single()

  if (saleError || !sale) throw new Error('Failed to create sale')

  const saleItems = items.map(item => ({
    sale_id: sale.id,
    product_id: item.product.id,
    product_name: item.product.name,
    quantity: item.quantity,
    unit_price: getEffectivePrice(item),
    original_price: item.product.price,
    subtotal: getItemSubtotal(item),
    is_old_stock: item.isOldStock || false,
    discount_pct: item.discountPct || 0,
  }))

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(saleItems)

  if (itemsError) {
    await supabase.from('sales').delete().eq('id', sale.id)
    throw new Error('Failed to create sale items')
  }

  for (const item of items) {
    await deductInventory(item.product.id, item.quantity, sale.id, cashierId)
  }

  return sale
}

// =============================================
// DEDUCT INVENTORY
// =============================================

async function deductInventory(
  productId: string,
  quantity: number,
  saleId: string,
  cashierId: string
): Promise<void> {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (productError || !product) throw new Error('Product not found')

  const newStock = product.shop_current_stock - quantity

  if (newStock < 0) throw new Error(`Insufficient stock for ${product.name}`)

  const { error: updateError } = await supabase
    .from('products')
    .update({ shop_current_stock: newStock })
    .eq('id', productId)

  if (updateError) throw updateError

  await supabase.from('inventory_transactions').insert({
    product_id: productId,
    transaction_type: 'sale',
    location: 'shop',
    quantity_before: product.shop_current_stock,
    quantity_change: -quantity,
    quantity_after: newStock,
    notes: 'Sold in transaction',
    reference_id: saleId,
    performed_by: cashierId,
  })
}

// =============================================
// GET SALES
// =============================================

export async function getTodaysSales(): Promise<SaleWithItems[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items (*), profiles (full_name)')
    .gte('sale_date', today.toISOString())
    .order('sale_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getSalesByDateRange(startDate: Date, endDate: Date): Promise<SaleWithItems[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items (*), profiles (full_name)')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())
    .order('sale_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getSaleById(saleId: string): Promise<SaleWithItems | null> {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items (*), profiles (full_name)')
    .eq('id', saleId)
    .single()

  if (error) return null
  return data
}

export async function getTodaysSalesStats(): Promise<SalesStats> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: sales, error } = await supabase
    .from('sales')
    .select('*, sale_items (quantity)')
    .gte('sale_date', today.toISOString())

  if (error) throw error

  const stats: SalesStats = {
    totalSales: sales?.length || 0,
    totalAmount: 0,
    cashSales: 0,
    onlineSales: 0,
    itemsSold: 0,
    averageTransaction: 0,
  }

  sales?.forEach(sale => {
    stats.totalAmount += sale.total_amount
    if (sale.payment_method === 'cash') stats.cashSales += sale.total_amount
    else stats.onlineSales += sale.total_amount
    sale.sale_items?.forEach((item: any) => { stats.itemsSold += item.quantity })
  })

  if (stats.totalSales > 0) stats.averageTransaction = stats.totalAmount / stats.totalSales

  return stats
}
