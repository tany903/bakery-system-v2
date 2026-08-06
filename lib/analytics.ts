import { supabase } from './supabase'

// =============================================
// TYPES
// =============================================
export type Period = 'today' | 'week' | 'month' | 'year'

export interface DailySalesStat {
  date: string
  revenue: number
  transactions: number
}

export interface TopProduct {
  product_name: string
  total_quantity: number
  total_revenue: number
}

export interface SalesSummary {
  totalRevenue: number
  totalTransactions: number
  averageOrderValue: number
  topProducts: TopProduct[]
  dailyStats: DailySalesStat[]
  cashRevenue: number
  onlineRevenue: number
}

export interface ExpenseVsRevenue {
  month: string
  revenue: number
  expenses: number
  net: number
}

export interface PredictionPoint {
  date: string
  predicted: number
  actual: number
}

export interface RestockRecommendation {
  product_name: string
  current_shop_stock: number
  minimum_threshold: number
  forecast_daily_demand: number
  days_until_stockout: number | null
  recommended_restock: number
  urgency: 'critical' | 'warning' | 'ok'
  accuracy_mape: number | null
  prediction_history: PredictionPoint[]
}

export interface SalesTrend {
  currentPeriodRevenue: number
  previousPeriodRevenue: number
  percentageChange: number
  trend: 'up' | 'down' | 'flat'
}

export interface BestSellingDay {
  day: string
  avgUnitsSold: number
}

// =============================================
// SALES ANALYTICS
// =============================================

export async function getSalesSummary(
  startDate: Date,
  endDate: Date
): Promise<SalesSummary> {
  const { data: sales, error: salesError } = await supabase
    .from('sales')
    .select('*')
    .eq('is_voided', false)
    .gte('sale_date', startDate.toISOString())
    .lte('sale_date', endDate.toISOString())

  if (salesError) throw salesError

  const { data: saleItems, error: itemsError } = await supabase
    .from('sale_items')
    .select(`*, sales!inner (sale_date)`)
    .eq('sales.is_voided', false)
    .gte('sales.sale_date', startDate.toISOString())
    .lte('sales.sale_date', endDate.toISOString())

  if (itemsError) throw itemsError

  const totalRevenue = (sales || []).reduce((sum, s) => sum + Number(s.total_amount), 0)
  const totalTransactions = (sales || []).length
  const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
  const cashRevenue = (sales || [])
    .filter(s => s.payment_method === 'cash')
    .reduce((sum, s) => sum + Number(s.total_amount), 0)
  const onlineRevenue = (sales || [])
    .filter(s => s.payment_method === 'online')
    .reduce((sum, s) => sum + Number(s.total_amount), 0)

  // Top products
  const productMap: { [key: string]: { total_quantity: number; total_revenue: number } } = {}
  ;(saleItems || []).forEach((item: any) => {
    const name = item.product_name
    if (!productMap[name]) productMap[name] = { total_quantity: 0, total_revenue: 0 }
    productMap[name].total_quantity += item.quantity
    productMap[name].total_revenue += Number(item.subtotal)
  })

  const topProducts: TopProduct[] = Object.entries(productMap)
    .map(([product_name, stats]) => ({ product_name, ...stats }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10)

  // Daily stats
  const dailyMap: { [key: string]: { revenue: number; transactions: number } } = {}
  ;(sales || []).forEach((s) => {
    const date = s.sale_date.split('T')[0]
    if (!dailyMap[date]) dailyMap[date] = { revenue: 0, transactions: 0 }
    dailyMap[date].revenue += Number(s.total_amount)
    dailyMap[date].transactions += 1
  })

  const dailyStats: DailySalesStat[] = Object.entries(dailyMap)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalRevenue, totalTransactions, averageOrderValue,
    topProducts, dailyStats, cashRevenue, onlineRevenue,
  }
}

// =============================================
// EXPENSE VS REVENUE
// =============================================

