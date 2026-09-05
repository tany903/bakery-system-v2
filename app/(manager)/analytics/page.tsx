'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getSalesSummary,
  getExpenseVsRevenue,
  getRestockRecommendations,
  getSalesTrend,
  getBestSellingDays,
  exportSalesToCSV,
  exportExpensesToCSV,
  getDisposalAnalytics,
  getWeeklyBreakdown,
  getDailySalesBreakdown,
  getPrescriptiveRecommendations,
  type DisposalAnalytics,
  type WeeklyBreakdown,
  type SalesSummary,
  type ExpenseVsRevenue,
  type RestockRecommendation,
  type SalesTrend,
  type BestSellingDay,
  type DailySalesBreakdown,
  type PrescriptiveRecommendation,
  type RecommendationPriority,
  type RecommendationType,
} from '@/lib/analytics'
import {
  BarChart, Bar, ComposedChart, Area, Cell, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ManagerSidebar from '@/components/ManagerSidebar'
import { LogoSmall, LogoWatermark } from '@/components/Logo'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { exportAnalyticsToPDF } from '@/lib/pdf-export'
import LogoutButton from '@/components/LogoutButton'


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

// ─── PRESCRIPTIVE RECOMMENDATION CARD ───────────────────────────

const PRIORITY_STYLES: Record<RecommendationPriority, {
  badge: string
  border: string
  bg: string
  dot: string
}> = {
  high: {
    badge: 'bg-red-100 text-red-700',
    border: 'border-red-200',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
  },
  medium: {
    badge: 'bg-yellow-100 text-yellow-800',
    border: 'border-yellow-200',
    bg: 'bg-yellow-50',
    dot: 'bg-yellow-500',
  },
  low: {
    badge: 'bg-gray-100 text-gray-600',
    border: 'border-gray-200',
    bg: 'bg-gray-50',
    dot: 'bg-gray-400',
  },
}

const TYPE_LABELS: Record<RecommendationType, string> = {
  production: 'Production',
  waste: 'Waste Reduction',
  slow_moving: 'Slow-Moving Product',
  conflict: 'Conflict / Review',
}

// How many metrics to show collapsed before the "View details" toggle
const METRICS_PREVIEW_COUNT = 2

function formatMetricValue(value: number | string | null): string {
  if (value === null) return '—'
  return String(value)
}

function RecommendationCard({ rec }: { rec: PrescriptiveRecommendation }) {
  const [expanded, setExpanded] = useState(false)
  const styles = PRIORITY_STYLES[rec.priority]
  const isConflict = rec.type === 'conflict'
  const isHigh = rec.priority === 'high'

  const metricEntries = Object.entries(rec.metrics)
  const previewMetrics = metricEntries.slice(0, METRICS_PREVIEW_COUNT)
  const extraMetrics = metricEntries.slice(METRICS_PREVIEW_COUNT)
  const hasExtra = extraMetrics.length > 0

  return (
    <div
      className={`rounded-sm border overflow-hidden flex flex-col ${
        isConflict
          ? 'border-red-300 bg-white'
          : isHigh
          ? `${styles.border} ${styles.bg}`
          : `${styles.border} bg-white`
      }`}
      style={{
        boxShadow: isConflict
          ? '0 0 0 1.5px #dc2626, 0 2px 8px rgba(220,38,38,0.10)'
          : isHigh
          ? '0 2px 8px rgba(0,0,0,0.08)'
          : '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Header row: priority + product name ── */}
      <div
        className={`px-3 py-2 flex items-center gap-2 border-b ${
          isConflict ? 'bg-red-700 border-red-600' : styles.border
        }`}
      >
        <span
          className={`text-xs font-black px-1.5 py-0.5 rounded-sm tracking-wide shrink-0 ${
            isConflict ? 'bg-red-900 text-red-200' : styles.badge
          }`}
        >
          {rec.priority.toUpperCase()}
        </span>
        <span
          className={`text-sm font-black truncate flex-1 min-w-0 ${
            isConflict ? 'text-white' : 'text-gray-800'
          }`}
          title={rec.productName}
        >
          {rec.productName}
        </span>
      </div>

      {/* ── Body ── */}
      <div className="px-3 py-3 flex flex-col gap-2 flex-1">
        {/* Title */}
        <p className={`font-black text-sm leading-tight ${isConflict ? 'text-red-800' : 'text-gray-900'}`}>
          {rec.title}
        </p>

        {/* Key metrics — always visible */}
        {previewMetrics.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {previewMetrics.map(([key, val]) => (
              <span key={key} className="text-xs text-gray-500">
                <span className="font-semibold text-gray-400">{key}:</span>{' '}
                <span className="font-black text-gray-700">{formatMetricValue(val)}</span>
              </span>
            ))}
          </div>
        )}

        {/* Expanded: remaining metrics + reason */}
        {expanded && (
          <div className="flex flex-col gap-2">
            {extraMetrics.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {extraMetrics.map(([key, val]) => (
                  <span key={key} className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-400">{key}:</span>{' '}
                    <span className="font-black text-gray-700">{formatMetricValue(val)}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 leading-relaxed">{rec.reason}</p>
          </div>
        )}

        {/* Recommended action — always visible */}
        <div
          className={`px-2.5 py-2 rounded-sm border-l-4 mt-auto ${
            isConflict ? 'bg-red-50 border-red-400' : 'bg-white border-yellow-400'
          }`}
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
        >
          <p className={`text-xs font-black leading-snug ${isConflict ? 'text-red-800' : 'text-gray-900'}`}>
            {rec.recommendedAction}
          </p>
        </div>

        {/* Expand / collapse toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className={`text-xs font-bold self-start mt-0.5 transition-colors ${
            isConflict
              ? 'text-red-500 hover:text-red-700'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          {expanded ? '▲ Hide details' : `▼ View details${hasExtra ? ` (+${extraMetrics.length} metrics)` : ''}`}
        </button>
      </div>
    </div>
  )
}

// ─── TYPE GROUP (heading + 2-col grid of cards) ──────────────────

const TYPE_GROUP_META: Record<RecommendationType, { label: string; icon: string }> = {
  production:   { label: 'Production',          icon: '⚙️' },
  waste:        { label: 'Waste Reduction',      icon: '♻️' },
  slow_moving:  { label: 'Slow-Moving Products', icon: '📦' },
  conflict:     { label: 'Conflicting Signals',  icon: '⚠️' },
}

function RecommendationGroup({
  type,
  recs,
}: {
  type: RecommendationType
  recs: PrescriptiveRecommendation[]
}) {
  if (recs.length === 0) return null
  const meta = TYPE_GROUP_META[type]
  const isConflict = type === 'conflict'

  return (
    <div>
      {/* Group heading */}
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${isConflict ? 'border-red-200' : 'border-gray-100'}`}>
        <span className="text-base leading-none">{meta.icon}</span>
        <h4 className={`text-sm font-black ${isConflict ? 'text-red-700' : 'text-gray-700'}`}>
          {meta.label}
        </h4>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          isConflict ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
        }`}>
          {recs.length}
        </span>
        {isConflict && (
          <span className="text-xs text-red-500 font-semibold ml-1">
            — review before acting
          </span>
        )}
      </div>

      {/* 2-column responsive grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recs.map(rec => (
          <RecommendationCard key={`${rec.type}-${rec.productId}`} rec={rec} />
        ))}
      </div>
    </div>
  )
}

// ─── FILTER BAR + FILTERED RECOMMENDATIONS ──────────────────────

type PriorityFilter = 'all' | RecommendationPriority
type TypeFilter = 'all' | RecommendationType

function RecommendationFilters({ recs }: { recs: PrescriptiveRecommendation[] }) {
  // Default to 'high' so the manager sees urgent items immediately
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('high')
  const [typeFilter, setTypeFilter]         = useState<TypeFilter>('all')

  // Counts always reflect the full unfiltered list — badges never change when a filter is active
  const priorityCounts = {
    all:    recs.length,
    high:   recs.filter(r => r.priority === 'high').length,
    medium: recs.filter(r => r.priority === 'medium').length,
    low:    recs.filter(r => r.priority === 'low').length,
  }
  const typeCounts: Record<TypeFilter, number> = {
    all:         recs.length,
    production:  recs.filter(r => r.type === 'production').length,
    waste:       recs.filter(r => r.type === 'waste').length,
    slow_moving: recs.filter(r => r.type === 'slow_moving').length,
    conflict:    recs.filter(r => r.type === 'conflict').length,
  }

  // Apply both filters together
  const filtered = recs.filter(r => {
    const priorityOk = priorityFilter === 'all' || r.priority === priorityFilter
    const typeOk     = typeFilter === 'all'     || r.type === typeFilter
    return priorityOk && typeOk
  })

  // Group filtered list by type for display
  const TYPE_ORDER: RecommendationType[] = ['conflict', 'production', 'waste', 'slow_moving']
  const byType = TYPE_ORDER.reduce<Record<RecommendationType, PrescriptiveRecommendation[]>>(
    (acc, t) => ({ ...acc, [t]: filtered.filter(r => r.type === t) }),
    {} as Record<RecommendationType, PrescriptiveRecommendation[]>
  )

  // Priority pill — active style uses semantic colour, inactive uses ghost
  function priorityPillClass(key: PriorityFilter): string {
    return priorityFilter === key
      ? 'text-white'
      : 'bg-white text-gray-600 border border-gray-200 hover:text-gray-800 hover:border-gray-300'
  }
  function priorityPillStyle(key: PriorityFilter): React.CSSProperties {
    if (priorityFilter !== key) return { boxShadow: '2px 2px 7px rgba(0,0,0,0.08)' }
    if (key === 'all')    return { backgroundColor: '#220901' }
    if (key === 'high')   return { backgroundColor: '#b91c1c' }
    if (key === 'medium') return { backgroundColor: '#ca8a04' }
    if (key === 'low')    return { backgroundColor: '#6b7280' }
    return {}
  }

  // Type pill — active uses brand navy (matches existing period-selector active state)
  function typePillClass(key: TypeFilter): string {
    return typeFilter === key
      ? 'text-white'
      : 'bg-white text-gray-600 border border-gray-200 hover:text-gray-800 hover:border-gray-300'
  }
  function typePillStyle(key: TypeFilter): React.CSSProperties {
    return typeFilter === key
      ? { backgroundColor: '#1a2340' }
      : { boxShadow: '2px 2px 7px rgba(0,0,0,0.08)' }
  }

  const PRIORITY_PILLS: { key: PriorityFilter; label: string }[] = [
    { key: 'all',    label: `All ${priorityCounts.all}` },
    { key: 'high',   label: `High ${priorityCounts.high}` },
    { key: 'medium', label: `Medium ${priorityCounts.medium}` },
    { key: 'low',    label: `Low ${priorityCounts.low}` },
  ]

  const TYPE_PILLS: { key: TypeFilter; label: string }[] = [
    { key: 'all',         label: 'All Types' },
    { key: 'production',  label: `Production ${typeCounts.production}` },
    { key: 'waste',       label: `Waste Reduction ${typeCounts.waste}` },
    { key: 'slow_moving', label: `Slow-Moving ${typeCounts.slow_moving}` },
    { key: 'conflict',    label: `Conflicts ${typeCounts.conflict}` },
  ]

  return (
    <div>
      {/* Row 1: priority filters */}
      <div className="flex flex-wrap gap-2 mb-2">
        {PRIORITY_PILLS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPriorityFilter(key)}
            className={`text-xs font-black px-3 py-1.5 rounded-sm transition-colors ${priorityPillClass(key)}`}
            style={priorityPillStyle(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Row 2: type filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TYPE_PILLS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-sm transition-colors ${typePillClass(key)}`}
            style={typePillStyle(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtered results */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-bold text-gray-500">No recommendations match this filter.</p>
          <p className="text-xs text-gray-400 mt-1">Try selecting a different priority or type.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {TYPE_ORDER.map(type => (
            <RecommendationGroup key={type} type={type} recs={byType[type]} />
          ))}
        </div>
      )}
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
  const [recommendations, setRecommendations] = useState<RestockRecommendation[]>([])
  const [trend, setTrend] = useState<SalesTrend | null>(null)
  const [bestDays, setBestDays] = useState<BestSellingDay[]>([])
  const [disposalStats, setDisposalStats] = useState<DisposalAnalytics | null>(null)
  const [drilldownMonth, setDrilldownMonth] = useState<{ label: string; year: number; month: number } | null>(null)
  const [weeklyData, setWeeklyData] = useState<WeeklyBreakdown[]>([])
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [dailyDate, setDailyDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [dailyData, setDailyData] = useState<DailySalesBreakdown | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyError, setDailyError] = useState('')

  // New unified prescriptive state
  const [prescriptiveRecs, setPrescriptiveRecs] = useState<PrescriptiveRecommendation[]>([])
  const [prescriptiveLoading, setPrescriptiveLoading] = useState(true)
  const [prescriptiveError, setPrescriptiveError] = useState('')

  useEffect(() => { checkAuthAndLoad() }, [])
  useEffect(() => { if (!loading) loadSummary() }, [period])
  useEffect(() => { if (!loading) loadDailyBreakdown(dailyDate) }, [dailyDate, loading])

  useRealtimeRefresh(['sale_items', 'sales', 'production', 'stock_disposals', 'products'], loadPrescriptive)

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
    setPrescriptiveLoading(true)
    setPrescriptiveError('')
    try {
      const [restockData, bestDaysData, opRecs] = await Promise.all([
        getRestockRecommendations(),
        getBestSellingDays(),
        getPrescriptiveRecommendations(),
      ])
      setRecommendations(restockData)
      setBestDays(bestDaysData)
      // Backend already sorts by priority; preserve that order
      setPrescriptiveRecs(opRecs)
    } catch {
      setPrescriptiveError('Unable to load operational recommendations. Please try refreshing.')
    } finally {
      setPrescriptiveLoading(false)
    }
  }

  function handleExportSales() {
    if (!summary) return
    exportSalesToCSV(summary, getPeriodDates(period).label)
  }

  function handleExportPDF() {
    if (!summary) return
    exportAnalyticsToPDF({
      periodLabel: getPeriodDates(period).label,
      summary,
      trend,
      disposalStats,
      financialOverview: activeMonths,
      dailyData,
      dailyDateLabel: new Date(dailyDate).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      restockRecommendations: recommendations,
      bestDays,
      prescriptiveRecs,
    })
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

  async function loadDailyBreakdown(dateStr: string) {
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
  }

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
  const hasOperationalRecs = prescriptiveRecs.length > 0

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>

      {/* TOP NAVBAR */}
      <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
            <LogoSmall />
          </div>
          <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
        </div>
                <LogoutButton onLogout={handleLogout} />
      </div>

      <div className="flex flex-1 relative">
        <LogoWatermark />

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
              <button onClick={handleExportPDF} disabled={!summary}
                className="px-4 py-2 rounded-sm font-bold text-white text-xs disabled:opacity-50" style={{ backgroundColor: '#7B1111' }}>
                ↓ Export PDF
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
                    <ResponsiveContainer width="100%" height={Math.max(160, summary.topProducts.slice(0, 12).length * 44 + 32)}>
                      <BarChart
                        data={summary.topProducts.slice(0, 12)}
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
                          {summary.topProducts.slice(0, 12).map((_, i) => (
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
                  <div className="text-5xl mb-3"></div>
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
                      <div className="text-4xl mb-3"></div>
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

          {/* ── DAILY SALES BREAKDOWN ── */}
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
                  <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Online</p>
                  <p className="text-2xl font-black text-blue-400">₱{dailyData.onlineRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  <p className="text-white text-xs opacity-50 mt-1">{dailyData.totalRevenue > 0 ? ((dailyData.onlineRevenue / dailyData.totalRevenue) * 100).toFixed(0) : 0}% of total</p>
                </div>
                <div className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                  <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Voided</p>
                  <p className="text-2xl font-black text-red-400">{dailyData.voidedCount}</p>
                  <p className="text-white text-xs opacity-50 mt-1">₱{dailyData.voidedRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })} lost</p>
                </div>
              </div>

              {dailyData.items.length === 0 ? (
                <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="text-5xl mb-3"></div>
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
            <h2 className="text-2xl font-black text-gray-900 mb-1">Prescriptive Analytics</h2>
            <p className="text-sm text-gray-600 mb-5">What happened → Why it matters → What the system recommends doing.</p>

            {/* Revenue Trend */}
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

            {/* Restock + Best Days */}
            <div className="grid grid-cols-2 gap-5 mb-5">
              <div className="bg-white rounded-sm p-6" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <img src="/icons/Box.svg" alt="" className="w-5 h-5 opacity-50" />
                  <h3 className="font-black text-gray-900">Restock Recommendations</h3>
                </div>
                <p className="text-xs text-gray-400 mb-4">Forecasted demand, verified against actual sales, prescribing a restock action.</p>
                {recommendations.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-sm">Nothing needs restocking right now.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recommendations.map(p => (
                      <div key={p.product_name} className={`p-4 rounded-sm border ${
                        p.urgency === 'critical' ? 'bg-red-50 border-red-200' :
                        p.urgency === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-sm text-gray-900 flex items-center gap-1">
                              {p.urgency === 'critical' && <span>🔴</span>}
                              {p.urgency === 'warning' && <span>🟡</span>}
                              {p.urgency === 'ok' && <span>🟢</span>}
                              {p.product_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Stock: {p.current_shop_stock} pcs • Forecast: {p.forecast_daily_demand}/day
                            </p>
                            {p.days_until_stockout !== null && (
                              <p className={`text-xs font-semibold mt-0.5 ${p.urgency === 'critical' ? 'text-red-600' : p.urgency === 'warning' ? 'text-yellow-600' : 'text-gray-400'}`}>
                                {p.days_until_stockout === 0 ? 'Stockout today!' : `Runs out in ~${p.days_until_stockout} day${p.days_until_stockout !== 1 ? 's' : ''}`}
                              </p>
                            )}
                            {p.accuracy_mape !== null && (
                              <p className="text-xs text-gray-400 mt-0.5">Forecast accuracy: {Math.max(0, 100 - p.accuracy_mape).toFixed(0)}%</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black" style={{ color: '#F5A623' }}>+{p.recommended_restock} pcs</p>
                            <p className="text-xs text-gray-400">7-day supply</p>
                          </div>
                        </div>
                        {p.prediction_history.length > 1 && (
                          <div className="mt-3 h-16">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={p.prediction_history}>
                                <Line type="monotone" dataKey="actual" stroke="#7B1111" strokeWidth={1.5} dot={false} />
                                <Line type="monotone" dataKey="predicted" stroke="#F5A623" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
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
                <p className="text-xs text-gray-400 mb-4">Based on avg units sold per day over the last 30 days.</p>
                {bestDays.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">📊</div>
                    <p className="text-sm">Not enough sales data yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bestDays.map((d, index) => {
                      const pct = bestDays[0].avgUnitsSold > 0 ? Math.round((d.avgUnitsSold / bestDays[0].avgUnitsSold) * 100) : 0
                      return (
                        <div key={d.day}>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-gray-700">
                              {index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '    '}{d.day}
                            </span>
                            <span className="text-gray-500">{d.avgUnitsSold.toLocaleString('en-PH')} pcs avg</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#7B1111' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── OPERATIONAL RECOMMENDATIONS ── */}
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-0.5">
                  <img src="/icons/Box.svg" alt="" className="w-5 h-5 opacity-50" />
                  <h3 className="font-black text-gray-900">Operational Recommendations</h3>
                </div>
                <p className="text-xs text-gray-400">
                  Production, waste reduction, slow-moving products, and conflict signals — based on the last 7 days.
                </p>
              </div>

              <div className="p-6">
                {/* Loading state */}
                {prescriptiveLoading && (
                  <div className="flex items-center justify-center py-12 gap-3">
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                    <p className="text-sm text-gray-400 font-semibold">Analyzing production and waste data…</p>
                  </div>
                )}

                {/* Error state */}
                {!prescriptiveLoading && prescriptiveError && (
                  <div className="flex items-start gap-3 px-4 py-4 rounded-sm bg-red-50 border border-red-200">
                    <span className="text-red-400 mt-0.5">⚠</span>
                    <div>
                      <p className="text-sm font-semibold text-red-700">Could not load recommendations</p>
                      <p className="text-xs text-red-500 mt-0.5">{prescriptiveError}</p>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!prescriptiveLoading && !prescriptiveError && !hasOperationalRecs && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-base font-black text-gray-700">No new operational recommendations at this time.</p>
                    <p className="text-sm text-gray-400 mt-1">Production, waste, and sales levels look balanced for the last 7 days.</p>
                  </div>
                )}

                {/* Recommendations — filter bar + grouped results */}
                {!prescriptiveLoading && !prescriptiveError && hasOperationalRecs && (
                  <RecommendationFilters recs={prescriptiveRecs} />
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}