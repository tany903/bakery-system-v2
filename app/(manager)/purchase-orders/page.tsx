'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import { getAllIngredients, type IngredientWithCategory } from '@/lib/ingredients'
import { getAllExpenseCategories } from '@/lib/expenses'
import type { ExpenseCategory } from '@/lib/supabase'
import ManagerSidebar from '@/components/ManagerSidebar'
import {
  getAllPurchaseOrders, getAllSuppliers, createPurchaseOrder, createSupplier,
  updateSupplier, archiveSupplier,
  submitPurchaseOrder, approvePurchaseOrder, rejectPurchaseOrder,
  cancelPurchaseOrder, receivePurchaseOrder,
  type PurchaseOrderWithDetails, type PurchaseOrderItem, type Supplier, type NewPOItem,
} from '@/lib/purchase-orders'

const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
const labelClass = "block text-xs font-bold text-gray-500 mb-1"

const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  draft:              { bg: '#6B7280', label: 'Draft' },
  submitted:          { bg: '#F5A623', label: 'Submitted' },
  approved:           { bg: '#3B82F6', label: 'Approved' },
  rejected:           { bg: '#EF4444', label: 'Rejected' },
  partially_received: { bg: '#8B5CF6', label: 'Partial' },
  received:           { bg: '#10B981', label: 'Received' },
  cancelled:          { bg: '#9CA3AF', label: 'Cancelled' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] || { bg: '#6B7280', label: status }
  return (
    <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: s.bg }}>
      {s.label}
    </span>
  )
}

const PAGE_SIZE = 9

