'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getAllIngredients,
  createIngredient,
  updateIngredient,
  archiveIngredient,
  adjustIngredientStock,
  getAllIngredientCategories,
  type IngredientWithCategory,
  type IngredientCategory,
} from '@/lib/ingredients'
import ManagerSidebar from '@/components/ManagerSidebar'

// ── Moved outside component to prevent remounting on every render ──
const managerLinks = [
  { href: '/restock-requests', icon: '/icons/Plus_square.svg', label: 'Restock' },
  { href: '/inventory', icon: '/icons/Box.svg', label: 'Inventory' },
  { href: '/expenses', icon: '/icons/payment.svg', label: 'Expenses' },
  { href: '/analytics', icon: '/icons/Bar_chart.svg', label: 'Analytics' },
  { href: '/users', icon: '/icons/person.svg', label: 'Staff' },
  { href: '/products', icon: '/icons/Tag.svg', label: 'Products' },
  { href: '/ingredients', icon: '/icons/flour.svg', label: 'Ingredients', active: true },
  { href: '/audit-logs', icon: '/icons/Book.svg', label: 'Audit' },
  { href: '/dashboard', icon: '/icons/menu.svg', label: 'Dashboard' },
]

const productionNavLinks = [
  { href: '/production', label: 'Dashboard' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/restock-requests', label: 'Restock' },
  { href: '/ingredients', label: 'Ingredients', active: true },
  { href: '/purchase-orders', label: 'Purchase Orders' },
]

const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
const labelClass = "block text-xs font-bold text-gray-500 mb-1"

function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock === 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">Out</span>
  if (stock < min) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-400 text-white">Low</span>
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500 text-white">OK</span>
}

