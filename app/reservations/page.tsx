'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import {
  getAllReservations,
  markReservationReady,
  cancelReservation,
  completeReservationPickup,
  type ReservationWithDetails,
} from '@/lib/reservations'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import ManagerSidebar from '@/components/ManagerSidebar'

const PAGE_SIZE = 9

function formatPHT(isoStr: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(isoStr).toLocaleString('en-PH', { ...opts, timeZone: 'Asia/Manila' })
}

function peso(n: number) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ReservationsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<'manager' | 'cashier' | 'production'>('cashier')
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [filtered, setFiltered] = useState<ReservationWithDetails[]>([])

  const [statusFilter, setStatusFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Complete pickup modal
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completingReservation, setCompletingReservation] = useState<ReservationWithDetails | null>(null)
  const [pickupPaymentMethod, setPickupPaymentMethod] = useState<'cash' | 'online'>('cash')
  const [completing, setCompleting] = useState(false)

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { applyFilters() }, [reservations, statusFilter, search])
  useEffect(() => { setPage(1) }, [statusFilter, search])
  useRealtimeRefresh(['reservations', 'reservation_items'], loadReservations)

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile) { router.push('/login'); return }
    setUserId(user.id)
    setUserRole(profile.role)
    await loadReservations()
    setLoading(false)
  }

  async function loadReservations() {
    try {
      const data = await getAllReservations()
      setReservations(data)
    } catch {
      setError('Failed to load reservations')
    }
  }

  function applyFilters() {
    let result = reservations
    if (statusFilter !== 'all') result = result.filter(r => r.status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(r =>
        r.customer_name.toLowerCase().includes(q) ||
        (r.items || []).some(i => i.product_name_snapshot.toLowerCase().includes(q))
      )
    }
    setFiltered(result)
  }

  async function handleMarkReady(id: string) {
    setError(''); setSuccess('')
    try {
      await markReservationReady(id)
      setSuccess('Marked as ready for pickup')
      await loadReservations()
    } catch (err: any) { setError(err.message || 'Failed to update') }
    finally { setTimeout(() => { setSuccess(''); setError('') }, 3000) }
  }

  function openCompleteModal(reservation: ReservationWithDetails) {
    setCompletingReservation(reservation)
    setPickupPaymentMethod('cash')
    setShowCompleteModal(true)
  }

  async function handleCompleteConfirm() {
    if (!completingReservation) return
    setCompleting(true); setError('')
    try {
      await completeReservationPickup(completingReservation.id, pickupPaymentMethod, userId)
      setSuccess('Pickup completed — sale recorded')
      setShowCompleteModal(false)
      setCompletingReservation(null)
      await loadReservations()
    } catch (err: any) {
      setError(err.message || 'Failed to complete pickup')
    } finally {
      setCompleting(false)
      setTimeout(() => { setSuccess(''); setError('') }, 4000)
    }
  }

  function openCancelModal(id: string) {
    setCancellingId(id)
    setCancelReason('')
    setShowCancelModal(true)
  }

  async function handleCancelConfirm() {
    if (!cancellingId || !cancelReason.trim()) { setError('Please provide a reason'); return }
    try {
      await cancelReservation(cancellingId, cancelReason.trim())
      setSuccess('Reservation cancelled')
      setShowCancelModal(false)
      setCancellingId(null)
      await loadReservations()
    } catch (err: any) { setError(err.message || 'Failed to cancel') }
    finally { setTimeout(() => { setSuccess(''); setError('') }, 3000) }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusTabs = [
    { key: 'pending', label: 'Pending', count: reservations.filter(r => r.status === 'pending').length },
    { key: 'ready', label: 'Ready', count: reservations.filter(r => r.status === 'ready').length },
    { key: 'completed', label: 'Completed', count: reservations.filter(r => r.status === 'completed').length },
    { key: 'cancelled', label: 'Cancelled', count: reservations.filter(r => r.status === 'cancelled').length },
    { key: 'all', label: 'All', count: reservations.length },
  ]

  function getStatusBadge(status: string) {
    const map: Record<string, { label: string; bg: string }> = {
      pending:   { label: 'Pending',   bg: '#F5A623' },
      ready:     { label: 'Ready',     bg: '#3B82F6' },
      completed: { label: 'Completed', bg: '#10B981' },
      cancelled: { label: 'Cancelled', bg: '#EF4444' },
    }
    const s = map[status] || { label: status, bg: '#6B7280' }
    return <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: s.bg }}>{s.label}</span>
  }

  const cashierNavLinks = [
    { href: '/pos', label: 'POS' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/restock-requests', label: 'Restock' },
    { href: '/reservations', label: 'Reservations', active: true },
  ]
  const productionNavLinks = [
    { href: '/production', label: 'Dashboard' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/restock-requests', label: 'Restock' },
    { href: '/ingredients', label: 'Ingredients' },
    { href: '/purchase-orders', label: 'Purchase Orders' },
    { href: '/reservations', label: 'Reservations', active: true },
  ]

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
      {paginated.map((r) => (
        <div key={r.id} className="bg-white rounded-sm overflow-hidden flex flex-col"
          style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>

          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
            <div className="truncate pr-2">
              <span className="text-white font-black text-sm">{r.customer_name}</span>
              {r.customer_phone && <span className="text-white text-xs opacity-50 ml-2">{r.customer_phone}</span>}
            </div>
            {getStatusBadge(r.status)}
          </div>

          <div className="px-4 py-4 flex flex-col gap-3 flex-1">
            {r.needed_by && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-orange-50">
                <span className="text-xs font-black text-orange-600">
                  Needed by {formatPHT(r.needed_by, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {(r.items || []).map(item => (
                <div key={item.id} className="rounded-sm px-3 py-2 bg-gray-50 border border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black text-gray-800">{item.product_name_snapshot}</span>
                  <span className="text-xs text-gray-500">{item.quantity} × {peso(item.unit_price_snapshot)}</span>
                </div>
              ))}
            </div>

            <div className="rounded-sm px-3 py-3 bg-gray-100 flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Total Order Value</span>
                <span className="font-black text-gray-900">{peso(r.total_amount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Fee Paid (50%)</span>
                <span className="font-bold text-green-600">{peso(r.fee_amount)}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-gray-200 pt-1 mt-1">
                <span className="text-gray-500 font-bold">Balance Due at Pickup</span>
                <span className="font-black" style={{ color: '#7B1111' }}>{peso(r.balance_amount)}</span>
              </div>
            </div>

            {r.notes && <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">{r.notes}</p>}
            {r.status === 'cancelled' && r.cancellation_reason && (
              <p className="text-xs text-red-500 italic border-l-2 border-red-200 pl-2">Cancelled: {r.cancellation_reason}</p>
            )}

            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-gray-400">
                Booked {formatPHT(r.created_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {r.created_by_profile?.full_name && (
                <p className="text-xs text-gray-500">By: <span className="font-semibold">{r.created_by_profile.full_name}</span></p>
              )}
              {r.status === 'completed' && r.completed_by_profile?.full_name && (
                <p className="text-xs text-green-600">Completed by: <span className="font-semibold">{r.completed_by_profile.full_name}</span></p>
              )}
            </div>

            <div className="flex-1" />

            {r.status === 'pending' && userRole === 'production' && (
              <button onClick={() => handleMarkReady(r.id)}
                className="w-full text-xs font-bold py-2 rounded-sm text-white" style={{ backgroundColor: '#3B82F6' }}>
                Mark Ready for Pickup
              </button>
            )}

            {(r.status === 'pending' || r.status === 'ready') && (userRole === 'cashier' || userRole === 'manager') && (
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button onClick={() => openCompleteModal(r)}
                  className="flex-1 text-xs font-bold py-2 rounded-sm text-white" style={{ backgroundColor: '#10B981' }}>
                  Complete Pickup
                </button>
                <button onClick={() => openCancelModal(r.id)}
                  className="text-xs font-bold px-4 py-2 rounded-sm text-white" style={{ backgroundColor: '#EF4444' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-between mt-6">
      <p className="text-xs text-gray-500 font-medium">
        Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} reservations
      </p>
      <div className="flex gap-2">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40"
          style={{ backgroundColor: '#1a2340', color: 'white' }}>← Prev</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => setPage(p)}
            className="px-3 py-1.5 rounded-sm text-xs font-bold"
            style={page === p ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
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
          <h1 className="text-4xl font-black text-gray-900">Reservations</h1>
          <p className="text-gray-700 font-medium mt-1">Advance orders with deposit</p>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex flex-wrap gap-2">
          {statusTabs.map(tab => (
            <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
              className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
              style={statusFilter === tab.key ? { backgroundColor: '#1a2340', color: 'white' } : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer or product..."
          className="text-xs px-3 py-1.5 rounded-sm border border-gray-200 bg-white focus:outline-none focus:border-gray-400 text-gray-900 placeholder-gray-400"
          style={{ minWidth: '200px', boxShadow: '2px 2px 7px rgba(0,0,0,0.1)' }} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
          <div className="text-5xl mb-3">📅</div>
          <p className="text-lg font-bold text-gray-600">No reservations found</p>
          <p className="text-sm text-gray-400 mt-1">New advance orders from POS will appear here</p>
        </div>
      ) : (<>{cards}{pagination}</>)}
    </div>
  )

  const completeModal = showCompleteModal && completingReservation ? (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm w-full max-w-sm" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
        <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
          <h2 className="text-white font-black text-lg">Complete Pickup</h2>
          <p className="text-white text-xs opacity-50 mt-0.5">{completingReservation.customer_name}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-sm px-4 py-3 bg-gray-50 border border-gray-100 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-gray-500">Total Order</span><span className="font-bold">{peso(completingReservation.total_amount)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Already Paid (fee)</span><span className="font-bold text-green-600">{peso(completingReservation.fee_amount)}</span></div>
            <div className="flex justify-between text-sm font-black border-t border-gray-200 pt-1 mt-1"><span>Collect Now</span><span style={{ color: '#7B1111' }}>{peso(completingReservation.balance_amount)}</span></div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Payment Method for Balance</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPickupPaymentMethod('cash')}
                className="py-2 rounded-sm text-xs font-bold border-2 transition-colors"
                style={pickupPaymentMethod === 'cash' ? { borderColor: '#7B1111', backgroundColor: '#7B1111', color: 'white' } : { borderColor: '#e5e7eb', color: '#374151' }}>
                💵 Cash
              </button>
              <button onClick={() => setPickupPaymentMethod('online')}
                className="py-2 rounded-sm text-xs font-bold border-2 transition-colors"
                style={pickupPaymentMethod === 'online' ? { borderColor: '#1a2340', backgroundColor: '#1a2340', color: 'white' } : { borderColor: '#e5e7eb', color: '#374151' }}>
                💳 Online
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">This records the full sale ({peso(completingReservation.total_amount)}), deducts stock, and updates cash register/analytics now.</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={handleCompleteConfirm} disabled={completing}
            className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50" style={{ backgroundColor: '#10B981' }}>
            {completing ? 'Processing...' : `Confirm — Collect ${peso(completingReservation.balance_amount)}`}
          </button>
          <button onClick={() => { setShowCompleteModal(false); setCompletingReservation(null) }}
            className="px-5 py-2 rounded-sm border border-gray-300 text-gray-900 text-sm font-semibold hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null

  const cancelModal = showCancelModal ? (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm w-full max-w-sm" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
        <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
          <h2 className="text-white font-black text-lg">Cancel Reservation</h2>
        </div>
        <div className="px-6 py-5">
          <label className="block text-xs font-bold text-gray-500 mb-1">Reason *</label>
          <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3}
            placeholder="e.g., Customer no longer needs it, fee refunded in person, etc."
            className="w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:border-gray-400" autoFocus />
          <p className="text-xs text-gray-400 mt-2">Note: this does not automatically refund the fee — handle that manually if needed.</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={handleCancelConfirm} className="flex-1 py-2 rounded-sm font-bold text-white text-sm" style={{ backgroundColor: '#EF4444' }}>
            Confirm Cancellation
          </button>
          <button onClick={() => { setShowCancelModal(false); setCancellingId(null) }}
            className="px-5 py-2 rounded-sm border border-gray-300 text-gray-900 text-sm font-semibold hover:bg-gray-100">
            Back
          </button>
        </div>
      </div>
    </div>
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
      <div className="h-screen overflow-hidden flex flex-col" style={{ backgroundColor: '#F5A623' }}>
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
        {completeModal}
        {cancelModal}
      </div>
    )
  }

  if (userRole === 'production') {
    return (
      <div className="h-screen overflow-hidden flex flex-col" style={{ backgroundColor: '#F5A623' }}>
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
      </div>
    )
  }

 // Manager view
  return (
    <div className="h-screen overflow-hidden flex flex-col" style={{ backgroundColor: '#F5A623' }}>
      <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <Branding /><LogoutButton />
      </div>
      <div className="flex flex-1 relative">
        <Watermark /><ManagerSidebar />{mainContent}
      </div>
      {completeModal}
      {cancelModal}
    </div>
  )
}