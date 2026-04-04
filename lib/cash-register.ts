import { supabase } from './supabase'

export interface CashRegisterEntry {
  id: string
  type: 'float' | 'cash_in' | 'cash_out'
  amount: number
  notes: string | null
  performed_by: string
  reference_id: string | null
  created_at: string
}

export interface CashSummary {
  cashFloat: number
  todayCashSales: number
  totalCashIn: number
  totalCashOut: number
  cashOnHand: number
  entries: CashRegisterEntry[]
}

export async function getCashSummary(): Promise<CashSummary> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString()

  const [
    { data: todayEntries, error: entriesError },
    { data: yesterdayEntries, error: yesterdayError },
    { data: yesterdaySales, error: yesterdaySalesError },
    { data: todaySales, error: todaySalesError },
  ] = await Promise.all([
    supabase
      .from('cash_register')
      .select('*')
      .gte('created_at', todayStart)
      .order('created_at', { ascending: false }),
    supabase
      .from('cash_register')
      .select('*')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    supabase
      .from('sales')
      .select('total_amount')
      .eq('payment_method', 'cash')
      .eq('is_voided', false)
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    supabase
      .from('sales')
      .select('total_amount')
      .eq('payment_method', 'cash')
      .eq('is_voided', false)
      .gte('created_at', todayStart),
  ])

  if (entriesError) throw entriesError
  if (yesterdayError) throw yesterdayError
  if (yesterdaySalesError) throw yesterdaySalesError
  if (todaySalesError) throw todaySalesError

  const yesterdayCashSales = yesterdaySales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0
  const yesterdayFloat = yesterdayEntries?.filter(e => e.type === 'float' && !e.is_voided).reduce((sum, e) => sum + Number(e.amount), 0) || 0
  const yesterdayCashIn = yesterdayEntries?.filter(e => e.type === 'cash_in' && !e.is_voided).reduce((sum, e) => sum + Number(e.amount), 0) || 0
  const yesterdayCashOut = yesterdayEntries?.filter(e => e.type === 'cash_out' && !e.is_voided).reduce((sum, e) => sum + Number(e.amount), 0) || 0
  const cashFloat = Math.max(0, yesterdayFloat + yesterdayCashSales + yesterdayCashIn - yesterdayCashOut)

  const todayCashSales = todaySales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0
  const totalCashIn = todayEntries?.filter(e => e.type === 'cash_in' && !e.is_voided).reduce((sum, e) => sum + Number(e.amount), 0) || 0
  const totalCashOut = todayEntries?.filter(e => e.type === 'cash_out' && !e.is_voided).reduce((sum, e) => sum + Number(e.amount), 0) || 0
  const cashOnHand = Math.max(0, cashFloat + todayCashSales + totalCashIn - totalCashOut)

  return {
    cashFloat,
    todayCashSales,
    totalCashIn,
    totalCashOut,
    cashOnHand,
    entries: todayEntries || [],
  }
}

export async function addCashIn(
  amount: number,
  performedBy: string,
  notes?: string,
  referenceId?: string
): Promise<void> {
  const { error } = await supabase
    .from('cash_register')
    .insert({
      type: 'cash_in',
      amount,
      notes: notes || null,
      performed_by: performedBy,
      reference_id: referenceId || null,
    })
  if (error) throw error
}

export async function addCashOut(
  amount: number,
  performedBy: string,
  notes?: string,
  referenceId?: string
): Promise<void> {
  const { error } = await supabase
    .from('cash_register')
    .insert({
      type: 'cash_out',
      amount,
      notes: notes || null,
      performed_by: performedBy,
      reference_id: referenceId || null,
    })
  if (error) throw error
}
