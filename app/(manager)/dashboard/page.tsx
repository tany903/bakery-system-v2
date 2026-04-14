'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import CashRegisterWidget from '@/components/CashRegisterWidget'
import ManagerSidebar from '@/components/ManagerSidebar'

interface LowStockProduct {
  id: string
  name: string
  shop_current_stock: number
  shop_minimum_threshold: number
}

interface RecentSale {
  id: string
  sale_date: string
  total_amount: number
  payment_method: string
  cashier: { full_name: string } | null
}

interface TopProduct {
  product_name: string
  total_qty: number
  total_revenue: number
}

interface TodayDisposal {
  id: string
  products: { name: string } | null
  type: 'pullout' | 'oth'
  reason: string
  quantity: number
  location: 'shop' | 'production'
  profiles: { full_name: string } | null
  created_at: string
}

export default function ManagerDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profileName, setProfileName] = useState('')
  const [userId, setUserId] = useState('')

  // Existing stats
  const [todaySales, setTodaySales] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])

  // New stats
  const [outOfStockCount, setOutOfStockCount] = useState(0)
  const [netIncome, setNetIncome] = useState(0)
  const [todayDisposalCount, setTodayDisposalCount] = useState(0)
  const [todayDisposalQty, setTodayDisposalQty] = useState(0)
  const [todayProduction, setTodayProduction] = useState(0)
  const [pendingTransfers, setPendingTransfers] = useState(0)
  const [cashOutToday, setCashOutToday] = useState(0)

  // New tables
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [todayDisposals, setTodayDisposals] = useState<TodayDisposal[]>([])

  useEffect(() => { checkAuthAndLoad() }, [])

  async function checkAuthAndLoad() {
    try {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      const profile = await getUserProfile(user.id)
      if (!profile || profile.role !== 'manager') { router.push('/login'); return }
      setProfileName(profile.full_name)
      setUserId(user.id)
      await loadData()
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  async function loadData() {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayISO = todayStart.toISOString()

    // ── Today's sales ────────────────────────────────────────────────────────
    const { data: sales } = await supabase
      .from('sales')
      .select('total_amount')
      .gte('sale_date', todayISO)
      .eq('is_voided', false)
    const salesTotal = (sales || []).reduce((sum, s) => sum + Number(s.total_amount), 0)
    setTodaySales(salesTotal)

    // ── Stock levels ─────────────────────────────────────────────────────────
    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name, shop_current_stock, shop_minimum_threshold')
      .eq('is_archived', false)
    const lowStock = (allProducts || []).filter(p => p.shop_current_stock > 0 && p.shop_current_stock < p.shop_minimum_threshold)
    const outOfStock = (allProducts || []).filter(p => p.shop_current_stock <= 0)
    setLowStockCount(lowStock.length)
    setLowStockProducts(lowStock)
    setOutOfStockCount(outOfStock.length)

    // ── Pending restock requests ─────────────────────────────────────────────
    const { data: pending } = await supabase
      .from('restock_requests')
      .select('id')
      .eq('status', 'requested')
    setPendingCount(pending?.length || 0)

    // ── Recent sales ─────────────────────────────────────────────────────────
    const { data: recentSalesData } = await supabase
      .from('sales')
      .select('id, sale_date, total_amount, payment_method, cashier:profiles!sales_cashier_id_fkey(full_name)')
      .eq('is_voided', false)
      .order('sale_date', { ascending: false })
      .limit(5)
    setRecentSales((recentSalesData as any) || [])

    // ── Today's expenses → net income ────────────────────────────────────────
    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount')
      .gte('created_at', todayISO)
    const expensesTotal = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0)
    setNetIncome(salesTotal - expensesTotal)

    // ── Today's disposals ────────────────────────────────────────────────────
    const { data: disposals } = await supabase
      .from('stock_disposals')
      .select('id, quantity, type, reason, location, created_at, products(name), profiles!stock_disposals_performed_by_fkey(full_name)')
      .gte('created_at', todayISO)
      .eq('is_voided', false)
      .order('created_at', { ascending: false })
    setTodayDisposalCount((disposals || []).length)
    setTodayDisposalQty((disposals || []).reduce((sum, d) => sum + Number(d.quantity), 0))
    setTodayDisposals((disposals as any) || [])

    // ── Today's production ───────────────────────────────────────────────────
    const { data: prodData } = await supabase
      .from('production')
      .select('quantity_produced')
      .gte('created_at', todayISO)
      .eq('is_voided', false)
    setTodayProduction((prodData || []).reduce((sum, p) => sum + Number(p.quantity_produced), 0))

    // ── Pending transfers (not yet transferred = production stock available) ─
    // Using inventory_transfers created today as a proxy; adjust if you have a
    // "pending" status column on transfers
    const { data: transferData } = await supabase
      .from('inventory_transfers')
      .select('id')
      .eq('is_voided', false)
      .gte('created_at', todayISO)
    setPendingTransfers(transferData?.length || 0)

    // ── Cash out today ───────────────────────────────────────────────────────
    const { data: cashOut } = await supabase
      .from('cash_register')
      .select('amount')
      .eq('type', 'cash_out')
      .eq('is_voided', false)
      .gte('created_at', todayISO)
    setCashOutToday((cashOut || []).reduce((sum, c) => sum + Number(c.amount), 0))

    // ── Top selling products today ───────────────────────────────────────────
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('product_name, quantity, subtotal, sale:sales!inner(sale_date, is_voided)')
      .eq('sale.is_voided', false)
      .gte('sale.sale_date', todayISO)
    const productMap: Record<string, { total_qty: number; total_revenue: number }> = {}
    ;(saleItems || []).forEach((item: any) => {
      if (!productMap[item.product_name]) productMap[item.product_name] = { total_qty: 0, total_revenue: 0 }
      productMap[item.product_name].total_qty += Number(item.quantity)
      productMap[item.product_name].total_revenue += Number(item.subtotal)
    })
    const sorted = Object.entries(productMap)
      .map(([product_name, v]) => ({ product_name, ...v }))
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, 5)
    setTopProducts(sorted)
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Manila',
    })
  }

  function peso(n: number) {
    return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  const statCards = [
    { label: "Today's Sales",        value: peso(todaySales),                        sub: null },
    { label: 'Net Income Today',      value: peso(netIncome),                         sub: netIncome < 0 ? 'Loss' : 'Profit', loss: netIncome < 0 },
    { label: 'Cash Out Today',        value: peso(cashOutToday),                      sub: null },
    { label: 'Production Today',      value: `${todayProduction} pcs`,               sub: null },
    { label: 'Transfers Today',       value: `${pendingTransfers}`,                  sub: 'batches' },
    { label: 'Low Stock Items',       value: `${lowStockCount}`,                     sub: null },
    { label: 'Out of Stock',          value: `${outOfStockCount}`,                   sub: null, danger: outOfStockCount > 0 },
    { label: "Today's Disposals",     value: `${todayDisposalCount} entries`,        sub: `${todayDisposalQty} pcs total` },
    { label: 'Pending Requests',      value: `${pendingCount}`,                      sub: null },
  ]

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
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors"
        >
          <span className="text-base font-bold">→</span>
          <span className="text-xs font-semibold">Logout</span>
        </button>
      </div>

      {/* BODY */}
      <div className="flex flex-1 relative">

        {/* Watermark */}
        <img
          src="/logo-big.png"
          alt=""
          className="fixed pointer-events-none select-none"
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', height: 'auto', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />

        <ManagerSidebar />

        {/* MAIN CONTENT */}
        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Welcome */}
          <h1 className="text-4xl font-black text-gray-900 mb-1">
            Welcome back, {profileName.split(' ')[0]}!
          </h1>
          <p className="text-gray-700 font-medium mb-6">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          {/* STAT CARDS — 3-col grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {statCards.map(card => (
              <div
                key={card.label}
                className="rounded-sm p-5"
                style={{
                  backgroundColor: (card as any).danger ? '#7B1111' : '#220901',
                  boxShadow: '4px 4px 10px rgba(0,0,0,0.3)',
                }}
              >
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">{card.label}</p>
                <p className={`text-3xl font-black ${(card as any).loss ? 'text-red-400' : 'text-white'}`}>
                  {card.value}
                </p>
                {card.sub && (
                  <p className="text-white text-xs mt-1 opacity-50">{card.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* CASH REGISTER */}
          {userId && (
            <div className="mb-6">
              <CashRegisterWidget userId={userId} userRole="manager" />
            </div>
          )}

          {/* TABLES — row 1: Low Stock + Recent Sales */}
          <div className="grid grid-cols-2 gap-4 mb-4">

            {/* Low Stock Alert */}
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#7B1111' }}>
                <img src="/icons/Alert_triangle.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                <h2 className="font-bold text-white">Low Stock Alert — Shop</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Stock</th>
                    <th className="px-5 py-3 font-semibold">Min</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">
                        No low stock alerts
                      </td>
                    </tr>
                  ) : (
                    lowStockProducts.map(product => (
                      <tr key={product.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-semibold text-gray-800">{product.name}</td>
                        <td className="px-5 py-3">
                          <span className="bg-red-500 text-white text-xs font-bold rounded-sm w-7 h-7 flex items-center justify-center">
                            {product.shop_current_stock}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-400">{product.shop_minimum_threshold}</td>
                        <td className="px-5 py-3">
                          <a
                            href="/restock-requests"
                            className="flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full text-gray-900 hover:opacity-90 transition-opacity w-fit no-underline"
                            style={{ backgroundColor: '#F5A623' }}
                          >
                            <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" />
                            Request
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Recent Sales */}
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#6B8F8F' }}>
                <img src="/icons/Clock.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                <h2 className="font-bold text-white">Recent Sales</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-semibold">Date & Time</th>
                    <th className="px-5 py-3 font-semibold">Cashier</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">
                        No recent sales
                      </td>
                    </tr>
                  ) : (
                    recentSales.map(sale => (
                      <tr key={sale.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(sale.sale_date).toLocaleDateString('en-PH', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                            timeZone: 'Asia/Manila',
                          })}
                        </td>
                        <td className="px-5 py-3 text-sm font-medium text-gray-800">
                          {(sale.cashier as any)?.full_name || '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-bold px-3 py-1 rounded-full text-white ${sale.payment_method === 'cash' ? 'bg-blue-500' : 'bg-green-500'}`}>
                            {sale.payment_method === 'cash' ? 'Cash' : 'Online'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm font-black text-gray-900">
                          {peso(sale.total_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLES — row 2: Top Products + Today's Disposals */}
          <div className="grid grid-cols-2 gap-4">

            {/* Top Selling Products Today */}
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
                <h2 className="font-bold text-white">Top Selling Products Today</h2>
                <span className="ml-auto text-xs text-white opacity-60">by qty</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-semibold">#</th>
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Qty Sold</th>
                    <th className="px-5 py-3 font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">
                        No sales yet today
                      </td>
                    </tr>
                  ) : (
                    topProducts.map((p, i) => (
                      <tr key={p.product_name} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="text-xs font-black text-white w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: i === 0 ? '#F5A623' : i === 1 ? '#9CA3AF' : i === 2 ? '#D97706' : '#E5E7EB', color: i < 3 ? 'white' : '#6B7280' }}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm font-semibold text-gray-800">{p.product_name}</td>
                        <td className="px-5 py-3 text-sm font-black text-purple-600">{p.total_qty} pcs</td>
                        <td className="px-5 py-3 text-sm font-bold text-gray-700">{peso(p.total_revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Today's Disposals */}
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#7B1111' }}>
                <h2 className="font-bold text-white">Today's Disposals</h2>
                <span className="ml-auto text-xs text-white opacity-60">{todayDisposals.length} entries · {todayDisposalQty} pcs</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Qty</th>
                    <th className="px-5 py-3 font-semibold">Reason</th>
                    <th className="px-5 py-3 font-semibold">By</th>
                  </tr>
                </thead>
                <tbody>
                  {todayDisposals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">
                        No disposals today
                      </td>
                    </tr>
                  ) : (
                    todayDisposals.map(d => (
                      <tr key={d.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-semibold text-gray-800">{d.products?.name || '—'}</td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: d.type === 'pullout' ? '#EF4444' : '#7C3AED' }}>
                            {d.type === 'pullout' ? 'Pull-out' : 'OTH'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm font-black text-red-500">-{d.quantity}</td>
                        <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate">{d.reason}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{d.profiles?.full_name || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
