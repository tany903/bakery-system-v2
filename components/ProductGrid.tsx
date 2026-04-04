'use client'

import { useState } from 'react'
import type { Product } from '@/lib/supabase'

interface ProductGridProps {
  products: (Product & { categories?: { name: string } })[]
  categories: { id: string; name: string }[]
  onAddToCart: (product: Product) => void
}

export default function ProductGrid({ products, categories, onAddToCart }: ProductGridProps) {
  const [activeCategory, setActiveCategory] = useState('all')

  const filtered = activeCategory === 'all'
    ? products
    : products.filter(p => p.categories?.name === activeCategory)

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap shrink-0">
        <button
          onClick={() => setActiveCategory('all')}
          className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
          style={activeCategory === 'all'
            ? { backgroundColor: '#1a2340', color: 'white' }
            : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
          }
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.name)}
            className="px-4 py-1.5 rounded-sm text-xs font-bold transition-colors"
            style={activeCategory === cat.name
              ? { backgroundColor: '#1a2340', color: 'white' }
              : { backgroundColor: 'white', color: '#374151', boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }
            }
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto pb-2">
        {filtered.length === 0 ? (
          <div className="col-span-4 flex flex-col items-center justify-center py-16 text-gray-500">
            <div className="text-4xl mb-2">🔍</div>
            <p className="font-semibold text-sm">No products in this category</p>
          </div>
        ) : (
          filtered.map((product) => {
            const outOfStock = product.shop_current_stock === 0
            const lowStock = !outOfStock && product.shop_current_stock < product.shop_minimum_threshold
            return (
              <button
                key={product.id}
                onClick={() => onAddToCart(product)}
                disabled={outOfStock}
                className="text-left rounded-sm p-4 transition-all disabled:cursor-not-allowed flex flex-col"
                style={{
                  backgroundColor: 'white',
                  boxShadow: '2px 2px 8px rgba(0,0,0,0.15)',
                  opacity: outOfStock ? 0.5 : 1,
                }}
              >
                {/* Product name */}
                <p className="font-black text-gray-900 text-sm leading-tight mb-1">{product.name}</p>

                {/* Category */}
                {product.categories && (
                  <p className="text-xs text-gray-400 mb-2">{product.categories.name}</p>
                )}

                {/* Price */}
                <p className="text-xl font-black mb-2" style={{ color: '#7B1111' }}>
                  ₱{product.price.toFixed(2)}
                </p>

                {/* Stock */}
                <p className={`text-xs font-bold mt-auto ${
                  outOfStock ? 'text-red-500' : lowStock ? 'text-orange-500' : 'text-green-600'
                }`}>
                  {outOfStock ? 'Out of Stock' : `Stock: ${product.shop_current_stock}`}
                </p>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