export async function getExpenseVsRevenue(): Promise<ExpenseVsRevenue[]> {
  const results: ExpenseVsRevenue[] = []

  for (let i = 5; i >= 0; i--) {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    const year = date.getFullYear()
    const month = date.getMonth() + 1

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    const { data: sales } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('is_voided', false)
      .gte('sale_date', startDate.toISOString())
      .lte('sale_date', endDate.toISOString())

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount')
      .gte('expense_date', startDate.toISOString().split('T')[0])
      .lte('expense_date', endDate.toISOString().split('T')[0])

    const revenue = (sales || []).reduce((sum, s) => sum + Number(s.total_amount), 0)
    const expenseTotal = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0)
    const monthName = startDate.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })

    results.push({
      month: monthName,
      revenue,
      expenses: expenseTotal,
      net: revenue - expenseTotal,
    })
  }

  return results
}

// =============================================
// PRESCRIPTIVE ANALYTICS
// =============================================

// Minimum number of days with at least one sale before we trust the forecast
// over the simple threshold rule (cold-start guard).
const MIN_SALE_DAYS_FOR_FORECAST = 7
// Exponential smoothing factor. 0.3 is the standard default for demand with
// moderate day-to-day variability (matches bakery weekday/weekend swings)
// without overreacting to a single unusual day.
const SMOOTHING_ALPHA = 0.3
// Backtest window used for both forecasting and verifying accuracy.
const HISTORY_WINDOW_DAYS = 30
const LEAD_TIME_DAYS = 7

function buildDailySeries(dailyQuantities: { [date: string]: number }, windowDays: number): number[] {
  const series: number[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    series.push(dailyQuantities[key] || 0)
  }
  return series
}

// Stage 1 (Predict) + Stage 2 (Verify): run exponential smoothing over the
// historical series, scoring each day's forecast against that day's actual
// sales as it becomes known (this is the "verify accuracy against new data"
// step), then return the next-day forecast plus the accuracy score.
function runExponentialSmoothing(series: number[]): {
  nextForecast: number
  mape: number | null
  history: PredictionPoint[]
} {
  const history: PredictionPoint[] = []
  let forecast = series[0]
  const errors: number[] = []

  for (let t = 1; t < series.length; t++) {
    const actual = series[t]
    history.push({
      date: `day-${t}`,
      predicted: Math.round(forecast * 10) / 10,
      actual,
    })
    if (actual > 0) {
      errors.push(Math.abs(actual - forecast) / actual)
    }
    forecast = SMOOTHING_ALPHA * actual + (1 - SMOOTHING_ALPHA) * forecast
  }

  const mape = errors.length > 0
    ? Math.round((errors.reduce((a, b) => a + b, 0) / errors.length) * 1000) / 10
    : null

  return { nextForecast: forecast, mape, history }
}

export async function getRestockRecommendations(): Promise<RestockRecommendation[]> {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, shop_current_stock, shop_minimum_threshold')
    .eq('is_archived', false)

  if (productsError) throw productsError

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - HISTORY_WINDOW_DAYS)

  const { data: saleItems, error: itemsError } = await supabase
    .from('sale_items')
    .select(`*, sales!inner (sale_date)`)
    .eq('sales.is_voided', false)
    .gte('sales.sale_date', windowStart.toISOString())

  if (itemsError) throw itemsError

  // Build a per-product, per-day quantity map so we can fill in zero-sale days.
  const dailyQuantitiesByProduct: { [productId: string]: { [date: string]: number } } = {}
  const saleDaysByProduct: { [productId: string]: Set<string> } = {}
  ;(saleItems || []).forEach((item: any) => {
    const date = item.sales.sale_date.split('T')[0]
    if (!dailyQuantitiesByProduct[item.product_id]) dailyQuantitiesByProduct[item.product_id] = {}
    if (!saleDaysByProduct[item.product_id]) saleDaysByProduct[item.product_id] = new Set()
    dailyQuantitiesByProduct[item.product_id][date] = (dailyQuantitiesByProduct[item.product_id][date] || 0) + item.quantity
    saleDaysByProduct[item.product_id].add(date)
  })

  return (products || [])
    .map(product => {
      const saleDayCount = saleDaysByProduct[product.id]?.size || 0
      const hasEnoughHistory = saleDayCount >= MIN_SALE_DAYS_FOR_FORECAST

      // Products without enough sales history yet are skipped rather than
      // shown via a threshold guess — with several low-history products at
      // once, that fallback used to flood the card and bury the real,
      // forecast-backed recommendations. They'll appear here automatically
      // once they build up enough history.
      if (!hasEnoughHistory) return null

      const series = buildDailySeries(dailyQuantitiesByProduct[product.id] || {}, HISTORY_WINDOW_DAYS)
      const { nextForecast, mape, history } = runExponentialSmoothing(series)
      const forecastDailyDemand = Math.round(nextForecast * 10) / 10
      const daysUntilStockout = forecastDailyDemand > 0
        ? Math.floor(product.shop_current_stock / forecastDailyDemand)
        : null
      const recommended = Math.ceil(forecastDailyDemand * LEAD_TIME_DAYS)

      let urgency: 'critical' | 'warning' | 'ok' = 'ok'
      if (daysUntilStockout !== null && daysUntilStockout <= 2) urgency = 'critical'
      else if (daysUntilStockout !== null && daysUntilStockout <= 5) urgency = 'warning'
      else if (product.shop_current_stock <= product.shop_minimum_threshold) urgency = 'warning'

      return {
        product_name: product.name,
        current_shop_stock: product.shop_current_stock,
        minimum_threshold: product.shop_minimum_threshold,
        forecast_daily_demand: forecastDailyDemand,
        days_until_stockout: daysUntilStockout,
        recommended_restock: recommended,
        urgency,
        accuracy_mape: mape,
        prediction_history: history.slice(-14), // last 14 days is plenty for the chart
      }
    })
    .filter((r): r is RestockRecommendation => r !== null && r.forecast_daily_demand > 0)
    .sort((a, b) => ({ critical: 0, warning: 1, ok: 2 }[a.urgency] - { critical: 0, warning: 1, ok: 2 }[b.urgency]))
}

