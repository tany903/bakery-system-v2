'use client'
import { useState } from 'react'
import type { RestockRequestWithDetails } from '@/lib/restock-requests'

interface FulfillRequestModalProps {
  request: RestockRequestWithDetails
  onConfirm: (quantity: number, notes: string, itemFulfillments: { item_id: string; quantity: number }[]) => void
  onClose: () => void
}

export default function FulfillRequestModal({ request, onConfirm, onClose }: FulfillRequestModalProps) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  // Per-item quantity state, defaulting to requested quantity
  const [itemQtys, setItemQtys] = useState<Record<string, string>>(
    Object.fromEntries(request.items.map(item => [item.id, String(item.requested_quantity)]))
  )

  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
  const labelClass = "block text-xs font-bold text-gray-500 mb-1"

  function handleConfirm() {
    setError('')

    for (const item of request.items) {
      const qty = parseInt(itemQtys[item.id] || '0') || 0
      const available = item.products?.production_current_stock ?? 0
      if (qty < 0) { setError('Quantities cannot be negative'); return }
      if (qty > available) {
        setError(`Only ${available} available in production for "${item.products?.name}"`)
        return
      }
    }

    const itemFulfillments = request.items.map(item => ({
      item_id: item.id,
      quantity: parseInt(itemQtys[item.id] || '0') || 0,
    }))

    const totalFulfilled = itemFulfillments.reduce((sum, f) => sum + f.quantity, 0)
    if (totalFulfilled <= 0) { setError('Please fulfill at least one item'); return }

    onConfirm(totalFulfilled, notes, itemFulfillments)
  }

  const totalRequested = request.items.reduce((sum, i) => sum + i.requested_quantity, 0)
  const totalFulfilling = request.items.reduce((sum, i) => sum + (parseInt(itemQtys[i.id] || '0') || 0), 0)
  const isPartial = totalFulfilling < totalRequested && totalFulfilling > 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm w-full max-w-lg max-h-[92vh] flex flex-col" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
        <div className="px-6 py-4 shrink-0" style={{ backgroundColor: '#220901' }}>
          <h2 className="text-white font-black text-lg">Fulfill Restock Request</h2>
          <p className="text-white text-xs opacity-50 mt-0.5">Transfer stock from production to shop</p>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {request.items.map(item => {
            const available = item.products?.production_current_stock ?? 0
            const qty = parseInt(itemQtys[item.id] || '0') || 0
            const insufficient = qty > available
            return (
              <div key={item.id} className="rounded-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
                  <p className="text-white font-black text-sm">{item.products?.name ?? 'Unknown product'}</p>
                  <span className={`text-xs font-bold ${available < item.requested_quantity ? 'text-red-400' : 'text-green-400'}`}>
                    {available} in production
                  </span>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Requested: <span className="font-black text-gray-800">{item.requested_quantity}</span></span>
                    {item.notes && <span className="italic">{item.notes}</span>}
                  </div>
                  <div>
                    <label className={labelClass}>Fulfill Quantity *</label>
                    <input
                      type="number" min="0" max={available}
                      value={itemQtys[item.id] || ''}
                      onChange={e => setItemQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className={`${inputClass} ${insufficient ? 'border-red-300' : ''}`}
                    />
                    {insufficient && (
                      <p className="text-xs text-red-500 mt-1">Only {available} available</p>
                    )}
                    {qty < item.requested_quantity && qty > 0 && !insufficient && (
                      <p className="text-xs text-orange-500 mt-1">⚠️ Partial — requested {item.requested_quantity}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Total summary */}
          <div className="rounded-sm px-4 py-3 bg-gray-50 border border-gray-100">
            <div className="flex justify-between text-sm font-black text-gray-900">
              <span>Total Fulfilling</span>
              <span>{totalFulfilling} / {totalRequested}</span>
            </div>
            {isPartial && <p className="text-xs text-orange-500 mt-1">⚠️ This will be marked as partially fulfilled</p>}
          </div>

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Add any notes about the fulfillment..."
              className={inputClass} />
          </div>

          {error && <div className="px-3 py-2 rounded-sm text-xs font-semibold text-white bg-red-500">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={handleConfirm}
            className="flex-1 py-2 rounded-sm font-bold text-white text-sm"
            style={{ backgroundColor: '#10B981' }}>
            Confirm Fulfillment
          </button>
          <button onClick={onClose}
            className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
