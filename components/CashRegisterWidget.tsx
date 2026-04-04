'use client'

import { useEffect, useState } from 'react'
import { getCashSummary, addCashIn, addCashOut, type CashSummary } from '@/lib/cash-register'

interface CashRegisterWidgetProps {
  userId: string
  userRole: 'manager' | 'cashier' | 'production'
}

export default function CashRegisterWidget({ userId, userRole }: CashRegisterWidgetProps) {
  const [summary, setSummary] = useState<CashSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'cash_in' | 'cash_out'>('cash_in')
  const [amountStr, setAmountStr] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { loadSummary() }, [])

  async function loadSummary() {
    try {
      setLoading(true)
      const data = await getCashSummary()
      setSummary(data)
    } catch (err: any) {
      setError('Failed to load cash summary')
    } finally {
      setLoading(false)
    }
  }

  function openModal(type: 'cash_in' | 'cash_out') {
    setModalType(type)
    setAmountStr('')
    setNotes('')
    setFormError('')
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(amountStr)
    if (!amountStr || isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid amount')
      return
    }
    setSubmitting(true); setFormError('')
    try {
      if (modalType === 'cash_in') {
        await addCashIn(amount, userId, notes || undefined)
      } else {
        if (summary && amount > summary.cashOnHand) {
          setFormError(`Cannot cash out more than current cash on hand (₱${summary.cashOnHand.toFixed(2)})`)
          setSubmitting(false)
          return
        }
        await addCashOut(amount, userId, notes || undefined)
      }
      setSuccess(`${modalType === 'cash_in' ? 'Cash in' : 'Cash out'} recorded successfully`)
      setShowModal(false)
      await loadSummary()
    } catch (err: any) {
      setFormError(err.message || 'Failed to record transaction')
    } finally {
      setSubmitting(false)
      setTimeout(() => setSuccess(''), 3000)
    }
  }

  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
  const labelClass = "block text-xs font-bold text-gray-500 mb-1"

  if (loading) {
    return (
      <div className="bg-white rounded-sm p-5 animate-pulse" style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-1/2" />
      </div>
    )
  }

  if (!summary) return null

  return (
    <>
      <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
          <div>
            <p className="text-white text-xs font-bold uppercase tracking-widest opacity-60">Cash On Hand</p>
            <p className="text-white font-black text-3xl mt-1">₱{summary.cashOnHand.toFixed(2)}</p>
          </div>
          {userRole === 'manager' && (
            <a href="/cash-register-log"
              className="text-white text-xs opacity-60 hover:opacity-100 font-bold no-underline">
              View Log →
            </a>
          )}
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {[
            { label: 'Cash Float', value: summary.cashFloat, color: '#1a2340' },
            { label: "Today's Sales", value: summary.todayCashSales, color: '#10B981' },
            { label: 'Cash In', value: summary.totalCashIn, color: '#3B82F6' },
          ].map(stat => (
            <div key={stat.label} className="px-4 py-3">
              <p className="text-xs text-gray-400 font-medium">{stat.label}</p>
              <p className="font-black text-lg" style={{ color: stat.color }}>₱{stat.value.toFixed(2)}</p>
            </div>
          ))}
        </div>

        {/* Cash out row */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Total Cash Out</p>
            <p className="font-black text-lg text-red-500">-₱{summary.totalCashOut.toFixed(2)}</p>
          </div>
          {(userRole === 'cashier' || userRole === 'manager') && (
            <div className="flex gap-2">
              <button onClick={() => openModal('cash_in')}
                className="px-4 py-1.5 rounded-sm text-xs font-bold text-white"
                style={{ backgroundColor: '#3B82F6' }}>
                + Cash In
              </button>
              <button onClick={() => openModal('cash_out')}
                className="px-4 py-1.5 rounded-sm text-xs font-bold text-white"
                style={{ backgroundColor: '#EF4444' }}>
                - Cash Out
              </button>
            </div>
          )}
        </div>

        {error && <div className="mx-4 mb-3 px-3 py-2 rounded-sm text-xs font-semibold text-white bg-red-500">{error}</div>}
        {success && <div className="mx-4 mb-3 px-3 py-2 rounded-sm text-xs font-semibold text-white bg-green-500">{success}</div>}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-sm" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">
                {modalType === 'cash_in' ? 'Cash In' : 'Cash Out'}
              </h2>
              <p className="text-white text-xs opacity-50 mt-0.5">
                {modalType === 'cash_in' ? 'Add money to the register' : 'Remove money from the register'}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="rounded-sm px-4 py-3" style={{ backgroundColor: '#220901' }}>
                <p className="text-white text-xs opacity-50">Current Cash On Hand</p>
                <p className="text-white font-black text-2xl">₱{summary.cashOnHand.toFixed(2)}</p>
              </div>

              {formError && <div className="px-3 py-2 rounded-sm text-xs font-semibold text-white bg-red-500">{formError}</div>}

              <div>
                <label className={labelClass}>Amount *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  placeholder="₱0.00"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div>
                <label className={labelClass}>Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder={modalType === 'cash_in' ? 'e.g., Change fund replenishment' : 'e.g., Paid supplier, petty cash'}
                  className={inputClass} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
                  style={{ backgroundColor: modalType === 'cash_in' ? '#3B82F6' : '#EF4444' }}>
                  {submitting ? 'Recording...' : modalType === 'cash_in' ? '+ Confirm Cash In' : '- Confirm Cash Out'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