export default function IngredientsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'manager' | 'production'>('production')
  const [ingredients, setIngredients] = useState<IngredientWithCategory[]>([])
  const [categories, setCategories] = useState<IngredientCategory[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientWithCategory | null>(null)
  const [editingIngredient, setEditingIngredient] = useState<IngredientWithCategory | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newMinStock, setNewMinStock] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editMinStock, setEditMinStock] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [adjustment, setAdjustment] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

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
      const [ingredientsData, categoriesData] = await Promise.all([getAllIngredients(), getAllIngredientCategories()])
      setIngredients(ingredientsData)
      setCategories(categoriesData)
    } catch { setError('Failed to load ingredients') }
  }

  function openEditModal(ingredientId: string) {
    const ingredient = ingredients.find(i => i.id === ingredientId)
    if (ingredient) {
      setEditingIngredient(ingredient); setEditName(ingredient.name); setEditUnit(ingredient.unit)
      setEditMinStock(ingredient.minimum_threshold.toString()); setEditCategory(ingredient.category_id || '')
      setShowEditModal(true)
    }
  }

  function openAdjustModal(ingredientId: string) {
    const ingredient = ingredients.find(i => i.id === ingredientId)
    if (ingredient) { setSelectedIngredient(ingredient); setShowAdjustModal(true) }
  }

  async function handleAddIngredient(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSubmitting(true)
    try {
      await createIngredient(newName, newUnit, parseInt(newMinStock), newCategory || undefined)
      setSuccess('Ingredient added successfully'); setShowAddModal(false)
      setNewName(''); setNewUnit(''); setNewMinStock(''); setNewCategory('')
      await loadData()
    } catch (err: any) { setError(err.message || 'Failed to add ingredient') }
    finally { setSubmitting(false); setTimeout(() => setSuccess(''), 3000) }
  }

  async function handleEditIngredient(e: React.FormEvent) {
    e.preventDefault()
    if (!editingIngredient) return
    setError(''); setSubmitting(true)
    try {
      await updateIngredient(editingIngredient.id, { name: editName, unit: editUnit, minimumStock: parseInt(editMinStock), categoryId: editCategory || undefined })
      setSuccess('Ingredient updated successfully'); setShowEditModal(false); setEditingIngredient(null)
      await loadData()
    } catch (err: any) { setError(err.message || 'Failed to update ingredient') }
    finally { setSubmitting(false); setTimeout(() => setSuccess(''), 3000) }
  }

  async function handleArchiveIngredient(ingredientId: string) {
    const ingredient = ingredients.find(i => i.id === ingredientId)
    if (!ingredient || !confirm(`Are you sure you want to archive "${ingredient.name}"?`)) return
    try {
      await archiveIngredient(ingredientId); setSuccess('Ingredient archived successfully'); await loadData()
    } catch (err: any) { setError(err.message || 'Failed to archive ingredient') }
    finally { setTimeout(() => setSuccess(''), 3000) }
  }

  async function handleAdjustStock(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedIngredient) return
    setError(''); setSubmitting(true)
    try {
      await adjustIngredientStock(selectedIngredient.id, parseInt(adjustment), userId, adjustNotes || undefined)
      setSuccess('Stock adjusted successfully'); setShowAdjustModal(false); setSelectedIngredient(null)
      setAdjustment(''); setAdjustNotes(''); await loadData()
    } catch (err: any) { setError(err.message || 'Failed to adjust stock') }
    finally { setSubmitting(false); setTimeout(() => setSuccess(''), 3000) }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  const lowStockCount = ingredients.filter(i => i.current_stock < i.minimum_threshold).length
  const outOfStockCount = ingredients.filter(i => i.current_stock === 0).length

  const filteredIngredients = ingredients.filter(i => {
    const matchesSearch = !search.trim() || i.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'low' ? i.current_stock < i.minimum_threshold && i.current_stock > 0 :
      filterStatus === 'out' ? i.current_stock === 0 :
      i.current_stock >= i.minimum_threshold
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  const navbar_branding = (
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
      <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
        <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
      </div>
      <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
    </div>
  )

  const navbar_logout = (
    <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors shrink-0">
      <span className="text-base font-bold">→</span>
      <span className="text-xs font-semibold">Logout</span>
    </button>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>

      {/* TOP NAVBAR */}
      {userRole === 'production' ? (
        <div className="relative z-10 w-full flex items-center gap-6 px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
          {navbar_branding}
          <div className="flex gap-2">
            {productionNavLinks.map(link => (
              <a key={link.label} href={link.href}
                className="px-4 py-1.5 rounded-sm text-xs font-bold no-underline transition-colors"
                style={link.active ? { backgroundColor: '#F5A623', color: '#7B1111' } : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="ml-auto">{navbar_logout}</div>
        </div>
      ) : (
        <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
          {navbar_branding}
          {navbar_logout}
        </div>
      )}

      {/* BODY */}
      <div className="flex flex-1 relative">

        {/* Watermark */}
        <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

        {/* SIDEBAR (manager only) */}
        {userRole === 'manager' && <ManagerSidebar />}

        {/* MAIN CONTENT */}
        <div className="relative z-10 flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-black text-gray-900">Ingredients</h1>
            {userRole === 'manager' && (
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm"
                style={{ backgroundColor: '#1a2340' }}>
                <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
                Add Ingredient
              </button>
            )}
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error} <button onClick={() => setError('')} className="ml-3 underline text-xs">Dismiss</button></div>}
          {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total Ingredients', value: ingredients.length, sub: 'Active ingredients' },
              { label: 'Low Stock', value: lowStockCount, sub: 'Need restocking' },
              { label: 'Out of Stock', value: outOfStockCount, sub: 'Ingredients' },
            ].map(card => (
              <div key={card.label} className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">{card.label}</p>
                <p className="text-3xl font-black text-white">{card.value}</p>
                <p className="text-white text-xs opacity-50 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#6B8F8F' }}>
              <img src="/icons/flour.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
              <h2 className="font-bold text-white">All Ingredients</h2>
              <span className="ml-auto text-xs text-white opacity-60">{filteredIngredients.length} ingredients</span>
            </div>
            <div className="flex gap-3 px-5 pt-4 pb-2 items-center flex-wrap">
              <input type="text" placeholder="Search ingredients..." value={search} onChange={e => setSearch(e.target.value)}
                className="text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none w-44"
                style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }} />
              {['all', 'ok', 'low', 'out'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
                  style={filterStatus === s
                    ? { backgroundColor: '#1a2340', color: 'white' }
                    : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
                  {s === 'all' ? 'All' : s === 'ok' ? 'In Stock' : s === 'low' ? 'Low Stock' : 'Out of Stock'}
                </button>
              ))}
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-semibold">Ingredient</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Unit</th>
                  <th className="px-5 py-3 font-semibold">Stock</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">
                    {ingredients.length === 0 ? 'No ingredients yet — add your first one!' : 'No ingredients match your filters'}
                  </td></tr>
                ) : filteredIngredients.map(ingredient => (
                  <tr key={ingredient.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-semibold text-gray-800">{ingredient.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{ingredient.ingredient_categories?.name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{ingredient.unit}</td>
                    <td className="px-5 py-3">
                      <span className={`text-lg font-black ${ingredient.current_stock === 0 ? 'text-red-500' : ingredient.current_stock < ingredient.minimum_threshold ? 'text-orange-500' : 'text-green-600'}`}>
                        {ingredient.current_stock}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">/ {ingredient.minimum_threshold}</span>
                    </td>
                    <td className="px-5 py-3"><StockBadge stock={ingredient.current_stock} min={ingredient.minimum_threshold} /></td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openAdjustModal(ingredient.id)} className="text-xs font-bold px-3 py-1 rounded-full text-white bg-blue-500 hover:bg-blue-600">Adjust</button>
                        {userRole === 'manager' && (
                          <>
                            <button onClick={() => openEditModal(ingredient.id)} className="text-xs font-bold px-3 py-1 rounded-full text-white bg-purple-500 hover:bg-purple-600">Edit</button>
                            <button onClick={() => handleArchiveIngredient(ingredient.id)} className="text-xs font-bold px-3 py-1 rounded-full text-white bg-gray-400 hover:bg-gray-500">Archive</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODALS — inlined directly, not as inner components */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm overflow-hidden max-w-md w-full" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">Add New Ingredient</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">Fill in the details below</p>
            </div>
            <form onSubmit={handleAddIngredient} className="px-6 py-5 space-y-4">
              <div><label className={labelClass}>Ingredient Name *</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className={inputClass} placeholder="e.g., Flour, Sugar, Eggs" /></div>
              <div><label className={labelClass}>Unit of Measurement *</label><input type="text" value={newUnit} onChange={e => setNewUnit(e.target.value)} required className={inputClass} placeholder="e.g., kg, liters, pieces" /></div>
              <div><label className={labelClass}>Minimum Stock Level *</label><input type="number" min="0" value={newMinStock} onChange={e => setNewMinStock(e.target.value)} required className={inputClass} placeholder="e.g., 50" /></div>
              <div><label className={labelClass}>Category (optional)</label>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className={inputClass}>
                  <option value="">Select category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#1a2340' }}>{submitting ? 'Adding...' : 'Add Ingredient'}</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50"style={{ backgroundColor: '#440609' }} >Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingIngredient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm overflow-hidden max-w-md w-full" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">Edit Ingredient</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">{editingIngredient.name}</p>
            </div>
            <form onSubmit={handleEditIngredient} className="px-6 py-5 space-y-4">
              <div><label className={labelClass}>Ingredient Name *</label><input type="text" value={editName} onChange={e => setEditName(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Unit of Measurement *</label><input type="text" value={editUnit} onChange={e => setEditUnit(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Minimum Stock Level *</label><input type="number" min="0" value={editMinStock} onChange={e => setEditMinStock(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Category (optional)</label>
                <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className={inputClass}>
                  <option value="">Select category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50 bg-blue-500 hover:bg-blue-600">{submitting ? 'Updating...' : 'Update Ingredient'}</button>
                <button type="button" onClick={() => { setShowEditModal(false); setEditingIngredient(null) }} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdjustModal && selectedIngredient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm overflow-hidden max-w-md w-full" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">Adjust Stock</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">{selectedIngredient.name} — {selectedIngredient.current_stock} {selectedIngredient.unit} current</p>
            </div>
            <form onSubmit={handleAdjustStock} className="px-6 py-5 space-y-4">
              <div><label className={labelClass}>Adjustment Amount *</label><input type="number" value={adjustment} onChange={e => setAdjustment(e.target.value)} required className={inputClass} placeholder="e.g., 10 or -5" /><p className="text-xs text-gray-400 mt-1">Positive to add, negative to remove</p></div>
              <div><label className={labelClass}>Notes (optional)</label><textarea value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} rows={3} className={inputClass} placeholder="Reason for adjustment..." /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#1a2340' }}>{submitting ? 'Adjusting...' : 'Confirm Adjustment'}</button>
                <button type="button" onClick={() => { setShowAdjustModal(false); setSelectedIngredient(null); setAdjustment(''); setAdjustNotes('') }} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
