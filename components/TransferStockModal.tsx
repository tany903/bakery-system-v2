'use client'

import { useState } from 'react'
import type { Product } from '@/lib/supabase'

interface TransferStockModalProps {
  product: Product
  onSubmit: (quantity: number, notes: string) => Promise<void>
  onCancel: () => void
}

export default function TransferStockModal({
  product,
  onSubmit,
  onCancel,
}: TransferStockModalProps) {
  const [quantity, setQuantity] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const qty = parseInt(quantity)
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid quantity')
      return
    }

    if (qty > product.production_current_stock) {
      setError('Not enough stock in production')
      return
    }

    setLoading(true)
    try {
      await onSubmit(qty, notes)
    } catch (err: any) {
      setError(err.message || 'Failed to transfer stock')
      setLoading(false)
    }
  }

  const qty = parseInt(quantity) || 0
  const newProductionStock = product.production_current_stock - qty
  const newShopStock = product.shop_current_stock + qty

  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
  const labelClass = "block text-xs font-bold text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-sm w-full max-w-sm" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
          <h2 className="text-white font-black text-lg">Transfer Stock</h2>
          <p className="text-white text-xs opacity-50 mt-0.5">{product.name} — Production → Shop</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Current stock display */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm px-4 py-3" style={{ backgroundColor: '#220901' }}>
              <p className="text-white text-xs opacity-50">Production</p>
              <p className="text-white font-black text-2xl">{product.production_current_stock}</p>
            </div>
            <div className="rounded-sm px-4 py-3" style={{ backgroundColor: '#220901' }}>
              <p className="text-white text-xs opacity-50">Shop</p>
              <p className="text-white font-black text-2xl">{product.shop_current_stock}</p>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-sm text-xs font-semibold text-white bg-red-500">{error}</div>
          )}

          <div>
            <label className={labelClass}>Quantity to Transfer *</label>
            <input
              type="number"
              min="1"
              max={product.production_current_stock}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={`Max: ${product.production_current_stock}`}
              className={inputClass}
              autoFocus
            />
          </div>

          {/* After transfer preview */}
          {quantity && qty > 0 && qty <= product.production_current_stock && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-sm px-4 py-3" style={{ backgroundColor: '#220901' }}>
                <p className="text-white text-xs opacity-50">Production After</p>
                <p className={`font-black text-2xl ${newProductionStock < product.production_minimum_threshold ? 'text-red-400' : 'text-green-400'}`}>
                  {newProductionStock}
                </p>
                <p className="text-white text-xs opacity-40">-{qty}</p>
              </div>
              <div className="rounded-sm px-4 py-3" style={{ backgroundColor: '#220901' }}>
                <p className="text-white text-xs opacity-50">Shop After</p>
                <p className="text-green-400 font-black text-2xl">{newShopStock}</p>
                <p className="text-white text-xs opacity-40">+{qty}</p>
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason for transfer..."
              className={inputClass}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !quantity || qty <= 0 || qty > product.production_current_stock}
              className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
              style={{ backgroundColor: '#10B981' }}
            >
              {loading ? 'Transferring...' : 'Confirm Transfer'}
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
