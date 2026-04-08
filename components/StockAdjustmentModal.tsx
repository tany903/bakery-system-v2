'use client'

import { useState } from 'react'
import type { Product } from '@/lib/supabase'
import type { InventoryLocation } from '@/lib/inventory'

interface StockAdjustmentModalProps {
  product: Product
  location: InventoryLocation
  onSubmit: (quantity: number, notes: string) => Promise<void>
  onCancel: () => void
}

export default function StockAdjustmentModal({
  product,
  location,
  onSubmit,
  onCancel,
}: StockAdjustmentModalProps) {
  const [quantity, setQuantity] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currentStock = location === 'shop'
    ? product.shop_current_stock
    : product.production_current_stock

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const qty = parseInt(quantity)
    if (isNaN(qty) || qty === 0) {
      setError('Please enter a valid quantity')
      return
    }

    if (currentStock + qty < 0) {
      setError('Cannot reduce stock below 0')
      return
    }

    setLoading(true)
    try {
      await onSubmit(qty, notes)
    } catch (err: any) {
      setError(err.message || 'Failed to adjust stock')
      setLoading(false)
    }
  }

  const newStock = currentStock + (parseInt(quantity) || 0)

  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
  const labelClass = "block text-xs font-bold text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm w-full max-w-sm" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
          <h2 className="text-white font-black text-lg">Adjust Stock</h2>
          <p className="text-white text-xs opacity-50 mt-0.5 capitalize">{location} — {product.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Current stock display */}
          <div className="rounded-sm px-4 py-3" style={{ backgroundColor: '#220901' }}>
            <p className="text-white text-xs opacity-50">Current Stock</p>
            <p className="text-white font-black text-2xl">{currentStock}</p>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-sm text-xs font-semibold text-white bg-red-500">{error}</div>
          )}

          <div>
            <label className={labelClass}>Quantity Change *</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g., 10 or -5"
              className={inputClass}
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Enter positive to add, negative to remove</p>
          </div>

          {/* New stock preview */}
          {quantity && (
            <div className="rounded-sm px-4 py-3" style={{ backgroundColor: '#220901' }}>
              <p className="text-white text-xs opacity-50">New Stock Level</p>
              <p className={`font-black text-2xl ${newStock < 0 ? 'text-red-400' : 'text-green-400'}`}>{newStock}</p>
            </div>
          )}

          <div>
            <label className={labelClass}>Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason for adjustment..."
              className={inputClass}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !quantity}
              className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
              style={{ backgroundColor: '#3B82F6' }}
            >
              {loading ? 'Adjusting...' : 'Confirm Adjustment'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-sm border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
