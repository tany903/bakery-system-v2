'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
    return { label: `Overdue ${overdueMin}m`, color: '#DC2626', bg: 'rgba(254,226,226,0.9)' }
  }
  const minutes = Math.ceil(diffMs / 60000)
  return { label: `Due in ${minutes}m`, color: '#D97706', bg: 'rgba(254,243,199,0.9)' }
}

function summarizeItems(order: ReservationWithDetails): string {
  return (order.items || []).map(i => `${i.quantity}× ${i.product_name_snapshot}`).join(', ')
}

export default function ReservationAlarmToast() {
  const { enabled, activeAlarms, now, soundReady, markingId, markReady, dismiss } = useReservationAlarms()
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  // document.body only exists client-side — wait for mount before portaling
  useEffect(() => { setMounted(true) }, [])

  if (!mounted || !enabled || activeAlarms.length === 0) return null

  const visible = expanded ? activeAlarms : activeAlarms.slice(0, MAX_VISIBLE)
  const hiddenCount = activeAlarms.length - visible.length

  const content = (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
        maxWidth: 340,
        width: '90vw',
        zIndex: 2147483000,
        pointerEvents: 'none',
      }}
    >
      {!soundReady && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 4,
            color: 'white',
            alignSelf: 'stretch',
            textAlign: 'center',
            backgroundColor: 'rgba(146,64,14,0.95)',
            backdropFilter: 'blur(6px)',
            pointerEvents: 'auto',
          }}
        >
          🔇 Click anywhere to enable alarm sound
        </div>
      )}

      {visible.map(order => {
        const due = describeDue(order.needed_by as string, now)
        return (
          <div
            key={order.id}
            style={{
              borderRadius: 4,
              width: '100%',
              overflow: 'hidden',
              boxShadow: '2px 2px 18px rgba(0,0,0,0.45)',
              border: '1px solid #7B1111',
              backgroundColor: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', backgroundColor: 'rgba(123,17,17,0.92)' }}>
              <span style={{ fontSize: 14 }}>🔔</span>
              <p style={{ color: 'white', fontSize: 12, fontWeight: 900, flex: 1, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {order.customer_name}
              </p>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  flexShrink: 0,
                  backgroundColor: due.bg,
                  color: due.color,
                }}
              >
                {due.label}
              </span>
            </div>
            <div style={{ padding: '8px 12px' }}>
              <p style={{ fontSize: 11, color: '#4B5563', fontWeight: 600, margin: 0 }}>
                Pickup {formatPickupTime(order.needed_by as string)}
              </p>
              <p style={{ fontSize: 12, color: '#111827', fontWeight: 600, margin: '2px 0 0' }}>{summarizeItems(order)}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => markReady(order.id)}
                  disabled={markingId === order.id}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    borderRadius: 4,
                    fontWeight: 700,
                    color: 'white',
                    fontSize: 11,
                    border: 'none',
                    cursor: markingId === order.id ? 'default' : 'pointer',
                    opacity: markingId === order.id ? 0.5 : 1,
                    backgroundColor: '#10B981',
                  }}
                >
                  {markingId === order.id ? 'Saving...' : 'Mark Ready'}
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(order.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: '1px solid #9CA3AF',
                    color: '#1F2937',
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                  }}
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
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 4,
            color: 'white',
            alignSelf: 'stretch',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: 'rgba(34,9,1,0.92)',
            backdropFilter: 'blur(6px)',
            pointerEvents: 'auto',
          }}
        >
          +{hiddenCount} more order{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )

  return createPortal(content, document.body)
}