export async function getSalesTrend(period: Period): Promise<SalesTrend> {
  const now = new Date()
  let currentStart: Date, currentEnd: Date, prevStart: Date, prevEnd: Date

  switch (period) {
    case 'today':
      currentStart = new Date(now); currentStart.setHours(0,0,0,0)
      currentEnd = new Date(now)
      prevStart = new Date(now); prevStart.setDate(prevStart.getDate()-1); prevStart.setHours(0,0,0,0)
      prevEnd = new Date(now); prevEnd.setDate(prevEnd.getDate()-1); prevEnd.setHours(23,59,59,999)
      break
    case 'week':
      currentStart = new Date(now); currentStart.setDate(now.getDate()-6); currentStart.setHours(0,0,0,0)
      currentEnd = new Date(now)
      prevStart = new Date(now); prevStart.setDate(now.getDate()-13); prevStart.setHours(0,0,0,0)
      prevEnd = new Date(now); prevEnd.setDate(now.getDate()-7); prevEnd.setHours(23,59,59,999)
      break
    case 'month':
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1)
      currentEnd = new Date(now)
      prevStart = new Date(now.getFullYear(), now.getMonth()-1, 1)
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23,59,59)
      break
    case 'year':
      currentStart = new Date(now.getFullYear(), 0, 1)
      currentEnd = new Date(now)
      prevStart = new Date(now.getFullYear()-1, 0, 1)
      prevEnd = new Date(now.getFullYear()-1, 11, 31, 23,59,59)
      break
  }

  const { data: current } = await supabase.from('sales').select('total_amount')
    .eq('is_voided', false)
    .gte('sale_date', currentStart.toISOString()).lte('sale_date', currentEnd.toISOString())
  const { data: previous } = await supabase.from('sales').select('total_amount')
    .eq('is_voided', false)
    .gte('sale_date', prevStart.toISOString()).lte('sale_date', prevEnd.toISOString())

  const currentRevenue = (current || []).reduce((sum, s) => sum + Number(s.total_amount), 0)
  const previousRevenue = (previous || []).reduce((sum, s) => sum + Number(s.total_amount), 0)
  const percentageChange = previousRevenue > 0
    ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100) : 0

  return {
    currentPeriodRevenue: currentRevenue,
    previousPeriodRevenue: previousRevenue,
    percentageChange,
    trend: percentageChange > 2 ? 'up' : percentageChange < -2 ? 'down' : 'flat',
  }
}

