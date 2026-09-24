'use client'

import { useState } from 'react'
import { useReservationAlarms } from '@/lib/useReservationAlarms'
import type { ReservationWithDetails } from '@/lib/reservations'

const MAX_VISIBLE = 3

function formatPickupTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

function describeDue(neededBy: string, now: number): { label: string; color: string; bg: string } {
  const diffMs = new Date(neededBy).getTime() - now
  if (diffMs < 0) {
    const overdueMin = Math.max(1, Math.floor(-diffMs / 60000))
    return { label: `Overdue ${overdueMin}m`, color: '#DC2626', bg: '#FEE2E2' }
  }
  const minutes = Math.ceil(diffMs / 60000)
  return { label: `Due in ${minutes}m`, color: '#D97706', bg: '#FEF3C7' }
}

function summarizeItems(order: ReservationWithDetails): string {
  return (order.items || []).map(i => `${i.quantity}× ${i.product_name_snapshot}`).join(', ')
}

export default function ReservationAlarmToast() {
  const { enabled, activeAlarms, now, soundReady, markingId, markReady, dismiss } = useReservationAlarms()
  const [expanded, setExpanded] = useState(false)

  if (!enabled || activeAlarms.length === 0) return null

  const visible = expanded ? activeAlarms : activeAlarms.slice(0, MAX_VISIBLE)
  const hiddenCount = activeAlarms.length - visible.length

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 items-end"
      style={{ maxWidth: 340, width: '90vw' }}
    >
      {!soundReady && (
        <div
          className="text-[11px] font-semibold px-3 py-1.5 rounded-sm text-white self-stretch text-center"
          style={{ backgroundColor: '#92400E' }}
        >
          🔇 Click anywhere to enable alarm sound
        </div>
      )}

      {visible.map(order => {
        const due = describeDue(order.needed_by as string, now)
        return (
          <div
            key={order.id}
            className="bg-white rounded-sm w-full overflow-hidden"
            style={{ boxShadow: '2px 2px 14px rgba(0,0,0,0.35)', border: '1px solid #7B1111' }}
          >
            <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: '#7B1111' }}>
              <span className="text-sm">🔔</span>
              <p className="text-white text-xs font-black truncate flex-1">{order.customer_name}</p>
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: due.bg, color: due.color }}
              >
                {due.label}
              </span>
            </div>
            <div className="px-3 py-2">
              <p className="text-[11px] text-gray-500 font-semibold">
                Pickup {formatPickupTime(order.needed_by as string)}
              </p>
              <p className="text-xs text-gray-800 font-semibold mt-0.5 line-clamp-2">{summarizeItems(order)}</p>
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => markReady(order.id)}
                  disabled={markingId === order.id}
                  className="flex-1 py-1 rounded-sm font-bold text-white text-[11px] disabled:opacity-50"
                  style={{ backgroundColor: '#10B981' }}
                >
                  {markingId === order.id ? 'Saving...' : 'Mark Ready'}
                </button>
                <button
                  onClick={() => dismiss(order.id)}
                  className="px-2.5 py-1 rounded-sm border border-gray-300 text-gray-700 text-[11px] font-semibold hover:bg-gray-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[11px] font-bold px-3 py-1 rounded-sm text-white self-stretch"
          style={{ backgroundColor: '#220901' }}
        >
          +{hiddenCount} more order{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}