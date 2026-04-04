'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import { getAllProducts } from '@/lib/products'
import { supabase } from '@/lib/supabase'
import ManagerSidebar from '@/components/ManagerSidebar'

interface Transaction {
  id: string
  created_at: string
  transaction_type: string
  location: string
  quantity_before: number
  quantity_change: number
  quantity_after: number
  notes: string | null
  products: { id: string; name: string; category_id: string | null; categories?: { id: string; name: string } | null } | null
  profiles: { full_name: string } | null
}

export default function AuditLogsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filtered, setFiltered] = useState<Transaction[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Filters
  const [filterLocation, setFilterLocation] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { applyFilters() }, [transactions, filterLocation, filterType, filterProduct, filterCategory, filterDateFrom, filterDateTo])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || profile.role !== 'manager') { router.push('/login'); return }
    await loadData()
    setLoading(false)
  }

  async function loadData() {
    try {
      const { data, error: txnError } = await supabase
        .from('inventory_transactions')
        .select(`
          *,
          products (id, name, category_id, categories (id, name)),
          profiles (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(500)

      if (txnError) throw txnError
      console.log('first transaction products:', data?.[0]?.products)
      setTransactions(data || [])

      const productsData = await getAllProducts()
      setProducts(productsData)

      const { data: cats } = await supabase.from('categories').select('*').eq('is_archived', false)
      setCategories(cats || [])
    } catch (err: any) {
      setError('Failed to load audit logs')
    }
  }

  function applyFilters() {
    setCurrentPage(1)
    let result = transactions

    if (filterLocation !== 'all') {
      result = result.filter(t => t.location === filterLocation)
    }
    if (filterType !== 'all') {
      result = result.filter(t => t.transaction_type === filterType)
    }
    if (filterProduct !== 'all') {
      result = result.filter(t => t.products?.id === filterProduct)
    }
    if (filterCategory !== 'all') {
      result = result.filter(t => t.products?.category_id === filterCategory)
    }
    if (filterDateFrom) {
      result = result.filter(t => new Date(t.created_at) >= new Date(filterDateFrom))
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(t => new Date(t.created_at) <= to)
    }

    setFiltered(result)
  }

  function clearFilters() {
    setFilterLocation('all')
    setFilterType('all')
    setFilterProduct('all')
    setFilterCategory('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  // Pagination
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // const sidebarLinks = [
  //   { href: '/restock-requests', icon: '/icons/Plus_square.svg', label: 'Restock' },
  //   { href: '/inventory', icon: '/icons/Box.svg', label: 'Inventory' },
  //   { href: '/expenses', icon: '/icons/payment.svg', label: 'Expenses' },
  //   { href: '/analytics', icon: '/icons/Bar_chart.svg', label: 'Analytics' },
  //   { href: '/users', icon: '/icons/person.svg', label: 'Staff' },
  //   { href: '/products', icon: '/icons/Tag.svg', label: 'Products' },
  //   { href: '/ingredients', icon: '/icons/flour.svg', label: 'Ingredients' },
  //   { href: '/audit-logs', icon: '/icons/Book.svg', label: 'Audit', active: true },
  //   { href: '/dashboard', icon: '/icons/menu.svg', label: 'Dashboard' },
  // ]

  const transactionTypes = ['adjustment', 'sale', 'production', 'transfer', 'restock', 'initial']

  function getTypeBadge(type: string) {
    const map: Record<string, string> = {
      adjustment: '#3B82F6',
      sale:       '#EF4444',
      production: '#10B981',
      transfer:   '#8B5CF6',
      restock:    '#F5A623',
      initial:    '#6B7280',
    }
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white capitalize" style={{ backgroundColor: map[type] || '#6B7280' }}>
        {type}
      </span>
    )
  }

  function getLocationBadge(location: string) {
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white capitalize ${location === 'shop' ? 'bg-blue-400' : 'bg-green-500'}`}>
        {location}
      </span>
    )
  }

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
      <div className="w-full flex items-center justify-between px-6 py-3 shrink-0 z-10" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center">
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

        {/* SIDEBAR */}
        <ManagerSidebar />

        {/* MAIN CONTENT */}
        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-black text-gray-900">Audit Logs</h1>
              <p className="text-gray-700 font-medium mt-1">{filtered.length} record{filtered.length !== 1 ? 's' : ''} found</p>
            </div>
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-gray-900 text-sm"
              style={{ backgroundColor: 'white', boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}
            >
              ✕ Clear Filters
            </button>
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}

          {/* FILTERS */}
          <div className="bg-white rounded-sm p-4 mb-5 grid grid-cols-2 lg:grid-cols-6 gap-3 text-gray-900" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Location</label>
              <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none ">
                <option value="all">All Locations</option>
                <option value="shop">Shop</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Type</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                <option value="all">All Types</option>
                {transactionTypes.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Category</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Product</label>
              <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                <option value="all">All Products</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">From</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">To</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
            </div>
          </div>

          {/* TABLE */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="text-5xl mb-3">📋</div>
              <p className="text-lg font-bold text-gray-600">No records found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
                <img src="/icons/Book.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                <h2 className="font-bold text-white">Transaction History</h2>
                <span className="ml-auto text-xs text-white opacity-60">{filtered.length} records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-5 py-3 font-semibold">Date & Time</th>
                      <th className="px-5 py-3 font-semibold">Product</th>
                      <th className="px-5 py-3 font-semibold">Category</th>
                      <th className="px-5 py-3 font-semibold">Type</th>
                      <th className="px-5 py-3 font-semibold">Location</th>
                      <th className="px-5 py-3 font-semibold">Change</th>
                      <th className="px-5 py-3 font-semibold">Before → After</th>
                      <th className="px-5 py-3 font-semibold">By</th>
                      <th className="px-5 py-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((txn) => (
                      <tr key={txn.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(txn.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
                        </td>
                        <td className="px-5 py-3 text-sm font-semibold text-gray-800 whitespace-nowrap">{txn.products?.name || '—'}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{txn.products?.categories?.name || '—'}</td>
                        <td className="px-5 py-3">{getTypeBadge(txn.transaction_type)}</td>
                        <td className="px-5 py-3">{getLocationBadge(txn.location)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-black ${txn.quantity_change > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {txn.quantity_change > 0 ? '+' : ''}{txn.quantity_change}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{txn.quantity_before} → {txn.quantity_after}</td>
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{txn.profiles?.full_name || '—'}</td>
                        <td className="px-5 py-3 text-xs text-gray-400 max-w-xs truncate">{txn.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
                  <span className="text-xs text-gray-500">
                    Page {currentPage} of {totalPages} — {filtered.length} total records
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40"
                      style={{ backgroundColor: '#1a2340', color: 'white' }}
                    >
                      ← Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((p, idx, arr) => (
                        <span key={p} className="flex items-center gap-2">
                          {idx > 0 && arr[idx - 1] !== p - 1 && (
                            <span className="text-xs text-gray-400">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(p)}
                            className="px-3 py-1.5 rounded-sm text-xs font-bold"
                            style={currentPage === p
                              ? { backgroundColor: '#1a2340', color: 'white' }
                              : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
                            }
                          >
                            {p}
                          </button>
                        </span>
                      ))
                    }
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40"
                      style={{ backgroundColor: '#1a2340', color: 'white' }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
