import { supabase } from './supabase'
import type { Ingredient, IngredientCategory } from './supabase'

export type { IngredientCategory }

export interface IngredientWithCategory extends Ingredient {
  ingredient_categories?: IngredientCategory
}

// =============================================
// INGREDIENT CRUD
// =============================================

export async function getAllIngredients(): Promise<IngredientWithCategory[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select(`*, ingredient_categories (*)`)
    .eq('is_archived', false)
    .order('name')

  if (error) throw error
  return data || []
}

export async function createIngredient(
  name: string,
  unit: string,
  minimumStock: number,
  categoryId?: string
): Promise<Ingredient> {
  const { data, error } = await supabase
    .from('ingredients')
    .insert({
      name,
      unit,
      minimum_threshold: minimumStock,
      current_stock: 0,
      category_id: categoryId || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateIngredient(
  id: string,
  updates: {
    name?: string
    unit?: string
    minimumStock?: number
    categoryId?: string
  }
): Promise<void> {
  const updateData: any = {}

  if (updates.name) updateData.name = updates.name
  if (updates.unit) updateData.unit = updates.unit
  if (updates.minimumStock !== undefined) updateData.minimum_threshold = updates.minimumStock
  if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId

  const { error } = await supabase
    .from('ingredients')
    .update(updateData)
    .eq('id', id)

  if (error) throw error
}

export async function archiveIngredient(id: string): Promise<void> {
  const { error } = await supabase
    .from('ingredients')
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export async function unarchiveIngredient(id: string): Promise<void> {
  const { error } = await supabase
    .from('ingredients')
    .update({ is_archived: false, archived_at: null })
    .eq('id', id)

  if (error) throw error
}

export async function adjustIngredientStock(
  ingredientId: string,
  adjustment: number,
  performedBy: string,
  notes?: string
): Promise<void> {
  const { data: ingredient, error: ingredientError } = await supabase
    .from('ingredients')
    .select('*')
    .eq('id', ingredientId)
    .single()

  if (ingredientError || !ingredient) throw new Error('Ingredient not found')

  const newStock = ingredient.current_stock + adjustment
  if (newStock < 0) throw new Error('Insufficient stock')

  const { error: updateError } = await supabase
    .from('ingredients')
    .update({ current_stock: newStock })
    .eq('id', ingredientId)

  if (updateError) throw updateError

  // Log to ingredient_procurement for both additions and removals.
  // Removals use a negative quantity and a [REMOVAL] prefix on notes.
  // Fix: actual column is 'quantity', not 'quantity_procured'
  const { error: procurementError } = await supabase
    .from('ingredient_procurement')
    .insert({
      ingredient_id: ingredientId,
      quantity: adjustment,
      unit_cost: 0,
      total_cost: 0,
      recorded_by: performedBy,
      procurement_date: new Date().toISOString().split('T')[0],
      notes: adjustment < 0
        ? (notes ? `[REMOVAL] ${notes}` : '[REMOVAL]')
        : (notes || null),
    })

  if (procurementError) {
    console.error('Error logging ingredient adjustment:', procurementError)
    // Don't throw — logging shouldn't break the main operation
  }
}

// =============================================
// LOW STOCK ALERTS
// =============================================

export async function getLowStockIngredients(): Promise<IngredientWithCategory[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select(`*, ingredient_categories (*)`)
    .eq('is_archived', false)

  if (error) throw error
  return (data || []).filter(ing => ing.current_stock < ing.minimum_threshold)
}

// =============================================
// INGREDIENT CATEGORIES
// =============================================

export async function getAllIngredientCategories(): Promise<IngredientCategory[]> {
  const { data, error } = await supabase
    .from('ingredient_categories')
    .select('*')
    .order('name')

  if (error) throw error
  return data || []
}

export async function createIngredientCategory(
  name: string,
  description?: string
): Promise<IngredientCategory> {
  const { data, error } = await supabase
    .from('ingredient_categories')
    .insert({ name, description: description || null })
    .select()
    .single()

  if (error) throw error
  return data
}
