'use client'

import type { IngredientWithCategory } from '@/lib/ingredients'

interface IngredientCardProps {
  ingredient: IngredientWithCategory
  onAdjustStock?: (id: string) => void
  onEdit?: (id: string) => void
  onArchive?: (id: string) => void
}

export default function IngredientCard({
  ingredient,
  onAdjustStock,
  onEdit,
  onArchive,
}: IngredientCardProps) {
  const isLowStock = ingredient.current_stock < ingredient.minimum_threshold
  const stockPercentage = Math.min((ingredient.current_stock / ingredient.minimum_threshold) * 100, 100)

  return (
    <div className="bg-white rounded-sm overflow-hidden flex flex-col"
      style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
        <div className="truncate pr-2">
          <p className="text-white font-black text-sm">{ingredient.name}</p>
          {ingredient.ingredient_categories && (
            <p className="text-white text-xs opacity-50">{ingredient.ingredient_categories.name}</p>
          )}
        </div>
        {isLowStock && (
          <span className="text-xs font-bold px-3 py-1 rounded-full text-white shrink-0"
            style={{ backgroundColor: '#F5A623' }}>
            Low Stock
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4 flex flex-col gap-3 flex-1">

        {/* Stock numbers */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-sm px-3 py-2" style={{ backgroundColor: isLowStock ? '#FFF7ED' : '#F9FAFB' }}>
            <p className="text-xs text-gray-500 mb-0.5">Current Stock</p>
            <p className={`text-2xl font-black ${isLowStock ? 'text-orange-500' : 'text-gray-900'}`}>
              {ingredient.current_stock}
              <span className="text-xs font-medium text-gray-400 ml-1">{ingredient.unit}</span>
            </p>
          </div>
          <div className="flex-1 rounded-sm px-3 py-2 bg-gray-50">
            <p className="text-xs text-gray-500 mb-0.5">Minimum</p>
            <p className="text-2xl font-black text-gray-400">
              {ingredient.minimum_threshold}
              <span className="text-xs font-medium text-gray-400 ml-1">{ingredient.unit}</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Stock level</span>
            <span>{stockPercentage.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${stockPercentage}%`,
                backgroundColor: isLowStock ? '#F5A623' : '#10B981',
              }}
            />
          </div>
        </div>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
          {onAdjustStock && (
            <button onClick={() => onAdjustStock(ingredient.id)}
              className="w-full py-2 rounded-sm text-xs font-bold text-white"
              style={{ backgroundColor: '#1a2340' }}>
              Adjust Stock
            </button>
          )}
          {(onEdit || onArchive) && (
            <div className="flex gap-2">
              {onEdit && (
                <button onClick={() => onEdit(ingredient.id)}
                  className="flex-1 py-2 rounded-sm text-xs font-bold text-white bg-gray-400 hover:bg-gray-500 transition-colors">
                  Edit
                </button>
              )}
              {onArchive && (
                <button onClick={() => onArchive(ingredient.id)}
                  className="flex-1 py-2 rounded-sm text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">
                  Archive
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
