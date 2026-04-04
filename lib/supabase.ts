import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// ─── Shared types ────────────────────────────────────────────────────────────

export type UserRole = 'manager' | 'cashier' | 'production'
export type RestockStatus = 'requested' | 'acknowledged' | 'in_progress' | 'fulfilled' | 'partially_fulfilled' | 'declined'
export type RestockType = 'auto_alert' | 'manual_order'
export type PaymentMethod = 'cash' | 'online'

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  description?: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  category_id: string
  price: number
  description?: string
  shop_minimum_threshold: number
  production_minimum_threshold: number
  shop_current_stock: number
  production_current_stock: number
  is_archived: boolean
  archived_at?: string
  created_at: string
  updated_at: string
}

export interface RestockRequest {
  id: string
  product_id: string
  request_type: RestockType
  requested_quantity: number
  fulfilled_quantity: number | null
  status: RestockStatus
  requested_by: string
  acknowledged_by: string | null
  acknowledged_at: string | null
  fulfilled_by: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Sale {
  id: string
  sale_number: string
  payment_method: PaymentMethod
  total_amount: number
  cashier_id: string
  sale_date: string
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
}

export interface Production {
  id: string
  product_id: string
  quantity_produced: number
  production_date: string
  produced_by: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Ingredient {
  id: string
  name: string
  unit: string
  current_stock: number
  minimum_threshold: number
  unit_cost: number | null
  category_id: string | null
  is_archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface IngredientCategory {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface IngredientProcurement {
  id: string
  ingredient_id: string
  quantity_procured: number
  unit_cost: number
  total_cost: number
  recorded_by: string
  notes: string | null
  procurement_date: string
  created_at: string
}

export interface ExpenseCategory {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface Expense {
  id: string
  category_id: string | null
  name: string
  amount: number
  description: string | null
  expense_date: string
  receipt_number: string | null
  notes: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}
