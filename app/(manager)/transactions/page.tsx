'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import ManagerSidebar from '@/components/ManagerSidebar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  is_old_stock: boolean
  discount_pct: number
}

interface Sale {
  id: string
  sale_number: string
  payment_method: 'cash' | 'online'
  total_amount: number
  sale_date: string
  created_at: string
  is_voided: boolean
  voided_at: string | null
  void_reason: string | null
  sale_items: SaleItem[]
  profiles: { full_name: string } | null
}

interface Transfer {
  id: string
  product_id: string
  quantity: number
  transferred_at: string
  created_at: string
  is_voided: boolean
  voided_at: string | null
  void_reason: string | null
  notes: string | null
  product: { name: string } | null
  transferred_by_profile: { full_name: string } | null
}

interface ProductionRecord {
  id: string
  product_id: string
  quantity_produced: number
  production_date: string
  created_at: string
  notes: string | null
  is_voided: boolean
  voided_at: string | null
  void_reason: string | null
  products: { name: string } | null
  produced_by_profile: { full_name: string } | null
}

interface CashEntry {
  id: string
  type: 'float' | 'cash_in' | 'cash_out'
  amount: number
  notes: string | null
  created_at: string
  is_voided: boolean
  void_reason: string | null
  profiles: { full_name: string } | null
}

type Tab = 'sales' | 'transfers' | 'production'

// ─── Void Modal ───────────────────────────────────────────────────────────────

