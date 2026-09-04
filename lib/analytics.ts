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
// PRESCRIPTIVE ANALYTICS — RESTOCK FORECAST
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
export function runExponentialSmoothing(series: number[]): {
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
// PRESCRIPTIVE RECOMMENDATIONS (Production / Waste / Slow-Moving)
// =============================================

// All business thresholds live here, isolated from the logic that uses
// them, so sensitivity can be tuned without touching the recommendation
// rules themselves.
const ANALYSIS_WINDOW_DAYS = 7
const MIN_ACTIVITY_UNITS_PER_DAY = 2
const PRODUCTION_GAP_THRESHOLD_PCT = 0.15
const PRODUCTION_HIGH_GAP_PCT = 0.40
const WASTE_MIN_UNITS = 5
const WASTE_THRESHOLD_PCT = 0.15
const WASTE_HIGH_PCT = 0.30

// Zero-production-but-selling is always a real signal (there's no gap % to
// grade it by), so it's graded on the demand itself instead. Below this,
// it's "selling a little with nothing made" (medium); at/above, it's
// "selling a lot with nothing made" (high).
const ZERO_PRODUCTION_HIGH_DEMAND_UNITS_PER_DAY = 5

// Zero-matching-production waste is an exception case, not a stricter
// version of the normal rule — a tiny disposal with no production logged
// usually just means someone forgot to log a small batch, not a real
// waste problem, so it needs its own (deliberately stricter) gate.
const ZERO_PRODUCTION_WASTE_MIN_UNITS = 5
const ZERO_PRODUCTION_WASTE_MIN_VALUE = 500
const ZERO_PRODUCTION_WASTE_HIGH_UNITS = 15
const ZERO_PRODUCTION_WASTE_HIGH_VALUE = 1000

const SLOW_MOVING_MAX_UNITS = 10

export type RecommendationPriority = 'high' | 'medium' | 'low'
export type RecommendationType = 'production' | 'waste' | 'slow_moving' | 'conflict'

export interface PrescriptiveRecommendation {
  type: RecommendationType
  priority: RecommendationPriority
  productId: string
  productName: string
  title: string
  reason: string
  metrics: Record<string, number | string | null>
  recommendedAction: string
}

interface ProductionSignal {
  product_id: string
  product_name: string
  avg_daily_demand: number
  avg_daily_production: number
  gap_pct: number | null // null only for the zero-production case, graded on demand instead
  direction: 'increase' | 'decrease'
  recommended_daily_production: number
  priority: RecommendationPriority
}

interface WasteSignal {
  product_id: string
  product_name: string
  pullout_quantity: number
  oth_quantity: number
  total_disposal: number
  disposal_value: number
  production_quantity_in_window: number
  waste_pct: number | null // null only when there was zero matching production, graded on volume/value instead
  recommended_daily_reduction: number
  priority: RecommendationPriority
  is_production_tracked: boolean
}

function productionPriorityFromGap(gapPct: number): RecommendationPriority {
  return gapPct >= PRODUCTION_HIGH_GAP_PCT ? 'high' : 'medium'
}

function productionPriorityFromZeroProduction(avgDailyDemand: number): RecommendationPriority {
  return avgDailyDemand >= ZERO_PRODUCTION_HIGH_DEMAND_UNITS_PER_DAY ? 'high' : 'medium'
}

function wastePriorityFromPct(wastePct: number): RecommendationPriority {
  return wastePct >= WASTE_HIGH_PCT ? 'high' : 'medium'
}

function wastePriorityFromZeroProduction(totalDisposal: number, disposalValue: number): RecommendationPriority {
  return (totalDisposal >= ZERO_PRODUCTION_WASTE_HIGH_UNITS || disposalValue >= ZERO_PRODUCTION_WASTE_HIGH_VALUE)
    ? 'high' : 'medium'
}

async function getProductionSignals(): Promise<Map<string, ProductionSignal>> {
  // Only products the bakery actually manufactures are eligible for
  // production recommendations — resale items (canned drinks, etc.) are
  // excluded at the query level so they never enter the demand-vs-production
  // comparison or the conflict-detection pass below.
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name')
    .eq('is_archived', false)
    .eq('production_tracked', true)
  if (productsError) throw productsError

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - ANALYSIS_WINDOW_DAYS)

  const [{ data: saleItems, error: salesErr }, { data: productionRecords, error: prodErr }] = await Promise.all([
    supabase
      .from('sale_items')
      .select(`product_id, quantity, sales!inner (sale_date)`)
      .eq('sales.is_voided', false)
      .gte('sales.sale_date', windowStart.toISOString()),
    supabase
      .from('production')
      .select('product_id, quantity_produced')
      .eq('is_voided', false)
      .gte('production_date', windowStart.toISOString()),
  ])
  if (salesErr) throw salesErr
  if (prodErr) throw prodErr

  const demandByProduct: { [id: string]: number } = {}
  ;(saleItems || []).forEach((item: any) => {
    demandByProduct[item.product_id] = (demandByProduct[item.product_id] || 0) + item.quantity
  })

  const producedByProduct: { [id: string]: number } = {}
  ;(productionRecords || []).forEach((rec: any) => {
    producedByProduct[rec.product_id] = (producedByProduct[rec.product_id] || 0) + rec.quantity_produced
  })

  const signals = new Map<string, ProductionSignal>()

  ;(products || []).forEach(product => {
    const totalDemand = demandByProduct[product.id] || 0
    const totalProduced = producedByProduct[product.id] || 0
    const avgDailyDemand = Math.round((totalDemand / ANALYSIS_WINDOW_DAYS) * 10) / 10
    const avgDailyProduction = Math.round((totalProduced / ANALYSIS_WINDOW_DAYS) * 10) / 10

    if (avgDailyProduction === 0) {
      // Zero production: only a signal if demand clears the activity floor —
      // zero production of something nobody's buying isn't a problem.
      if (avgDailyDemand < MIN_ACTIVITY_UNITS_PER_DAY) return
      signals.set(product.id, {
        product_id: product.id,
        product_name: product.name,
        avg_daily_demand: avgDailyDemand,
        avg_daily_production: 0,
        gap_pct: null,
        direction: 'increase',
        recommended_daily_production: Math.max(1, Math.ceil(avgDailyDemand)),
        priority: productionPriorityFromZeroProduction(avgDailyDemand),
      })
      return
    }

    // Not enough activity either way to say anything meaningful
    if (avgDailyDemand < MIN_ACTIVITY_UNITS_PER_DAY && avgDailyProduction < MIN_ACTIVITY_UNITS_PER_DAY) return

    const gap = avgDailyDemand - avgDailyProduction
    const gapPct = Math.abs(gap) / avgDailyProduction
    if (gapPct < PRODUCTION_GAP_THRESHOLD_PCT) return

    signals.set(product.id, {
      product_id: product.id,
      product_name: product.name,
      avg_daily_demand: avgDailyDemand,
      avg_daily_production: avgDailyProduction,
      gap_pct: gapPct,
      direction: gap > 0 ? 'increase' : 'decrease',
      recommended_daily_production: Math.max(1, Math.ceil(avgDailyDemand)),
      priority: productionPriorityFromGap(gapPct),
    })
  })

  return signals
}

