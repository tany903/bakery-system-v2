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
    .slice(0, 12)

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
// PRESCRIPTIVE RECOMMENDATIONS
// =============================================

// Operational recommendations use the most recent 7 calendar days for
// pattern analysis. Restock forecasting above intentionally remains separate
// and continues to use Simple Exponential Smoothing.
const ANALYSIS_WINDOW_DAYS = 7
const SHORT_TERM_WINDOW_DAYS = 3
// A product must have sold at least this many units in the analysis window
// before we call it "selling faster/slower" or recommend making more/less.
// With only a sale or two, a tiny change looks like a huge percentage jump
// (e.g. 1 sale in 7 days -> 2 sales looks like +100%) and just creates noise.
// Raise this number to see fewer, more meaningful recommendations.
const MIN_UNITS_FOR_TREND = 5

export type RecommendationPriority = 'high' | 'medium' | 'low'
export type RecommendationType = 'production' | 'waste' | 'fast_moving' | 'slow_moving'

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

interface DemandPattern {
  dailyDemand: number[]
  ma3: number
  ma7: number
  // Whole-unit totals, used for manager-facing wording
  total3: number
  total7: number
  trendPct: number | null
  trendDirection: 'increasing' | 'decreasing' | 'stable'
  recentMa3: number
  previousMa3: number | null
}

