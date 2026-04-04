'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getAllExpenses,
  getAllExpenseCategories,
  createExpense,
  updateExpense,
  deleteExpense,
  createExpenseCategory,
  updateExpenseCategory,
  archiveExpenseCategory,
  getMonthlyExpenseSummary,
  type ExpenseWithCategory,
  type ExpenseSummary,
} from '@/lib/expenses'
import type { ExpenseCategory } from '@/lib/supabase'
import ExpenseCard from '@/components/ExpenseCard'
import ManagerSidebar from '@/components/ManagerSidebar'

export default function ExpensesPage() {
  const router = useRouter()

  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'expenses' | 'categories'>('expenses')

  const [filterCategory, setFilterCategory] = useState('all')
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1)
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())

  // Add expense
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [newCategory, setNewCategory] = useState('')
  const [newNotes, setNewNotes] = useState('')

  // Edit expense
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Delete expense
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingExpense, setDeletingExpense] = useState<ExpenseWithCategory | null>(null)

  // Add category
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDesc, setNewCategoryDesc] = useState('')

  // Edit category
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryDesc, setEditCategoryDesc] = useState('')

  // Archive category (replaces delete)
  const [showArchiveCategoryModal, setShowArchiveCategoryModal] = useState(false)
  const [archivingCategory, setArchivingCategory] = useState<ExpenseCategory | null>(null)

  useEffect(() => { checkAuthAndLoad() }, [])
  useEffect(() => { if (!loading) loadSummary() }, [filterMonth, filterYear, loading])

  async function checkAuthAndLoad() {
    try {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }
      const profile = await getUserProfile(user.id)
      if (!profile || profile.role !== 'manager') { router.push('/dashboard'); return }
      setCurrentUserId(user.id)
      await loadData()
    } catch { router.push('/login') }
  }

  async function loadData() {
    try {
      setLoading(true)
      const [expensesData, categoriesData] = await Promise.all([getAllExpenses(), getAllExpenseCategories()])
      setExpenses(expensesData)
      setCategories(categoriesData)
      await loadSummary()
    } catch { setError('Failed to load expenses') }
    finally { setLoading(false) }
  }

  async function loadSummary() {
    try {
      const data = await getMonthlyExpenseSummary(filterYear, filterMonth)
      setSummary(data)
    } catch {}
  }

  // ── Expense handlers ──
  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim() || !newAmount || !newDate) return
    try {
      setSubmitting(true); setError('')
      await createExpense(newTitle.trim(), parseFloat(newAmount), newDate, currentUserId, newCategory || undefined, newNotes.trim() || undefined)
      setShowAddModal(false); resetAddForm()
      setSuccess('Expense added'); await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Failed to add expense.') }
    finally { setSubmitting(false) }
  }

  function resetAddForm() {
    setNewTitle(''); setNewAmount(''); setNewDate(new Date().toISOString().split('T')[0]); setNewCategory(''); setNewNotes('')
  }

  function handleEditClick(expense: ExpenseWithCategory) {
    setEditingExpense(expense); setEditTitle(expense.name); setEditAmount(String(expense.amount))
    setEditDate(expense.expense_date); setEditCategory(expense.category_id || ''); setEditNotes(expense.notes || '')
    setShowEditModal(true)
  }

  async function handleUpdateExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!editingExpense || !editTitle.trim() || !editAmount) return
    try {
      setSubmitting(true); setError('')
      await updateExpense(editingExpense.id, { title: editTitle.trim(), amount: parseFloat(editAmount), expense_date: editDate, category_id: editCategory || null, notes: editNotes.trim() || null })
      setShowEditModal(false); setEditingExpense(null)
      setSuccess('Expense updated'); await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Failed to update expense.') }
    finally { setSubmitting(false) }
  }

  function handleDeleteClick(expense: ExpenseWithCategory) {
    setDeletingExpense(expense); setShowDeleteModal(true)
  }

  async function handleConfirmDelete() {
    if (!deletingExpense) return
    try {
      setSubmitting(true)
      await deleteExpense(deletingExpense.id)
      setShowDeleteModal(false); setDeletingExpense(null)
      setSuccess('Expense deleted'); await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Failed to delete expense.') }
    finally { setSubmitting(false) }
  }

  // ── Category handlers ──
  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    try {
      setSubmitting(true); setError('')
      await createExpenseCategory(newCategoryName.trim(), newCategoryDesc.trim() || undefined)
      setShowAddCategoryModal(false); setNewCategoryName(''); setNewCategoryDesc('')
      setSuccess('Category added'); await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Failed to add category. Name may already exist.') }
    finally { setSubmitting(false) }
  }

  function handleEditCategoryClick(cat: ExpenseCategory) {
    setEditingCategory(cat); setEditCategoryName(cat.name); setEditCategoryDesc(cat.description || '')
    setShowEditCategoryModal(true)
  }

  async function handleUpdateCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCategory || !editCategoryName.trim()) return
    try {
      setSubmitting(true); setError('')
      await updateExpenseCategory(editingCategory.id, editCategoryName.trim(), editCategoryDesc.trim() || undefined)
      setShowEditCategoryModal(false); setEditingCategory(null)
      setSuccess('Category updated'); await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Failed to update category.') }
    finally { setSubmitting(false) }
  }

  function handleArchiveCategoryClick(cat: ExpenseCategory) {
    setArchivingCategory(cat); setShowArchiveCategoryModal(true)
  }

  async function handleConfirmArchiveCategory() {
    if (!archivingCategory) return
    try {
      setSubmitting(true)
      await archiveExpenseCategory(archivingCategory.id)
      setShowArchiveCategoryModal(false); setArchivingCategory(null)
      setSuccess('Category archived'); await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Failed to archive category.') }
    finally { setSubmitting(false) }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  const filteredExpenses = expenses.filter((expense) => {
    const expDate = new Date(expense.expense_date + 'T00:00:00Z')
    return expDate.getUTCMonth() + 1 === filterMonth && expDate.getUTCFullYear() === filterYear &&
      (filterCategory === 'all' || expense.category_id === filterCategory)
  })

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


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

       <ManagerSidebar />

        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-black text-gray-900">Expense Tracking</h1>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm"
              style={{ backgroundColor: '#1a2340' }}>
              <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
              Add Expense
            </button>
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error} <button onClick={() => setError('')} className="ml-3 underline text-xs">Dismiss</button></div>}
          {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

          <div className="flex items-center gap-3 mb-5">
            <select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))}
              className="text-xs font-bold px-3 py-2 rounded-sm border border-gray-200 bg-white focus:outline-none"
              style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }}>
              {monthNames.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
            <select value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))}
              className="text-xs font-bold px-3 py-2 rounded-sm border border-gray-200 bg-white focus:outline-none"
              style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs font-semibold text-gray-700">{monthNames[filterMonth - 1]} {filterYear}</span>
          </div>

          {summary && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Total Revenue</p>
                <p className="text-2xl font-black text-white">₱{summary.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                <p className="text-white text-xs opacity-50 mt-1">Sales this month</p>
              </div>
              <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Total Expenses</p>
                <p className="text-2xl font-black text-white">₱{summary.totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                <p className="text-white text-xs opacity-50 mt-1">{summary.expenseCount} records</p>
              </div>
              <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Net Income</p>
                <p className={`text-2xl font-black ${summary.netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.netIncome < 0 ? '-' : ''}₱{Math.abs(summary.netIncome).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-white text-xs opacity-50 mt-1">Revenue minus expenses</p>
              </div>
              <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Top Expense</p>
                <p className="text-lg font-black text-white">{summary.expensesByCategory[0]?.category || '—'}</p>
                {summary.expensesByCategory[0] && (
                  <p className="text-white text-xs opacity-50 mt-1">₱{summary.expensesByCategory[0].total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                )}
              </div>
            </div>
          )}

          {summary && summary.expensesByCategory.length > 0 && (
            <div className="bg-white rounded-sm p-5 mb-5" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 mb-4">
                <img src="/icons/Bar_chart.svg" alt="" className="w-5 h-5 opacity-60" />
                <h2 className="font-bold text-gray-800">Expenses by Category</h2>
              </div>
              <div className="space-y-3">
                {summary.expensesByCategory.map(({ category, total }) => {
                  const pct = summary.totalExpenses > 0 ? Math.round((total / summary.totalExpenses) * 100) : 0
                  return (
                    <div key={category}>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-gray-700">{category}</span>
                        <span className="text-gray-500">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#F5A623' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-5">
            {(['expenses', 'categories'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors capitalize"
                style={activeTab === tab
                  ? { backgroundColor: '#1a2340', color: 'white' }
                  : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
                }>
                {tab === 'expenses' ? 'Expense Records' : 'Categories'}
              </button>
            ))}
          </div>

          {activeTab === 'expenses' && (
            <div>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {['all', ...categories.map(c => c.id)].map(id => {
                  const label = id === 'all' ? 'All' : categories.find(c => c.id === id)?.name || id
                  return (
                    <button key={id} onClick={() => setFilterCategory(id)}
                      className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
                      style={filterCategory === id
                        ? { backgroundColor: '#1a2340', color: 'white' }
                        : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
                      }>
                      {label}
                    </button>
                  )
                })}
              </div>
              {filteredExpenses.length === 0 ? (
                <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="text-5xl mb-3">💸</div>
                  <p className="text-lg font-bold text-gray-600">No expenses found</p>
                  <p className="text-sm text-gray-400 mt-1">No expenses for {monthNames[filterMonth - 1]} {filterYear}{filterCategory !== 'all' ? ' in this category' : ''}</p>
                  <button onClick={() => setShowAddModal(true)} className="mt-5 text-xs font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: '#1a2340' }}>+ Add First Expense</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredExpenses.map(expense => (
                    <ExpenseCard key={expense.id} expense={expense} onEdit={handleEditClick} onDelete={handleDeleteClick} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'categories' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-gray-900">Expense Categories</h2>
                <button onClick={() => setShowAddCategoryModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-xs"
                  style={{ backgroundColor: '#1a2340' }}>
                  <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
                  Add Category
                </button>
              </div>
              {categories.length === 0 ? (
                <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="text-5xl mb-3">🏷️</div>
                  <p className="text-lg font-bold text-gray-600">No categories yet</p>
                  <button onClick={() => setShowAddCategoryModal(true)} className="mt-5 text-xs font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: '#1a2340' }}>+ Add First Category</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map(cat => {
                    const expCount = expenses.filter(e => e.category_id === cat.id).length
                    const total = expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + Number(e.amount), 0)
                    return (
                      <div key={cat.id} className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>
                        <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
                          <p className="text-white font-black text-sm">{cat.name}</p>
                          <div className="flex gap-1.5">
                            <button onClick={() => handleEditCategoryClick(cat)}
                              className="text-xs font-bold px-2.5 py-1 rounded-sm transition-colors"
                              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}>
                              Edit
                            </button>
                            <button onClick={() => handleArchiveCategoryClick(cat)}
                              className="text-xs font-bold px-2.5 py-1 rounded-sm bg-gray-500 text-white hover:bg-gray-600 transition-colors">
                              Archive
                            </button>
                          </div>
                        </div>
                        <div className="px-4 py-4">
                          {cat.description && <p className="text-xs text-gray-500 mb-3">{cat.description}</p>}
                          <div className="flex justify-between">
                            <div>
                              <p className="text-xs text-gray-400">Records</p>
                              <p className="text-xl font-black text-gray-800">{expCount}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-400">Total Spent</p>
                              <p className="text-sm font-black text-red-500">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ADD EXPENSE */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-5">Add Expense</h2>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div><label className={labelClass}>Expense Title *</label><input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} required className={inputClass} placeholder="e.g., Electricity Bill" /></div>
              <div><label className={labelClass}>Amount (₱) *</label><input type="number" min="0" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Date *</label><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Category</label>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className={inputClass}>
                  <option value="">Select category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Notes (optional)</label><textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={3} className={inputClass} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#1a2340' }}>{submitting ? 'Saving...' : 'Save Expense'}</button>
                <button type="button" onClick={() => { setShowAddModal(false); resetAddForm() }} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EXPENSE */}
      {showEditModal && editingExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-5">Edit Expense</h2>
            <form onSubmit={handleUpdateExpense} className="space-y-4">
              <div><label className={labelClass}>Expense Title *</label><input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Amount (₱) *</label><input type="number" min="0" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Date *</label><input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Category</label>
                <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className={inputClass}>
                  <option value="">Select category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Notes (optional)</label><textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className={inputClass} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50 bg-blue-600 hover:bg-blue-700">{submitting ? 'Updating...' : 'Update Expense'}</button>
                <button type="button" onClick={() => { setShowEditModal(false); setEditingExpense(null) }} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE EXPENSE */}
      {showDeleteModal && deletingExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-sm w-full text-center" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="text-5xl mb-4">🗑️</div>
            <h2 className="text-lg font-black text-gray-900 mb-2">Delete Expense?</h2>
            <p className="text-sm text-gray-500 mb-1">Are you sure you want to delete <strong>{deletingExpense.name}</strong>?</p>
            <p className="text-red-500 font-black mb-1">₱{Number(deletingExpense.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-gray-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleConfirmDelete} disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 text-sm">{submitting ? 'Deleting...' : 'Yes, Delete'}</button>
              <button onClick={() => { setShowDeleteModal(false); setDeletingExpense(null) }} className="flex-1 py-2 rounded-sm border border-gray-200 font-semibold text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CATEGORY */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-md w-full" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-5">Add Category</h2>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div><label className={labelClass}>Category Name *</label><input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} required className={inputClass} placeholder="e.g., Maintenance, Transport" /></div>
              <div><label className={labelClass}>Description (optional)</label><input type="text" value={newCategoryDesc} onChange={e => setNewCategoryDesc(e.target.value)} className={inputClass} placeholder="Brief description..." /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#1a2340' }}>{submitting ? 'Adding...' : 'Add Category'}</button>
                <button type="button" onClick={() => setShowAddCategoryModal(false)} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CATEGORY */}
      {showEditCategoryModal && editingCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-md w-full" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-5">Edit Category</h2>
            <form onSubmit={handleUpdateCategory} className="space-y-4">
              <div><label className={labelClass}>Category Name *</label><input type="text" value={editCategoryName} onChange={e => setEditCategoryName(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Description (optional)</label><input type="text" value={editCategoryDesc} onChange={e => setEditCategoryDesc(e.target.value)} className={inputClass} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50 bg-blue-600 hover:bg-blue-700">{submitting ? 'Updating...' : 'Update Category'}</button>
                <button type="button" onClick={() => { setShowEditCategoryModal(false); setEditingCategory(null) }} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ARCHIVE CATEGORY */}
      {showArchiveCategoryModal && archivingCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm p-6 max-w-sm w-full text-center" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="text-5xl mb-4">🏷️</div>
            <h2 className="text-lg font-black text-gray-900 mb-2">Archive Category?</h2>
            <p className="text-sm text-gray-500 mb-2">Are you sure you want to archive <strong>{archivingCategory.name}</strong>?</p>
            <p className="text-xs text-gray-400 mb-5">Existing expenses will keep this category. It just won't appear for new expenses.</p>
            <div className="flex gap-3">
              <button onClick={handleConfirmArchiveCategory} disabled={submitting}
                className="flex-1 py-2 rounded-sm font-bold text-white bg-gray-500 hover:bg-gray-600 disabled:opacity-50 text-sm">
                {submitting ? 'Archiving...' : 'Yes, Archive'}
              </button>
              <button onClick={() => { setShowArchiveCategoryModal(false); setArchivingCategory(null) }}
                className="flex-1 py-2 rounded-sm border border-gray-200 font-semibold text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
