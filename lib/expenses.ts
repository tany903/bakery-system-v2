import { supabase } from './supabase'
import type { Expense, ExpenseCategory } from './supabase'

export interface ExpenseWithCategory extends Expense {
  expense_categories?: ExpenseCategory
  recorded_by_profile?: { full_name: string }
}

export interface ExpenseSummary {
  totalExpenses: number
  totalRevenue: number
  netIncome: number
  expensesByCategory: { category: string; total: number }[]
  expenseCount: number
}

// =============================================
// EXPENSE CATEGORIES
// =============================================

export async function getAllExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('is_archived', false)
    .order('name')

  if (error) throw error
  return data || []
}

export async function createExpenseCategory(
  name: string,
  description?: string
): Promise<ExpenseCategory> {
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ name, description: description || null })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateExpenseCategory(
  id: string,
  name: string,
  description?: string
): Promise<ExpenseCategory> {
  const { data, error } = await supabase
    .from('expense_categories')
    .update({ name, description: description || null })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function archiveExpenseCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('expense_categories')
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// Keep for backwards compatibility but prefer archiveExpenseCategory
export async function deleteExpenseCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('expense_categories')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// =============================================
// EXPENSES CRUD
// =============================================

export async function getAllExpenses(): Promise<ExpenseWithCategory[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      *,
      expense_categories (*),
      recorded_by_profile:profiles!expenses_recorded_by_fkey (full_name)
    `)
    .order('expense_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getExpensesByDateRange(
  startDate: Date,
  endDate: Date
): Promise<ExpenseWithCategory[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      *,
      expense_categories (*),
      recorded_by_profile:profiles!expenses_recorded_by_fkey (full_name)
    `)
    .gte('expense_date', startDate.toISOString().split('T')[0])
    .lte('expense_date', endDate.toISOString().split('T')[0])
    .order('expense_date', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createExpense(
  title: string,
  amount: number,
  expenseDate: string,
  recordedBy: string,
  categoryId?: string,
  notes?: string
): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      name: title,
      amount,
      expense_date: expenseDate,
      recorded_by: recordedBy,
      category_id: categoryId || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateExpense(
  id: string,
  updates: {
    title?: string
    amount?: number
    expense_date?: string
    category_id?: string | null
    notes?: string | null
  }
): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .update({
      name: updates.title,
      amount: updates.amount,
      expense_date: updates.expense_date,
      category_id: updates.category_id,
      notes: updates.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// =============================================
// EXPENSE SUMMARY / STATS
// =============================================

export async function getMonthlyExpenseSummary(
  year: number,
  month: number
): Promise<ExpenseSummary> {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0)

  const { data: expenses, error: expenseError } = await supabase
    .from('expenses')
    .select(`*, expense_categories (name)`)
    .gte('expense_date', startDate.toISOString().split('T')[0])
    .lte('expense_date', endDate.toISOString().split('T')[0])

  if (expenseError) throw expenseError

  const { data: sales, error: salesError } = await supabase
    .from('sales')
    .select('total_amount')
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())

  if (salesError) throw salesError

  const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0)
  const totalRevenue = (sales || []).reduce((sum, s) => sum + Number(s.total_amount), 0)

  const categoryMap: { [key: string]: number } = {}
  ;(expenses || []).forEach((e: any) => {
    const cat = e.expense_categories?.name || 'Uncategorized'
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(e.amount)
  })

  const expensesByCategory = Object.entries(categoryMap)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)

  return {
    totalExpenses,
    totalRevenue,
    netIncome: totalRevenue - totalExpenses,
    expensesByCategory,
    expenseCount: (expenses || []).length,
  }
}