interface ProductionSignal {
  product_id: string
  product_name: string
  demand: DemandPattern
  avg_daily_production: number
  recent_production: number
  production_trend_pct: number | null
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
  waste_pct: number | null
  demand: DemandPattern | null
  avg_daily_production: number
  production_trend_pct: number | null
  priority: RecommendationPriority
  is_production_tracked: boolean
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function calculateTrendPercentage(recentAverage: number, longerAverage: number): number | null {
  if (longerAverage === 0) return recentAverage === 0 ? 0 : null
  return ((recentAverage - longerAverage) / longerAverage) * 100
}

function buildDemandPattern(dailyDemand: number[]): DemandPattern {
  const padded = [...dailyDemand]
  while (padded.length < ANALYSIS_WINDOW_DAYS) padded.unshift(0)

  const ma3 = calculateAverage(padded.slice(-SHORT_TERM_WINDOW_DAYS))
  const ma7 = calculateAverage(padded.slice(-ANALYSIS_WINDOW_DAYS))
  const total3 = Math.round(padded.slice(-SHORT_TERM_WINDOW_DAYS).reduce((sum, v) => sum + v, 0))
  const total7 = Math.round(padded.slice(-ANALYSIS_WINDOW_DAYS).reduce((sum, v) => sum + v, 0))

  // Compare the latest 3-day moving average with the preceding 3-day moving
  // average when possible. This helps distinguish a sustained change from a
  // single unusual day.
  const previousThree = padded.slice(-6, -3)
  const previousMa3 = previousThree.length === SHORT_TERM_WINDOW_DAYS
    ? calculateAverage(previousThree)
    : null

  const trendPct = calculateTrendPercentage(ma3, ma7)
  const trendDirection: DemandPattern['trendDirection'] =
    previousMa3 === null || ma3 === previousMa3
      ? trendPct === null || trendPct === 0
        ? 'stable'
        : trendPct > 0 ? 'increasing' : 'decreasing'
      : ma3 > previousMa3 ? 'increasing' : 'decreasing'

  return {
    dailyDemand: padded,
    ma3: roundMetric(ma3),
    ma7: roundMetric(ma7),
    total3,
    total7,
    trendPct: trendPct === null ? null : roundMetric(trendPct),
    trendDirection,
    recentMa3: roundMetric(ma3),
    previousMa3: previousMa3 === null ? null : roundMetric(previousMa3),
  }
}

function priorityFromPattern(pattern: DemandPattern): RecommendationPriority {
  // Priority is based on how clearly the recent pattern differs from the
  // longer-term pattern, while preserving low priority for a relatively
  // stable demand pattern.
  const magnitude = Math.abs(pattern.trendPct ?? 0)
  if (pattern.trendDirection === 'stable') return 'low'
  if (magnitude >= 30) return 'high'
  if (magnitude >= 10) return 'medium'
  return 'low'
}

function priorityFromOperationalGap(
  demand: DemandPattern,
  productionTrendPct: number | null,
  direction: 'increase' | 'decrease'
): RecommendationPriority {
  const demandMagnitude = Math.abs(demand.trendPct ?? 0)
  const productionMagnitude = Math.abs(productionTrendPct ?? 0)

  if (direction === 'increase' && demandMagnitude >= 30 && productionMagnitude < demandMagnitude) return 'high'
  if (direction === 'decrease' && demandMagnitude >= 30 && productionMagnitude < demandMagnitude) return 'high'
  if (demandMagnitude >= 10 || productionMagnitude >= 10) return 'medium'
  return 'low'
}

function priorityFromWastePattern(
  demand: DemandPattern | null,
  wastePct: number | null,
  productionTrendPct: number | null
): RecommendationPriority {
  const demandMagnitude = Math.abs(demand?.trendPct ?? 0)
  const productionMagnitude = Math.abs(productionTrendPct ?? 0)
  const wasteMagnitude = Math.abs(wastePct ?? 0)

  if (wasteMagnitude >= 30 || (demandMagnitude >= 30 && productionMagnitude >= 20)) return 'high'
  if (wasteMagnitude >= 15 || demandMagnitude >= 10 || productionMagnitude >= 10) return 'medium'
  return 'low'
}

function buildOperationalDailySeries(
  dailyQuantities: { [date: string]: number },
  windowDays: number
): number[] {
  const series: number[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    series.push(Number(dailyQuantities[key] || 0))
  }
  return series
}

async function getProductionSignals(): Promise<Map<string, ProductionSignal>> {
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
      .select('product_id, quantity_produced, production_date')
      .eq('is_voided', false)
      .gte('production_date', windowStart.toISOString()),
  ])
  if (salesErr) throw salesErr
  if (prodErr) throw prodErr

  const demandByProduct: { [id: string]: { [date: string]: number } } = {}
  ;(saleItems || []).forEach((item: any) => {
    const date = item.sales.sale_date.split('T')[0]
    if (!demandByProduct[item.product_id]) demandByProduct[item.product_id] = {}
    demandByProduct[item.product_id][date] =
      (demandByProduct[item.product_id][date] || 0) + Number(item.quantity)
  })

  const productionByProduct: { [id: string]: { [date: string]: number } } = {}
  ;(productionRecords || []).forEach((record: any) => {
    const date = record.production_date.split('T')[0]
    if (!productionByProduct[record.product_id]) productionByProduct[record.product_id] = {}
    productionByProduct[record.product_id][date] =
      (productionByProduct[record.product_id][date] || 0) + Number(record.quantity_produced)
  })

  const signals = new Map<string, ProductionSignal>()

  ;(products || []).forEach(product => {
    const demandSeries = buildOperationalDailySeries(demandByProduct[product.id] || {}, ANALYSIS_WINDOW_DAYS)
    const productionSeries = buildOperationalDailySeries(productionByProduct[product.id] || {}, ANALYSIS_WINDOW_DAYS)
    const demand = buildDemandPattern(demandSeries)

    // Too few sales to say anything meaningful about a trend
    if (demand.total7 < MIN_UNITS_FOR_TREND) return

    const avgDailyProduction = calculateAverage(productionSeries)
    const recentProduction = calculateAverage(productionSeries.slice(-SHORT_TERM_WINDOW_DAYS))
    const previousProduction = calculateAverage(productionSeries.slice(-6, -3))
    const productionTrendPct = previousProduction > 0
      ? roundMetric(((recentProduction - previousProduction) / previousProduction) * 100)
      : recentProduction === 0 ? 0 : null

    const demandIncreasing = demand.trendDirection === 'increasing' && demand.ma3 > demand.ma7
    const demandDecreasing = demand.trendDirection === 'decreasing' && demand.ma3 < demand.ma7
    const productionKeepingUp = recentProduction >= demand.ma3
    const productionExceedingDemand = recentProduction > demand.ma3 && demand.trendDirection !== 'increasing'

    let direction: 'increase' | 'decrease' | null = null
    if (demandIncreasing && !productionKeepingUp) direction = 'increase'
    else if (demandDecreasing && productionExceedingDemand) direction = 'decrease'
    else if (demand.ma7 > 0 && demand.ma3 > demand.ma7 && recentProduction < demand.ma3) direction = 'increase'

    if (!direction) return

    const priority = priorityFromOperationalGap(demand, productionTrendPct, direction)

    signals.set(product.id, {
      product_id: product.id,
      product_name: product.name,
      demand,
      avg_daily_production: roundMetric(avgDailyProduction),
      recent_production: roundMetric(recentProduction),
      production_trend_pct: productionTrendPct,
      direction,
      recommended_daily_production: Math.max(1, Math.ceil(demand.ma3)),
      priority,
    })
  })

  return signals
}

