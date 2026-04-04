'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import ManagerSidebar from '@/components/ManagerSidebar'

interface CashEntry {
  id: string
  created_at: string
  type: 'float' | 'cash_in' | 'cash_out'
  amount: number
  notes: string | null
  is_voided: boolean | null
  void_reason: string | null
  voided_at: string | null
  performer: { full_name: string } | null
}

function VoidModal({
  entry,
  onConfirm,
  onCancel,
  loading,
}: {
  entry: CashEntry
  onConfirm: (reason: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  const label = entry.type === 'cash_in' ? 'Cash In' : 'Cash Out'
  const amount = `₱${Number(entry.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-sm w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <div className="px-6 py-4" style={{ backgroundColor: '#7B1111' }}>
          <h3 className="text-lg font-black text-white">⚠ Void Cash Entry</h3>
          <p className="text-red-200 text-sm mt-1">
            Voiding {label} of {amount}. A counter-entry will be created to reverse this. Cannot be undone.
          </p>
        </div>
        <div className="p-6">
          <label className="block text-sm font-bold text-gray-700 mb-2">Void Reason <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Enter reason for voiding..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:border-red-400 resize-none"
          />
          <div className="flex gap-3 mt-4">
            <button onClick={onCancel} disabled={loading}
              className="flex-1 px-4 py-2 rounded-sm text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={() => reason.trim() && onConfirm(reason.trim())}
              disabled={loading || !reason.trim()}
              className="flex-1 px-4 py-2 rounded-sm text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: '#7B1111' }}>
              {loading ? 'Voiding…' : 'Confirm Void'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CashRegisterLogPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [managerId, setManagerId] = useState('')
  const [entries, setEntries] = useState<CashEntry[]>([])
  const [filtered, setFiltered] = useState<CashEntry[]>([])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15

  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const [voidTarget, setVoidTarget] = useState<CashEntry | null>(null)
  const [voidLoading, setVoidLoading] = useState(false)

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { applyFilters() }, [entries, filterType, filterStatus, filterDateFrom, filterDateTo])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || profile.role !== 'manager') { router.push('/login'); return }
    setManagerId(user.id)
    await loadData()
    setLoading(false)
  }

  async function loadData() {
    try {
      const { data, error: err } = await supabase
        .from('cash_register')
        .select('*, performer:profiles!cash_register_performed_by_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(500)
      if (err) throw err
      setEntries(data || [])
    } catch (err: any) {
      setError('Failed to load cash register log: ' + (err?.message || ''))
    }
  }

  function applyFilters() {
    setCurrentPage(1)
    let result = entries
    if (filterType !== 'all') result = result.filter(e => e.type === filterType)
    if (filterStatus === 'active') result = result.filter(e => !e.is_voided)
    if (filterStatus === 'voided') result = result.filter(e => !!e.is_voided)
    if (filterDateFrom) result = result.filter(e => new Date(e.created_at) >= new Date(filterDateFrom))
    if (filterDateTo) {
      const to = new Date(filterDateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(e => new Date(e.created_at) <= to)
    }
    setFiltered(result)
  }

  function clearFilters() {
    setFilterType('all')
    setFilterStatus('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  async function handleVoid(reason: string) {
    if (!voidTarget) return
    setVoidLoading(true)
    setError('')
    try {
      const res = await fetch('/api/transactions/void-cash-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: voidTarget.id, voidReason: reason, managerId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Void failed')
      setSuccessMsg('Entry voided. A reversal entry has been created.')
      setTimeout(() => setSuccessMsg(''), 4000)
      setVoidTarget(null)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to void entry')
    } finally {
      setVoidLoading(false)
    }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // Summary cards — active entries only
  const active = entries.filter(e => !e.is_voided)
  const totalFloat   = active.filter(e => e.type === 'float').reduce((s, e) => s + Number(e.amount), 0)
  const totalCashIn  = active.filter(e => e.type === 'cash_in').reduce((s, e) => s + Number(e.amount), 0)
  const totalCashOut = active.filter(e => e.type === 'cash_out').reduce((s, e) => s + Number(e.amount), 0)

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
    })
  }

  function getTypeBadge(type: string) {
    const map: Record<string, { label: string; color: string }> = {
      float:    { label: 'Float',    color: '#F5A623' },
      cash_in:  { label: 'Cash In',  color: '#10B981' },
      cash_out: { label: 'Cash Out', color: '#EF4444' },
    }
    const t = map[type] || { label: type, color: '#6B7280' }
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: t.color }}>
        {t.label}
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

      {/* NAVBAR */}
      <div className="w-full flex items-center justify-between px-6 py-3 shrink-0 z-10" style={{ backgroundColor: '#7B1111' }}>
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

      {/* BODY */}
      <div className="flex flex-1 relative">

        <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', height: 'auto', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

        <ManagerSidebar />

        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-black text-gray-900">Cash Register Log</h1>
              <p className="text-gray-700 font-medium mt-1">{filtered.length} record{filtered.length !== 1 ? 's' : ''} found</p>
            </div>
            <button onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-gray-900 text-sm"
              style={{ backgroundColor: 'white', boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}>
              ✕ Clear Filters
            </button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-600 flex items-center justify-between">
              <span>⚠ {error}</span>
              <button onClick={() => setError('')} className="ml-4 opacity-70 hover:opacity-100">✕</button>
            </div>
          )}
          {successMsg && (
            <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-600 flex items-center justify-between">
              <span>✓ {successMsg}</span>
              <button onClick={() => setSuccessMsg('')} className="ml-4 opacity-70 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total Float',    value: totalFloat,   color: 'text-yellow-400' },
              { label: 'Total Cash In',  value: totalCashIn,  color: 'text-green-400'  },
              { label: 'Total Cash Out', value: totalCashOut, color: 'text-red-400'    },
            ].map(card => (
              <div key={card.label} className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
                <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">{card.label}</p>
                <p className={`text-3xl font-black ${card.color}`}>
                  ₱{card.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-sm p-4 mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3 text-gray-900"
            style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Type</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                <option value="all">All Types</option>
                <option value="float">Float</option>
                <option value="cash_in">Cash In</option>
                <option value="cash_out">Cash Out</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="voided">Voided</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">From</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">To</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-sm flex flex-col items-center justify-center py-16" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="text-5xl mb-3">💵</div>
              <p className="text-lg font-bold text-gray-600">No records found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
                <h2 className="font-bold text-white">Cash Register History</h2>
                <span className="ml-auto text-xs text-white opacity-60">{filtered.length} records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-5 py-3 font-semibold">Date & Time</th>
                      <th className="px-5 py-3 font-semibold">Type</th>
                      <th className="px-5 py-3 font-semibold">Amount</th>
                      <th className="px-5 py-3 font-semibold">By</th>
                      <th className="px-5 py-3 font-semibold">Notes</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(entry => (
                      <tr key={entry.id}
                        className={`border-b border-gray-100 last:border-0 transition-colors ${entry.is_voided ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(entry.created_at)}</td>
                        <td className="px-5 py-3">{getTypeBadge(entry.type)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-black ${entry.is_voided ? 'line-through text-gray-400' : entry.type === 'cash_out' ? 'text-red-500' : entry.type === 'cash_in' ? 'text-green-600' : 'text-gray-900'}`}>
                            {entry.type === 'cash_out' ? '-' : '+'}₱{Number(entry.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {entry.performer?.full_name || '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-400 max-w-xs truncate">{entry.notes || '—'}</td>
                        <td className="px-5 py-3">
                          {entry.is_voided
                            ? (
                              <div>
                                <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">VOIDED</span>
                                {entry.void_reason && <p className="text-xs text-red-400 mt-1 max-w-xs truncate">{entry.void_reason}</p>}
                              </div>
                            )
                            : <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Active</span>
                          }
                        </td>
                        <td className="px-5 py-3">
                          {!entry.is_voided && entry.type !== 'float' && (
                            <button
                              onClick={() => setVoidTarget(entry)}
                              className="text-xs font-bold px-3 py-1 rounded-sm text-white hover:opacity-80"
                              style={{ backgroundColor: '#7B1111' }}>
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
                  <span className="text-xs text-gray-500">Page {currentPage} of {totalPages} — {filtered.length} total</span>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40 text-white"
                      style={{ backgroundColor: '#1a2340' }}>← Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((p, idx, arr) => (
                        <span key={p} className="flex items-center gap-2">
                          {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-xs text-gray-400">...</span>}
                          <button onClick={() => setCurrentPage(p)}
                            className="px-3 py-1.5 rounded-sm text-xs font-bold"
                            style={currentPage === p
                              ? { backgroundColor: '#1a2340', color: 'white' }
                              : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
                            {p}
                          </button>
                        </span>
                      ))}
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40 text-white"
                      style={{ backgroundColor: '#1a2340' }}>Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {voidTarget && (
        <VoidModal
          entry={voidTarget}
          onConfirm={handleVoid}
          onCancel={() => setVoidTarget(null)}
          loading={voidLoading}
        />
      )}
    </div>
  )
}