async function getWasteSignals(): Promise<Map<string, WasteSignal>> {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - ANALYSIS_WINDOW_DAYS)

  const [{ data: disposals, error: dispErr }, { data: productionRecords, error: prodErr }] = await Promise.all([
    // NOTE: disposal/waste analytics still cover every product, resale
    // items included — production_tracked is only used here to pick the
    // correct message/action for the zero-production case below, never to
    // filter which products are eligible for a waste recommendation.
    supabase
      .from('stock_disposals')
      .select('product_id, type, quantity, products (name, price, production_tracked)')
      .gte('created_at', windowStart.toISOString()),
    supabase
      .from('production')
      .select('product_id, quantity_produced')
      .eq('is_voided', false)
      .gte('production_date', windowStart.toISOString()),
  ])
  if (dispErr) throw dispErr
  if (prodErr) throw prodErr

  const producedByProduct: { [id: string]: number } = {}
  ;(productionRecords || []).forEach((rec: any) => {
    producedByProduct[rec.product_id] = (producedByProduct[rec.product_id] || 0) + rec.quantity_produced
  })

  const disposalMap: { [id: string]: { name: string; pullout: number; oth: number; value: number; is_production_tracked: boolean } } = {}
  ;(disposals || []).forEach((d: any) => {
    if (!disposalMap[d.product_id]) {
      disposalMap[d.product_id] = {
        name: d.products?.name || 'Unknown',
        pullout: 0,
        oth: 0,
        value: 0,
        is_production_tracked: d.products?.production_tracked ?? true,
      }
    }
    const entry = disposalMap[d.product_id]
    if (d.type === 'pullout') entry.pullout += d.quantity
    else entry.oth += d.quantity
    entry.value += (d.products?.price || 0) * d.quantity
  })

  const signals = new Map<string, WasteSignal>()

  Object.entries(disposalMap).forEach(([productId, d]) => {
    const totalDisposal = d.pullout + d.oth
    if (totalDisposal === 0) return
    const producedInWindow = producedByProduct[productId] || 0

    if (producedInWindow === 0) {
      // Exception case: no waste_pct can be computed. This is NOT the normal
      // rule run with a zero denominator — it's a separate, deliberately
      // stricter-by-default gate, since a tiny disposal with nothing produced
      // is usually a missed production log, not a real waste problem.
      // (For non-production-tracked resale items, zero production is simply
      // expected — they're never manufactured in-house at all.)
      const triggered = totalDisposal >= ZERO_PRODUCTION_WASTE_MIN_UNITS || d.value >= ZERO_PRODUCTION_WASTE_MIN_VALUE
      if (!triggered) return

      signals.set(productId, {
        product_id: productId,
        product_name: d.name,
        pullout_quantity: d.pullout,
        oth_quantity: d.oth,
        total_disposal: totalDisposal,
        disposal_value: d.value,
        production_quantity_in_window: 0,
        waste_pct: null,
        recommended_daily_reduction: 0, // no production baseline to reduce from — see buildWasteRecommendation
        priority: wastePriorityFromZeroProduction(totalDisposal, d.value),
        is_production_tracked: d.is_production_tracked,
      })
      return
    }

    // Normal case: production exists, so waste_pct is meaningful.
    const wastePct = totalDisposal / producedInWindow
    if (totalDisposal < WASTE_MIN_UNITS || wastePct < WASTE_THRESHOLD_PCT) return

    signals.set(productId, {
      product_id: productId,
      product_name: d.name,
      pullout_quantity: d.pullout,
      oth_quantity: d.oth,
      total_disposal: totalDisposal,
      disposal_value: d.value,
      production_quantity_in_window: producedInWindow,
      waste_pct: wastePct,
      recommended_daily_reduction: Math.max(1, Math.round(totalDisposal / ANALYSIS_WINDOW_DAYS)),
      priority: wastePriorityFromPct(wastePct),
      is_production_tracked: d.is_production_tracked,
    })
  })

  return signals
}

