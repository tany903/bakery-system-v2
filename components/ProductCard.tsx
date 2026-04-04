'use client'

import type { Product } from '@/lib/supabase'

interface ProductCardProps {
  product: Product & { categories?: { name: string } }
  onEdit: (product: Product) => void
  onArchive: (id: string) => void
}

export default function ProductCard({ product, onEdit, onArchive }: ProductCardProps) {
  if (!product) return null

  const shopLow = product.shop_current_stock < product.shop_minimum_threshold
  const prodLow = product.production_current_stock < product.production_minimum_threshold
  const isLowStock = shopLow || prodLow

  return (
    <div className="bg-white rounded-sm overflow-hidden flex flex-col"
      style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>

      {/* Dark header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#031947' }}>
        <div className="flex items-center gap-2 truncate">
          <span className="text-white font-black text-sm">{product.name}</span>
          {product.categories?.name && (
            <span className="text-white text-xs opacity-50">{product.categories.name}</span>
          )}
        </div>
        <span className="text-white font-black text-sm shrink-0 ml-3">₱{product.price.toFixed(2)}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 flex flex-col gap-3 flex-1">

        {/* Description */}
        {product.description && (
          <p className="text-sm text-gray-500">{product.description}</p>
        )}

        {/* Stock boxes */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-sm px-3 py-2 bg-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Shop Stock</p>
            <p className={`text-2xl font-black ${shopLow ? 'text-red-500' : 'text-green-600'}`}>
              {product.shop_current_stock}
            </p>
            <p className="text-xs text-gray-400">Min: {product.shop_minimum_threshold}</p>
          </div>
          <div className="flex-1 rounded-sm px-3 py-2 bg-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Production Stock</p>
            <p className={`text-2xl font-black ${prodLow ? 'text-red-500' : 'text-green-600'}`}>
              {product.production_current_stock}
            </p>
            <p className="text-xs text-gray-400">Min: {product.production_minimum_threshold}</p>
          </div>
        </div>

        {/* Low stock alert */}
        {isLowStock && (
          <div className="px-3 py-2 rounded-sm text-sm font-semibold text-red-600"
            style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
            Low stock alert!
          </div>
        )}

        <div className="flex-1" />

        {/* Buttons */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button onClick={() => onEdit(product)}
            className="flex-1 text-xs font-bold py-2 rounded-sm text-white"
            style={{ backgroundColor: '#1a2340' }}>
            Edit
          </button>
          <button onClick={() => { if (confirm(`Archive ${product.name}?`)) onArchive(product.id) }}
            className="flex-1 text-xs font-bold py-2 rounded-sm text-white bg-gray-500 hover:bg-gray-600">
            Archive
          </button>
        </div>
      </div>
    </div>
  )
}
