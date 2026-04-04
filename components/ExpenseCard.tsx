'use client'
import type { ExpenseWithCategory } from '@/lib/expenses'

interface ExpenseCardProps {
  expense: ExpenseWithCategory
  onEdit: (expense: ExpenseWithCategory) => void
  onDelete: (expense: ExpenseWithCategory) => void
}

export default function ExpenseCard({ expense, onEdit, onDelete }: ExpenseCardProps) {
  const formattedDate = new Date(expense.expense_date).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
  const categoryName = expense.expense_categories?.name || 'Uncategorized'

  return (
    <div className="bg-white rounded-sm overflow-hidden flex flex-col" style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.2)' }}>

      {/* Card header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#220901' }}>
        <div className="truncate pr-2">
          <p className="text-white font-black text-sm truncate">{expense.name}</p>
          <p className="text-white text-xs opacity-50">{categoryName}</p>
        </div>
        <span className="text-xs font-bold px-3 py-1 rounded-full text-white shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
          {categoryName}
        </span>
      </div>

      <div className="px-4 py-4 flex flex-col gap-3 flex-1">

        {/* Amount */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">Amount</span>
          <span className="text-2xl font-black text-red-500">
            ₱{Number(expense.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Date */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">Date</span>
          <span className="text-xs font-semibold text-gray-700">📅 {formattedDate}</span>
        </div>

        {/* Notes */}
        {expense.notes && (
          <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2 leading-relaxed">
            {expense.notes}
          </p>
        )}

        {/* Recorded by */}
        <p className="text-xs text-gray-400">
          By: <span className="font-semibold">{expense.recorded_by_profile?.full_name || 'Unknown'}</span>
        </p>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button onClick={() => onEdit(expense)}
            className="flex-1 text-xs font-bold py-1.5 rounded-sm text-white"
            style={{ backgroundColor: '#1a2340' }}>
            Edit
          </button>
          <button onClick={() => onDelete(expense)}
            className="flex-1 text-xs font-bold py-1.5 rounded-sm text-white"
            style={{ backgroundColor: '#EF4444' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
