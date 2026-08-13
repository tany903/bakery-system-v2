import { supabase } from './supabase'

export interface ExpenseLogEntry {
  id: string
  expense_id: string | null
  action: 'created' | 'archived' | 'restored' | 'updated'
  performed_by: string | null
  expense_name: string | null
  amount: number | null
  expense_date: string | null
  category_id: string | null
  notes: string | null
  created_at: string
  profiles?: { full_name: string } | null
}

interface LogExpenseEventParams {
  expenseId: string | null
  action: 'created' | 'archived' | 'restored' | 'updated'
  performedBy: string
  expenseName: string
  amount: number
  expenseDate: string
  categoryId?: string | null
  notes?: string | null
}

/**
 * Records an expense create/archive/restore/update event. Mirrors
 * auth-logs.ts's pattern: failures are logged to console but never thrown —
 * logging should never block an actual expense save/archive/restore.
 */
export async function logExpenseEvent(params: LogExpenseEventParams): Promise<void> {
  try {
    const { error } = await supabase.from('expense_logs').insert({
      expense_id: params.expenseId,
      action: params.action,
      performed_by: params.performedBy,
      expense_name: params.expenseName,
      amount: params.amount,
      expense_date: params.expenseDate,
      category_id: params.categoryId || null,
      notes: params.notes || null,
    })
    if (error) console.error('Failed to log expense event:', error)
  } catch (err) {
    console.error('Failed to log expense event:', err)
  }
}

export async function getAllExpenseLogs(limit = 500): Promise<ExpenseLogEntry[]> {
  const { data, error } = await supabase
    .from('expense_logs')
    .select('*, profiles (full_name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as unknown as ExpenseLogEntry[]) || []
}