export async function getBestSellingDays(): Promise<BestSellingDay[]> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Quantity sold, not peso revenue: one big custom order shouldn't make a
  // day look like it needs more stock when it actually just needs one product.
  const { data: saleItems, error } = await supabase
    .from('sale_items')
    .select(`quantity, sales!inner (sale_date)`)
    .eq('sales.is_voided', false)
    .gte('sales.sale_date', thirtyDaysAgo.toISOString())

  if (error) throw error

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const unitsByDay: { [key: string]: number } = {}

  ;(saleItems || []).forEach((item: any) => {
    const day = dayNames[new Date(item.sales.sale_date).getDay()]
    unitsByDay[day] = (unitsByDay[day] || 0) + item.quantity
  })

  // Divide by how many *calendar days* of each weekday actually occurred in
  // the window (4 or 5, not the transaction count) so this is a true
  // per-day average rather than a per-transaction average.
  const occurrencesByDay: { [key: string]: number } = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const day = dayNames[d.getDay()]
    occurrencesByDay[day] = (occurrencesByDay[day] || 0) + 1
  }

  return dayNames
    .filter(day => unitsByDay[day])
    .map(day => ({ day, avgUnitsSold: Math.round(unitsByDay[day] / occurrencesByDay[day]) }))
    .sort((a, b) => b.avgUnitsSold - a.avgUnitsSold)
}

// =============================================
// CSV EXPORT
// =============================================

