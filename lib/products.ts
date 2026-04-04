import { supabase } from './supabase'
import type { Product, Category } from './supabase'

// =============================================
// PRODUCTS
// =============================================

export async function getAllProducts(includeArchived = false): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select(`
      *,
      categories (
        id,
        name
      )
    `)
    .order('created_at', { ascending: false })

  if (!includeArchived) {
    query = query.eq('is_archived', false)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      categories (
        id,
        name
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching product:', error)
    return null
  }

  return data
}

export async function searchProducts(query: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      categories (
        id,
        name
      )
    `)
    .eq('is_archived', false)
    .ilike('name', `%${query}%`)
    .order('name')

  if (error) throw error
  return data || []
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      categories (
        id,
        name
      )
    `)
    .eq('category_id', categoryId)
    .eq('is_archived', false)
    .order('name')

  if (error) throw error
  return data || []
}

export async function getLowStockProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .rpc('get_low_stock_products')

  if (error) {
    console.error('Error getting low stock:', error)
    throw error
  }
  
  return data || []
}

export async function createProduct(product: {
  name: string
  category_id: string
  price: number
  description?: string
  shop_minimum_threshold: number
  production_minimum_threshold: number
  shop_current_stock: number
  production_current_stock: number
}): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function archiveProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

export async function unarchiveProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      is_archived: false,
      archived_at: null,
    })
    .eq('id', id)

  if (error) throw error
}

export async function updateStock(
  productId: string,
  shopStock?: number,
  productionStock?: number
): Promise<void> {
  const updates: any = {}
  
  if (shopStock !== undefined) {
    updates.shop_current_stock = shopStock
  }
  
  if (productionStock !== undefined) {
    updates.production_current_stock = productionStock
  }

  const { error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId)

  if (error) throw error
}



// =============================================
// CATEGORIES
// =============================================

export async function getAllCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_archived', false)  // Only show active categories
    .order('name')

  if (error) throw error
  return data || []
}

export async function archiveCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

export async function createCategory(
  name: string,
  description?: string
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, description })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateCategory(
  id: string,
  name: string,
  description?: string
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({ name, description })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)

  if (error) throw error
}