async function getWasteSignals(): Promise<Map<string, WasteSignal>> {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - ANALYSIS_WINDOW_DAYS)

  const [{ data: disposals, error: dispErr }, { data: productionRecords, error: prodErr }, { data: saleItems, error: salesErr }] = await Promise.all([
    supabase
      .from('stock_disposals')
      .select('product_id, type, quantity, created_at, products (name, price, production_tracked)')
      .gte('created_at', windowStart.toISOString()),
    supabase
      .from('production')
      .select('product_id, quantity_produced, production_date')
      .eq('is_voided', false)
      .gte('production_date', windowStart.toISOString()),
    supabase
      .from('sale_items')
      .select(`product_id, quantity, sales!inner (sale_date)`)
      .eq('sales.is_voided', false)
      .gte('sales.sale_date', windowStart.toISOString()),
  ])
  if (dispErr) throw dispErr
  if (prodErr) throw prodErr
  if (salesErr) throw salesErr

  const producedByProduct: { [id: string]: { [date: string]: number } } = {}
  ;(productionRecords || []).forEach((record: any) => {
    const date = record.production_date.split('T')[0]
    if (!producedByProduct[record.product_id]) producedByProduct[record.product_id] = {}
    producedByProduct[record.product_id][date] =
      (producedByProduct[record.product_id][date] || 0) + Number(record.quantity_produced)
  })

  const demandByProduct: { [id: string]: { [date: string]: number } } = {}
  ;(saleItems || []).forEach((item: any) => {
    const date = item.sales.sale_date.split('T')[0]
    if (!demandByProduct[item.product_id]) demandByProduct[item.product_id] = {}
    demandByProduct[item.product_id][date] =
      (demandByProduct[item.product_id][date] || 0) + Number(item.quantity)
  })

  const disposalMap: { [id: string]: {
    name: string
    pullout: number
    oth: number
    value: number
    is_production_tracked: boolean
  } } = {}

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
    if (d.type === 'pullout') entry.pullout += Number(d.quantity)
    else entry.oth += Number(d.quantity)
    entry.value += Number(d.products?.price || 0) * Number(d.quantity)
  })

  const signals = new Map<string, WasteSignal>()

  Object.entries(disposalMap).forEach(([productId, d]) => {
    const totalDisposal = d.pullout + d.oth
    if (totalDisposal === 0) return

    const productionSeries = buildOperationalDailySeries(producedByProduct[productId] || {}, ANALYSIS_WINDOW_DAYS)
    const demandSeries = buildDailySeries(demandByProduct[productId] || {}, ANALYSIS_WINDOW_DAYS)
    const demand = buildDemandPattern(demandSeries)
    const producedInWindow = productionSeries.reduce((sum, value) => sum + value, 0)
    const avgDailyProduction = calculateAverage(productionSeries)
    const recentProduction = calculateAverage(productionSeries.slice(-SHORT_TERM_WINDOW_DAYS))
    const previousProduction = calculateAverage(productionSeries.slice(-6, -3))
    const productionTrendPct = previousProduction > 0
      ? roundMetric(((recentProduction - previousProduction) / previousProduction) * 100)
      : previousProduction === 0 && recentProduction === 0 ? 0 : null

    const wastePct = producedInWindow > 0 ? totalDisposal / producedInWindow : null
    const priority = priorityFromWastePattern(demand, wastePct, productionTrendPct)

    signals.set(productId, {
      product_id: productId,
      product_name: d.name,
      pullout_quantity: d.pullout,
      oth_quantity: d.oth,
      total_disposal: totalDisposal,
      disposal_value: d.value,
      production_quantity_in_window: producedInWindow,
      waste_pct: wastePct === null ? null : roundMetric(wastePct * 100),
      demand,
      avg_daily_production: roundMetric(avgDailyProduction),
      production_trend_pct: productionTrendPct,
      priority,
      is_production_tracked: d.is_production_tracked,
    })
  })

  return signals
}

