'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile } from '@/lib/auth'
import { getAllProducts, getAllCategories } from '@/lib/products'
import {
  getInventoryStats,
  getLowStockAlerts,
  adjustStock,
  transferStock,
  type InventoryStats,
} from '@/lib/inventory'
import type { Product, UserRole } from '@/lib/supabase'
import StockAdjustmentModal from '@/components/StockAdjustmentModal'
import TransferStockModal from '@/components/TransferStockModal'
import { createDisposal, PULLOUT_REASONS, OTH_REASONS, type DisposalType } from '@/lib/disposals'
import { signOut } from '@/lib/auth'
import ManagerSidebar from '@/components/ManagerSidebar'

export default function InventoryPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<UserRole>('cashier')
  const [products, setProducts] = useState<any[]>([])
  const [stats, setStats] = useState<InventoryStats | null>(null)
  const [alerts, setAlerts] = useState<any[]>([])
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<'shop' | 'production'>('shop')
  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalType, setDisposalType] = useState<DisposalType>('pullout')
  const [disposalProduct, setDisposalProduct] = useState<any>(null)
  const [disposalLocation, setDisposalLocation] = useState<'shop' | 'production'>('shop')
  const [disposalReason, setDisposalReason] = useState('')
  const [disposalQuantity, setDisposalQuantity] = useState('')
  const [disposalSubmitting, setDisposalSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [categories, setCategories] = useState<any[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { setCurrentPage(1) }, [search, filterStatus, filterCategory])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile) { router.push('/login'); return }
    setUserId(user.id)
    setUserRole(profile.role)
    await loadData(profile.role)
    setLoading(false)
  }

  async function loadData(role: UserRole) {
    try {
      const productsData = await getAllProducts()
      setProducts(productsData)
      const alertsData = await getLowStockAlerts()
      const catsData = await getAllCategories()
      setCategories(catsData)
      if (role === 'cashier' || role === 'production') {
        setAlerts(alertsData.filter((a: any) => a.location === 'shop'))
      } else {
        setAlerts(alertsData)
      }
      if (role === 'manager') {
        const statsData = await getInventoryStats()
        setStats(statsData)
      }
    } catch {
      setError('Failed to load inventory data')
    }
  }

  async function handleAdjustStock(quantity: number, notes: string) {
    if (!selectedProduct) return
    try {
      await adjustStock(selectedProduct.id, selectedLocation, quantity, notes, userId)
      setSuccess(`Stock adjusted for ${selectedProduct.name}`)
      setShowAdjustModal(false); setSelectedProduct(null)
      await loadData(userRole)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) { throw err }
  }

  async function handleTransferStock(quantity: number, notes: string) {
    if (!selectedProduct) return
    try {
      await transferStock(selectedProduct.id, quantity, notes, userId)
      setSuccess(`Transferred ${quantity} ${selectedProduct.name} to shop`)
      setShowTransferModal(false); setSelectedProduct(null)
      await loadData(userRole)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) { throw err }
  }

  function openAdjustModal(product: Product, location: 'shop' | 'production') {
    setSelectedProduct(product); setSelectedLocation(location); setShowAdjustModal(true)
  }

  function openTransferModal(product: Product) {
    setSelectedProduct(product); setShowTransferModal(true)
  }

  function openDisposalModal(product: any, type: DisposalType, location: 'shop' | 'production') {
    setDisposalProduct(product); setDisposalType(type); setDisposalLocation(location)
    setDisposalReason(''); setDisposalQuantity(''); setShowDisposalModal(true)
  }

  async function handleDisposal(e: React.FormEvent) {
    e.preventDefault()
    if (!disposalProduct || !disposalReason || !disposalQuantity) return
    setDisposalSubmitting(true)
    try {
      await createDisposal(disposalProduct.id, disposalType, disposalReason, parseInt(disposalQuantity), disposalLocation, userId)
      setSuccess(`${disposalType === 'pullout' ? 'Pull-out' : 'OTH'} recorded for ${disposalProduct.name}`)
      setShowDisposalModal(false); setDisposalProduct(null)
      await loadData(userRole)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) { setError(err.message || 'Failed to record disposal') }
    finally { setDisposalSubmitting(false) }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  function getFilteredProducts(role: UserRole) {
    let result = products
    if (search.trim()) result = result.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    if (filterCategory !== 'all') result = result.filter(p => p.category_id === filterCategory)
    if (filterStatus === 'low') {
      result = result.filter(p => role === 'production'
        ? p.production_current_stock < p.production_minimum_threshold && p.production_current_stock > 0
        : p.shop_current_stock < p.shop_minimum_threshold && p.shop_current_stock > 0)
    } else if (filterStatus === 'out') {
      result = result.filter(p => role === 'production' ? p.production_current_stock === 0 : p.shop_current_stock === 0)
    } else if (filterStatus === 'ok') {
      result = result.filter(p => role === 'production'
        ? p.production_current_stock >= p.production_minimum_threshold
        : p.shop_current_stock >= p.shop_minimum_threshold)
    }
    return result
  }

  function Pagination({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
    const totalPages = Math.ceil(total / itemsPerPage)
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
        <span className="text-xs text-gray-500">Page {page} of {totalPages} — {total} products</span>
        <div className="flex gap-2">
          <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40"
            style={{ backgroundColor: '#1a2340', color: 'white' }}>← Prev</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .map((p, idx, arr) => (
              <span key={p} className="flex items-center gap-2">
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-xs text-gray-400">...</span>}
                <button onClick={() => onPage(p)} className="px-3 py-1.5 rounded-sm text-xs font-bold"
                  style={page === p
                    ? { backgroundColor: '#1a2340', color: 'white' }
                    : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
                  }>{p}</button>
              </span>
            ))}
          <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === Math.ceil(total / itemsPerPage)}
            className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40"
            style={{ backgroundColor: '#1a2340', color: 'white' }}>Next →</button>
        </div>
      </div>
    )
  }

  function FilterBar() {
    return (
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)}
          className="text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-white focus:outline-none w-40 text-gray-900"
          style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }} />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-white focus:outline-none text-gray-900"
          style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {['all', 'ok', 'low', 'out'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors capitalize "
            style={filterStatus === s
              ? { backgroundColor: '#1a2340', color: 'white' }
              : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
            }>
            {s === 'all' ? 'All' : s === 'ok' ? 'In Stock' : s === 'low' ? 'Low Stock' : 'Out of Stock'}
          </button>
        ))}
      </div>
    )
  }

  function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
      <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
        <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">{label}</p>
        <p className="text-3xl font-black text-white">{value}</p>
        {sub && <p className="text-white text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    )
  }

  function StockBadge({ stock, min }: { stock: number; min: number }) {
    if (stock === 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">Out</span>
    if (stock < min) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-400 text-white">Low</span>
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500 text-white">OK</span>
  }

  // Shared branding + logout for sidebar layouts
  function TopNav() {
    return (
      <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
            <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
        </div>
        <button onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors">
          <span className="text-base font-bold">→</span>
          <span className="text-xs font-semibold">Logout</span>
        </button>
      </div>
    )
  }

  // Cashier top nav with inline links
  function CashierTopNav() {
    const links = [
      { href: '/pos', label: 'POS' },
      { href: '/inventory', label: 'Inventory', active: true },
      { href: '/restock-requests', label: 'Restock' },
    ]
    return (
      <div className="relative z-10 w-full flex items-center gap-6 px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
            <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
        </div>
        <div className="flex gap-2">
          {links.map(link => (
            <a key={link.label} href={link.href}
              className="px-4 py-1.5 rounded-sm text-xs font-bold no-underline transition-colors"
              style={link.active
                ? { backgroundColor: '#F5A623', color: '#7B1111' }
                : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }
              }>
              {link.label}
            </a>
          ))}
        </div>
        <div className="ml-auto">
          <button onClick={handleLogout}
            className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors">
            <span className="text-base font-bold">→</span>
            <span className="text-xs font-semibold">Logout</span>
          </button>
        </div>
      </div>
    )
  }

  // function Sidebar({ links }: { links: { href: string; icon: string; label: string; active?: boolean }[] }) {
  //   return (
  //     <div className="relative z-10 flex flex-col gap-2 p-3 w-28 shrink-0">
  //       {links.map((link) => (
  //         <a key={link.label} href={link.href}
  //           className={`flex flex-col items-center justify-center gap-1 p-3 rounded-sm text-center transition-colors no-underline ${
  //             link.active ? 'text-white' : 'bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-800'
  //           }`}
  //           style={link.active ? { backgroundColor: '#1a2340' } : { boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}>
  //           <img src={link.icon} alt="" className="w-7 h-7" style={link.active ? { filter: 'brightness(0) invert(1)' } : {}} />
  //           <span className="text-xs font-semibold leading-tight">{link.label}</span>
  //         </a>
  //       ))}
  //     </div>
  //   )
  // }

  // const managerLinks = [
  //   { href: '/restock-requests', icon: '/icons/Plus_square.svg', label: 'Restock' },
  //   { href: '/inventory', icon: '/icons/Box.svg', label: 'Inventory', active: true },
  //   { href: '/expenses', icon: '/icons/payment.svg', label: 'Expenses' },
  //   { href: '/analytics', icon: '/icons/Bar_chart.svg', label: 'Analytics' },
  //   { href: '/users', icon: '/icons/person.svg', label: 'Staff' },
  //   { href: '/products', icon: '/icons/Tag.svg', label: 'Products' },
  //   { href: '/ingredients', icon: '/icons/flour.svg', label: 'Ingredients' },
  //   { href: '/audit-logs', icon: '/icons/Book.svg', label: 'Audit' },
  //   { href: '/dashboard', icon: '/icons/menu.svg', label: 'Dashboard' },
  // ]

