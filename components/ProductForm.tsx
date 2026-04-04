'use client'

import { useState, useEffect } from 'react'
import type { Product, Category } from '@/lib/supabase'
import { getAllCategories } from '@/lib/products'

interface ProductFormProps {
  product?: Product
  onSubmit: (data: ProductFormData) => Promise<void>
  onCancel: () => void
}

export interface ProductFormData {
  name: string
  category_id: string
  price: number
  description: string
  shop_minimum_threshold: number
  production_minimum_threshold: number
  shop_current_stock: number
  production_current_stock: number
}

const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
const labelClass = "block text-xs font-bold text-gray-500 mb-1"

export default function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<ProductFormData>({
    name: product?.name || '',
    category_id: product?.category_id || '',
    price: product?.price || 0,
    description: product?.description || '',
    shop_minimum_threshold: product?.shop_minimum_threshold || 10,
    production_minimum_threshold: product?.production_minimum_threshold || 20,
    shop_current_stock: product?.shop_current_stock || 0,
    production_current_stock: product?.production_current_stock || 0,
  })

  useEffect(() => { loadCategories() }, [])

  async function loadCategories() {
    try {
      const data = await getAllCategories()
      setCategories(data)
      if (!formData.category_id && data.length > 0) {
        setFormData(prev => ({ ...prev, category_id: data[0].id }))
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try { await onSubmit(formData) }
    catch {}
    finally { setLoading(false) }
  }

  function field(key: keyof ProductFormData, value: string | number) {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Name */}
      <div className="md:col-span-2">
        <label className={labelClass}>Product Name *</label>
        <input type="text" value={formData.name} onChange={e => field('name', e.target.value)}
          required className={inputClass} placeholder="e.g., Chocolate Cake" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category */}
        <div>
          <label className={labelClass}>Category *</label>
          <select value={formData.category_id} onChange={e => field('category_id', e.target.value)}
            required className={inputClass}>
            <option value="">Select a category</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>

        {/* Price */}
        <div>
          <label className={labelClass}>Price (₱) *</label>
          <input type="number" step="0.01" min="0" value={formData.price}
            onChange={e => field('price', parseFloat(e.target.value))}
            required className={inputClass} placeholder="0.00" />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea value={formData.description} onChange={e => field('description', e.target.value)}
          rows={3} className={inputClass} placeholder="Product description..." />
      </div>

      {/* Shop Inventory */}
      <div className="rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 8px rgba(0,0,0,0.1)' }}>
        <div className="px-4 py-3" style={{ backgroundColor: '#1a2340' }}>
          <p className="text-white font-black text-sm">🏪 Shop Inventory</p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50">
          <div>
            <label className={labelClass}>Current Stock</label>
            <input type="number" min="0" value={formData.shop_current_stock}
              onChange={e => field('shop_current_stock', parseInt(e.target.value))}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Minimum Threshold</label>
            <input type="number" min="0" value={formData.shop_minimum_threshold}
              onChange={e => field('shop_minimum_threshold', parseInt(e.target.value))}
              className={inputClass} />
          </div>
        </div>
      </div>

      {/* Production Inventory */}
      <div className="rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 8px rgba(0,0,0,0.1)' }}>
        <div className="px-4 py-3" style={{ backgroundColor: '#220901' }}>
          <p className="text-white font-black text-sm">🏭 Production Inventory</p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50">
          <div>
            <label className={labelClass}>Current Stock</label>
            <input type="number" min="0" value={formData.production_current_stock}
              onChange={e => field('production_current_stock', parseInt(e.target.value))}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Minimum Threshold</label>
            <input type="number" min="0" value={formData.production_minimum_threshold}
              onChange={e => field('production_minimum_threshold', parseInt(e.target.value))}
              className={inputClass} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: '#1a2340' }}>
          {loading ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-6 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  )
}