// ---------------------------------------------------------------------
// Plain-language helpers for the manager-facing recommendation cards.
// Everything shown is a whole number of units (you can't sell 0.3 of a pie).
// ---------------------------------------------------------------------

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`
}

// e.g. "6 sold in the last 3 days, 8 this past week"
function salesSummary(d: DemandPattern): string {
  return `${d.total3} sold in the last 3 days, ${d.total7} this past week`
}

// ---- Production ------------------------------------------------------

function buildProductionRecommendation(s: ProductionSignal): PrescriptiveRecommendation {
  const n = s.recommended_daily_production
  const increase = s.direction === 'increase'
  const madeLast3Days = Math.round(s.recent_production * SHORT_TERM_WINDOW_DAYS)

  return {
    type: 'production',
    priority: s.priority,
    productId: s.product_id,
    productName: s.product_name,
    title: increase ? 'Make More' : 'Make Less',
    reason: increase
      ? `${s.product_name} is selling more than usual (${salesSummary(s.demand)}), but not enough is being made to keep up.`
      : `${s.product_name} is selling less than usual (${salesSummary(s.demand)}), but more than that is still being made.`,
    recommendedAction: increase
      ? `Make about ${n} a day to keep up with sales.`
      : `Cut back to about ${n} a day so less goes unsold.`,
    metrics: {
      'Sold, last 3 days': `${s.demand.total3}`,
      'Made, last 3 days': `${madeLast3Days}`,
    },
  }
}

// ---- Waste -----------------------------------------------------------

function buildWasteRecommendation(s: WasteSignal): PrescriptiveRecommendation {
  const isZeroProduction = s.waste_pct === null
  const isResaleZeroProduction = isZeroProduction && !s.is_production_tracked
  const demandIncreasing = s.demand?.trendDirection === 'increasing'
  const demandDecreasing = s.demand?.trendDirection === 'decreasing'
  const productionHighAgainstDemand = s.avg_daily_production > (s.demand?.ma3 ?? 0)

  const wasted =
    `${plural(s.total_disposal, 'unit')} of ${s.product_name} ` +
    `${s.total_disposal === 1 ? 'was' : 'were'} thrown away or given away recently ` +
    `(₱${s.disposal_value.toFixed(2)})`

  let title: string
  let reason: string
  let recommendedAction: string

  if (isResaleZeroProduction) {
    title = 'Check Resale Item Waste'
    reason = `${wasted}. This is a resale item.`
    recommendedAction = 'Check how it is stored, when it expires, and how much you are buying in.'
  } else if (isZeroProduction) {
    title = 'Waste With No Production Record'
    reason = `${wasted}, but no production was recorded for it.`
    recommendedAction = 'Check the disposal and production records for missing or wrong entries.'
  } else if (demandDecreasing && productionHighAgainstDemand) {
    title = 'Make Less to Reduce Waste'
    reason = `${wasted} — about ${Math.round(s.waste_pct as number)}% of what was made. Sales are also slowing down.`
    recommendedAction = 'Make fewer, or bake in smaller batches.'
  } else if (demandIncreasing) {
    title = 'Waste Even Though Sales Are Up'
    reason = `${wasted} — about ${Math.round(s.waste_pct as number)}% of what was made, even though sales are going up.`
    recommendedAction = 'Keep making enough to meet sales, but check batch sizes and how long items sit before they sell.'
  } else {
    title = 'Reduce Waste'
    reason = `${wasted} — about ${Math.round(s.waste_pct as number)}% of what was made.`
    recommendedAction = 'Check batch sizes and how long items sit before they sell.'
  }

  const metrics: Record<string, number | string | null> = {
    'Made': `${s.production_quantity_in_window} units`,
    'Wasted': `${s.total_disposal} units`,
  }
  if (!isZeroProduction) metrics['Share wasted'] = `${Math.round(s.waste_pct as number)}%`
  metrics['Value lost'] = `₱${s.disposal_value.toFixed(2)}`

  return {
    type: 'waste',
    priority: s.priority,
    productId: s.product_id,
    productName: s.product_name,
    title,
    reason,
    recommendedAction,
    metrics,
  }
}

// ---- Fast / slow moving ---------------------------------------------

function buildFastMovingRecommendation(productId: string, productName: string, demand: DemandPattern): PrescriptiveRecommendation {
  return {
    type: 'fast_moving',
    priority: priorityFromPattern(demand),
    productId,
    productName,
    title: 'Selling Faster Than Usual',
    reason: `${productName} has been selling more than usual (${salesSummary(demand)}).`,
    recommendedAction: 'Make sure you have enough in stock, and make more if it runs low.',
    metrics: {},
  }
}

function buildSlowMovingRecommendation(productId: string, productName: string, demand: DemandPattern): PrescriptiveRecommendation {
  const noDemand = demand.total7 === 0

  return {
    type: 'slow_moving',
    priority: priorityFromPattern(demand),
    productId,
    productName,
    title: noDemand ? 'Not Selling' : 'Selling Slower Than Usual',
    reason: noDemand
      ? `${productName} has not sold at all this past week.`
      : `${productName} has been selling less than usual (${salesSummary(demand)}).`,
    recommendedAction: noDemand
      ? 'Decide whether to keep making it, promote it, or take it off the menu.'
      : 'Make smaller batches or run a promotion.',
    metrics: {},
  }
}

async function getFastAndSlowMovingRecs(): Promise<PrescriptiveRecommendation[]> {
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

  const dailyByProduct: { [id: string]: { [date: string]: number } } = {}
  ;(saleItems || []).forEach((item: any) => {
    const date = item.sales.sale_date.split('T')[0]
    if (!dailyByProduct[item.product_id]) dailyByProduct[item.product_id] = {}
    dailyByProduct[item.product_id][date] =
      (dailyByProduct[item.product_id][date] || 0) + Number(item.quantity)
  })

  const results: PrescriptiveRecommendation[] = []

  ;(products || [])
    .filter(product => new Date(product.created_at) <= windowStart)
    .forEach(product => {
      const dailySeries = buildOperationalDailySeries(dailyByProduct[product.id] || {}, ANALYSIS_WINDOW_DAYS)
      const demand = buildDemandPattern(dailySeries)

      // Fast-moving requires an upward recent pattern and enough sales to
      // trust it (a single extra sale on a slow product is not a trend).
      if (
        demand.total7 >= MIN_UNITS_FOR_TREND &&
        demand.ma3 > demand.ma7 &&
        demand.trendDirection === 'increasing'
      ) {
        results.push(buildFastMovingRecommendation(product.id, product.name, demand))
        return
      }

      // Slow-moving is either no sales at all this week, or a clear drop from
      // a product that normally sells enough to tell the difference.
      if (
        demand.total7 === 0 ||
        (demand.total7 >= MIN_UNITS_FOR_TREND &&
          demand.ma3 < demand.ma7 &&
          demand.trendDirection === 'decreasing')
      ) {
        results.push(buildSlowMovingRecommendation(product.id, product.name, demand))
      }
    })

  return results
}

const PRIORITY_ORDER: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 }

export async function getPrescriptiveRecommendations(): Promise<PrescriptiveRecommendation[]> {
  const [productionSignals, wasteSignals, movingRecs] = await Promise.all([
    getProductionSignals(),
    getWasteSignals(),
    getFastAndSlowMovingRecs(),
  ])

  const results: PrescriptiveRecommendation[] = []

  productionSignals.forEach(prod => {
    results.push(buildProductionRecommendation(prod))
  })

  wasteSignals.forEach(waste => {
    results.push(buildWasteRecommendation(waste))
  })

  results.push(...movingRecs)

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