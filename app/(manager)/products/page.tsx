'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getAllProducts,
  searchProducts,
  getProductsByCategory,
  createProduct,
  updateProduct,
  archiveProduct,
  getAllCategories,
  createCategory,
  updateCategory,
  archiveCategory,
} from '@/lib/products'
import type { Product, Category } from '@/lib/supabase'
import ProductCard from '@/components/ProductCard'
import ProductForm, { type ProductFormData } from '@/components/ProductForm'
import ManagerSidebar from '@/components/ManagerSidebar'

export default function ProductsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products')

  // Products state
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | undefined>()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStock, setFilterStock] = useState<string>('all')

  // Categories state
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | undefined>()
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { if (!loading) loadProducts() }, [filterCategory, filterStock, loading])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || profile.role !== 'manager') { router.push('/login'); return }
    await Promise.all([loadCategories(), loadProducts()])
    setLoading(false)
  }

  async function loadCategories() {
    try { setCategories(await getAllCategories()) } catch {}
  }

  async function loadProducts() {
    try {
      let data: Product[] = filterCategory !== 'all'
        ? await getProductsByCategory(filterCategory)
        : await getAllProducts()
      if (filterStock === 'low') {
        data = data.filter(p =>
          p.shop_current_stock < p.shop_minimum_threshold ||
          p.production_current_stock < p.production_minimum_threshold
        )
      }
      setProducts(data)
    } catch { setError('Failed to load products') }
  }

  async function handleSearch(query: string) {
    setSearchQuery(query)
    if (!query.trim()) { await loadProducts(); return }
    try { setProducts(await searchProducts(query)) } catch { setError('Search failed') }
  }

  async function handleCreateProduct(data: ProductFormData) {
    try {
      await createProduct(data)
      flash('Product created successfully!')
      setShowProductModal(false)
      await loadProducts()
    } catch (err: any) { setError(err.message || 'Failed to create product') }
  }

  async function handleUpdateProduct(data: ProductFormData) {
    if (!editingProduct) return
    try {
      await updateProduct(editingProduct.id, data)
      flash('Product updated successfully!')
      setShowProductModal(false); setEditingProduct(undefined)
      await loadProducts()
    } catch (err: any) { setError(err.message || 'Failed to update product') }
  }

  async function handleArchiveProduct(id: string) {
    try {
      await archiveProduct(id)
      flash('Product archived')
      await loadProducts()
    } catch { setError('Failed to archive product') }
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryForm.name, categoryForm.description)
        flash('Category updated!')
      } else {
        await createCategory(categoryForm.name, categoryForm.description)
        flash('Category created!')
      }
      closeCategoryModal()
      await loadCategories()
    } catch (err: any) { setError(err.message || 'Operation failed') }
  }

  async function handleArchiveCategory(id: string, name: string) {
    if (!confirm(`Archive category "${name}"?`)) return
    try {
      await archiveCategory(id)
      flash('Category archived')
      await loadCategories()
    } catch { setError('Failed to archive category') }
  }

  function openEditProduct(product: Product) { setEditingProduct(product); setShowProductModal(true) }
  function closeProductModal() { setShowProductModal(false); setEditingProduct(undefined) }
  function openEditCategory(cat: Category) { setEditingCategory(cat); setCategoryForm({ name: cat.name, description: cat.description || '' }); setShowCategoryModal(true) }
  function closeCategoryModal() { setShowCategoryModal(false); setEditingCategory(undefined); setCategoryForm({ name: '', description: '' }) }

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  const handleLogout = async () => { await signOut(); router.push('/login') }

  // const sidebarLinks = [
  //   { href: '/restock-requests', icon: '/icons/Plus_square.svg', label: 'Restock' },
  //   { href: '/inventory', icon: '/icons/Box.svg', label: 'Inventory' },
  //   { href: '/expenses', icon: '/icons/payment.svg', label: 'Expenses' },
  //   { href: '/analytics', icon: '/icons/Bar_chart.svg', label: 'Analytics' },
  //   { href: '/users', icon: '/icons/person.svg', label: 'Staff' },
  //   { href: '/products', icon: '/icons/Tag.svg', label: 'Products', active: true },
  //   { href: '/ingredients', icon: '/icons/flour.svg', label: 'Ingredients' },
  //   { href: '/audit-logs', icon: '/icons/Book.svg', label: 'Audit' },
  //   { href: '/dashboard', icon: '/icons/menu.svg', label: 'Dashboard' },
  // ]

  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-gray-400"
  const labelClass = "block text-xs font-bold text-gray-500 mb-1"

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
        <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors">
          <span className="text-base font-bold">→</span>
          <span className="text-xs font-semibold">Logout</span>
        </button>
      </div>

      {/* BODY */}
      <div className="flex flex-1 relative">

        {/* Watermark */}
        <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

        {/* SIDEBAR */}
          <ManagerSidebar />

        {/* MAIN CONTENT */}
        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-black text-gray-900">Products</h1>
            {activeTab === 'products' ? (
              <button onClick={() => setShowProductModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm"
                style={{ backgroundColor: '#1a2340' }}>
                <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
                Add Product
              </button>
            ) : (
              <button onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm"
                style={{ backgroundColor: '#1a2340' }}>
                <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
                Add Category
              </button>
            )}
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error} <button onClick={() => setError('')} className="ml-3 underline text-xs">Dismiss</button></div>}
          {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Total Products</p>
              <p className="text-3xl font-black text-white">{products.length}</p>
            </div>
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Low Stock</p>
              <p className="text-3xl font-black text-white">
                {products.filter(p => p.shop_current_stock < p.shop_minimum_threshold || p.production_current_stock < p.production_minimum_threshold).length}
              </p>
            </div>
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Categories</p>
              <p className="text-3xl font-black text-white">{categories.length}</p>
            </div>
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Avg Price</p>
              <p className="text-3xl font-black text-white">
                ₱{products.length > 0 ? (products.reduce((sum, p) => sum + p.price, 0) / products.length).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {(['products', 'categories'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors capitalize"
                style={activeTab === tab
                  ? { backgroundColor: '#1a2340', color: 'white' }
                  : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
                }>
                {tab === 'products' ? 'Products' : 'Categories'}
              </button>
            ))}
          </div>

          {/* ── PRODUCTS TAB ── */}
          {activeTab === 'products' && (
            <>
              {/* Filters */}
              <div className="bg-white rounded-sm p-4 mb-5 flex gap-3 items-center" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
                <input type="text" placeholder="Search products..." value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  className="text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none flex-1 text-gray-900 placeholder-gray-400" />
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none text-gray-900">
                  <option value="all">All Categories</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
                <select value={filterStock} onChange={e => setFilterStock(e.target.value)}
                  className="text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none text-gray-900">
                  <option value="all">All Stock Levels</option>
                  <option value="low">Low Stock Only</option>
                </select>
              </div>

              {products.length === 0 ? (
                <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="text-5xl mb-3">📦</div>
                  <p className="text-lg font-bold text-gray-600">No products found</p>
                  <button onClick={() => setShowProductModal(true)}
                    className="mt-5 text-xs font-bold px-4 py-2 rounded-sm text-white"
                    style={{ backgroundColor: '#1a2340' }}>
                    + Add First Product
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map(product => (
                    <ProductCard key={product.id} product={product} onEdit={openEditProduct} onArchive={handleArchiveProduct} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── CATEGORIES TAB ── */}
          {activeTab === 'categories' && (
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
                <img src="/icons/Tag.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
                <h2 className="font-bold text-white">All Categories</h2>
                <span className="ml-auto text-xs text-white opacity-60">{categories.length} categories</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Description</th>
                    <th className="px-5 py-3 font-semibold">Created</th>
                    <th className="px-5 py-3 font-semibold">Products</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">No categories yet</td></tr>
                  ) : (
                    categories.map(cat => {
                      const count = products.filter(p => (p as any).category_id === cat.id).length
                      return (
                        <tr key={cat.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 text-sm font-black text-gray-800">{cat.name}</td>
                          <td className="px-5 py-3 text-sm text-gray-500">{cat.description || '—'}</td>
                          <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(cat.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{count} products</span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => openEditCategory(cat)}
                                className="text-xs font-bold px-3 py-1 rounded-full text-white bg-blue-500 hover:bg-blue-600">
                                Edit
                              </button>
                              <button onClick={() => handleArchiveCategory(cat.id, cat.name)}
                                className="text-xs font-bold px-3 py-1 rounded-full text-white bg-red-400 hover:bg-red-500">
                                Archive
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── ADD/EDIT PRODUCT MODAL ── */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-5">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
            <ProductForm
              product={editingProduct}
              onSubmit={editingProduct ? handleUpdateProduct : handleCreateProduct}
              onCancel={closeProductModal}
            />
          </div>
        </div>
      )}

      {/* ── ADD/EDIT CATEGORY MODAL ── */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-md w-full" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-5">{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className={labelClass}>Name *</label>
                <input type="text" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required className={inputClass} placeholder="e.g., Bread, Pies" />
              </div>
              <div>
                <label className={labelClass}>Description (optional)</label>
                <textarea value={categoryForm.description} onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows={3} className={inputClass} placeholder="Brief description..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit"
                  className="flex-1 py-2 rounded-sm font-bold text-white text-sm"
                  style={{ backgroundColor: '#1a2340' }}>
                  {editingCategory ? 'Update Category' : 'Create Category'}
                </button>
                <button type="button" onClick={closeCategoryModal}
                  className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
