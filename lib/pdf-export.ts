import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
  SalesSummary,
  SalesTrend,
  DisposalAnalytics,
  ExpenseVsRevenue,
  DailySalesBreakdown,
  RestockRecommendation,
  BestSellingDay,
  PrescriptiveRecommendation,
} from './analytics'

export interface AnalyticsPDFParams {
  periodLabel: string
  summary: SalesSummary
  trend: SalesTrend | null
  disposalStats: DisposalAnalytics | null
  financialOverview: ExpenseVsRevenue[]
  dailyData: DailySalesBreakdown | null
  dailyDateLabel: string
  restockRecommendations: RestockRecommendation[]
  bestDays: BestSellingDay[]
  prescriptiveRecs: PrescriptiveRecommendation[]
}

const MARGIN = 40

// jsPDF's built-in fonts don't include the ₱ glyph (U+20B1) without embedding
// a custom font, so currency values use "PHP " here — same convention your
// existing exportSalesToCSV() header lines already use.
function peso(n: number): string {
  return `PHP ${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + needed > pageHeight - MARGIN) {
    doc.addPage()
    return MARGIN
  }
  return y
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 40)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(title, MARGIN, y)
  doc.setDrawColor(200, 200, 200)
  doc.line(MARGIN, y + 4, doc.internal.pageSize.getWidth() - MARGIN, y + 4)
  return y + 20
}

function keyValueTable(doc: jsPDF, y: number, rows: [string, string][]): number {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    body: rows,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 160 },
      1: { cellWidth: 'auto' },
    },
  })
  return (doc as any).lastAutoTable.finalY + 15
}

function narrativeText(doc: jsPDF, y: number, text: string): number {
  y = ensureSpace(doc, y, 30)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  const pageWidth = doc.internal.pageSize.getWidth() - MARGIN * 2
  const lines = doc.splitTextToSize(text, pageWidth)
  doc.text(lines, MARGIN, y)
  return y + lines.length * 13 + 10
}

function urgencyLabel(urgency: 'critical' | 'warning' | 'ok'): string {
  return urgency === 'critical' ? 'CRITICAL' : urgency === 'warning' ? 'WARNING' : 'OK'
}

const TYPE_LABELS: Record<PrescriptiveRecommendation['type'], string> = {
  production: 'Production',
  waste: 'Waste Reduction',
  slow_moving: 'Slow-Moving Products',
  conflict: 'Conflicting Signals',
}

export function exportAnalyticsToPDF(params: AnalyticsPDFParams): void {
  const {
    periodLabel, summary, trend, disposalStats, financialOverview,
    dailyData, dailyDateLabel, restockRecommendations, bestDays, prescriptiveRecs,
  } = params

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN

  // ── 1. REPORT HEADER ──────────────────────────────────────────
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text("Fred's Pies — Bakery Management System", MARGIN, y)
  y += 24
  doc.setFontSize(14)
  doc.text('Analytics & Reports', MARGIN, y)
  y += 20
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text(`Report Period: ${periodLabel}`, MARGIN, y)
  y += 14
  doc.text(
    `Date Generated: ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}`,
    MARGIN, y
  )
  y += 25

  // ── 2. SALES OVERVIEW ──────────────────────────────────────────
  y = sectionTitle(doc, 'Sales Overview', y)
  y = keyValueTable(doc, y, [
    ['Total Revenue', peso(summary.totalRevenue)],
    ['Total Transactions', String(summary.totalTransactions)],
    ['Average Order Value', peso(summary.averageOrderValue)],
    ['Cash Revenue', `${peso(summary.cashRevenue)} (${summary.totalRevenue > 0 ? ((summary.cashRevenue / summary.totalRevenue) * 100).toFixed(0) : 0}%)`],
    ['Online Revenue', `${peso(summary.onlineRevenue)} (${summary.totalRevenue > 0 ? ((summary.onlineRevenue / summary.totalRevenue) * 100).toFixed(0) : 0}%)`],
  ])

  // ── 3. LOSS OVERVIEW ───────────────────────────────────────────
  if (disposalStats) {
    y = sectionTitle(doc, 'Loss Overview', y)
    y = keyValueTable(doc, y, [
      ['Pull-outs', `${disposalStats.totalPullouts} units (${peso(disposalStats.pulloutValue)})`],
      ['On-the-House (OTH)', `${disposalStats.totalOTH} units (${peso(disposalStats.othValue)})`],
      ['Total Losses', `${disposalStats.totalLosses} units`],
      ['Value Lost', peso(disposalStats.totalLossValue)],
    ])
  }

  // ── 4. REVENUE TREND ───────────────────────────────────────────
  y = sectionTitle(doc, 'Revenue Trend', y)
  if (trend) {
    const trendText = trend.trend === 'up'
      ? `Revenue is trending up (${trend.percentageChange > 0 ? '+' : ''}${trend.percentageChange}%) versus the previous period. Previous: ${peso(trend.previousPeriodRevenue)} -> Current: ${peso(trend.currentPeriodRevenue)}.`
      : trend.trend === 'down'
      ? `Revenue is trending down (${trend.percentageChange}%) versus the previous period. Previous: ${peso(trend.previousPeriodRevenue)} -> Current: ${peso(trend.currentPeriodRevenue)}.`
      : `Revenue is stable versus the previous period. Previous: ${peso(trend.previousPeriodRevenue)} -> Current: ${peso(trend.currentPeriodRevenue)}.`
    y = narrativeText(doc, y, trendText)
  }
  if (summary.dailyStats.length > 0) {
    y = ensureSpace(doc, y, 60)
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Date', 'Revenue', 'Transactions']],
      body: summary.dailyStats.map(d => [
        new Date(d.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
        peso(d.revenue),
        String(d.transactions),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 35, 64] },
    })
    y = (doc as any).lastAutoTable.finalY + 15
  }

  // ── 5. TOP PRODUCTS ────────────────────────────────────────────
  if (summary.topProducts.length > 0) {
    y = sectionTitle(doc, 'Top Products', y)
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Rank', 'Product', 'Quantity Sold', 'Revenue']],
      body: summary.topProducts.map((p, i) => [String(i + 1), p.product_name, String(p.total_quantity), peso(p.total_revenue)]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [123, 17, 17] },
    })
    y = (doc as any).lastAutoTable.finalY + 15
  }

  // ── 6. FINANCIAL OVERVIEW ──────────────────────────────────────
  if (financialOverview.length > 0) {
    y = sectionTitle(doc, 'Financial Overview (Last 6 Months)', y)
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Month', 'Revenue', 'Expenses', 'Net Income', 'Status']],
      body: financialOverview.map(d => [
        d.month, peso(d.revenue), peso(d.expenses), peso(d.net), d.net >= 0 ? 'Profitable' : 'Loss',
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 35, 64] },
    })
    y = (doc as any).lastAutoTable.finalY + 15
  }

  // ── 7. DAILY SALES BREAKDOWN ───────────────────────────────────
  if (dailyData) {
    y = sectionTitle(doc, `Daily Sales Breakdown — ${dailyDateLabel}`, y)
    y = keyValueTable(doc, y, [
      ['Total Revenue', peso(dailyData.totalRevenue)],
      ['Total Transactions', String(dailyData.totalTransactions)],
      ['Cash Revenue', peso(dailyData.cashRevenue)],
      ['Online Revenue', peso(dailyData.onlineRevenue)],
      ['Voided Sales', `${dailyData.voidedCount} (${peso(dailyData.voidedRevenue)} lost)`],
    ])
    if (dailyData.items.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Product', 'Quantity Sold', 'Revenue']],
        body: dailyData.items.map(i => [i.product_name, String(i.quantity), peso(i.revenue)]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [123, 17, 17] },
      })
      y = (doc as any).lastAutoTable.finalY + 15
    }
  }

  // ── 8. PRESCRIPTIVE ANALYTICS ──────────────────────────────────
  y = sectionTitle(doc, 'Prescriptive Analytics', y)

  if (trend) {
    const advice = trend.trend === 'up'
      ? 'Revenue increased versus the previous period.'
      : trend.trend === 'down'
      ? 'Revenue dropped versus the previous period. Consider running a promotion or reviewing margins.'
      : 'Revenue is stable versus the previous period.'
    y = narrativeText(doc, y, `Revenue Trend Recommendation: ${advice}`)
  }

  if (restockRecommendations.length > 0) {
    y = ensureSpace(doc, y, 30)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 20)
    doc.text('Restock Recommendations', MARGIN, y)
    y += 15
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Product', 'Current Stock', 'Forecast/Day', 'Days Until Stockout', 'Recommended Restock', 'Urgency']],
      body: restockRecommendations.map(r => [
        r.product_name,
        String(r.current_shop_stock),
        String(r.forecast_daily_demand),
        r.days_until_stockout === null ? 'N/A' : String(r.days_until_stockout),
        `+${r.recommended_restock}`,
        urgencyLabel(r.urgency),
      ]),
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [245, 166, 35], textColor: [30, 30, 30] },
    })
    y = (doc as any).lastAutoTable.finalY + 15
  }

  if (bestDays.length > 0) {
    y = ensureSpace(doc, y, 30)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Best Days to Stock Up', MARGIN, y)
    y += 15
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Day', 'Avg Units Sold']],
      body: bestDays.map(d => [d.day, String(d.avgUnitsSold)]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 35, 64] },
    })
    y = (doc as any).lastAutoTable.finalY + 15
  }

  // Operational recommendations from getPrescriptiveRecommendations(),
  // grouped by type to match the on-page card grouping.
  const TYPE_ORDER: PrescriptiveRecommendation['type'][] = ['conflict', 'production', 'waste', 'slow_moving']
  TYPE_ORDER.forEach(type => {
    const group = prescriptiveRecs.filter(r => r.type === type)
    if (group.length === 0) return

    y = ensureSpace(doc, y, 30)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 20)
    doc.text(`${TYPE_LABELS[type]} (${group.length})`, MARGIN, y)
    y += 15

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Priority', 'Product', 'Recommendation', 'Reason', 'Recommended Action']],
      body: group.map(r => [
        r.priority.toUpperCase(),
        r.productName,
        r.title,
        r.reason,
        r.recommendedAction,
      ]),
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 70 },
        2: { cellWidth: 80 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 'auto' },
      },
      headStyles: { fillColor: type === 'conflict' ? [185, 28, 28] : [26, 35, 64] },
    })
    y = (doc as any).lastAutoTable.finalY + 15
  })

  const fileSafePeriod = periodLabel.replace(/\s+/g, '-')
  doc.save(`bakery-analytics-report-${fileSafePeriod}.pdf`)
}