export function exportSalesToCSV(summary: SalesSummary, periodLabel: string): void {
  const rows: string[] = []
  rows.push(`Bakery Sales Report - ${periodLabel}`)
  rows.push(`Generated: ${new Date().toLocaleDateString('en-PH')}`)
  rows.push('')
  rows.push('SUMMARY')
  rows.push(`Total Revenue,PHP ${summary.totalRevenue.toFixed(2)}`)
  rows.push(`Total Transactions,${summary.totalTransactions}`)
  rows.push(`Average Order Value,PHP ${summary.averageOrderValue.toFixed(2)}`)
  rows.push(`Cash Revenue,PHP ${summary.cashRevenue.toFixed(2)}`)
  rows.push(`Online Revenue,PHP ${summary.onlineRevenue.toFixed(2)}`)
  rows.push('')
  rows.push('TOP PRODUCTS')
  rows.push('Product,Quantity Sold,Revenue')
  summary.topProducts.forEach(p => {
    rows.push(`${p.product_name},${p.total_quantity},₱${p.total_revenue.toFixed(2)}`)
  })
  rows.push('')
  rows.push('DAILY BREAKDOWN')
  rows.push('Date,Revenue,Transactions')
  summary.dailyStats.forEach(d => {
    rows.push(`${d.date},₱${d.revenue.toFixed(2)},${d.transactions}`)
  })

  const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bakery-sales-${periodLabel.replace(/\s+/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function exportExpensesToCSV(data: ExpenseVsRevenue[]): void {
  const rows: string[] = []
  rows.push('Bakery - Revenue vs Expenses (Last 6 Months)')
  rows.push(`Generated: ${new Date().toLocaleDateString('en-PH')}`)
  rows.push('')
  rows.push('Month,Revenue,Expenses,Net Income')
  data.forEach(d => {
    rows.push(`${d.month},₱${d.revenue.toFixed(2)},₱${d.expenses.toFixed(2)},₱${d.net.toFixed(2)}`)
  })

  const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bakery-expenses-vs-revenue.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// =============================================
// DISPOSAL / LOSS ANALYTICS
// =============================================

export interface DisposalAnalytics {
  totalPullouts: number
  totalOTH: number
  totalLosses: number
  pulloutValue: number
  othValue: number
  totalLossValue: number
}

export async function getDisposalAnalytics(startDate: Date, endDate: Date): Promise<DisposalAnalytics> {
  const { data, error } = await supabase
    .from('stock_disposals')
    .select('*, products (price)')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  if (error) throw error

  const result: DisposalAnalytics = {
    totalPullouts: 0, totalOTH: 0, totalLosses: 0,
    pulloutValue: 0, othValue: 0, totalLossValue: 0,
  }

  ;(data || []).forEach(d => {
    const value = (d.products?.price || 0) * d.quantity
    if (d.type === 'pullout') {
      result.totalPullouts += d.quantity
      result.pulloutValue += value
    } else {
      result.totalOTH += d.quantity
      result.othValue += value
    }
  })

  result.totalLosses = result.totalPullouts + result.totalOTH
  result.totalLossValue = result.pulloutValue + result.othValue

  return result
}

// =============================================
// WEEKLY BREAKDOWN (for drilldown)
// =============================================

export interface WeeklyBreakdown {
  week: string
  revenue: number
  expenses: number
  net: number
}

export async function getWeeklyBreakdown(year: number, month: number): Promise<WeeklyBreakdown[]> {
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const { data: sales } = await supabase
    .from('sales')
    .select('sale_date, total_amount')
    .eq('is_voided', false)
    .gte('sale_date', startOfMonth.toISOString())
    .lte('sale_date', endOfMonth.toISOString())

  const { data: expenses } = await supabase
    .from('expenses')
    .select('expense_date, amount')
    .gte('expense_date', startOfMonth.toISOString().split('T')[0])
    .lte('expense_date', endOfMonth.toISOString().split('T')[0])

  const weeks: { label: string; start: Date; end: Date }[] = []
  let weekStart = new Date(startOfMonth)
  let weekNum = 1

  while (weekStart <= endOfMonth) {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    if (weekEnd > endOfMonth) weekEnd.setTime(endOfMonth.getTime())

    weeks.push({
      label: `Week ${weekNum} (${weekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}–${weekEnd.toLocaleDateString('en-PH', { day: 'numeric' })})`,
      start: new Date(weekStart),
      end: new Date(weekEnd),
    })

    weekStart.setDate(weekStart.getDate() + 7)
    weekNum++
  }

  return weeks.map(week => {
    const revenue = (sales || [])
      .filter(s => { const d = new Date(s.sale_date); return d >= week.start && d <= week.end })
      .reduce((sum, s) => sum + Number(s.total_amount), 0)

    const expenseTotal = (expenses || [])
      .filter(e => { const d = new Date(e.expense_date); return d >= week.start && d <= week.end })
      .reduce((sum, e) => sum + Number(e.amount), 0)

    return { week: week.label, revenue, expenses: expenseTotal, net: revenue - expenseTotal }
  }).filter(w => w.revenue > 0 || w.expenses > 0)
}

// =============================================
// DAILY SALES BREAKDOWN
// =============================================

export interface DailySalesItem {
  product_name: string
  quantity: number
  revenue: number
}

export interface DailySalesBreakdown {
  date: string
  totalRevenue: number
  totalTransactions: number
  cashRevenue: number
  gcashRevenue: number
  cardRevenue: number
  items: DailySalesItem[]
  voidedCount: number
  voidedRevenue: number
}

export async function getDailySalesBreakdown(date: Date): Promise<DailySalesBreakdown> {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)

  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .gte('sale_date', start.toISOString())
    .lte('sale_date', end.toISOString())

  if (salesErr) throw salesErr

  const activeSales = (sales || []).filter(s => !s.is_voided)
  const voidedSales = (sales || []).filter(s => s.is_voided)

  const totalRevenue = activeSales.reduce((sum, s) => sum + Number(s.total_amount), 0)
  const cashRevenue = activeSales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + Number(s.total_amount), 0)
  const gcashRevenue = activeSales.filter(s => s.payment_method === 'gcash').reduce((sum, s) => sum + Number(s.total_amount), 0)
  const cardRevenue = activeSales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + Number(s.total_amount), 0)
  const voidedRevenue = voidedSales.reduce((sum, s) => sum + Number(s.total_amount), 0)

  // Aggregate items across all active sales
  const itemMap: { [name: string]: { quantity: number; revenue: number } } = {}
  activeSales.forEach(sale => {
    (sale.sale_items || []).forEach((item: any) => {
      if (!itemMap[item.product_name]) itemMap[item.product_name] = { quantity: 0, revenue: 0 }
      itemMap[item.product_name].quantity += item.quantity
      itemMap[item.product_name].revenue += Number(item.subtotal)
    })
  })

  const items: DailySalesItem[] = Object.entries(itemMap)
    .map(([product_name, stats]) => ({ product_name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    date: start.toISOString().split('T')[0],
    totalRevenue,
    totalTransactions: activeSales.length,
    cashRevenue,
    gcashRevenue,
    cardRevenue,
    items,
    voidedCount: voidedSales.length,
    voidedRevenue,
  }
}