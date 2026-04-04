'use client'

import type { ProductionWithDetails } from '@/lib/production'

interface ProductionRecordCardProps {
  record: ProductionWithDetails
}

export default function ProductionRecordCard({ record }: ProductionRecordCardProps) {
  return (
    <div className="bg-white rounded-lg shadow border-2 border-gray-200 p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{record.products.name}</h3>
          <p className="text-sm text-gray-600">
            {new Date(record.production_date).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-green-600">
            +{record.quantity_produced}
          </div>
          <div className="text-xs text-gray-600">units</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Produced By:</span>
          <span className="font-medium text-gray-900">
            {record.produced_by_profile?.full_name || 'Unknown'}
          </span>
        </div>

        {record.notes && (
          <div className="pt-2 border-t">
            <p className="text-sm text-gray-600 mb-1">Notes:</p>
            <p className="text-sm text-gray-900">{record.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}