function buildProductionRecommendation(s: ProductionSignal): PrescriptiveRecommendation {
  const gapLabel = s.gap_pct === null ? 'N/A (zero production)' : `${Math.round(s.gap_pct * 100)}%`
  return {
    type: 'production',
    priority: s.priority,
    productId: s.product_id,
    productName: s.product_name,
    title: s.direction === 'increase' ? 'Increase Production' : 'Decrease Production',
    reason: s.gap_pct === null
      ? `${s.product_name} is selling ${s.avg_daily_demand} units/day with zero production logged in the last ${ANALYSIS_WINDOW_DAYS} days, exceeding the minimum activity threshold of ${MIN_ACTIVITY_UNITS_PER_DAY} units/day.`
      : `Demand is ${Math.round(s.gap_pct * 100)}% ${s.direction === 'increase' ? 'higher' : 'lower'} than production, exceeding the configured ${Math.round(PRODUCTION_GAP_THRESHOLD_PCT * 100)}% threshold.`,
    recommendedAction: s.direction === 'increase'
      ? `Increase production to approximately ${s.recommended_daily_production} unit${s.recommended_daily_production !== 1 ? 's' : ''}/day.`
      : `Decrease production to approximately ${s.recommended_daily_production} unit${s.recommended_daily_production !== 1 ? 's' : ''}/day.`,
    metrics: {
      'Demand': `${s.avg_daily_demand} units/day`,
      'Production': `${s.avg_daily_production} units/day`,
      'Gap': gapLabel,
      'Window (days)': ANALYSIS_WINDOW_DAYS,
    },
  }
}

