'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getTodaysProductionRecords,
  getTodaysProductionStats,
  recordProduction,
  type ProductionWithDetails,
  type ProductionStats,
} from '@/lib/production'
import { getLowStockIngredients, type IngredientWithCategory } from '@/lib/ingredients'
import { getAllProducts } from '@/lib/products'
import type { Product } from '@/lib/supabase'
import ProductionRecordCard from '@/components/ProductionRecordCard'
import ManagerSidebar from '@/components/ManagerSidebar'

export default function ProductionDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'manager' | 'production'>('production')
  const [records, setRecords] = useState<ProductionWithDetails[]>([])
  const [stats, setStats] = useState<ProductionStats | null>(null)
  const [lowStockIngredients, setLowStockIngredients] = useState<IngredientWithCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || (profile.role !== 'production' && profile.role !== 'manager')) {
      router.push('/login'); return
    }
    setUserId(user.id)
    setUserRole(profile.role as 'manager' | 'production')
    await loadData()
    setLoading(false)
  }

  async function loadData() {
    try {
      const [recordsData, statsData, lowStockData, productsData] = await Promise.all([
        getTodaysProductionRecords(),
        getTodaysProductionStats(),
        getLowStockIngredients(),
        getAllProducts(),
      ])
      setRecords(recordsData)
      setStats(statsData)
      setLowStockIngredients(lowStockData)
      setProducts(productsData.filter(p => !p.is_archived))
    } catch {
      setError('Failed to load production data')
    }
  }

  function openModal() {
    setSelectedProduct(''); setQuantity(''); setNotes(''); setFormError('')
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!selectedProduct) { setFormError('Please select a product'); return }
    if (!quantity || parseInt(quantity) <= 0) { setFormError('Please enter a valid quantity'); return }
    setSubmitting(true)
    try {
      await recordProduction(selectedProduct, parseInt(quantity), userId, notes || undefined)
      setShowModal(false)
      await loadData()
    } catch (err: any) {
      setFormError(err.message || 'Failed to record production')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  const selectedProductData = products.find(p => p.id === selectedProduct)

const productionNavLinks = [
  { href: '/production', label: 'Dashboard', active: true },
  { href: '/inventory', label: 'Inventory' },
  { href: '/restock-requests', label: 'Restock' },
  { href: '/ingredients', label: 'Ingredients' },
  { href: '/purchase-orders', label: 'Purchase Orders' },
]



  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-gray-400"
  const labelClass = "block text-xs font-bold text-gray-500 mb-1"

  const Watermark = () => (
    <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
      style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
  )

  const Branding = () => (
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
      <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
        <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
      </div>
      <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
    </div>
  )

  const LogoutButton = () => (
    <button onClick={handleLogout}
      className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors shrink-0">
      <span className="text-base font-bold">→</span>
      <span className="text-xs font-semibold">Logout</span>
    </button>
  )

  const PageContent = () => (
    <div className="relative z-10 flex-1 p-6 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900">Production Log</h1>
          <p className="text-gray-700 font-medium mt-1">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        {userRole === 'production' && (
          <button onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm"
            style={{ backgroundColor: '#10B981' }}>
            <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
            Record Production
          </button>
        )}
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Produced Today', value: stats.totalProduced, sub: 'units' },
            { label: 'Production Sessions', value: stats.productionSessions, sub: 'batches' },
            { label: 'Unique Products', value: stats.uniqueProducts, sub: 'different items' },
            { label: 'Most Produced', value: stats.mostProducedProduct?.name || 'N/A', sub: `${stats.mostProducedProduct?.quantity || 0} units`, small: true },
          ].map(card => (
            <div key={card.label} className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">{card.label}</p>
              <p className={`font-black text-white ${card.small ? 'text-lg leading-tight' : 'text-3xl'}`}>{card.value}</p>
              <p className="text-white text-xs opacity-50 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Low Stock Alert */}
      {lowStockIngredients.length > 0 && (
        <div className="bg-white rounded-sm overflow-hidden mb-5" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#7B1111' }}>
            <img src="/icons/Alert_triangle.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
            <h2 className="font-bold text-white">Low Ingredient Stock — {lowStockIngredients.length} item{lowStockIngredients.length !== 1 ? 's' : ''} need restocking</h2>
            <Link href="/ingredients" className="ml-auto text-xs font-bold text-white opacity-80 hover:opacity-100 no-underline">View All →</Link>
          </div>
          <div className="px-5 py-3 flex flex-wrap gap-2">
            {lowStockIngredients.slice(0, 6).map(ing => (
              <span key={ing.id} className="text-xs font-bold px-3 py-1 rounded-full bg-orange-100 text-orange-700">
                {ing.name} ({ing.current_stock} {ing.unit})
              </span>
            ))}
            {lowStockIngredients.length > 6 && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-500">+{lowStockIngredients.length - 6} more</span>
            )}
          </div>
        </div>
      )}

      {/* Today's Records */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-black text-gray-900">Today's Production</h2>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#1a2340' }}>{records.length}</span>
        </div>

        {records.length === 0 ? (
          <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
            <div className="text-5xl mb-3">🏭</div>
            <p className="text-lg font-bold text-gray-600">No production recorded today</p>
            {userRole === 'production' && (
              <button onClick={openModal}
                className="mt-4 px-5 py-2 rounded-sm text-sm font-bold text-white"
                style={{ backgroundColor: '#10B981' }}>
                Record First Batch
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map(record => (
              <ProductionRecordCard key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>

      {/* Quick Links — production only */}
      {userRole === 'production' && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { href: '/ingredients', icon: '🥄', label: 'Ingredients', sub: 'Manage raw materials' },
            { href: '/restock-requests', icon: '📦', label: 'Restock Requests', sub: 'View and fulfill requests' },
            { href: '/inventory', icon: '📊', label: 'Inventory', sub: 'Check product stock levels' },
          ].map(link => (
            <Link key={link.label} href={link.href}
              className="bg-white rounded-sm p-5 no-underline hover:scale-[1.01] transition-transform"
              style={{ boxShadow: '2px 2px 8px rgba(0,0,0,0.15)' }}>
              <div className="text-3xl mb-2">{link.icon}</div>
              <p className="font-black text-gray-900 text-sm mb-0.5">{link.label}</p>
              <p className="text-xs text-gray-400">{link.sub}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  // Record Production Modal
  const RecordModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm w-full max-w-md" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
        {/* Modal header */}
        <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
          <h2 className="text-white font-black text-lg">Record Production</h2>
          <p className="text-white text-xs opacity-50 mt-0.5">Log products manufactured today</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {formError && <div className="px-3 py-2 rounded-sm text-xs font-semibold text-white bg-red-500">{formError}</div>}

          {/* Product select */}
          <div>
            <label className={labelClass}>Product *</label>
            <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} required className={inputClass}>
              <option value="">Select a product...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — Stock: {p.production_current_stock}
                </option>
              ))}
            </select>
          </div>

          {/* Product info pill */}
          {selectedProductData && (
            <div className="rounded-sm px-4 py-3 flex gap-4" style={{ backgroundColor: '#220901' }}>
              <div>
                <p className="text-white text-xs opacity-50">Production Stock</p>
                <p className="text-white font-black text-lg">{selectedProductData.production_current_stock}</p>
              </div>
              <div>
                <p className="text-white text-xs opacity-50">Shop Stock</p>
                <p className="text-white font-black text-lg">{selectedProductData.shop_current_stock}</p>
              </div>
              <div>
                <p className="text-white text-xs opacity-50">Price</p>
                <p className="text-white font-black text-lg">₱{selectedProductData.price.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className={labelClass}>Quantity Produced *</label>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
              required placeholder="e.g., 50" className={inputClass} />
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Batch details, quality notes, etc." className={inputClass} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting}
              className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
              style={{ backgroundColor: '#10B981' }}>
              {submitting ? 'Recording...' : 'Record Production'}
            </button>
            <button type="button" onClick={() => setShowModal(false)}
              className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  // ── PRODUCTION — top nav ──
  if (userRole === 'production') {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
        <div className="relative z-10 w-full flex items-center gap-6 px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
          <Branding />
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
          <div className="ml-auto"><LogoutButton /></div>
        </div>
        <div className="flex flex-1 relative">
          <Watermark />
          <PageContent />
        </div>
        {showModal && <RecordModal />}
      </div>
    )
  }

  // ── MANAGER — sidebar, view only ──
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
      <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <Branding />
        <LogoutButton />
      </div>
      <div className="flex flex-1 relative">
        <Watermark />
       <ManagerSidebar />
        <PageContent />
      </div>
    </div>
  )
}
