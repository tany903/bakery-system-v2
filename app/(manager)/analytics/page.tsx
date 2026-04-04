'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getSalesSummary,
  getExpenseVsRevenue,
  getRestockPredictions,
  getSalesTrend,
  getBestSellingDays,
  exportSalesToCSV,
  exportExpensesToCSV,
  getDisposalAnalytics,
  getWeeklyBreakdown,
  getDailySalesBreakdown, //watch
  type DisposalAnalytics,
  type WeeklyBreakdown,
  type SalesSummary,
  type ExpenseVsRevenue,
  type RestockPrediction,
  type SalesTrend,
  type BestSellingDay,
  type DailySalesBreakdown, //watch
} from '@/lib/analytics'
import {
  BarChart, Bar, ComposedChart, Area, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ManagerSidebar from '@/components/ManagerSidebar'

type Period = 'today' | 'week' | 'month' | 'year'

function getPeriodDates(period: Period): { startDate: Date; endDate: Date; label: string } {
  const now = new Date()
  const endDate = new Date(now)
  switch (period) {
    case 'today': {
      const startDate = new Date(now); startDate.setHours(0,0,0,0)
      return { startDate, endDate, label: 'Today' }
    }
    case 'week': {
      const startDate = new Date(now); startDate.setDate(now.getDate()-6); startDate.setHours(0,0,0,0)
      return { startDate, endDate, label: 'Last 7 Days' }
    }
    case 'month': {
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      return { startDate, endDate, label: now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) }
    }
    case 'year': {
      const startDate = new Date(now.getFullYear(), 0, 1)
      return { startDate, endDate, label: `${now.getFullYear()}` }
    }
  }
}

// ─── CUSTOM TOOLTIPS ────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-sm overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 160 }}>
      <div className="px-3 py-2" style={{ backgroundColor: '#220901' }}>
        <p className="text-white text-xs font-black">
          {new Date(label).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      </div>
      <div className="px-3 py-2 bg-white">
        <p className="text-xs text-gray-400 font-semibold mb-0.5">Revenue</p>
        <p className="font-black text-lg" style={{ color: '#7B1111' }}>
          ₱{Number(payload[0]?.value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  )
}

function ProductTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-sm overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 180 }}>
      <div className="px-3 py-2" style={{ backgroundColor: '#220901' }}>
        <p className="text-white text-xs font-black truncate">{label}</p>
      </div>
      <div className="px-3 py-2 bg-white">
        <p className="text-xs text-gray-400 font-semibold mb-0.5">Total Revenue</p>
        <p className="font-black text-lg" style={{ color: '#7B1111' }}>
          ₱{Number(payload[0]?.value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  )
}

function ExpenseTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const revenue = payload.find((p: any) => p.dataKey === 'revenue')?.value || 0
  const expenses = payload.find((p: any) => p.dataKey === 'expenses')?.value || 0
  const net = revenue - expenses
  return (
    <div className="rounded-sm overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 180 }}>
      <div className="px-3 py-2" style={{ backgroundColor: '#1a2340' }}>
        <p className="text-white text-xs font-black">{label}</p>
      </div>
      <div className="bg-white divide-y divide-gray-100">
        <div className="px-3 py-2 flex justify-between items-center gap-6">
          <span className="text-xs font-semibold text-gray-500">Revenue</span>
          <span className="font-black text-sm text-green-600">₱{Number(revenue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="px-3 py-2 flex justify-between items-center gap-6">
          <span className="text-xs font-semibold text-gray-500">Expenses</span>
          <span className="font-black text-sm text-red-500">₱{Number(expenses).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="px-3 py-2 flex justify-between items-center gap-6">
          <span className="text-xs font-semibold text-gray-500">Net</span>
          <span className="font-black text-sm" style={{ color: net >= 0 ? '#16a34a' : '#dc2626' }}>
            {net >= 0 ? '+' : ''}₱{Math.abs(net).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  )
}

function WeeklyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const revenue = payload.find((p: any) => p.dataKey === 'revenue')?.value || 0
  const expenses = payload.find((p: any) => p.dataKey === 'expenses')?.value || 0
  const net = revenue - expenses
  return (
    <div className="rounded-sm overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 190 }}>
      <div className="px-3 py-2" style={{ backgroundColor: '#1a2340' }}>
        <p className="text-white text-xs font-black">{label}</p>
      </div>
      <div className="bg-white divide-y divide-gray-100">
        <div className="px-3 py-2 flex justify-between items-center gap-6">
          <span className="text-xs font-semibold text-gray-500">Revenue</span>
          <span className="font-black text-sm text-green-600">₱{Number(revenue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="px-3 py-2 flex justify-between items-center gap-6">
          <span className="text-xs font-semibold text-gray-500">Expenses</span>
          <span className="font-black text-sm text-red-500">₱{Number(expenses).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="px-3 py-2 flex justify-between items-center gap-6">
          <span className="text-xs font-semibold text-gray-500">Net</span>
          <span className="font-black text-sm" style={{ color: net >= 0 ? '#16a34a' : '#dc2626' }}>
            {net >= 0 ? '+' : ''}₱{Math.abs(net).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [expenseData, setExpenseData] = useState<ExpenseVsRevenue[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [predictions, setPredictions] = useState<RestockPrediction[]>([])
  const [trend, setTrend] = useState<SalesTrend | null>(null)
  const [bestDays, setBestDays] = useState<BestSellingDay[]>([])
  const [disposalStats, setDisposalStats] = useState<DisposalAnalytics | null>(null)
  const [drilldownMonth, setDrilldownMonth] = useState<{ label: string; year: number; month: number } | null>(null)
  const [weeklyData, setWeeklyData] = useState<WeeklyBreakdown[]>([])
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [dailyDate, setDailyDate] = useState<string>(() => new Date().toISOString().split('T')[0]) //watch
  const [dailyData, setDailyData] = useState<DailySalesBreakdown | null>(null) //watch
  const [dailyLoading, setDailyLoading] = useState(false) //watch
  const [dailyError, setDailyError] = useState('') //watch

  useEffect(() => { checkAuthAndLoad() }, [])
  useEffect(() => { if (!loading) loadSummary() }, [period])
  useEffect(() => { if (!loading) loadDailyBreakdown(dailyDate) }, [dailyDate, loading]) //watch


  async function checkAuthAndLoad() {
    try {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      const profile = await getUserProfile(user.id)
      if (!profile || profile.role !== 'manager') { router.push('/dashboard'); return }
      await Promise.all([loadSummary(), loadExpenseData(), loadPrescriptive()])
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  async function loadSummary() {
    try {
      setLoading(true)
      const { startDate, endDate } = getPeriodDates(period)
      const [data, trendData, disposalData] = await Promise.all([
        getSalesSummary(startDate, endDate),
        getSalesTrend(period),
        getDisposalAnalytics(startDate, endDate),
      ])
      setSummary(data); setTrend(trendData); setDisposalStats(disposalData)
    } catch { setError('Failed to load analytics data.') }
    finally { setLoading(false) }
  }

  async function loadExpenseData() {
    try { setExpenseData(await getExpenseVsRevenue()) } catch {}
  }

  async function loadPrescriptive() {
    try {
      const [predictionsData, bestDaysData] = await Promise.all([getRestockPredictions(), getBestSellingDays()])
      setPredictions(predictionsData); setBestDays(bestDaysData)
    } catch {}
  }

  function handleExportSales() {
    if (!summary) return
    exportSalesToCSV(summary, getPeriodDates(period).label)
  }

  async function handleMonthDrilldown(monthLabel: string) {
    const monthNames: { [k: string]: number } = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 }
    const parts = monthLabel.split(' ')
    const monthNum = monthNames[parts[0]]
    const year = 2000 + parseInt(parts[1]?.replace("'", '') || '26')
    if (!monthNum || !year) return
    setDrilldownLoading(true)
    setDrilldownMonth({ label: monthLabel, year, month: monthNum })
    try {
      const data = await getWeeklyBreakdown(year, monthNum)
      setWeeklyData(data)
    } catch {}
    finally { setDrilldownLoading(false) }
  }

  async function loadDailyBreakdown(dateStr: string) { //watch
  setDailyLoading(true)
  setDailyError('')
  try {
    const data = await getDailySalesBreakdown(new Date(dateStr))
    setDailyData(data)
  } catch {
    setDailyError('Failed to load daily sales data.')
  } finally {
    setDailyLoading(false)
  }
} // watch


  const handleLogout = async () => { await signOut(); router.push('/login') }


  const periodButtons: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
  ]

  const StatCard = ({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'orange' }) => (
    <div className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
      <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">{label}</p>
      <p className={`text-2xl font-black ${
        highlight === 'green' ? 'text-green-400' :
        highlight === 'red' ? 'text-red-400' :
        highlight === 'orange' ? 'text-orange-400' : 'text-white'
      }`}>{value}</p>
      {sub && <p className="text-white text-xs opacity-50 mt-1">{sub}</p>}
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  const activeMonths = expenseData.filter(d => d.revenue > 0 || d.expenses > 0)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>

      {/* TOP NAVBAR */}
      <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
            <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
        </div>
        <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors">
          <span className="text-base font-bold">→</span>
          <span className="text-xs font-semibold">Logout</span>
        </button>
      </div>

      <div className="flex flex-1 relative">
        <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

        {/* SIDEBAR */}
      <ManagerSidebar />

        {/* MAIN CONTENT */}
        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h1 className="text-4xl font-black text-gray-900">Analytics & Reports</h1>
            <div className="flex gap-2">
              <button onClick={handleExportSales} disabled={!summary}
                className="px-4 py-2 rounded-sm font-bold text-white text-xs disabled:opacity-50 bg-green-600 hover:bg-green-700">
                ↓ Export Sales CSV
              </button>
              <button onClick={() => exportExpensesToCSV(expenseData)} disabled={expenseData.length === 0}
                className="px-4 py-2 rounded-sm font-bold text-white text-xs disabled:opacity-50 bg-blue-600 hover:bg-blue-700">
                ↓ Export Revenue CSV
              </button>
            </div>
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}

          {/* Period Selector */}
          <div className="flex gap-2 mb-6">
            {periodButtons.map(({ key, label }) => (
              <button key={key} onClick={() => setPeriod(key)}
                className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
                style={period === key
                  ? { backgroundColor: '#1a2340', color: 'white' }
                  : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
                }>
                {label}
              </button>
            ))}
          </div>

          {summary && (
            <>
              {/* ── STAT CARDS ── */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label="Total Revenue" value={`₱${summary.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} sub={`${summary.totalTransactions} transactions`} />
                <StatCard label="Avg Order Value" value={`₱${summary.averageOrderValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                <StatCard label="Cash Revenue" value={`₱${summary.cashRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} sub={`${summary.totalRevenue > 0 ? ((summary.cashRevenue/summary.totalRevenue)*100).toFixed(0) : 0}% of total`} />
                <StatCard label="Online Revenue" value={`₱${summary.onlineRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} sub={`${summary.totalRevenue > 0 ? ((summary.onlineRevenue/summary.totalRevenue)*100).toFixed(0) : 0}% of total`} />
              </div>

              {/* ── LOSS STAT CARDS ── */}
              {disposalStats && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <StatCard label="Pull-outs" value={`${disposalStats.totalPullouts} units`} sub={`₱${disposalStats.pulloutValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} value lost`} highlight="red" />
                  <StatCard label="On the House (OTH)" value={`${disposalStats.totalOTH} units`} sub={`₱${disposalStats.othValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} given away`} highlight="orange" />
                  <StatCard label="Total Losses" value={`${disposalStats.totalLosses} units`} sub={`₱${disposalStats.totalLossValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} total`} highlight={disposalStats.totalLossValue > 0 ? 'red' : undefined} />
                </div>
              )}

              {/* ── CHART 1: REVENUE OVER TIME ── */}
              {summary.dailyStats.length > 1 && (
                <div className="rounded-sm mb-5 overflow-hidden" style={{ backgroundColor: 'white', boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="px-6 pt-5 pb-2 flex items-end justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Revenue Over Time</p>
                      <p className="text-2xl font-black text-gray-900">
                        ₱{summary.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        <span className="text-sm font-semibold text-gray-400 ml-2">{getPeriodDates(period).label}</span>
                      </p>
                    </div>
                    {trend && (
                      <div className={`px-3 py-1.5 rounded-sm text-xs font-black mb-1 ${
                        trend.trend === 'up' ? 'bg-green-100 text-green-700' :
                        trend.trend === 'down' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→'} {Math.abs(trend.percentageChange)}% vs prev period
                      </div>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={summary.dailyStats} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7B1111" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#7B1111" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="#f3f4f6" vertical={false} />
                      <XAxis
                        dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }}
                        tickFormatter={val => new Date(val).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        axisLine={false} tickLine={false}
                        tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }}
                        tickFormatter={val => val >= 1000 ? `₱${(val/1000).toFixed(0)}k` : `₱${val}`}
                        width={48}
                      />
                      <Tooltip content={<RevenueTooltip />} cursor={{ stroke: '#7B1111', strokeWidth: 1, strokeDasharray: '4 4' }} />
                      <Area
                        type="monotone" dataKey="revenue"
                        stroke="#7B1111" strokeWidth={2.5}
                        fill="url(#revenueGrad)"
                        dot={false}
                        activeDot={{ r: 5, fill: '#7B1111', stroke: 'white', strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── CHART 2: TOP PRODUCTS ── */}
              {summary.topProducts.length > 0 && (
                <div className="grid grid-cols-2 gap-5 mb-5">
                  {/* Bar chart */}
                  <div className="rounded-sm overflow-hidden" style={{ backgroundColor: 'white', boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                    <div className="px-6 pt-5 pb-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Top Products</p>
                      <p className="text-xl font-black text-gray-900">By Revenue</p>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={summary.topProducts.slice(0, 6)}
                        layout="vertical"
                        margin={{ top: 0, right: 24, left: 8, bottom: 12 }}
                        barCategoryGap="30%"
                      >
                        <CartesianGrid strokeDasharray="4 4" stroke="#f3f4f6" horizontal={false} />
                        <XAxis
                          type="number" axisLine={false} tickLine={false}
                          tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }}
                          tickFormatter={val => val >= 1000 ? `₱${(val/1000).toFixed(0)}k` : `₱${val}`}
                        />
                        <YAxis
                          type="category" dataKey="product_name"
                          axisLine={false} tickLine={false}
                          tick={{ fontSize: 10, fill: '#374151', fontWeight: 700 }}
                          width={110}
                        />
                        <Tooltip content={<ProductTooltip />} cursor={{ fill: 'rgba(123,17,17,0.04)' }} />
                        <Bar dataKey="total_revenue" radius={[0, 6, 6, 0]} maxBarSize={20}>
                          {summary.topProducts.slice(0, 6).map((_, i) => (
                            <Cell key={i} fill={i === 0 ? '#7B1111' : i === 1 ? '#a03030' : i === 2 ? '#c45555' : i === 3 ? '#d47070' : '#e0a0a0'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Leaderboard */}
                  <div className="rounded-sm overflow-hidden" style={{ backgroundColor: 'white', boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                    <div className="px-6 pt-5 pb-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Best Sellers</p>
                      <p className="text-xl font-black text-gray-900">Ranked by Revenue</p>
                    </div>
                    <div className="px-4 pb-4 space-y-1">
                      {summary.topProducts.map((product, index) => {
                        const maxRev = summary.topProducts[0].total_revenue
                        const pct = maxRev > 0 ? (product.total_revenue / maxRev) * 100 : 0
                        return (
                          <div key={product.product_name} className="px-3 py-3 rounded-sm hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-xs font-black w-5 shrink-0" style={{ color: index === 0 ? '#F5A623' : '#9ca3af' }}>
                                #{index + 1}
                              </span>
                              <span className="text-sm font-black text-gray-800 flex-1 truncate">{product.product_name}</span>
                              <span className="text-sm font-black shrink-0" style={{ color: '#7B1111' }}>
                                ₱{product.total_revenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: index === 0 ? '#7B1111' : '#daa0a0' }} />
                              </div>
                              <span className="text-xs text-gray-400 font-semibold shrink-0">{product.total_quantity} pcs</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {summary.totalTransactions === 0 && (
                <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16 mb-5" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="text-5xl mb-3">📭</div>
                  <p className="text-lg font-bold text-gray-600">No sales data for this period</p>
                </div>
              )}
            </>
          )}

          {/* ── CHART 3: REVENUE VS EXPENSES ── */}
          {activeMonths.length > 0 && (
            <div className="rounded-sm overflow-hidden mb-5" style={{ backgroundColor: 'white', boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>

              {/* ── DRILLDOWN VIEW ── */}
              {drilldownMonth ? (
                <>
                  <div className="px-6 py-4 flex items-center gap-4" style={{ backgroundColor: '#1a2340' }}>
                    <button onClick={() => { setDrilldownMonth(null); setWeeklyData([]) }}
                      className="flex items-center gap-1.5 text-white text-xs font-black px-3 py-1.5 rounded-sm transition-colors"
                      style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                      ← Back
                    </button>
                    <div>
                      <p className="text-white font-black">{drilldownMonth.label}</p>
                      <p className="text-white text-xs opacity-50">Weekly Breakdown</p>
                    </div>
                  </div>

                  {drilldownLoading ? (
                    <div className="flex items-center justify-center py-16 text-gray-400 text-sm font-semibold">Loading...</div>
                  ) : weeklyData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="text-4xl mb-3">📭</div>
                      <p className="text-sm font-bold text-gray-500">No data for this month</p>
                    </div>
                  ) : (
                    <>
                      <div className="px-6 pt-5 pb-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Revenue vs Expenses</p>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={weeklyData} margin={{ top: 10, right: 24, left: 0, bottom: 8 }} barCategoryGap="35%">
                          <CartesianGrid strokeDasharray="4 4" stroke="#f3f4f6" vertical={false} />
                          <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} tickFormatter={val => val >= 1000 ? `₱${(val/1000).toFixed(0)}k` : `₱${val}`} width={48} />
                          <Tooltip content={<WeeklyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                          <Bar dataKey="revenue" fill="#16a34a" radius={[4,4,0,0]} maxBarSize={36} />
                          <Bar dataKey="expenses" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 border-t border-gray-100">
                            <th className="px-5 py-3 font-bold uppercase tracking-wide">Week</th>
                            <th className="px-5 py-3 font-bold uppercase tracking-wide text-green-600">Revenue</th>
                            <th className="px-5 py-3 font-bold uppercase tracking-wide text-red-500">Expenses</th>
                            <th className="px-5 py-3 font-bold uppercase tracking-wide">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weeklyData.map(w => (
                            <tr key={w.week} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-5 py-3 text-xs font-semibold text-gray-600">{w.week}</td>
                              <td className="px-5 py-3 text-sm font-black text-green-600">₱{w.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                              <td className="px-5 py-3 text-sm font-black text-red-500">₱{w.expenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                              <td className="px-5 py-3 text-sm font-black" style={{ color: w.net >= 0 ? '#16a34a' : '#dc2626' }}>
                                {w.net >= 0 ? '+' : ''}₱{w.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              ) : (
                /* ── OVERVIEW ── */
                <>
                  <div className="px-6 pt-5 pb-2 flex items-end justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Financial Overview</p>
                      <p className="text-xl font-black text-gray-900">Revenue vs Expenses
                        <span className="text-sm font-semibold text-gray-400 ml-2">Last 6 Months</span>
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 font-semibold mb-1">Click a month to drill down →</p>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={activeMonths}
                      margin={{ top: 10, right: 24, left: 0, bottom: 8 }}
                      barCategoryGap="35%"
                      onClick={(e: any) => { if (e?.activePayload?.[0]?.payload?.month) handleMonthDrilldown(e.activePayload[0].payload.month) }}
                    >
                      <CartesianGrid strokeDasharray="4 4" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} tickFormatter={val => val >= 1000 ? `₱${(val/1000).toFixed(0)}k` : `₱${val}`} width={48} />
                      <Tooltip content={<ExpenseTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                      <Bar dataKey="revenue" fill="#16a34a" radius={[4,4,0,0]} maxBarSize={36} style={{ cursor: 'pointer' }} />
                      <Bar dataKey="expenses" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={36} style={{ cursor: 'pointer' }} />
                    </BarChart>
                  </ResponsiveContainer>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-t border-gray-100">
                        <th className="px-5 py-3 font-bold uppercase tracking-wide">Month</th>
                        <th className="px-5 py-3 font-bold uppercase tracking-wide text-green-600">Revenue</th>
                        <th className="px-5 py-3 font-bold uppercase tracking-wide text-red-500">Expenses</th>
                        <th className="px-5 py-3 font-bold uppercase tracking-wide">Net Income</th>
                        <th className="px-5 py-3 font-bold uppercase tracking-wide">Status</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeMonths.map(d => (
                        <tr key={d.month} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer group" onClick={() => handleMonthDrilldown(d.month)}>
                          <td className="px-5 py-3 text-sm font-black text-gray-800">{d.month}</td>
                          <td className="px-5 py-3 text-sm font-black text-green-600">₱{d.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                          <td className="px-5 py-3 text-sm font-black text-red-500">₱{d.expenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                          <td className="px-5 py-3 text-sm font-black" style={{ color: d.net >= 0 ? '#16a34a' : '#dc2626' }}>
                            {d.net >= 0 ? '+' : ''}₱{d.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${d.net >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {d.net >= 0 ? '● Profitable' : '● Loss'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-300 font-bold group-hover:text-gray-500 transition-colors">→</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}


<h2 className="text-2xl font-black text-gray-900 mb-4">Daily Sales Breakdown</h2>

  <div className="bg-white rounded-sm p-4 mb-4 flex items-center gap-4" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
    <label className="text-xs font-bold text-gray-500">Select Date</label>
    <input
      type="date"
      value={dailyDate}
      max={new Date().toISOString().split('T')[0]}
      onChange={e => setDailyDate(e.target.value)}
      className="text-sm font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none text-gray-900"
    />
    <span className="text-xs text-gray-400 font-semibold">
      {new Date(dailyDate).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
    </span>
  </div>

  {dailyError && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{dailyError}</div>}

  {dailyLoading ? (
    <div className="bg-white rounded-sm flex items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
      <p className="text-gray-400 font-semibold text-sm">Loading...</p>
    </div>
  ) : dailyData ? (
    <>
   
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
          <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Total Revenue</p>
          <p className="text-2xl font-black text-white">₱{dailyData.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-white text-xs opacity-50 mt-1">{dailyData.totalTransactions} transaction{dailyData.totalTransactions !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
          <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Cash</p>
          <p className="text-2xl font-black text-green-400">₱{dailyData.cashRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-white text-xs opacity-50 mt-1">{dailyData.totalRevenue > 0 ? ((dailyData.cashRevenue / dailyData.totalRevenue) * 100).toFixed(0) : 0}% of total</p>
        </div>
        <div className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
          <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">GCash / Card</p>
          <p className="text-2xl font-black text-blue-400">₱{(dailyData.gcashRevenue + dailyData.cardRevenue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-white text-xs opacity-50 mt-1">GCash ₱{dailyData.gcashRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })} · Card ₱{dailyData.cardRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
          <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Voided</p>
          <p className="text-2xl font-black text-red-400">{dailyData.voidedCount}</p>
          <p className="text-white text-xs opacity-50 mt-1">₱{dailyData.voidedRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} lost</p>
        </div>
      </div>

      
      {dailyData.items.length === 0 ? (
        <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
          <div className="text-5xl mb-3">📭</div>
          <p className="text-lg font-bold text-gray-600">No sales on this day</p>
        </div>
      ) : (
        <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
            <span className="text-white text-lg">🧁</span>
            <h2 className="font-bold text-white">Items Sold</h2>
            <span className="ml-auto text-xs text-white opacity-60">{dailyData.items.length} product{dailyData.items.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="px-5 py-3 font-semibold">Rank</th>
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-5 py-3 font-semibold text-center">Qty Sold</th>
                <th className="px-5 py-3 font-semibold text-right">Revenue</th>
                <th className="px-5 py-3 font-semibold text-right">% of Day</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.items.map((item, index) => {
                const pct = dailyData.totalRevenue > 0 ? ((item.revenue / dailyData.totalRevenue) * 100).toFixed(1) : '0'
                return (
                  <tr key={item.product_name} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-xs font-black" style={{ color: index === 0 ? '#F5A623' : '#9ca3af' }}>
                      #{index + 1}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-800">{item.product_name}</td>
                    <td className="px-5 py-3 text-sm font-black text-gray-700 text-center">{item.quantity}</td>
                    <td className="px-5 py-3 text-sm font-black text-gray-900 text-right">
                      ₱{item.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#7B1111' }} />
                        </div>
                        <span className="text-xs text-gray-400 font-semibold w-8">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={2} className="px-5 py-3 text-xs font-bold text-gray-700">Total</td>
                <td className="px-5 py-3 text-sm font-black text-gray-900 text-center">
                  {dailyData.items.reduce((sum, i) => sum + i.quantity, 0)} pcs
                </td>
                <td className="px-5 py-3 text-sm font-black text-gray-900 text-right">
                  ₱{dailyData.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  ) : null}
<br />
          {/* ── PRESCRIPTIVE ANALYTICS ── */}
          <div className="mb-5">
            <h2 className="text-2xl font-black text-gray-900 mb-4">Prescriptive Analytics</h2>

            {trend && (
              <div className={`rounded-sm p-5 mb-5 ${trend.trend === 'up' ? 'bg-green-50' : trend.trend === 'down' ? 'bg-red-50' : 'bg-white'}`}
                style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{trend.trend === 'up' ? '📈' : trend.trend === 'down' ? '📉' : '➡️'}</span>
                  <div className="flex-1">
                    <p className="font-black text-gray-900 text-lg">
                      Revenue is {trend.trend === 'up' ? 'trending up' : trend.trend === 'down' ? 'trending down' : 'stable'}
                      {trend.percentageChange !== 0 && ` (${trend.percentageChange > 0 ? '+' : ''}${trend.percentageChange}%)`}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {trend.trend === 'up' ? 'Great job! Revenue increased vs the previous period.'
                        : trend.trend === 'down' ? 'Revenue dropped vs the previous period. Consider running a promotion or reviewing margins.'
                        : 'Revenue is stable vs the previous period.'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Previous: ₱{trend.previousPeriodRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} → Current: ₱{trend.currentPeriodRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white rounded-sm p-6" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <img src="/icons/Box.svg" alt="" className="w-5 h-5 opacity-50" />
                  <h3 className="font-black text-gray-900">Restock Predictions</h3>
                </div>
                <p className="text-xs text-gray-400 mb-4">Based on avg daily sales from the last 14 days.</p>
                {predictions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">📭</div>
                    <p className="text-sm">Not enough sales data yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {predictions.map(p => (
                      <div key={p.product_name} className={`p-4 rounded-sm border ${
                        p.urgency === 'critical' ? 'bg-red-50 border-red-200' :
                        p.urgency === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-sm text-gray-900 flex items-center gap-1">
                              {p.urgency === 'critical' && <span>🚨</span>}
                              {p.urgency === 'warning' && <span>⚠️</span>}
                              {p.urgency === 'ok' && <span>✅</span>}
                              {p.product_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">Stock: {p.current_shop_stock} pcs • Avg: {p.avg_daily_sales}/day</p>
                            {p.days_until_stockout !== null && (
                              <p className={`text-xs font-semibold mt-0.5 ${p.urgency === 'critical' ? 'text-red-600' : p.urgency === 'warning' ? 'text-yellow-600' : 'text-gray-400'}`}>
                                {p.days_until_stockout === 0 ? '⚡ Stockout today!' : `Runs out in ~${p.days_until_stockout} day${p.days_until_stockout !== 1 ? 's' : ''}`}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black" style={{ color: '#F5A623' }}>+{p.recommended_restock} pcs</p>
                            <p className="text-xs text-gray-400">7-day supply</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-sm p-6" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <img src="/icons/Bar_chart.svg" alt="" className="w-5 h-5 opacity-50" />
                  <h3 className="font-black text-gray-900">Best Days to Stock Up</h3>
                </div>
                <p className="text-xs text-gray-400 mb-4">Based on avg revenue per day over the last 30 days.</p>
                {bestDays.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">📭</div>
                    <p className="text-sm">Not enough sales data yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bestDays.map((d, index) => {
                      const pct = bestDays[0].avgRevenue > 0 ? Math.round((d.avgRevenue / bestDays[0].avgRevenue) * 100) : 0
                      return (
                        <div key={d.day}>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-gray-700">
                              {index === 0 ? '🏆 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '    '}{d.day}
                            </span>
                            <span className="text-gray-500">₱{d.avgRevenue.toLocaleString('en-PH')} avg</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#7B1111' }} />
                          </div>
                        </div>
                      )
                    })}
                    <p className="text-xs text-gray-400 mt-2">💡 Stock up the day before your busiest days!</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-5">
  
</div>

        </div>
      </div>
    </div>
  )
}