function VoidModal({
  title,
  description,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string
  description: string
  onConfirm: (reason: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-sm w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <div className="px-6 py-4" style={{ backgroundColor: '#7B1111' }}>
          <h3 className="text-lg font-black text-white">⚠ {title}</h3>
          <p className="text-red-200 text-sm mt-1">{description}</p>
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
              className="flex-1 px-4 py-2 rounded-sm text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={() => reason.trim() && onConfirm(reason.trim())}
              disabled={loading || !reason.trim()}
              className="flex-1 px-4 py-2 rounded-sm text-sm font-bold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#7B1111' }}>
              {loading ? 'Voiding…' : 'Confirm Void'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null
  const pages = Array.from({ length: total }, (_, i) => i + 1)
    .filter(p => p === 1 || p === total || Math.abs(p - current) <= 1)
  return (
    <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
      <span className="text-xs text-gray-500">Page {current} of {total}</span>
      <div className="flex gap-2">
        <button onClick={() => onChange(current - 1)} disabled={current === 1}
          className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40 text-white"
          style={{ backgroundColor: '#1a2340' }}>← Prev</button>
        {pages.map((p, i, arr) => (
          <span key={p} className="flex items-center gap-2">
            {i > 0 && arr[i - 1] !== p - 1 && <span className="text-xs text-gray-400">...</span>}
            <button onClick={() => onChange(p)}
              className="px-3 py-1.5 rounded-sm text-xs font-bold"
              style={current === p
                ? { backgroundColor: '#1a2340', color: 'white' }
                : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }}>
              {p}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(current + 1)} disabled={current === total}
          className="px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-40 text-white"
          style={{ backgroundColor: '#1a2340' }}>Next →</button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('sales')
  const [managerId, setManagerId] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [sales, setSales] = useState<Sale[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [production, setProduction] = useState<ProductionRecord[]>([])
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([])

  // Sales filters
  const [saleSearch, setSaleSearch] = useState('')
  const [salePayment, setSalePayment] = useState('all')
  const [saleStatus, setSaleStatus] = useState('all')
  const [saleDateFrom, setSaleDateFrom] = useState('')
  const [saleDateTo, setSaleDateTo] = useState('')
  const [salePage, setSalePage] = useState(1)

  // Transfer filters
  const [transferSearch, setTransferSearch] = useState('')
  const [transferStatus, setTransferStatus] = useState('all')
  const [transferDateFrom, setTransferDateFrom] = useState('')
  const [transferDateTo, setTransferDateTo] = useState('')
  const [transferPage, setTransferPage] = useState(1)

  // Production filters
  const [productionSearch, setProductionSearch] = useState('')
  const [productionStatus, setProductionStatus] = useState('all')
  const [productionDateFrom, setProductionDateFrom] = useState('')
  const [productionDateTo, setProductionDateTo] = useState('')
  const [productionPage, setProductionPage] = useState(1)

  const [voidTarget, setVoidTarget] = useState<{ type: 'sale' | 'transfer' | 'production' | 'cash'; id: string; label: string } | null>(null)
  const [voidLoading, setVoidLoading] = useState(false)
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())

  const PER_PAGE = 15

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || profile.role !== 'manager') { router.push('/login'); return }
    setManagerId(user.id)
    await loadAll()
    setLoading(false)
  }

  async function loadAll() {
    await Promise.all([loadSales(), loadTransfers(), loadProduction(), loadCashEntries()])
  }

  async function loadSales() {
    const { data, error: err } = await supabase
      .from('sales')
      .select('*, sale_items(*), cashier:profiles!sales_cashier_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (err) console.error('loadSales error:', err)
    if (data) setSales(data.map((s: any) => ({ ...s, profiles: s.cashier })))
  }

  async function loadTransfers() {
    const { data, error: err } = await supabase
      .from('inventory_transfers')
      .select('*, product:products(name), transferred_by_profile:profiles!inventory_transfers_transferred_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (err) console.error('loadTransfers error:', err)
    if (data) setTransfers(data)
  }

  async function loadProduction() {
    const { data, error: err } = await supabase
      .from('production')
      .select('*, products(name), produced_by_profile:profiles!production_produced_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (err) console.error('loadProduction error:', err)
    if (data) setProduction(data)
  }

  async function loadCashEntries() {
    const { data, error: err } = await supabase
      .from('cash_register')
      .select('*, performer:profiles!cash_register_performed_by_fkey(full_name)')
      .in('type', ['cash_in', 'cash_out'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (err) console.error('loadCashEntries error:', err)
    if (data) setCashEntries(data.map((e: any) => ({ ...e, profiles: e.performer })))
  }

  async function handleVoid(reason: string) {
    if (!voidTarget) return
    setVoidLoading(true)
    setError('')
    try {
      const endpointMap = {
        sale: '/api/transactions/void-sale',
        transfer: '/api/transactions/void-transfer',
        production: '/api/transactions/void-production',
        cash: '/api/transactions/void-cash-entry',
      }
      const bodyMap: Record<string, object> = {
        sale: { saleId: voidTarget.id, voidReason: reason, managerId },
        transfer: { transferId: voidTarget.id, voidReason: reason, managerId },
        production: { productionId: voidTarget.id, voidReason: reason, managerId },
        cash: { entryId: voidTarget.id, voidReason: reason, managerId },
      }
      const res = await fetch(endpointMap[voidTarget.type], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyMap[voidTarget.type]),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Void failed')
      setSuccessMsg(`Successfully voided: ${voidTarget.label}`)
      setTimeout(() => setSuccessMsg(''), 4000)
      setVoidTarget(null)
      await loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to void')
    } finally {
      setVoidLoading(false)
    }
  }

  // ── Filtered data ────────────────────────────────────────────────────────────

  const filteredSales = sales.filter(s => {
    if (saleSearch) {
      const q = saleSearch.toLowerCase()
      if (!s.sale_number?.toLowerCase().includes(q) && !s.profiles?.full_name?.toLowerCase().includes(q)) return false
    }
    if (salePayment !== 'all' && s.payment_method !== salePayment) return false
    if (saleStatus === 'active' && s.is_voided) return false
    if (saleStatus === 'voided' && !s.is_voided) return false
    if (saleDateFrom && new Date(s.created_at) < new Date(saleDateFrom)) return false
    if (saleDateTo) { const t = new Date(saleDateTo); t.setHours(23,59,59,999); if (new Date(s.created_at) > t) return false }
    return true
  })

  const filteredTransfers = transfers.filter(t => {
    if (transferSearch && !t.product?.name?.toLowerCase().includes(transferSearch.toLowerCase())) return false
    if (transferStatus === 'active' && t.is_voided) return false
    if (transferStatus === 'voided' && !t.is_voided) return false
    if (transferDateFrom && new Date(t.created_at) < new Date(transferDateFrom)) return false
    if (transferDateTo) { const d = new Date(transferDateTo); d.setHours(23,59,59,999); if (new Date(t.created_at) > d) return false }
    return true
  })

  const filteredProduction = production.filter(p => {
    if (productionSearch && !p.products?.name?.toLowerCase().includes(productionSearch.toLowerCase())) return false
    if (productionStatus === 'active' && p.is_voided) return false
    if (productionStatus === 'voided' && !p.is_voided) return false
    if (productionDateFrom && new Date(p.created_at) < new Date(productionDateFrom)) return false
    if (productionDateTo) { const d = new Date(productionDateTo); d.setHours(23,59,59,999); if (new Date(p.created_at) > d) return false }
    return true
  })

  const paginatedSales = filteredSales.slice((salePage-1)*PER_PAGE, salePage*PER_PAGE)
  const paginatedTransfers = filteredTransfers.slice((transferPage-1)*PER_PAGE, transferPage*PER_PAGE)
  const paginatedProduction = filteredProduction.slice((productionPage-1)*PER_PAGE, productionPage*PER_PAGE)

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
    })
  }

  function peso(n: number) {
    return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function toggleExpand(id: string) {
    setExpandedSales(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading…</div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: 'sales',      label: 'Sales',              icon: '🧾', count: sales.length },
    { key: 'transfers',  label: 'Stock Transfers',     icon: '📦', count: transfers.length },
    { key: 'production', label: 'Production Records',  icon: '🏭', count: production.length },
  ]

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>

      {/* NAVBAR */}
      <div className="w-full flex items-center justify-between px-6 py-3 shrink-0 z-10" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center">
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
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />

        <ManagerSidebar />

        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-4xl font-black text-gray-900">Transactions</h1>
            <p className="text-gray-700 font-medium mt-1">View and manage all sales, transfers, and production records</p>
          </div>

          {/* Alerts */}
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

          {/* TABS */}
          <div className="flex gap-2 mb-5">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className="flex items-center gap-2 px-5 py-3 rounded-sm font-bold text-sm transition-all"
                style={activeTab === t.key
                  ? { backgroundColor: '#1a2340', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }
                  : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)', opacity: 0.85 }}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
                <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full"
                  style={activeTab === t.key
                    ? { backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }
                    : { backgroundColor: '#F5A623', color: 'white' }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* ── TAB: SALES ────────────────────────────────────────────────────── */}
          {activeTab === 'sales' && (
            <div>
              {/* Filters */}
              <div className="bg-white rounded-sm p-4 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-3"
                style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
                <div className="lg:col-span-2">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Search</label>
                  <input value={saleSearch} onChange={e => { setSaleSearch(e.target.value); setSalePage(1) }}
                    placeholder="Sale # or cashier…"
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Payment</label>
                  <select value={salePayment} onChange={e => { setSalePayment(e.target.value); setSalePage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                    <option value="all">All</option>
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Status</label>
                  <select value={saleStatus} onChange={e => { setSaleStatus(e.target.value); setSalePage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">From</label>
                  <input type="date" value={saleDateFrom} onChange={e => { setSaleDateFrom(e.target.value); setSalePage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">To</label>
                  <input type="date" value={saleDateTo} onChange={e => { setSaleDateTo(e.target.value); setSalePage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
              </div>

              {/* Cash entries sub-section */}
              {cashEntries.length > 0 && (
                <div className="bg-white rounded-sm overflow-hidden mb-4" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
                  <div className="flex items-center gap-2 px-5 py-3" style={{ backgroundColor: '#1a4033' }}>
                    <span className="text-sm">💵</span>
                    <h3 className="font-bold text-white text-sm">Cash Register Entries</h3>
                    <span className="text-xs text-white opacity-60 ml-1">(Cash-In / Cash-Out)</span>
                    <span className="ml-auto text-xs text-white opacity-60">{cashEntries.length} entries</span>
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
                        {cashEntries.map(entry => (
                          <tr key={entry.id} className={`border-b border-gray-100 last:border-0 transition-colors ${entry.is_voided ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                            <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(entry.created_at)}</td>
                            <td className="px-5 py-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${entry.type === 'cash_in' ? 'bg-green-500' : 'bg-orange-500'}`}>
                                {entry.type === 'cash_in' ? 'Cash In' : 'Cash Out'}
                              </span>
                            </td>
                            <td className={`px-5 py-3 text-sm font-black ${entry.is_voided ? 'line-through text-gray-400' : entry.type === 'cash_in' ? 'text-green-600' : 'text-orange-600'}`}>
                              {entry.type === 'cash_in' ? '+' : '-'}{peso(entry.amount)}
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500">{entry.profiles?.full_name || '—'}</td>
                            <td className="px-5 py-3 text-xs text-gray-400 max-w-xs truncate">{entry.notes || '—'}</td>
                            <td className="px-5 py-3">
                              {entry.is_voided
                                ? <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">VOIDED</span>
                                : <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Active</span>}
                            </td>
                            <td className="px-5 py-3">
                              {!entry.is_voided && (
                                <button
                                  onClick={() => setVoidTarget({ type: 'cash', id: entry.id, label: `${entry.type === 'cash_in' ? 'Cash In' : 'Cash Out'} ${peso(entry.amount)}` })}
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
                </div>
              )}

              {/* Sales table */}
              <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
                  <span className="text-white">🧾</span>
                  <h2 className="font-bold text-white">Sales</h2>
                  <span className="ml-auto text-xs text-white opacity-60">{filteredSales.length} records</span>
                </div>
                {filteredSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="text-5xl mb-3">🧾</div>
                    <p className="text-lg font-bold text-gray-600">No sales found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                            <th className="px-3 py-3 font-semibold w-8"></th>
                            <th className="px-5 py-3 font-semibold">Date & Time</th>
                            <th className="px-5 py-3 font-semibold">Sale #</th>
                            <th className="px-5 py-3 font-semibold">Cashier</th>
                            <th className="px-5 py-3 font-semibold">Payment</th>
                            <th className="px-5 py-3 font-semibold">Total</th>
                            <th className="px-5 py-3 font-semibold">Items</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                            <th className="px-5 py-3 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedSales.map(sale => {
                            const expanded = expandedSales.has(sale.id)
                            return (
                              <React.Fragment key={sale.id}>
                                <tr
                                  className={`border-b border-gray-100 transition-colors ${sale.is_voided ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                  <td className="px-3 py-3 text-center">
                                    <button onClick={() => toggleExpand(sale.id)}
                                      className="text-gray-400 hover:text-gray-700 font-bold text-xs w-5 h-5 inline-flex items-center justify-center rounded transition-colors">
                                      {expanded ? '▼' : '▶'}
                                    </button>
                                  </td>
                                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(sale.created_at)}</td>
                                  <td className={`px-5 py-3 text-sm font-bold ${sale.is_voided ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                    {sale.sale_number || sale.id.slice(0,8).toUpperCase()}
                                  </td>
                                  <td className="px-5 py-3 text-xs text-gray-600">{sale.profiles?.full_name || '—'}</td>
                                  <td className="px-5 py-3">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${sale.payment_method === 'cash' ? 'bg-green-500' : 'bg-blue-500'}`}>
                                      {sale.payment_method === 'cash' ? '💵 Cash' : '📱 Online'}
                                    </span>
                                  </td>
                                  <td className={`px-5 py-3 text-sm font-black ${sale.is_voided ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                    {peso(sale.total_amount)}
                                  </td>
                                  <td className="px-5 py-3 text-xs text-gray-500">
                                    {sale.sale_items?.reduce((s, i) => s + i.quantity, 0) ?? 0} pcs
                                  </td>
                                  <td className="px-5 py-3">
                                    {sale.is_voided
                                      ? <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">VOIDED</span>
                                      : <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Active</span>}
                                  </td>
                                  <td className="px-5 py-3">
                                    {!sale.is_voided && (
                                      <button
                                        onClick={() => setVoidTarget({ type: 'sale', id: sale.id, label: `Sale ${sale.sale_number || sale.id.slice(0,8).toUpperCase()} (${peso(sale.total_amount)})` })}
                                        className="text-xs font-bold px-3 py-1 rounded-sm text-white hover:opacity-80"
                                        style={{ backgroundColor: '#7B1111' }}>
                                        Void
                                      </button>
                                    )}
                                  </td>
                                </tr>
                                {expanded && (
                                  <tr key={`${sale.id}-exp`} className={sale.is_voided ? 'bg-red-50' : 'bg-gray-50'}>
                                    <td colSpan={9} className="px-10 pb-4 pt-1">
                                      <div className="rounded-sm overflow-hidden border border-gray-200">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="text-gray-500 border-b border-gray-200 bg-gray-100">
                                              <th className="px-4 py-2 text-left font-semibold">Product</th>
                                              <th className="px-4 py-2 text-right font-semibold">Qty</th>
                                              <th className="px-4 py-2 text-right font-semibold">Unit Price</th>
                                              <th className="px-4 py-2 text-right font-semibold">Discount</th>
                                              <th className="px-4 py-2 text-right font-semibold">Subtotal</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sale.sale_items?.map(item => (
                                              <tr key={item.id} className="border-b border-gray-100 last:border-0">
                                                <td className="px-4 py-2 font-medium text-gray-700">
                                                  {item.product_name}
                                                  {item.is_old_stock && <span className="ml-2 text-orange-500">(Day-old 50%)</span>}
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-600">{item.quantity}</td>
                                                <td className="px-4 py-2 text-right text-gray-600">{peso(item.unit_price)}</td>
                                                <td className="px-4 py-2 text-right text-gray-500">{item.discount_pct > 0 ? `${item.discount_pct}%` : '—'}</td>
                                                <td className="px-4 py-2 text-right font-bold text-gray-800">{peso(item.subtotal)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="border-t border-gray-300">
                                              <td colSpan={4} className="px-4 py-2 text-right font-bold text-gray-700">Total</td>
                                              <td className="px-4 py-2 text-right font-black text-gray-900">{peso(sale.total_amount)}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                      {sale.is_voided && sale.void_reason && (
                                        <p className="mt-2 text-xs text-red-600 font-semibold">
                                          ⚠ Void reason: {sale.void_reason}
                                          {sale.voided_at && ` — ${fmt(sale.voided_at)}`}
                                        </p>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pagination current={salePage} total={Math.ceil(filteredSales.length/PER_PAGE)} onChange={setSalePage} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: TRANSFERS ──────────────────────────────────────────────────── */}
          {activeTab === 'transfers' && (
            <div>
              <div className="bg-white rounded-sm p-4 mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3"
                style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
                <div className="lg:col-span-2">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Search Product</label>
                  <input value={transferSearch} onChange={e => { setTransferSearch(e.target.value); setTransferPage(1) }}
                    placeholder="Product name…"
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Status</label>
                  <select value={transferStatus} onChange={e => { setTransferStatus(e.target.value); setTransferPage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">From</label>
                  <input type="date" value={transferDateFrom} onChange={e => { setTransferDateFrom(e.target.value); setTransferPage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">To</label>
                  <input type="date" value={transferDateTo} onChange={e => { setTransferDateTo(e.target.value); setTransferPage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
              </div>

              <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
                  <span className="text-white">📦</span>
                  <h2 className="font-bold text-white">Stock Transfers</h2>
                  <span className="text-xs text-white opacity-60 ml-1">(Production → Shop)</span>
                  <span className="ml-auto text-xs text-white opacity-60">{filteredTransfers.length} records</span>
                </div>
                {filteredTransfers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="text-5xl mb-3">📦</div>
                    <p className="text-lg font-bold text-gray-600">No transfers found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                            <th className="px-5 py-3 font-semibold">Date & Time</th>
                            <th className="px-5 py-3 font-semibold">Product</th>
                            <th className="px-5 py-3 font-semibold">Qty</th>
                            <th className="px-5 py-3 font-semibold">Route</th>
                            <th className="px-5 py-3 font-semibold">By</th>
                            <th className="px-5 py-3 font-semibold">Notes</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                            <th className="px-5 py-3 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTransfers.map(t => (
                            <tr key={t.id}
                              className={`border-b border-gray-100 last:border-0 transition-colors ${t.is_voided ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(t.created_at)}</td>
                              <td className={`px-5 py-3 text-sm font-semibold ${t.is_voided ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {t.product?.name || '—'}
                              </td>
                              <td className={`px-5 py-3 text-sm font-black ${t.is_voided ? 'line-through text-gray-400' : 'text-purple-600'}`}>
                                {t.quantity} pcs
                              </td>
                              <td className="px-5 py-3 text-xs">
                                <span className="font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Production</span>
                                <span className="mx-1 text-gray-400">→</span>
                                <span className="font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Shop</span>
                              </td>
                              <td className="px-5 py-3 text-xs text-gray-500">{t.transferred_by_profile?.full_name || '—'}</td>
                              <td className="px-5 py-3 text-xs text-gray-400 max-w-xs truncate">{t.notes || '—'}</td>
                              <td className="px-5 py-3">
                                {t.is_voided ? (
                                  <div>
                                    <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">VOIDED</span>
                                    {t.void_reason && <p className="text-xs text-red-400 mt-1 truncate max-w-xs">{t.void_reason}</p>}
                                  </div>
                                ) : <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Active</span>}
                              </td>
                              <td className="px-5 py-3">
                                {!t.is_voided && (
                                  <button
                                    onClick={() => setVoidTarget({ type: 'transfer', id: t.id, label: `Transfer of ${t.quantity} × ${t.product?.name || 'product'}` })}
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
                    <Pagination current={transferPage} total={Math.ceil(filteredTransfers.length/PER_PAGE)} onChange={setTransferPage} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: PRODUCTION ─────────────────────────────────────────────────── */}
          {activeTab === 'production' && (
            <div>
              <div className="bg-white rounded-sm p-4 mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3"
                style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.15)' }}>
                <div className="lg:col-span-2">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Search Product</label>
                  <input value={productionSearch} onChange={e => { setProductionSearch(e.target.value); setProductionPage(1) }}
                    placeholder="Product name…"
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Status</label>
                  <select value={productionStatus} onChange={e => { setProductionStatus(e.target.value); setProductionPage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none">
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">From</label>
                  <input type="date" value={productionDateFrom} onChange={e => { setProductionDateFrom(e.target.value); setProductionPage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">To</label>
                  <input type="date" value={productionDateTo} onChange={e => { setProductionDateTo(e.target.value); setProductionPage(1) }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none" />
                </div>
              </div>

              <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
                  <span className="text-white">🏭</span>
                  <h2 className="font-bold text-white">Production Records</h2>
                  <span className="ml-auto text-xs text-white opacity-60">{filteredProduction.length} records</span>
                </div>
                {filteredProduction.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="text-5xl mb-3">🏭</div>
                    <p className="text-lg font-bold text-gray-600">No production records found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                            <th className="px-5 py-3 font-semibold">Date & Time</th>
                            <th className="px-5 py-3 font-semibold">Product</th>
                            <th className="px-5 py-3 font-semibold">Qty Produced</th>
                            <th className="px-5 py-3 font-semibold">Produced By</th>
                            <th className="px-5 py-3 font-semibold">Notes</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                            <th className="px-5 py-3 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedProduction.map(rec => (
                            <tr key={rec.id}
                              className={`border-b border-gray-100 last:border-0 transition-colors ${rec.is_voided ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(rec.created_at)}</td>
                              <td className={`px-5 py-3 text-sm font-semibold ${rec.is_voided ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {rec.products?.name || '—'}
                              </td>
                              <td className={`px-5 py-3 text-sm font-black ${rec.is_voided ? 'line-through text-gray-400' : 'text-emerald-600'}`}>
                                +{rec.quantity_produced} pcs
                              </td>
                              <td className="px-5 py-3 text-xs text-gray-500">{rec.produced_by_profile?.full_name || '—'}</td>
                              <td className="px-5 py-3 text-xs text-gray-400 max-w-xs truncate">{rec.notes || '—'}</td>
                              <td className="px-5 py-3">
                                {rec.is_voided ? (
                                  <div>
                                    <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">VOIDED</span>
                                    {rec.void_reason && <p className="text-xs text-red-400 mt-1 truncate max-w-xs">{rec.void_reason}</p>}
                                  </div>
                                ) : <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Active</span>}
                              </td>
                              <td className="px-5 py-3">
                                {!rec.is_voided && (
                                  <button
                                    onClick={() => setVoidTarget({ type: 'production', id: rec.id, label: `Production batch: ${rec.quantity_produced} × ${rec.products?.name || 'product'}` })}
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
                    <Pagination current={productionPage} total={Math.ceil(filteredProduction.length/PER_PAGE)} onChange={setProductionPage} />
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* VOID MODAL */}
      {voidTarget && (
        <VoidModal
          title="Void Transaction"
          description={`You are about to void: ${voidTarget.label}. This will reverse all stock and cash effects. This cannot be undone.`}
          onConfirm={handleVoid}
          onCancel={() => setVoidTarget(null)}
          loading={voidLoading}
        />
      )}

    </div>
  )
}