function buildWasteRecommendation(s: WasteSignal): PrescriptiveRecommendation {
  const isZeroProduction = s.waste_pct === null
  // Resale items (production_tracked = false) are never expected to have
  // production records at all, so the "possible recording issue" framing
  // used for bakery-made products would be actively misleading here.
  const isResaleZeroProduction = isZeroProduction && !s.is_production_tracked

  return {
    type: 'waste',
    priority: s.priority,
    productId: s.product_id,
    productName: s.product_name,
    title: isResaleZeroProduction
      ? 'Review Resale Item Waste'
      : isZeroProduction
      ? 'Investigate Waste — No Matching Production'
      : 'Reduce Waste',
    reason: isResaleZeroProduction
      ? `${s.product_name} is a resale item (not produced in-house) and had ${s.total_disposal} unit${s.total_disposal !== 1 ? 's' : ''} disposed worth ₱${s.disposal_value.toFixed(2)} in the last ${ANALYSIS_WINDOW_DAYS} days.`
      : isZeroProduction
      ? `${s.product_name} had ${s.total_disposal} unit${s.total_disposal !== 1 ? 's' : ''} disposed worth ₱${s.disposal_value.toFixed(2)}, but no matching production was logged during the last ${ANALYSIS_WINDOW_DAYS} days. This is a potential inventory or production-recording issue.`
      : `Waste represents ${Math.round(s.waste_pct! * 100)}% of production and exceeds the configured ${Math.round(WASTE_THRESHOLD_PCT * 100)}% threshold.`,
    recommendedAction: isResaleZeroProduction
      ? 'Review receiving/purchase records for this item and check storage conditions or expiry handling.'
      : isZeroProduction
      ? 'Review the disposal records and production logs before adjusting production.'
      : `Reduce daily production by approximately ${s.recommended_daily_reduction} unit${s.recommended_daily_reduction !== 1 ? 's' : ''} and review batch size.`,
    metrics: {
      'Produced': `${s.production_quantity_in_window} units`,
      'Pull-outs': s.pullout_quantity,
      'OTH': s.oth_quantity,
      'Total waste': `${s.total_disposal} units`,
      'Waste rate': isZeroProduction ? (isResaleZeroProduction ? 'N/A (resale item)' : 'N/A (no production logged)') : `${Math.round(s.waste_pct! * 100)}%`,
      'Value lost': `₱${s.disposal_value.toFixed(2)}`,
    },
  }
}

function buildConflictRecommendation(prod: ProductionSignal, waste: WasteSignal): PrescriptiveRecommendation {
  const gapLabel = prod.gap_pct === null ? 'no production logged' : `${Math.round(prod.gap_pct * 100)}% demand gap`
  const wasteLabel = waste.waste_pct === null ? 'unverified waste (no production logged)' : `${Math.round(waste.waste_pct * 100)}% waste rate`
  return {
    type: 'conflict',
    priority: 'high',
    productId: prod.product_id,
    productName: prod.product_name,
    title: 'Conflicting Signals — Review Before Acting',
    reason: `${prod.product_name} shows both rising demand (${gapLabel}) and excessive waste (${wasteLabel}) in the same ${ANALYSIS_WINDOW_DAYS}-day window — increasing output would likely increase waste too.`,
    recommendedAction: 'High demand detected, but waste is also above the threshold. Review batch size and production scheduling before increasing total output. Address waste first.',
    metrics: {
      'Demand': `${prod.avg_daily_demand} units/day`,
      'Production': `${prod.avg_daily_production} units/day`,
      'Total waste': `${waste.total_disposal} units`,
      'Waste rate': wasteLabel,
    },
  }
}

