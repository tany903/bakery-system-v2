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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6">Transfer Stock</h2>

        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="text-sm text-gray-600 mb-2">Product</div>
          <div className="font-bold text-gray-900 mb-4">{product.name}</div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-600 mb-1">🏭 Production</div>
              <div className="text-2xl font-bold text-green-600">
                {product.production_current_stock}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">🏪 Shop</div>
              <div className="text-2xl font-bold text-blue-600">
                {product.shop_current_stock}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity to Transfer
            </label>
            <input
              type="number"
              min="1"
              max={product.production_current_stock}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              autoFocus
            />
            <div className="text-sm text-gray-500 mt-1">
              Maximum: {product.production_current_stock}
            </div>
          </div>

          {quantity && qty > 0 && qty <= product.production_current_stock && (
            <div className="border-2 border-blue-200 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-700 mb-3">After Transfer:</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600 mb-1">🏭 Production</div>
                  <div className="text-xl font-bold text-green-600">
                    {newProductionStock}
                  </div>
                  <div className="text-xs text-gray-500">
                    ({qty > 0 ? '-' : ''}{qty})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">🏪 Shop</div>
                  <div className="text-xl font-bold text-blue-600">
                    {newShopStock}
                  </div>
                  <div className="text-xs text-gray-500">
                    (+{qty})
                  </div>
                </div>
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
              rows={2}
              placeholder="Reason for transfer..."
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
              disabled={loading || !quantity || qty <= 0 || qty > product.production_current_stock}
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Transferring...' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}