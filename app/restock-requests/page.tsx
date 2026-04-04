'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getAllRestockRequests,
  autoGenerateLowStockRequests,
  fulfillRequest,
  declineRequest,
  createRestockRequest,
  type RestockRequestWithDetails,
  type NewRestockItem,
} from '@/lib/restock-requests'
import { getAllProducts, getAllCategories } from '@/lib/products'
import type { Product, Category } from '@/lib/supabase'
import FulfillRequestModal from '@/components/FulfillRequestModal'
import ManagerSidebar from '@/components/ManagerSidebar'

const PAGE_SIZE = 9

// Convert a datetime-local string (treated as Asia/Manila) to UTC ISO string
function manilaLocalToUTC(localStr: string): string {
  if (!localStr) return localStr
  const [datePart, timePart = '00:00'] = localStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  // PHT = UTC+8, so subtract 8 hours
  const utc = new Date(Date.UTC(year, month - 1, day, hour - 8, minute))
  return utc.toISOString()
}

// Format a UTC ISO string from Supabase to PHT for display
function formatPHT(isoStr: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(isoStr).toLocaleString('en-PH', { ...opts, timeZone: 'Asia/Manila' })
}

export default function RestockRequestsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'manager' | 'cashier' | 'production'>('cashier')
  const [requests, setRequests] = useState<RestockRequestWithDetails[]>([])
  const [filteredRequests, setFilteredRequests] = useState<RestockRequestWithDetails[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('restockStatusFilter') || 'pending'
    return 'pending'
  })
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showFulfillModal, setShowFulfillModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<RestockRequestWithDetails | null>(null)

  const [showNewRequestModal, setShowNewRequestModal] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [newItems, setNewItems] = useState<{ product_id: string; requested_quantity: string; notes: string }[]>([
    { product_id: '', requested_quantity: '', notes: '' }
  ])
  const [newOrderNotes, setNewOrderNotes] = useState('')
  const [newDeliveryDate, setNewDeliveryDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { filterRequests() }, [requests, statusFilter, typeFilter, dateFilter, dateFrom, dateTo, search, categoryFilter])
  useEffect(() => { setPage(1) }, [statusFilter, typeFilter, dateFilter, dateFrom, dateTo, search, categoryFilter])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile) { router.push('/login'); return }
    setUserId(user.id)
    setUserRole(profile.role)
    await Promise.all([loadRequests(), loadCategories()])
    setLoading(false)
  }

  async function loadRequests() {
    try {
      const data = await getAllRestockRequests()
      setRequests(data)
    } catch (err) {
      console.error('loadRequests error:', err)
      setError('Failed to load restock requests')
    }
  }

  async function loadCategories() {
    try {
      const data = await getAllCategories()
      setCategories(data.filter((c: Category) => !(c as any).is_archived))
    } catch { }
  }

  async function loadProducts() {
    try {
      const data = await getAllProducts()
      setProducts(data.filter(p => !p.is_archived))
    } catch { setError('Failed to load products') }
  }

  function filterRequests() {
    let result = requests
    if (statusFilter === 'pending') result = result.filter(r => r.status === 'requested')
    else if (statusFilter !== 'all') result = result.filter(r => r.status === statusFilter)
    if (typeFilter !== 'all') result = result.filter(r => (r as any).request_type === typeFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(r => (r.items || []).some((item: any) => item.products?.name?.toLowerCase().includes(q)))
    }
    if (categoryFilter !== 'all') {
      result = result.filter(r => (r.items || []).some((item: any) => item.products?.categories?.id === categoryFilter))
    }
    const now = new Date()
    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      result = result.filter(r => new Date(r.created_at) >= start)
    } else if (dateFilter === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 7)
      result = result.filter(r => new Date(r.created_at) >= start)
    } else if (dateFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      result = result.filter(r => new Date(r.created_at) >= start)
    } else if (dateFilter === 'custom' && dateFrom) {
      const start = new Date(dateFrom)
      result = result.filter(r => new Date(r.created_at) >= start)
      if (dateTo) {
        const end = new Date(dateTo); end.setHours(23, 59, 59, 999)
        result = result.filter(r => new Date(r.created_at) <= end)
      }
    }
    setFilteredRequests(result)
  }

  function handleSetStatusFilter(key: string) {
    sessionStorage.setItem('restockStatusFilter', key)
    setStatusFilter(key)
  }

  async function handleAutoGenerate() {
    setGenerating(true); setError(''); setSuccess('')
    try {
      const newRequests = await autoGenerateLowStockRequests(userId)
      setSuccess(newRequests.length === 0
        ? 'No new requests needed — all low stock items already have pending requests'
        : `Generated restock request with ${newRequests.length > 0 ? 'low stock items' : '0 items'}`)
      await loadRequests()
    } catch (err: any) { setError(err.message || 'Failed to generate requests') }
    finally { setGenerating(false); setTimeout(() => { setSuccess(''); setError('') }, 5000) }
  }

  function handleFulfillClick(requestId: string) {
    const request = requests.find(r => r.id === requestId)
    if (request) { setSelectedRequest(request); setShowFulfillModal(true) }
  }

  async function handleFulfillConfirm(quantity: number, notes: string, itemFulfillments: { item_id: string; quantity: number }[]) {
    if (!selectedRequest) return
    setError(''); setSuccess('')
    try {
      await fulfillRequest(selectedRequest.id, quantity, userId, notes, itemFulfillments)
      setSuccess('Request fulfilled successfully')
      setShowFulfillModal(false); setSelectedRequest(null)
      await loadRequests()
    } catch (err: any) {
      setError(err.message || 'Failed to fulfill request')
    } finally { setTimeout(() => { setSuccess(''); setError('') }, 3000) }
  }

  async function handleDecline(requestId: string) {
    const reason = prompt('Enter reason for declining:')
    if (!reason) return
    setError(''); setSuccess('')
    try { await declineRequest(requestId, userId, reason); setSuccess('Request declined'); await loadRequests() }
    catch (err: any) { setError(err.message || 'Failed to decline request') }
    finally { setTimeout(() => { setSuccess(''); setError('') }, 3000) }
  }

  async function openNewRequestModal() {
    await loadProducts()
    setNewItems([{ product_id: '', requested_quantity: '', notes: '' }])
    setNewOrderNotes('')
    setNewDeliveryDate('')
    setShowNewRequestModal(true)
  }

  function addItem() { setNewItems(prev => [...prev, { product_id: '', requested_quantity: '', notes: '' }]) }
  function removeItem(index: number) { setNewItems(prev => prev.filter((_, i) => i !== index)) }
  function updateItem(index: number, field: string, value: string) {
    setNewItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function getAvailableProducts(currentIndex: number) {
    const selectedIds = newItems.filter((_, i) => i !== currentIndex).map(item => item.product_id).filter(Boolean)
    return products.filter(p => !selectedIds.includes(p.id))
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault()
    const validItems = newItems.filter(i => i.product_id && parseInt(i.requested_quantity) > 0)
    if (validItems.length === 0) { setError('Please add at least one product with a valid quantity'); return }
    const items: NewRestockItem[] = validItems.map(i => ({
      product_id: i.product_id,
      requested_quantity: parseInt(i.requested_quantity),
      notes: i.notes || undefined,
    }))
    setSubmitting(true); setError('')
    try {
      // Convert the Manila local datetime to UTC before saving
      const deliveryDateUTC = newDeliveryDate ? manilaLocalToUTC(newDeliveryDate) : undefined
      await createRestockRequest(items, 'manual_order', userId, newOrderNotes || undefined, deliveryDateUTC)
      setSuccess(`Restock request created with ${items.length} product${items.length !== 1 ? 's' : ''}`)
      setShowNewRequestModal(false)
      await loadRequests()
    } catch (err: any) {
      setError(err.message || 'Failed to create request')
    } finally { setSubmitting(false); setTimeout(() => { setSuccess(''); setError('') }, 3000) }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }
  const pendingCount = requests.filter(r => r.status === 'requested').length
  const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE)
  const paginatedRequests = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // deliveryDate is a UTC ISO string from Supabase, or a datetime-local string from the input
  function getDeliveryDateInfo(deliveryDate: string | null | undefined) {
    if (!deliveryDate) return null

    // Parse the date correctly: if it's a UTC ISO string (from DB), parse directly.
    // If it's a datetime-local string (from input, no Z/offset), treat as Manila time.
    let due: Date
    if (deliveryDate.endsWith('Z') || deliveryDate.includes('+')) {
      due = new Date(deliveryDate)
    } else {
      // datetime-local from input — treat as Manila local time
      const [datePart, timePart = '00:00'] = deliveryDate.split('T')
      const [year, month, day] = datePart.split('-').map(Number)
      const [hour, minute] = timePart.split(':').map(Number)
      due = new Date(Date.UTC(year, month - 1, day, hour - 8, minute))
    }

    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = diffMs / (1000 * 60 * 60)

    const timeStr = due.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
    const dateStr = due.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

    if (diffMs < 0)      return { label: `Overdue — ${dateStr} ${timeStr}`,            color: '#EF4444', bg: '#FEE2E2' }
    if (diffHours <= 3)  return { label: `Needed Soon — by ${timeStr}`,                color: '#DC2626', bg: '#FEE2E2' }
    if (diffHours <= 24) return { label: `Needed Today — by ${timeStr}`,               color: '#DC2626', bg: '#FEE2E2' }
    if (diffDays <= 1)   return { label: `Needed Tomorrow — by ${timeStr}`,            color: '#D97706', bg: '#FEF3C7' }
    if (diffDays <= 3)   return { label: `Needed in ${diffDays}d — by ${timeStr}`,     color: '#D97706', bg: '#FEF3C7' }
    return               { label: `Needed by ${dateStr} ${timeStr}`,                   color: '#6B7280', bg: '#F3F4F6' }
  }

  const cashierNavLinks = [
    { href: '/pos', label: 'POS' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/restock-requests', label: 'Restock', active: true },
  ]
  const productionNavLinks = [
    { href: '/production', label: 'Dashboard' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/restock-requests', label: 'Restock', active: true },
    { href: '/ingredients', label: 'Ingredients' },
    { href: '/purchase-orders', label: 'Purchase Orders' },
  ]
  const statusTabs = [
    { key: 'all', label: 'All', count: requests.length },
    { key: 'pending', label: 'Pending', count: requests.filter(r => r.status === 'requested').length },
    { key: 'fulfilled', label: 'Fulfilled', count: requests.filter(r => r.status === 'fulfilled').length },
    { key: 'partially_fulfilled', label: 'Partial', count: requests.filter(r => r.status === 'partially_fulfilled').length },
    { key: 'declined', label: 'Declined', count: requests.filter(r => r.status === 'declined').length },
  ]
  const dateTabs = [
    { key: 'all', label: 'All Time' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ]

  function getStatusBadge(status: string) {
    const map: Record<string, { label: string; bg: string }> = {
      requested:           { label: 'Pending',  bg: '#F5A623' },
      fulfilled:           { label: 'Fulfilled', bg: '#10B981' },
      partially_fulfilled: { label: 'Partial',   bg: '#6B7280' },
      declined:            { label: 'Declined',  bg: '#EF4444' },
    }
    const s = map[status] || { label: status, bg: '#6B7280' }
    return <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: s.bg }}>{s.label}</span>
  }

  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
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

  const cards = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {paginatedRequests.map((request) => {
        const items = request.items || []
        const totalRequested = items.reduce((sum: number, i: any) => sum + (i.requested_quantity || 0), 0)
        const totalFulfilled = items.reduce((sum: number, i: any) => sum + (i.fulfilled_quantity || 0), 0)
        const deliveryInfo = getDeliveryDateInfo((request as any).delivery_date)

        return (
          <div key={request.id} className="bg-white rounded-sm overflow-hidden flex flex-col"
            style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>

            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
              <div className="truncate pr-2">
                <span className="text-white font-black text-sm">
                  {items.length === 1 ? (items[0] as any).products?.name || 'Unknown Product' : `${items.length} Products`}
                </span>
                <span className="text-white text-xs opacity-50 ml-2">
                  {items.length === 1 ? (items[0] as any).products?.categories?.name || '' : `${totalRequested} units total`}
                </span>
              </div>
              {getStatusBadge(request.status)}
            </div>

            <div className="px-4 py-4 flex flex-col gap-3 flex-1">
              {deliveryInfo && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-sm" style={{ backgroundColor: deliveryInfo.bg }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: deliveryInfo.color }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs font-black" style={{ color: deliveryInfo.color }}>{deliveryInfo.label}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium">Request Type</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(request as any).request_type === 'manual_order' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {(request as any).request_type === 'manual_order' ? 'Manual' : 'Auto'}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="rounded-sm px-3 py-2 bg-gray-50 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-xs font-black text-gray-800">{item.products?.name || 'Unknown'}</span>
                        {item.products?.categories?.name && (
                          <span className="text-xs text-gray-400 ml-2">{item.products.categories.name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div>
                        <p className="text-xs text-gray-400">Requested</p>
                        <p className="text-lg font-black text-gray-900">{item.requested_quantity}</p>
                      </div>
                      {item.fulfilled_quantity != null && item.fulfilled_quantity > 0 && (
                        <div>
                          <p className="text-xs text-gray-400">Fulfilled</p>
                          <p className="text-lg font-black text-green-600">{item.fulfilled_quantity}</p>
                        </div>
                      )}
                    </div>
                    {item.notes && <p className="text-xs text-gray-400 italic mt-1">{item.notes}</p>}
                  </div>
                ))}
              </div>

              {items.length > 1 && (
                <div className="flex gap-3 pt-1 border-t border-gray-100">
                  <div className="flex-1 rounded-sm px-3 py-2 bg-gray-100">
                    <p className="text-xs text-gray-500 mb-0.5">Total Requested</p>
                    <p className="text-xl font-black text-gray-900">{totalRequested}</p>
                  </div>
                  {totalFulfilled > 0 && (
                    <div className="flex-1 rounded-sm px-3 py-2 bg-green-50">
                      <p className="text-xs text-gray-500 mb-0.5">Total Fulfilled</p>
                      <p className="text-xl font-black text-green-600">{totalFulfilled}</p>
                    </div>
                  )}
                </div>
              )}

              {(request as any).notes && (
                <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2 leading-relaxed">{(request as any).notes}</p>
              )}

              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-gray-400">
                  {formatPHT(request.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {request.requested_by_profile?.full_name && (
                  <p className="text-xs text-gray-500">By: <span className="font-semibold">{request.requested_by_profile.full_name}</span></p>
                )}
              </div>

              <div className="flex-1" />

              {userRole === 'production' && ['requested', 'acknowledged'].includes(request.status) && (
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => handleFulfillClick(request.id)}
                    className="flex-1 text-xs font-bold py-2 rounded-sm text-white" style={{ backgroundColor: '#10B981' }}>
                    Fulfill
                  </button>
                  <button onClick={() => handleDecline(request.id)}
                    className="text-xs font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: '#EF4444' }}>
                    Decline
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-between mt-6">
      <p className="text-xs text-gray-500 font-medium">
        Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} requests
      </p>
      <div className="flex gap-2">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40"
          style={{ backgroundColor: '#1a2340', color: 'white' }}>← Prev</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => setPage(p)}
            className="px-3 py-1.5 rounded-sm text-xs font-bold"
            style={page === p ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
            {p}
          </button>
        ))}
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40"
          style={{ backgroundColor: '#1a2340', color: 'white' }}>Next →</button>
      </div>
    </div>
  )

  const mainContent = (
    <div className="relative z-10 flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900">Restock Requests</h1>
          <p className="text-gray-700 font-medium mt-1">{pendingCount} pending request{pendingCount !== 1 ? 's' : ''}</p>
        </div>
        {(userRole === 'cashier' || userRole === 'manager') && (
          <div className="flex gap-3">
            <button onClick={handleAutoGenerate} disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
              style={{ backgroundColor: '#1a2340' }}>
              <img src="/icons/Bar_chart.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
              {generating ? 'Generating...' : 'Auto-Generate'}
            </button>
            <button onClick={openNewRequestModal}
              className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-gray-900 text-sm"
              style={{ backgroundColor: 'white', boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}>
              <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" />
              New Request
            </button>
          </div>
        )}
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex flex-wrap gap-2">
          {statusTabs.map(tab => (
            <button key={tab.key} onClick={() => handleSetStatusFilter(tab.key)}
              className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
              style={statusFilter === tab.key ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product..."
            className="text-xs px-3 py-1.5 rounded-sm border border-gray-200 bg-white focus:outline-none focus:border-gray-400 text-gray-900 placeholder-gray-400"
            style={{ minWidth: '150px', boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }} />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-sm border border-gray-200 bg-white focus:outline-none focus:border-gray-400 text-gray-900"
            style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {['all', 'auto_alert', 'manual_order'].map(type => (
            <button key={type} onClick={() => setTypeFilter(type)}
              className="px-3 py-1.5 rounded-sm text-xs font-bold transition-colors"
              style={typeFilter === type ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
              {type === 'all' ? 'All Types' : type === 'auto_alert' ? 'Auto' : 'Manual'}
            </button>
          ))}
          {dateTabs.map(tab => (
            <button key={tab.key} onClick={() => setDateFilter(tab.key)}
              className="px-3 py-1.5 rounded-sm text-xs font-bold transition-colors"
              style={dateFilter === tab.key ? { backgroundColor: '#7B1111', color: 'white' } : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {dateFilter === 'custom' && (
        <div className="flex gap-3 mb-5 items-end justify-end">
          <div>
            <label className={labelClass}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-gray-400 text-gray-900" />
          </div>
          <div>
            <label className={labelClass}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-gray-400 text-gray-900" />
          </div>
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 rounded-sm text-xs font-bold text-gray-500 hover:bg-gray-100">Clear</button>
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
          <div className="text-5xl mb-3">📦</div>
          <p className="text-lg font-bold text-gray-600">No restock requests found</p>
          {(userRole === 'cashier' || userRole === 'manager') && (
            <p className="text-sm text-gray-400 mt-1">Create a manual request or auto-generate for low stock items</p>
          )}
        </div>
      ) : (<>{cards}{pagination}</>)}
    </div>
  )

  const newRequestModal = showNewRequestModal ? (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
        <div className="px-6 py-4 shrink-0" style={{ backgroundColor: '#220901' }}>
          <h2 className="text-white font-black text-lg">New Restock Request</h2>
          <p className="text-white text-xs opacity-50 mt-0.5">Add multiple products to a single order</p>
        </div>

        <form onSubmit={handleCreateRequest} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass}>Products *</label>
                <span className="text-xs text-gray-400">{newItems.length} item{newItems.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-3">
                {newItems.map((item, index) => {
                  const selectedProduct = products.find(p => p.id === item.product_id)
                  const availableProducts = getAvailableProducts(index)
                  return (
                    <div key={index} className="rounded-sm border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-500">Item {index + 1}</span>
                        {newItems.length > 1 && (
                          <button type="button" onClick={() => removeItem(index)} className="text-xs text-red-400 font-bold hover:text-red-600">Remove</button>
                        )}
                      </div>
                      <div className="px-3 py-3 space-y-2">
                        <select value={item.product_id} onChange={e => updateItem(index, 'product_id', e.target.value)} required className={inputClass}>
                          <option value="">Select a product...</option>
                          {availableProducts.map(p => (
                            <option key={p.id} value={p.id}>{p.name} — Shop: {p.shop_current_stock} | Prod: {p.production_current_stock}</option>
                          ))}
                        </select>
                        {selectedProduct && (
                          <div className="rounded-sm px-3 py-2 flex gap-4" style={{ backgroundColor: '#220901' }}>
                            <div>
                              <p className="text-white text-xs opacity-50">Shop Stock</p>
                              <p className={`font-black text-base ${selectedProduct.shop_current_stock < selectedProduct.shop_minimum_threshold ? 'text-red-400' : 'text-white'}`}>
                                {selectedProduct.shop_current_stock}
                                <span className="text-xs opacity-50 ml-1">/ min {selectedProduct.shop_minimum_threshold}</span>
                              </p>
                            </div>
                            <div>
                              <p className="text-white text-xs opacity-50">Production Stock</p>
                              <p className="text-white font-black text-base">
                                {selectedProduct.production_current_stock}
                                <span className="text-xs opacity-50 ml-1">/ min {selectedProduct.production_minimum_threshold}</span>
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className={labelClass}>Quantity *</label>
                            <input type="number" min="1" value={item.requested_quantity}
                              onChange={e => updateItem(index, 'requested_quantity', e.target.value)}
                              required placeholder="e.g., 50" className={inputClass} />
                          </div>
                          <div className="flex-1">
                            <label className={labelClass}>Item Notes (optional)</label>
                            <input type="text" value={item.notes}
                              onChange={e => updateItem(index, 'notes', e.target.value)}
                              placeholder="e.g., Urgent" className={inputClass} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {newItems.length < products.length && (
                <button type="button" onClick={addItem}
                  className="mt-3 w-full py-2 rounded-sm border-2 border-dashed border-gray-300 text-xs font-bold text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
                  + Add Another Product
                </button>
              )}
            </div>

            {/* Needed By + Order Notes */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>
                  Needed By <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={newDeliveryDate}
                  onChange={e => setNewDeliveryDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className={inputClass}
                />
                {newDeliveryDate && (() => {
                  const info = getDeliveryDateInfo(newDeliveryDate)
                  return info ? (
                    <p className="text-xs mt-1 font-semibold" style={{ color: info.color }}>{info.label}</p>
                  ) : null
                })()}
              </div>
              <div className="flex-1">
                <label className={labelClass}>Order Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea value={newOrderNotes} onChange={e => setNewOrderNotes(e.target.value)} rows={2}
                  placeholder="e.g., Needed before weekend, special event, etc."
                  className={inputClass} />
              </div>
            </div>

            {newItems.some(i => i.product_id && parseInt(i.requested_quantity) > 0) && (
              <div className="rounded-sm px-4 py-3 bg-gray-50 border border-gray-100">
                <p className="text-xs font-bold text-gray-500 mb-2">Order Summary</p>
                {newItems.filter(i => i.product_id && parseInt(i.requested_quantity) > 0).map((item, idx) => {
                  const p = products.find(pr => pr.id === item.product_id)
                  return p ? (
                    <div key={idx} className="flex justify-between text-xs text-gray-700 mb-1">
                      <span>{p.name}</span><span className="font-bold">{item.requested_quantity} units</span>
                    </div>
                  ) : null
                })}
                {newDeliveryDate && (
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Needed By</span>
                    <span className="font-bold">{getDeliveryDateInfo(newDeliveryDate)?.label ?? ''}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-xs font-black text-gray-900">
                  <span>Total Units</span>
                  <span>{newItems.filter(i => parseInt(i.requested_quantity) > 0).reduce((sum, i) => sum + (parseInt(i.requested_quantity) || 0), 0)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            <button type="submit" disabled={submitting}
              className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
              style={{ backgroundColor: '#1a2340' }}>
              {submitting ? 'Creating...' : `Create Request (${newItems.filter(i => i.product_id && parseInt(i.requested_quantity) > 0).length} product${newItems.filter(i => i.product_id).length !== 1 ? 's' : ''})`}
            </button>
            <button type="button" onClick={() => setShowNewRequestModal(false)}
              className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null

  const fulfillModal = showFulfillModal && selectedRequest ? (
    <FulfillRequestModal
      request={selectedRequest}
      onConfirm={handleFulfillConfirm}
      onClose={() => { setShowFulfillModal(false); setSelectedRequest(null) }}
    />
  ) : null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  if (userRole === 'cashier') {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
        <div className="relative z-10 w-full flex items-center gap-6 px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
          <Branding />
          <div className="flex gap-2">
            {cashierNavLinks.map(link => (
              <a key={link.label} href={link.href} className="px-4 py-1.5 rounded-sm text-xs font-bold no-underline transition-colors"
                style={link.active ? { backgroundColor: '#F5A623', color: '#7B1111' } : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="ml-auto"><LogoutButton /></div>
        </div>
        <div className="flex flex-1 relative"><Watermark />{mainContent}</div>
        {newRequestModal}
      </div>
    )
  }

  if (userRole === 'production') {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
        <div className="relative z-10 w-full flex items-center gap-6 px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
          <Branding />
          <div className="flex gap-2">
            {productionNavLinks.map(link => (
              <a key={link.label} href={link.href} className="px-4 py-1.5 rounded-sm text-xs font-bold no-underline transition-colors"
                style={link.active ? { backgroundColor: '#F5A623', color: '#7B1111' } : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="ml-auto"><LogoutButton /></div>
        </div>
        <div className="flex flex-1 relative"><Watermark />{mainContent}</div>
        {fulfillModal}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>
      <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <Branding /><LogoutButton />
      </div>
      <div className="flex flex-1 relative overflow-hidden">
        <Watermark /><ManagerSidebar />{mainContent}
      </div>
      {newRequestModal}
      {fulfillModal}
    </div>
  )
}