async function getSlowMovingRecs(): Promise<PrescriptiveRecommendation[]> {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, created_at')
    .eq('is_archived', false)
  if (productsError) throw productsError

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - ANALYSIS_WINDOW_DAYS)

  const { data: saleItems, error: itemsError } = await supabase
    .from('sale_items')
    .select(`product_id, quantity, sales!inner (sale_date)`)
    .eq('sales.is_voided', false)
    .gte('sales.sale_date', windowStart.toISOString())
  if (itemsError) throw itemsError

  const soldByProduct: { [id: string]: number } = {}
  ;(saleItems || []).forEach((item: any) => {
    soldByProduct[item.product_id] = (soldByProduct[item.product_id] || 0) + item.quantity
  })

  return (products || [])
    // Exclude products not yet active for the full window — a new product
    // with low sales on day one hasn't had a fair trial, not proof of weak demand.
    .filter(product => new Date(product.created_at) <= windowStart)
    .map(product => {
      const unitsSold = soldByProduct[product.id] || 0
      if (unitsSold > SLOW_MOVING_MAX_UNITS) return null

      const priority: RecommendationPriority = unitsSold === 0 ? 'medium' : 'low'

      const rec: PrescriptiveRecommendation = {
        type: 'slow_moving',
        priority,
        productId: product.id,
        productName: product.name,
        title: 'Slow-Moving Product',
        reason: `${product.name} sold only ${unitsSold} unit${unitsSold !== 1 ? 's' : ''} in the last ${ANALYSIS_WINDOW_DAYS} days, at or below the configured ${SLOW_MOVING_MAX_UNITS}-unit/week threshold.`,
        recommendedAction: unitsSold === 0
          ? 'Consider pausing production and reviewing whether to continue offering this product.'
          : 'Consider reducing production, running a promotion, or reviewing the product.',
        metrics: {
          'Units sold (7d)': unitsSold,
          'Threshold': `\u2264 ${SLOW_MOVING_MAX_UNITS} units/week`,
        },
      }
      return rec
    })
    .filter((r): r is PrescriptiveRecommendation => r !== null)
}

const PRIORITY_ORDER: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 }

export async function getPrescriptiveRecommendations(): Promise<PrescriptiveRecommendation[]> {
  const [productionSignals, wasteSignals, slowMovingRecs] = await Promise.all([
    getProductionSignals(),
    getWasteSignals(),
    getSlowMovingRecs(),
  ])

  const results: PrescriptiveRecommendation[] = []
  const consumedWasteIds = new Set<string>()

  productionSignals.forEach((prod, productId) => {
    const waste = wasteSignals.get(productId)

    // Conflict: rising demand says "produce more," waste says "produce less."
    // Only a true conflict when production direction is 'increase' — a
    // 'decrease' signal and a waste signal actually agree, not clash.
    // (This naturally never fires for non-production-tracked products,
    // since getProductionSignals() never generates a signal for them.)
    if (prod.direction === 'increase' && waste) {
      results.push(buildConflictRecommendation(prod, waste))
      consumedWasteIds.add(productId)
      return
    }

    results.push(buildProductionRecommendation(prod))
  })

  wasteSignals.forEach((waste, productId) => {
    if (consumedWasteIds.has(productId)) return // already folded into a conflict recommendation
    results.push(buildWasteRecommendation(waste))
  })

  results.push(...slowMovingRecs)

  return results.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
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
  onlineRevenue: number
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
  const onlineRevenue = activeSales.filter(s => s.payment_method === 'online').reduce((sum, s) => sum + Number(s.total_amount), 0)
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
    onlineRevenue,
    items,
    voidedCount: voidedSales.length,
    voidedRevenue,
  }
}