const productionNavLinks = [
  { href: '/production', label: 'Dashboard' },
  { href: '/inventory', label: 'Inventory' , active: true },
  { href: '/restock-requests', label: 'Restock'},
  { href: '/ingredients', label: 'Ingredients' },
  { href: '/purchase-orders', label: 'Purchase Orders' },
]

  const Watermark = () => (
    <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
      style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
  )

  function DisposalModal() {
    const reasons = disposalType === 'pullout' ? PULLOUT_REASONS : OTH_REASONS
    const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-gray-400"
    const labelClass = "block text-xs font-bold text-gray-500 mb-1"
    if (!showDisposalModal || !disposalProduct) return null
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-sm w-full max-w-md" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
          <div className="px-6 py-4" style={{ backgroundColor: disposalType === 'pullout' ? '#991B1B' : '#5B21B6' }}>
            <h2 className="text-white font-black text-lg">{disposalType === 'pullout' ? '🗑️ Pull-out Stock' : '🎁 On the House'}</h2>
            <p className="text-white text-xs opacity-60 mt-0.5">{disposalProduct.name} — {disposalLocation} stock ({disposalType === 'pullout' ? disposalProduct.shop_current_stock || disposalProduct.production_current_stock : disposalLocation === 'shop' ? disposalProduct.shop_current_stock : disposalProduct.production_current_stock} available)</p>
          </div>
          <form onSubmit={handleDisposal} className="px-6 py-5 space-y-4">
            <div>
              <label className={labelClass}>Reason *</label>
              <select value={disposalReason} onChange={e => setDisposalReason(e.target.value)} required className={inputClass}>
                <option value="">Select reason...</option>
                {reasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Quantity *</label>
              <input type="number" min="1" value={disposalQuantity} onChange={e => setDisposalQuantity(e.target.value)} required placeholder="e.g., 3" className={inputClass} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={disposalSubmitting}
                className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
                style={{ backgroundColor: disposalType === 'pullout' ? '#991B1B' : '#5B21B6' }}>
                {disposalSubmitting ? 'Recording...' : `Confirm ${disposalType === 'pullout' ? 'Pull-out' : 'OTH'}`}
              </button>
              <button type="button" onClick={() => setShowDisposalModal(false)}
                className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  // ─── CASHIER VIEW — top nav, no sidebar ──────────────────────
  if (userRole === 'cashier') {
    const filteredProducts = getFilteredProducts('cashier')
    const paginated = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
        <CashierTopNav />
        <div className="flex flex-1 relative">
          <Watermark />
          <div className="relative z-10 flex-1 p-6 overflow-y-auto">
            <h1 className="text-4xl font-black text-gray-900 mb-6">Shop Inventory</h1>
            {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}

            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard label="Total Shop Stock" value={products.reduce((sum, p) => sum + p.shop_current_stock, 0)} sub="Total units" />
              <StatCard label="Low Stock Items" value={alerts.length} sub="Need restocking" />
              <StatCard label="Out of Stock" value={products.filter(p => p.shop_current_stock === 0).length} sub="Products" />
            </div>

            {alerts.length > 0 && (
              <div className="bg-white rounded-sm overflow-hidden mb-5" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#7B1111' }}>
                  <img src="/icons/Alert_triangle.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                  <h2 className="font-bold text-white">Low Stock Alerts</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-5 py-3 font-semibold">Product</th>
                      <th className="px-5 py-3 font-semibold">Stock</th>
                      <th className="px-5 py-3 font-semibold">Min</th>
                      <th className="px-5 py-3 font-semibold">Needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-5 py-3 text-sm font-semibold text-gray-800">{alert.product.name}</td>
                        <td className="px-5 py-3"><span className="bg-red-500 text-white text-xs font-bold rounded-sm w-7 h-7 flex items-center justify-center">{alert.currentStock}</span></td>
                        <td className="px-5 py-3 text-sm text-gray-500">{alert.minimumThreshold}</td>
                        <td className="px-5 py-3 text-sm font-bold text-red-500">+{alert.deficit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#6B8F8F' }}>
                <img src="/icons/Box.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                <h2 className="font-bold text-white">All Products — Shop Stock</h2>
                <span className="ml-auto text-xs text-white opacity-60">{filteredProducts.length} products</span>
              </div>
              <div className="px-5 pt-4 pb-2"><FilterBar /></div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Price</th>
                    <th className="px-5 py-3 font-semibold">Stock</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((product) => (
                    <tr key={product.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-semibold text-gray-800">{product.name}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">₱{product.price.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-lg font-black ${product.shop_current_stock === 0 ? 'text-red-500' : product.shop_current_stock < product.shop_minimum_threshold ? 'text-orange-500' : 'text-green-600'}`}>
                          {product.shop_current_stock}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">/ {product.shop_minimum_threshold}</span>
                      </td>
                      <td className="px-5 py-3"><StockBadge stock={product.shop_current_stock} min={product.shop_minimum_threshold} /></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openDisposalModal(product, 'pullout', 'shop')} disabled={product.shop_current_stock === 0} className="text-xs font-bold px-2 py-1 rounded-sm text-white bg-red-500 hover:bg-red-600 disabled:opacity-30">Pull-out</button>
                          <button onClick={() => openDisposalModal(product, 'oth', 'shop')} disabled={product.shop_current_stock === 0} className="text-xs font-bold px-2 py-1 rounded-sm text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-30">OTH</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">No products found</td></tr>
                  )}
                </tbody>
              </table>
              <Pagination total={filteredProducts.length} page={currentPage} onPage={setCurrentPage} />
            </div>
          </div>
        </div>
      <DisposalModal />
      </div>
    )
  }

  // ─── PRODUCTION VIEW ─────────────────────────────────────────
  if (userRole === 'production') {
    const filteredProducts = getFilteredProducts('production')
    const paginated = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
        <div className="relative z-10 w-full flex items-center gap-6 px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
            <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
              <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
          </div>
          <div className="flex gap-2">
            {productionNavLinks.map(link => (
              <a key={link.label} href={link.href}
                className="px-4 py-1.5 rounded-sm text-xs font-bold no-underline transition-colors"
                style={link.active
                  ? { backgroundColor: '#F5A623', color: '#7B1111' }
                  : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }
                }>
                {link.label}
              </a>
            ))}
          </div>
          <div className="ml-auto">
            <button onClick={handleLogout}
              className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors">
              <span className="text-base font-bold">→</span>
              <span className="text-xs font-semibold">Logout</span>
            </button>
          </div>
        </div>
        <div className="flex flex-1 relative">
          <Watermark />
          <div className="relative z-10 flex-1 p-6 overflow-y-auto">
            <h1 className="text-4xl font-black text-gray-900 mb-6">Production Inventory</h1>
            {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}
            {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard label="Production Stock" value={products.reduce((sum, p) => sum + p.production_current_stock, 0)} sub="Total units" />
              <StatCard label="Shop Needs Restock" value={alerts.length} sub="Low stock alerts" />
              <StatCard label="Ready to Transfer" value={products.filter(p => p.production_current_stock > 0).length} sub="Products available" />
            </div>

            {alerts.length > 0 && (
              <div className="bg-white rounded-sm overflow-hidden mb-5" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#7B1111' }}>
                  <img src="/icons/Alert_triangle.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                  <h2 className="font-bold text-white">Shop Needs Restock</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-5 py-3 font-semibold">Product</th>
                      <th className="px-5 py-3 font-semibold">Shop Stock</th>
                      <th className="px-5 py-3 font-semibold">Needed</th>
                      <th className="px-5 py-3 font-semibold">Production Stock</th>
                      <th className="px-5 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-5 py-3 text-sm font-semibold text-gray-800">{alert.product.name}</td>
                        <td className="px-5 py-3"><span className="bg-red-500 text-white text-xs font-bold rounded-sm w-7 h-7 flex items-center justify-center">{alert.currentStock}</span></td>
                        <td className="px-5 py-3 text-sm font-bold text-red-500">+{alert.deficit}</td>
                        <td className="px-5 py-3 text-sm font-bold text-green-600">{alert.product.production_current_stock}</td>
                        <td className="px-5 py-3">
                          {alert.product.production_current_stock > 0
                            ? <button onClick={() => openTransferModal(alert.product)} className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: '#F5A623' }}>Transfer</button>
                            : <span className="text-xs text-gray-400">No stock</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#6B8F8F' }}>
                <img src="/icons/Box.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                <h2 className="font-bold text-white">All Products</h2>
                <span className="ml-auto text-xs text-white opacity-60">{filteredProducts.length} products</span>
              </div>
              <div className="px-5 pt-4 pb-2"><FilterBar /></div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Shop Stock</th>
                    <th className="px-5 py-3 font-semibold">Production Stock</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((product) => (
                    <tr key={product.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-semibold text-gray-800">{product.name}</td>
                      <td className="px-5 py-3">
                        <span className={`text-lg font-black ${product.shop_current_stock < product.shop_minimum_threshold ? 'text-red-500' : 'text-green-600'}`}>{product.shop_current_stock}</span>
                        <span className="text-xs text-gray-400 ml-1">/ {product.shop_minimum_threshold}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-lg font-black ${product.production_current_stock < product.production_minimum_threshold ? 'text-red-500' : 'text-green-600'}`}>{product.production_current_stock}</span>
                        <span className="text-xs text-gray-400 ml-1">/ {product.production_minimum_threshold}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          {product.production_current_stock > 0 && (
                            <button onClick={() => openTransferModal(product)} className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: '#F5A623' }}>Transfer</button>
                          )}
                          <button onClick={() => openDisposalModal(product, 'pullout', 'production')} disabled={product.production_current_stock === 0} className="text-xs font-bold px-2 py-1 rounded-sm text-white bg-red-500 hover:bg-red-600 disabled:opacity-30">Pull-out</button>
                          <button onClick={() => openDisposalModal(product, 'oth', 'production')} disabled={product.production_current_stock === 0} className="text-xs font-bold px-2 py-1 rounded-sm text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-30">OTH</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">No products found</td></tr>
                  )}
                </tbody>
              </table>
              <Pagination total={filteredProducts.length} page={currentPage} onPage={setCurrentPage} />
            </div>
          </div>
        </div>

        {showTransferModal && selectedProduct && <TransferStockModal product={selectedProduct} onSubmit={handleTransferStock} onCancel={() => { setShowTransferModal(false); setSelectedProduct(null) }} />}
        <DisposalModal />
      </div>
    )
  }

  // ─── MANAGER VIEW ─────────────────────────────────────────────
  const filteredProducts = getFilteredProducts('manager')
  const paginated = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
      <TopNav />
      <div className="flex flex-1 relative">
        <Watermark />
        <ManagerSidebar />
        <div className="relative z-10 flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-black text-gray-900">Inventory Management</h1>
            <a href="/audit-logs" className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-gray-900 text-sm no-underline"
              style={{ backgroundColor: 'white', boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}>
              <img src="/icons/Book.svg" alt="" className="w-4 h-4" />
              View Audit Logs
            </a>
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}
          {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

          {stats && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Shop Stock" value={stats.totalShopStock} sub={`${stats.totalProducts} products`} />
              <StatCard label="Production Stock" value={stats.totalProductionStock} sub="Ready to transfer" />
              <StatCard label="Low Stock Alerts" value={stats.lowStockShop + stats.lowStockProduction} sub={`Shop: ${stats.lowStockShop}, Prod: ${stats.lowStockProduction}`} />
              <StatCard label="Out of Stock" value={stats.outOfStockShop + stats.outOfStockProduction} sub={`Shop: ${stats.outOfStockShop}, Prod: ${stats.outOfStockProduction}`} />
            </div>
          )}

          {alerts.length > 0 && (
            <div className="bg-white rounded-sm overflow-hidden mb-5" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#7B1111' }}>
                <img src="/icons/Alert_triangle.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                <h2 className="font-bold text-white">Low Stock Alerts</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Location</th>
                    <th className="px-5 py-3 font-semibold">Stock</th>
                    <th className="px-5 py-3 font-semibold">Needed</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="px-5 py-3 text-sm font-semibold text-gray-800">{alert.product.name}</td>
                      <td className="px-5 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{alert.location}</span></td>
                      <td className="px-5 py-3"><span className="bg-red-500 text-white text-xs font-bold rounded-sm w-7 h-7 flex items-center justify-center">{alert.currentStock}</span></td>
                      <td className="px-5 py-3 text-sm font-bold text-red-500">+{alert.deficit}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openAdjustModal(alert.product, alert.location)} className="text-xs font-bold px-3 py-1 rounded-full text-white bg-blue-500 hover:bg-blue-600">Adjust</button>
                          {alert.location === 'shop' && alert.product.production_current_stock > 0 && (
                            <button onClick={() => openTransferModal(alert.product)} className="text-xs font-bold px-3 py-1 rounded-full text-white bg-green-500 hover:bg-green-600">Transfer</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#6B8F8F' }}>
              <img src="/icons/Box.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
              <h2 className="font-bold text-white">All Products</h2>
              <span className="ml-auto text-xs text-white opacity-60">{filteredProducts.length} products</span>
            </div>
            <div className="px-5 pt-4 pb-2"><FilterBar /></div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-semibold">Product</th>
                  <th className="px-5 py-3 font-semibold">Shop Stock</th>
                  <th className="px-5 py-3 font-semibold">Production Stock</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-semibold text-gray-800">{product.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-lg font-black ${product.shop_current_stock < product.shop_minimum_threshold ? 'text-red-500' : 'text-green-600'}`}>{product.shop_current_stock}</span>
                      <span className="text-xs text-gray-400 ml-1">/ {product.shop_minimum_threshold}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-lg font-black ${product.production_current_stock < product.production_minimum_threshold ? 'text-red-500' : 'text-green-600'}`}>{product.production_current_stock}</span>
                      <span className="text-xs text-gray-400 ml-1">/ {product.production_minimum_threshold}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openAdjustModal(product, 'shop')} className="text-xs font-bold px-3 py-1 rounded-full text-white bg-blue-500 hover:bg-blue-600">Shop</button>
                        <button onClick={() => openAdjustModal(product, 'production')} className="text-xs font-bold px-3 py-1 rounded-full text-white bg-purple-500 hover:bg-purple-600">Production</button>
                        {product.production_current_stock > 0 && (
                          <button onClick={() => openTransferModal(product)} className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: '#F5A623' }}>Transfer</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">No products found</td></tr>
                )}
              </tbody>
            </table>
            <Pagination total={filteredProducts.length} page={currentPage} onPage={setCurrentPage} />
          </div>
        </div>
      </div>
      {showAdjustModal && selectedProduct && <StockAdjustmentModal product={selectedProduct} location={selectedLocation} onSubmit={handleAdjustStock} onCancel={() => { setShowAdjustModal(false); setSelectedProduct(null) }} />}
      {showTransferModal && selectedProduct && <TransferStockModal product={selectedProduct} onSubmit={handleTransferStock} onCancel={() => { setShowTransferModal(false); setSelectedProduct(null) }} />}
      <DisposalModal />
    </div>
  )
}
