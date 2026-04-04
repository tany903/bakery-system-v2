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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6">Adjust Stock</h2>

        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="text-sm text-gray-600 mb-2">Product</div>
          <div className="font-bold text-gray-900">{product.name}</div>
          <div className="text-sm text-gray-600 mt-2">Location</div>
          <div className="font-medium text-gray-900 capitalize">{location}</div>
          <div className="text-sm text-gray-600 mt-2">Current Stock</div>
          <div className="text-2xl font-bold text-blue-600">{currentStock}</div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity Change
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g., 10 or -5"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              autoFocus
            />
            <div className="text-sm text-gray-500 mt-1">
              Enter positive numbers to add, negative to remove
            </div>
          </div>

          {quantity && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <div className="text-sm text-gray-600">New Stock Level</div>
              <div className={`text-3xl font-bold ${newStock < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {newStock}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Reason for adjustment..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <div className="flex space-x-4 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !quantity}
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adjusting...' : 'Adjust Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}