const productionNavLinks = [
  { href: '/production', label: 'Dashboard' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/restock-requests', label: 'Restock' },
  { href: '/ingredients', label: 'Ingredients' },
  { href: '/purchase-orders', label: 'Purchase Orders', active: true },
]

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'manager' | 'production'>('manager')
  const [orders, setOrders] = useState<PurchaseOrderWithDetails[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<IngredientWithCategory[]>([])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [activeTab, setActiveTab] = useState<'orders' | 'suppliers'>('orders')

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [showNewPO, setShowNewPO] = useState(false)
  const [poSupplierId, setPOSupplierId] = useState('')
  const [poSupplierName, setPOSupplierName] = useState('')
  const [poNotes, setPONotes] = useState('')
  const [poDeliveryDate, setPODeliveryDate] = useState('')
  const [poItems, setPOItems] = useState<{ ingredient_id: string; quantity: string; unit_cost: string; notes: string }[]>([
    { ingredient_id: '', quantity: '', unit_cost: '', notes: '' }
  ])

  const [viewingPO, setViewingPO] = useState<PurchaseOrderWithDetails | null>(null)

  const [receivingPO, setReceivingPO] = useState<PurchaseOrderWithDetails | null>(null)
  const [receiptQtys, setReceiptQtys] = useState<Record<string, string>>({})
  const [receiptExpenseCat, setReceiptExpenseCat] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')

  const [rejectingPO, setRejectingPO] = useState<PurchaseOrderWithDetails | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierContact, setNewSupplierContact] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [newSupplierEmail, setNewSupplierEmail] = useState('')
  const [newSupplierAddress, setNewSupplierAddress] = useState('')
  const [newSupplierNotes, setNewSupplierNotes] = useState('')

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [editSupplierName, setEditSupplierName] = useState('')
  const [editSupplierContact, setEditSupplierContact] = useState('')
  const [editSupplierPhone, setEditSupplierPhone] = useState('')
  const [editSupplierEmail, setEditSupplierEmail] = useState('')
  const [editSupplierAddress, setEditSupplierAddress] = useState('')
  const [editSupplierNotes, setEditSupplierNotes] = useState('')

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { setPage(1) }, [statusFilter, search])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || (profile.role !== 'manager' && profile.role !== 'production')) {
      router.push('/login'); return
    }
    setUserId(user.id)
    setUserRole(profile.role as 'manager' | 'production')
    await loadAll()
    setLoading(false)
  }

  async function loadAll() {
    try {
      const [ordersData, suppliersData, ingredientsData, expCatData] = await Promise.all([
        getAllPurchaseOrders(),
        getAllSuppliers(),
        getAllIngredients(),
        getAllExpenseCategories(),
      ])
      setOrders(ordersData)
      setSuppliers(suppliersData)
      setIngredients(ingredientsData)
      setExpenseCategories(expCatData)
    } catch { setError('Failed to load data') }
  }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  function addPOItem() {
    setPOItems(prev => [...prev, { ingredient_id: '', quantity: '', unit_cost: '', notes: '' }])
  }
  function removePOItem(i: number) {
    setPOItems(prev => prev.filter((_, idx) => idx !== i))
  }
  function updatePOItem(i: number, field: string, value: string) {
    setPOItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  function getAvailableIngredients(currentIndex: number) {
    const selected = poItems.filter((_, i) => i !== currentIndex).map(i => i.ingredient_id).filter(Boolean)
    return ingredients.filter(ing => !selected.includes(ing.id))
  }

  function handleIngredientSelect(index: number, ingredientId: string) {
    const ing = ingredients.find(i => i.id === ingredientId)
    setPOItems(prev => prev.map((item, idx) => idx === index
      ? { ...item, ingredient_id: ingredientId, unit_cost: ing?.unit_cost ? String(ing.unit_cost) : item.unit_cost }
      : item
    ))
  }

  async function handleCreatePO(e: React.FormEvent) {
    e.preventDefault()
    const validItems = poItems.filter(i => i.ingredient_id && parseFloat(i.quantity) > 0 && parseFloat(i.unit_cost) >= 0)
    if (validItems.length === 0) { flash('Add at least one item with valid quantity and cost', true); return }
    const supplierName = poSupplierId
      ? suppliers.find(s => s.id === poSupplierId)?.name || poSupplierName
      : poSupplierName
    if (!supplierName.trim()) { flash('Please enter or select a supplier', true); return }

    const items: NewPOItem[] = validItems.map(i => {
      const ing = ingredients.find(ing => ing.id === i.ingredient_id)!
      return {
        ingredient_id: i.ingredient_id,
        ingredient_name_snapshot: ing.name,
        unit: ing.unit,
        quantity_ordered: parseFloat(i.quantity),
        unit_cost: parseFloat(i.unit_cost),
        notes: i.notes || undefined,
      }
    })

    setSubmitting(true)
    try {
      await createPurchaseOrder(items, userId, {
        supplier_id: poSupplierId || undefined,
        supplier_name: supplierName,
        notes: poNotes || undefined,
        expected_delivery_date: poDeliveryDate || undefined,
      })
      flash(`Purchase order created with ${items.length} item${items.length !== 1 ? 's' : ''}`)
      setShowNewPO(false)
      resetNewPOForm()
      await loadAll()
    } catch (err: any) { flash(err.message || 'Failed to create PO', true) }
    finally { setSubmitting(false) }
  }

  function resetNewPOForm() {
    setPOSupplierId(''); setPOSupplierName(''); setPONotes(''); setPODeliveryDate('')
    setPOItems([{ ingredient_id: '', quantity: '', unit_cost: '', notes: '' }])
  }

  async function handleSubmitPO(id: string) {
    try { await submitPurchaseOrder(id); flash('PO submitted for approval'); await loadAll() }
    catch (err: any) { flash(err.message || 'Failed to submit', true) }
  }

  async function handleApprovePO(id: string) {
    try { await approvePurchaseOrder(id, userId); flash('PO approved'); await loadAll() }
    catch (err: any) { flash(err.message || 'Failed to approve', true) }
  }

  async function handleRejectConfirm() {
    if (!rejectingPO || !rejectReason.trim()) { flash('Please enter a rejection reason', true); return }
    try {
      await rejectPurchaseOrder(rejectingPO.id, userId, rejectReason)
      flash('PO rejected'); setRejectingPO(null); setRejectReason('')
      await loadAll()
    } catch (err: any) { flash(err.message || 'Failed to reject', true) }
  }

  async function handleCancelPO(id: string) {
    if (!confirm('Cancel this purchase order?')) return
    try { await cancelPurchaseOrder(id); flash('PO cancelled'); await loadAll() }
    catch (err: any) { flash(err.message || 'Failed to cancel', true) }
  }

  function openReceiveModal(po: PurchaseOrderWithDetails) {
    const qtys: Record<string, string> = {}
    for (const item of po.items) {
      qtys[item.id] = String(item.quantity_ordered - item.quantity_received)
    }
    setReceiptQtys(qtys)
    setReceiptExpenseCat(expenseCategories[0]?.id || '')
    setReceiptNotes('')
    setReceivingPO(po)
  }

  async function handleReceiveConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!receivingPO) return
    if (!receiptExpenseCat) { flash('Please select an expense category', true); return }
    const itemReceipts = receivingPO.items.map((item: PurchaseOrderItem) => ({
      item_id: item.id,
      quantity_received: parseFloat(receiptQtys[item.id] || '0') || 0,
    }))
    setSubmitting(true)
    try {
      await receivePurchaseOrder(receivingPO.id, userId, itemReceipts, receiptExpenseCat, receiptNotes)
      flash('Items received — ingredient stock updated & expense recorded')
      setReceivingPO(null)
      await loadAll()
    } catch (err: any) { flash(err.message || 'Failed to receive', true) }
    finally { setSubmitting(false) }
  }

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault()
    if (!newSupplierName.trim()) return
    setSubmitting(true)
    try {
      await createSupplier({
        name: newSupplierName,
        contact_person: newSupplierContact || undefined,
        phone: newSupplierPhone || undefined,
        email: newSupplierEmail || undefined,
        address: newSupplierAddress || undefined,
        notes: newSupplierNotes || undefined,
      })
      flash('Supplier added')
      setShowNewSupplier(false)
      setNewSupplierName(''); setNewSupplierContact(''); setNewSupplierPhone('')
      setNewSupplierEmail(''); setNewSupplierAddress(''); setNewSupplierNotes('')
      await loadAll()
    } catch (err: any) { flash(err.message || 'Failed to add supplier', true) }
    finally { setSubmitting(false) }
  }

  function openEditSupplier(s: Supplier) {
    setEditingSupplier(s)
    setEditSupplierName(s.name)
    setEditSupplierContact(s.contact_person || '')
    setEditSupplierPhone(s.phone || '')
    setEditSupplierEmail(s.email || '')
    setEditSupplierAddress(s.address || '')
    setEditSupplierNotes(s.notes || '')
  }

  async function handleUpdateSupplier(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSupplier || !editSupplierName.trim()) return
    setSubmitting(true)
    try {
      await updateSupplier(editingSupplier.id, {
        name: editSupplierName,
        contact_person: editSupplierContact || null,
        phone: editSupplierPhone || null,
        email: editSupplierEmail || null,
        address: editSupplierAddress || null,
        notes: editSupplierNotes || null,
      })
      flash('Supplier updated')
      setEditingSupplier(null)
      await loadAll()
    } catch (err: any) { flash(err.message || 'Failed to update supplier', true) }
    finally { setSubmitting(false) }
  }

  async function handleArchiveSupplier(s: Supplier) {
    if (!confirm(`Archive "${s.name}"? They won't appear in new PO dropdowns.`)) return
    try {
      await archiveSupplier(s.id)
      flash('Supplier archived')
      await loadAll()
    } catch (err: any) { flash(err.message || 'Failed to archive', true) }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    const matchSearch = !search.trim() || o.po_number.toLowerCase().includes(search.toLowerCase()) ||
      o.supplier_name_snapshot.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusTabs = [
    { key: 'all', label: 'All', count: orders.length },
    { key: 'draft', label: 'Draft', count: orders.filter(o => o.status === 'draft').length },
    { key: 'submitted', label: 'Submitted', count: orders.filter(o => o.status === 'submitted').length },
    { key: 'approved', label: 'Approved', count: orders.filter(o => o.status === 'approved').length },
    { key: 'received', label: 'Received', count: orders.filter(o => o.status === 'received').length },
    { key: 'rejected', label: 'Rejected', count: orders.filter(o => o.status === 'rejected').length },
  ]

  function printPO(po: PurchaseOrderWithDetails) {
    const rows = po.items.map((item: PurchaseOrderItem) => `
      <tr>
        <td>${item.ingredient_name_snapshot}</td>
        <td>${item.unit}</td>
        <td>${item.quantity_ordered}</td>
        <td>${item.quantity_received}</td>
        <td>₱${Number(item.unit_cost).toFixed(2)}</td>
        <td>₱${Number(item.total_cost).toFixed(2)}</td>
      </tr>
    `).join('')
    const html = `
      <html><head><title>PO ${po.po_number}</title>
      <style>
        body { font-family: sans-serif; padding: 32px; color: #111; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        .meta { font-size: 13px; color: #555; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #220901; color: white; text-align: left; padding: 8px 12px; font-size: 12px; }
        td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #eee; }
        .total { font-weight: bold; font-size: 16px; margin-top: 16px; text-align: right; }
        .footer { margin-top: 48px; font-size: 12px; color: #aaa; }
      </style></head><body>
      <h1>Purchase Order — ${po.po_number}</h1>
      <div class="meta">
        <p><strong>Supplier:</strong> ${po.supplier_name_snapshot}</p>
        <p><strong>Status:</strong> ${po.status.toUpperCase()}</p>
        <p><strong>Date:</strong> ${new Date(po.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        ${po.expected_delivery_date ? `<p><strong>Expected Delivery:</strong> ${po.expected_delivery_date}</p>` : ''}
        ${po.notes ? `<p><strong>Notes:</strong> ${po.notes}</p>` : ''}
      </div>
      <table>
        <thead><tr><th>Ingredient</th><th>Unit</th><th>Qty Ordered</th><th>Qty Received</th><th>Unit Cost</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Total Amount: ₱${Number(po.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
      <div class="footer">Generated by IS FREDS IS GOOD Bakery System</div>
      </body></html>
    `
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  const isManager = userRole === 'manager'

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>

      {/* NAVBAR */}
      {isManager ? (
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
      ) : (
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
                style={link.active ? { backgroundColor: '#F5A623', color: '#7B1111' } : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="ml-auto">
            <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors shrink-0">
              <span className="text-base font-bold">→</span>
              <span className="text-xs font-semibold">Logout</span>
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 relative overflow-hidden">
        <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

        {isManager && <ManagerSidebar />}

        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-black text-gray-900">Purchase Orders</h1>
              <p className="text-gray-700 font-medium mt-1">
                {isManager
                  ? `${orders.filter(o => o.status === 'submitted').length} pending approval`
                  : `${orders.filter(o => o.status === 'draft').length} drafts · ${orders.filter(o => o.status === 'submitted').length} submitted`
                }
              </p>
            </div>
            <div className="flex gap-3">
              {/* Only manager can add suppliers */}
              {isManager && (
                <button onClick={() => setShowNewSupplier(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-gray-900 text-sm"
                  style={{ backgroundColor: 'white', boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}>
                  + Supplier
                </button>
              )}
              {/* Both roles can create POs */}
              <button onClick={() => setShowNewPO(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm"
                style={{ backgroundColor: '#1a2340' }}>
                <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
                New PO
              </button>
            </div>
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}
          {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total POs', value: orders.length },
              { label: 'Pending Approval', value: orders.filter(o => o.status === 'submitted').length },
              { label: 'Approved', value: orders.filter(o => o.status === 'approved').length },
              { label: 'Total Value', value: `₱${orders.reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` },
            ].map(stat => (
              <div key={stat.label} className="rounded-sm p-5" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-1 opacity-60">{stat.label}</p>
                <p className="text-2xl font-black text-white">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Tabs — suppliers tab only for manager */}
          <div className="flex gap-2 mb-5">
            <button onClick={() => setActiveTab('orders')}
              className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
              style={activeTab === 'orders' ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
              Purchase Orders
            </button>
            {isManager && (
              <button onClick={() => setActiveTab('suppliers')}
                className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
                style={activeTab === 'suppliers' ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
                Suppliers ({suppliers.length})
              </button>
            )}
          </div>

          {/* ── ORDERS TAB ── */}
          {activeTab === 'orders' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex flex-wrap gap-2">
                  {statusTabs.map(tab => (
                    <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                      className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
                      style={statusFilter === tab.key
                        ? { backgroundColor: '#1a2340', color: 'white' }
                        : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search PO# or supplier..."
                  className="text-xs px-3 py-1.5 rounded-sm border border-gray-200 bg-white focus:outline-none text-gray-900 placeholder-gray-400"
                  style={{ minWidth: '180px', boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }} />
              </div>

              {paginated.length === 0 ? (
                <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="text-5xl mb-3">📋</div>
                  <p className="text-lg font-bold text-gray-600">No purchase orders found</p>
                  <button onClick={() => setShowNewPO(true)} className="mt-5 text-xs font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: '#1a2340' }}>+ Create First PO</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginated.map(po => (
                    <div key={po.id} className="bg-white rounded-sm overflow-hidden flex flex-col" style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>
                      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
                        <div>
                          <p className="text-white font-black text-sm">{po.po_number}</p>
                          <p className="text-white text-xs opacity-50">{po.supplier_name_snapshot}</p>
                        </div>
                        <StatusBadge status={po.status} />
                      </div>
                      <div className="px-4 py-4 flex flex-col gap-3 flex-1">
                        <div className="space-y-1">
                          {po.items.slice(0, 3).map((item: PurchaseOrderItem) => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span className="text-gray-600 font-medium">{item.ingredient_name_snapshot}</span>
                              <span className="text-gray-400">{item.quantity_ordered} {item.unit} × ₱{Number(item.unit_cost).toFixed(2)}</span>
                            </div>
                          ))}
                          {po.items.length > 3 && <p className="text-xs text-gray-400">+{po.items.length - 3} more items</p>}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                          <span className="text-xs text-gray-400 font-medium">Total Amount</span>
                          <span className="font-black text-gray-900">₱{Number(po.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {po.expected_delivery_date && (
                          <p className="text-xs text-gray-400">📅 Expected: {new Date(po.expected_delivery_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        )}
                        {po.status === 'rejected' && po.rejection_reason && (
                          <p className="text-xs text-red-500 italic border-l-2 border-red-200 pl-2">{po.rejection_reason}</p>
                        )}
                        <div className="text-xs text-gray-400">
                          <p>{new Date(po.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          {po.created_by_profile?.full_name && <p>By: <span className="font-semibold">{po.created_by_profile.full_name}</span></p>}
                        </div>
                        <div className="flex-1" />
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                          <button onClick={() => setViewingPO(po)} className="text-xs font-bold px-3 py-1.5 rounded-sm" style={{ backgroundColor: '#1a2340', color: 'white' }}>View</button>
                          <button onClick={() => printPO(po)} className="text-xs font-bold px-3 py-1.5 rounded-sm border border-gray-200 text-gray-600 hover:bg-gray-50">🖨 Print</button>

                          {/* Draft: both roles can submit/cancel */}
                          {po.status === 'draft' && !isManager && (
                            <>
                              <button onClick={() => handleSubmitPO(po.id)} className="text-xs font-bold px-3 py-1.5 rounded-sm text-white" style={{ backgroundColor: '#F5A623' }}>Submit</button>
                              <button onClick={() => handleCancelPO(po.id)} className="text-xs font-bold px-3 py-1.5 rounded-sm text-white" style={{ backgroundColor: '#EF4444' }}>Cancel</button>
                            </>
                          )}
                          {/* Manager sees draft but can't act on it */}
                          {po.status === 'draft' && isManager && (
                               <span className="text-xs text-gray-400 italic self-center">Awaiting submission by production</span>
                          )}

                          {/* Approve/Reject: manager only */}
                          {po.status === 'submitted' && isManager && (
                            <>
                              <button onClick={() => handleApprovePO(po.id)} className="text-xs font-bold px-3 py-1.5 rounded-sm text-white" style={{ backgroundColor: '#10B981' }}>Approve</button>
                              <button onClick={() => { setRejectingPO(po); setRejectReason('') }} className="text-xs font-bold px-3 py-1.5 rounded-sm text-white" style={{ backgroundColor: '#EF4444' }}>Reject</button>
                            </>
                          )}

                          {/* Receive: manager only */}
                          {(po.status === 'approved' || po.status === 'partially_received') && isManager && (
                            <button onClick={() => openReceiveModal(po)} className="text-xs font-bold px-3 py-1.5 rounded-sm text-white" style={{ backgroundColor: '#10B981' }}>Receive Items</button>
                          )}

                          {/* Production sees status label when waiting for manager */}
                          {po.status === 'submitted' && !isManager && (
                            <span className="text-xs text-gray-400 italic self-center">Awaiting manager approval</span>
                          )}
                          {(po.status === 'approved' || po.status === 'partially_received') && !isManager && (
                            <span className="text-xs text-blue-500 font-semibold self-center">✓ Approved — manager will receive</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-xs text-gray-500">Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40 text-white" style={{ backgroundColor: '#1a2340' }}>← Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPage(p)} className="px-3 py-1.5 rounded-sm text-xs font-bold"
                        style={page === p ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>{p}</button>
                    ))}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40 text-white" style={{ backgroundColor: '#1a2340' }}>Next →</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SUPPLIERS TAB (manager only) ── */}
          {activeTab === 'suppliers' && isManager && (
            <>
              {suppliers.length === 0 ? (
                <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                  <div className="text-5xl mb-3">🏭</div>
                  <p className="text-lg font-bold text-gray-600">No suppliers saved yet</p>
                  <button onClick={() => setShowNewSupplier(true)} className="mt-5 text-xs font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: '#1a2340' }}>+ Add First Supplier</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {suppliers.map(s => {
                    const poCount = orders.filter(o => o.supplier_id === s.id).length
                    return (
                      <div key={s.id} className="bg-white rounded-sm overflow-hidden flex flex-col" style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>
                        <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
                          <p className="text-white font-black text-sm truncate">{s.name}</p>
                          <span className="text-white text-xs opacity-50 shrink-0 ml-2">{poCount} PO{poCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="px-4 py-4 flex flex-col gap-2 flex-1 text-sm">
                          {s.contact_person && <div className="flex items-center gap-2 text-gray-600"><span className="text-gray-400 text-xs w-16 shrink-0">Contact</span><span className="font-semibold">{s.contact_person}</span></div>}
                          {s.phone && <div className="flex items-center gap-2 text-gray-600"><span className="text-gray-400 text-xs w-16 shrink-0">Phone</span><span>{s.phone}</span></div>}
                          {s.email && <div className="flex items-center gap-2 text-gray-600"><span className="text-gray-400 text-xs w-16 shrink-0">Email</span><span className="truncate">{s.email}</span></div>}
                          {s.address && <div className="flex items-center gap-2 text-gray-600"><span className="text-gray-400 text-xs w-16 shrink-0">Address</span><span className="text-xs">{s.address}</span></div>}
                          {s.notes && <p className="text-xs text-gray-400 italic border-l-2 border-gray-100 pl-2 mt-1">{s.notes}</p>}
                          {!s.contact_person && !s.phone && !s.email && !s.address && <p className="text-xs text-gray-300 italic">No contact info saved</p>}
                          <div className="flex-1" />
                          <div className="flex gap-2 pt-3 border-t border-gray-100 mt-2">
                            <button onClick={() => openEditSupplier(s)} className="text-xs font-bold px-3 py-1.5 rounded-sm" style={{ backgroundColor: '#1a2340', color: 'white' }}>Edit</button>
                            <button onClick={() => { setShowNewPO(true); setPOSupplierId(s.id); setActiveTab('orders') }} className="text-xs font-bold px-3 py-1.5 rounded-sm border border-gray-200 text-gray-600 hover:bg-gray-50">+ New PO</button>
                            <button onClick={() => handleArchiveSupplier(s)} className="text-xs font-bold px-3 py-1.5 rounded-sm text-white ml-auto" style={{ backgroundColor: '#9CA3AF' }}>Archive</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* NEW PO MODAL */}
      {showNewPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-2xl max-h-[92vh] flex flex-col" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4 shrink-0" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">New Purchase Order</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">Order ingredients from a supplier</p>
            </div>
            <form onSubmit={handleCreatePO} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Supplier (saved)</label>
                    <select value={poSupplierId} onChange={e => { setPOSupplierId(e.target.value); if (e.target.value) setPOSupplierName('') }} className={inputClass}>
                      <option value="">Select supplier...</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Or type supplier name</label>
                    <input type="text" value={poSupplierName} onChange={e => { setPOSupplierName(e.target.value); if (e.target.value) setPOSupplierId('') }}
                      placeholder="e.g., ABC Supplies" className={inputClass} disabled={!!poSupplierId} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Expected Delivery Date</label>
                    <input type="date" value={poDeliveryDate} onChange={e => setPODeliveryDate(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Notes (optional)</label>
                    <input type="text" value={poNotes} onChange={e => setPONotes(e.target.value)} placeholder="e.g., Urgent order" className={inputClass} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelClass}>Items *</label>
                    <span className="text-xs text-gray-400">{poItems.length} item{poItems.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-3">
                    {poItems.map((item, index) => {
                      const selectedIng = ingredients.find(i => i.id === item.ingredient_id)
                      const subtotal = parseFloat(item.quantity || '0') * parseFloat(item.unit_cost || '0')
                      return (
                        <div key={index} className="rounded-sm border border-gray-200 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-xs font-bold text-gray-500">Item {index + 1}</span>
                            <div className="flex items-center gap-3">
                              {!isNaN(subtotal) && subtotal > 0 && <span className="text-xs font-black text-gray-700">₱{subtotal.toFixed(2)}</span>}
                              {poItems.length > 1 && <button type="button" onClick={() => removePOItem(index)} className="text-xs text-red-400 font-bold hover:text-red-600">Remove</button>}
                            </div>
                          </div>
                          <div className="px-3 py-3 space-y-2">
                            <select value={item.ingredient_id} onChange={e => handleIngredientSelect(index, e.target.value)} required className={inputClass}>
                              <option value="">Select ingredient...</option>
                              {getAvailableIngredients(index).map(ing => (
                                <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit}) — Stock: {ing.current_stock}</option>
                              ))}
                            </select>
                            {selectedIng && (
                              <div className="flex gap-2 text-xs px-3 py-2 rounded-sm" style={{ backgroundColor: '#220901' }}>
                                <span className="text-white opacity-60">Unit:</span>
                                <span className="text-white font-bold">{selectedIng.unit}</span>
                                <span className="text-white opacity-60 ml-3">Current stock:</span>
                                <span className={`font-bold ${selectedIng.current_stock < selectedIng.minimum_threshold ? 'text-red-400' : 'text-white'}`}>
                                  {selectedIng.current_stock} / min {selectedIng.minimum_threshold}
                                </span>
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className={labelClass}>Qty *</label>
                                <input type="number" min="0.01" step="any" value={item.quantity} onChange={e => updatePOItem(index, 'quantity', e.target.value)} required placeholder="0" className={inputClass} />
                              </div>
                              <div>
                                <label className={labelClass}>Unit Cost (₱) *</label>
                                <input type="number" min="0" step="any" value={item.unit_cost} onChange={e => updatePOItem(index, 'unit_cost', e.target.value)} required placeholder="0.00" className={inputClass} />
                              </div>
                              <div>
                                <label className={labelClass}>Notes</label>
                                <input type="text" value={item.notes} onChange={e => updatePOItem(index, 'notes', e.target.value)} placeholder="Optional" className={inputClass} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {poItems.length < ingredients.length && (
                    <button type="button" onClick={addPOItem} className="mt-3 w-full py-2 rounded-sm border-2 border-dashed border-gray-300 text-xs font-bold text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
                      + Add Another Item
                    </button>
                  )}
                </div>
                {poItems.some(i => parseFloat(i.quantity) > 0 && parseFloat(i.unit_cost) >= 0) && (
                  <div className="rounded-sm px-4 py-3 bg-gray-50 border border-gray-100">
                    <div className="flex justify-between text-sm font-black text-gray-900">
                      <span>Order Total</span>
                      <span>₱{poItems.reduce((sum, i) => sum + (parseFloat(i.quantity || '0') * parseFloat(i.unit_cost || '0')), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#1a2340' }}>
                  {submitting ? 'Creating...' : 'Create Purchase Order'}
                </button>
                <button type="button" onClick={() => { setShowNewPO(false); resetNewPOForm() }} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PO MODAL */}
      {viewingPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-2xl max-h-[92vh] flex flex-col" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4 shrink-0 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
              <div>
                <h2 className="text-white font-black text-lg">{viewingPO.po_number}</h2>
                <p className="text-white text-xs opacity-50">{viewingPO.supplier_name_snapshot}</p>
              </div>
              <StatusBadge status={viewingPO.status} />
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs text-gray-400 font-bold">Created</p><p className="font-semibold">{new Date(viewingPO.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
                {viewingPO.expected_delivery_date && <div><p className="text-xs text-gray-400 font-bold">Expected Delivery</p><p className="font-semibold">{viewingPO.expected_delivery_date}</p></div>}
                {viewingPO.created_by_profile && <div><p className="text-xs text-gray-400 font-bold">Created By</p><p className="font-semibold">{viewingPO.created_by_profile.full_name}</p></div>}
                {viewingPO.approved_by_profile && <div><p className="text-xs text-gray-400 font-bold">Approved By</p><p className="font-semibold">{viewingPO.approved_by_profile.full_name}</p></div>}
                {viewingPO.received_by_profile && <div><p className="text-xs text-gray-400 font-bold">Received By</p><p className="font-semibold">{viewingPO.received_by_profile.full_name}</p></div>}
              </div>
              {viewingPO.notes && <p className="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">{viewingPO.notes}</p>}
              {viewingPO.rejection_reason && <p className="text-sm text-red-500 border-l-2 border-red-300 pl-3">Rejected: {viewingPO.rejection_reason}</p>}
              <div className="rounded-sm overflow-hidden border border-gray-100">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#220901' }}>
                      {['Ingredient', 'Unit', 'Ordered', 'Received', 'Unit Cost', 'Total'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-bold text-white opacity-80">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {viewingPO.items.map((item: PurchaseOrderItem) => (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800">{item.ingredient_name_snapshot}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.unit}</td>
                        <td className="px-4 py-3 text-sm font-black text-gray-900">{item.quantity_ordered}</td>
                        <td className="px-4 py-3 text-sm font-black text-green-600">{item.quantity_received}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">₱{Number(item.unit_cost).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-black text-gray-900">₱{Number(item.total_cost).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between font-black text-lg border-t border-gray-200 pt-3">
                <span>Total</span>
                <span>₱{Number(viewingPO.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => printPO(viewingPO)} className="px-5 py-2 rounded-sm font-bold text-white text-sm" style={{ backgroundColor: '#1a2340' }}>🖨 Print PO</button>
              <button onClick={() => setViewingPO(null)} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIVE ITEMS MODAL — manager only */}
      {receivingPO && isManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-lg max-h-[92vh] flex flex-col" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4 shrink-0" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">Receive Items</h2>
              <p className="text-white text-xs opacity-50">{receivingPO.po_number} — {receivingPO.supplier_name_snapshot}</p>
            </div>
            <form onSubmit={handleReceiveConfirm} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <p className="text-xs text-gray-500">Enter the actual quantity received for each item. Stock will be updated automatically.</p>
                {receivingPO.items.map((item: PurchaseOrderItem) => (
                  <div key={item.id} className="rounded-sm border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-black text-gray-800">{item.ingredient_name_snapshot}</p>
                      <span className="text-xs text-gray-400">{item.unit}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className={labelClass}>Qty Received (ordered: {item.quantity_ordered})</label>
                        <input type="number" min="0" max={item.quantity_ordered} step="any"
                          value={receiptQtys[item.id] || ''}
                          onChange={e => setReceiptQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className={inputClass} />
                      </div>
                      <div className="text-xs text-gray-400 text-right shrink-0">
                        <p>Subtotal</p>
                        <p className="font-black text-gray-700">₱{((parseFloat(receiptQtys[item.id] || '0') || 0) * Number(item.unit_cost)).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div>
                  <label className={labelClass}>Expense Category *</label>
                  <select value={receiptExpenseCat} onChange={e => setReceiptExpenseCat(e.target.value)} required className={inputClass}>
                    <option value="">Select category...</option>
                    {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">This will create an expense entry for the received amount.</p>
                </div>
                <div>
                  <label className={labelClass}>Payment Notes (optional)</label>
                  <textarea value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} rows={2} placeholder="e.g., Paid via bank transfer, receipt #123" className={inputClass} />
                </div>
                <div className="rounded-sm px-4 py-3 bg-gray-50 border border-gray-100">
                  <div className="flex justify-between text-sm font-black text-gray-900">
                    <span>Total to Expense</span>
                    <span>₱{receivingPO.items.reduce((sum: number, item: PurchaseOrderItem) => {
                      return sum + ((parseFloat(receiptQtys[item.id] || '0') || 0) * Number(item.unit_cost))
                    }, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
                  {submitting ? 'Receiving...' : 'Confirm Receipt'}
                </button>
                <button type="button" onClick={() => setReceivingPO(null)} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL — manager only */}
      {rejectingPO && isManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-sm" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black">Reject PO</h2>
              <p className="text-white text-xs opacity-50">{rejectingPO.po_number}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelClass}>Reason for Rejection *</label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
                  placeholder="e.g., Price too high, wrong supplier, budget constraint..." className={inputClass} autoFocus />
              </div>
              <div className="flex gap-3">
                <button onClick={handleRejectConfirm} className="flex-1 py-2 rounded-sm font-bold text-white text-sm" style={{ backgroundColor: '#EF4444' }}>Confirm Rejection</button>
                <button onClick={() => { setRejectingPO(null); setRejectReason('') }} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW SUPPLIER MODAL — manager only */}
      {showNewSupplier && isManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-md" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">Add Supplier</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">Save supplier info for future POs</p>
            </div>
            <form onSubmit={handleCreateSupplier} className="px-6 py-5 space-y-3">
              <div><label className={labelClass}>Supplier Name *</label><input type="text" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} required className={inputClass} placeholder="e.g., ABC Flour Supply" /></div>
              <div><label className={labelClass}>Contact Person</label><input type="text" value={newSupplierContact} onChange={e => setNewSupplierContact(e.target.value)} className={inputClass} placeholder="e.g., Juan dela Cruz" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Phone</label><input type="text" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} className={inputClass} placeholder="09xx-xxx-xxxx" /></div>
                <div><label className={labelClass}>Email</label><input type="email" value={newSupplierEmail} onChange={e => setNewSupplierEmail(e.target.value)} className={inputClass} placeholder="supplier@email.com" /></div>
              </div>
              <div><label className={labelClass}>Address</label><input type="text" value={newSupplierAddress} onChange={e => setNewSupplierAddress(e.target.value)} className={inputClass} placeholder="e.g., 123 Market St, Manila" /></div>
              <div><label className={labelClass}>Notes</label><textarea value={newSupplierNotes} onChange={e => setNewSupplierNotes(e.target.value)} rows={2} className={inputClass} placeholder="e.g., MOQ: 50kg, payment terms" /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#1a2340' }}>
                  {submitting ? 'Saving...' : 'Save Supplier'}
                </button>
                <button type="button" onClick={() => setShowNewSupplier(false)} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SUPPLIER MODAL — manager only */}
      {editingSupplier && isManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-md" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">Edit Supplier</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">{editingSupplier.name}</p>
            </div>
            <form onSubmit={handleUpdateSupplier} className="px-6 py-5 space-y-3">
              <div><label className={labelClass}>Supplier Name *</label><input type="text" value={editSupplierName} onChange={e => setEditSupplierName(e.target.value)} required className={inputClass} /></div>
              <div><label className={labelClass}>Contact Person</label><input type="text" value={editSupplierContact} onChange={e => setEditSupplierContact(e.target.value)} className={inputClass} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Phone</label><input type="text" value={editSupplierPhone} onChange={e => setEditSupplierPhone(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Email</label><input type="email" value={editSupplierEmail} onChange={e => setEditSupplierEmail(e.target.value)} className={inputClass} /></div>
              </div>
              <div><label className={labelClass}>Address</label><input type="text" value={editSupplierAddress} onChange={e => setEditSupplierAddress(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Notes</label><textarea value={editSupplierNotes} onChange={e => setEditSupplierNotes(e.target.value)} rows={2} className={inputClass} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#1a2340' }}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditingSupplier(null)} className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
