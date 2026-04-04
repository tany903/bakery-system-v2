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

export default function ManagerDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profileName, setProfileName] = useState('')
  const [userId, setUserId] = useState('')
  const [todaySales, setTodaySales] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])

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
    } catch (err) {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  async function loadData() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: sales } = await supabase
      .from('sales')
      .select('total_amount')
      .gte('sale_date', today.toISOString())
      .eq('is_voided', false)
    setTodaySales((sales || []).reduce((sum, s) => sum + Number(s.total_amount), 0))

    const { data: lowStock } = await supabase
      .from('products')
      .select('id, name, shop_current_stock, shop_minimum_threshold')
      .eq('is_archived', false)
    const filtered = (lowStock || []).filter(p => p.shop_current_stock < p.shop_minimum_threshold)
    setLowStockCount(filtered.length)
    setLowStockProducts(filtered)

    const { data: pending } = await supabase
      .from('restock_requests')
      .select('id')
      .eq('status', 'requested')
    setPendingCount(pending?.length || 0)

    const { data: recentSalesData } = await supabase
      .from('sales')
      .select(`id, sale_date, total_amount, payment_method, cashier:profiles!sales_cashier_id_fkey (full_name)`)
      .eq('is_voided', false)
      .order('sale_date', { ascending: false })
      .limit(5)
    setRecentSales((recentSalesData as any) || [])
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  // const sidebarLinks = [
  //   { href: '/restock-requests', icon: '/icons/Plus_square.svg', label: 'Restock' },
  //   { href: '/inventory', icon: '/icons/Box.svg', label: 'Inventory' },
  //   { href: '/expenses', icon: '/icons/payment.svg', label: 'Expenses' },
  //   { href: '/analytics', icon: '/icons/Bar_chart.svg', label: 'Analytics' },
  //   { href: '/users', icon: '/icons/person.svg', label: 'Staff' },
  //   { href: '/products', icon: '/icons/Tag.svg', label: 'Products' },
  //   { href: '/ingredients', icon: '/icons/flour.svg', label: 'Ingredients' },
  //   { href: '/audit-logs', icon: '/icons/Book.svg', label: 'Audit' },
  //   { href: '/dashboard', icon: '/icons/menu.svg', label: 'Dashboard', active: true },
  // ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

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

        {/* LEFT SIDEBAR */}
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

          {/* STAT CARDS */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Today's Sales</p>
              <p className="text-4xl font-black text-white">
                ₱{todaySales.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Low Stock Items</p>
              <p className="text-4xl font-black text-white">{lowStockCount}</p>
            </div>
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Pending Requests</p>
              <p className="text-4xl font-black text-white">{pendingCount}</p>
            </div>
          </div>

          {/* CASH REGISTER */}
          {userId && (
            <div className="mb-6">
              <CashRegisterWidget userId={userId} userRole="manager" />
            </div>
          )}

          {/* TABLES */}
          <div className="grid grid-cols-2 gap-4">

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
                        All stock levels are good 🎉
                      </td>
                    </tr>
                  ) : (
                    lowStockProducts.map((product) => (
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
                    recentSales.map((sale) => (
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
                          <span className={`text-xs font-bold px-3 py-1 rounded-full text-white ${
                            sale.payment_method === 'cash' ? 'bg-blue-500' : 'bg-green-500'
                          }`}>
                            {sale.payment_method === 'cash' ? 'Cash' : 'Online'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm font-black text-gray-900">
                          ₱{Number(sale.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
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
