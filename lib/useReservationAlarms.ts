'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getCurrentUser, getUserProfile } from '@/lib/auth'
import { getUpcomingReservations, markReservationReady, type ReservationWithDetails } from '@/lib/reservations'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

// Starts this many minutes before pickup...
const ALARM_LEAD_MINUTES = 20
// ...and stops this many minutes after (so old, forgotten orders don't ring forever).
const ALARM_GRACE_MINUTES = 60
const ALARM_REPEAT_MS = 5000
const DISMISSED_KEY = 'dismissed-reservation-alarms'
const CLOCK_TICK_MS = 15000

export function useReservationAlarms() {
  const pathname = usePathname()
  const [enabled, setEnabled] = useState(false) // only true once we know the SIGNED-IN user is 'production'
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [soundReady, setSoundReady] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Re-check on every route change (not just once on mount) — this is what makes the
  // alarm disappear immediately on logout instead of surviving with stale state on /login.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const user = await getCurrentUser()
      if (cancelled) return
      if (!user) { setEnabled(false); return }
      const profile = await getUserProfile(user.id)
      if (cancelled) return
      setEnabled(profile?.role === 'production')
    })()
    return () => { cancelled = true }
  }, [pathname])

  async function loadReservations() {
    try {
      const data = await getUpcomingReservations()
      setReservations(data)
    } catch {
      // Silently skip — a reservations hiccup shouldn't break whatever page this is mounted on.
    }
  }

  useEffect(() => {
    if (!enabled) { setReservations([]); return }
    loadReservations()
  }, [enabled])

  useRealtimeRefresh(enabled ? ['reservations'] : [], loadReservations)

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    try {
      const raw = localStorage.getItem(DISMISSED_KEY)
      if (raw) setDismissedIds(JSON.parse(raw))
    } catch {}
  }, [enabled])

  // Browsers only allow sound after a user gesture — unlock on first click/keypress anywhere.
  useEffect(() => {
    if (!enabled) return
    function unlockAudio() {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (!Ctx) return
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
        audioCtxRef.current.resume().then(() => {
          setSoundReady(audioCtxRef.current?.state === 'running')
        })
      } catch {}
    }
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [enabled])

  const leadMs = ALARM_LEAD_MINUTES * 60 * 1000
  const graceMs = ALARM_GRACE_MINUTES * 60 * 1000

  const activeAlarms = enabled
    ? reservations.filter(r => {
        if (r.status !== 'pending' || !r.needed_by) return false
        if (dismissedIds.includes(r.id)) return false
        const diff = new Date(r.needed_by).getTime() - now
        return diff <= leadMs && diff >= -graceMs
      })
    : []
  const hasActiveAlarm = activeAlarms.length > 0

  useEffect(() => {
    if (!hasActiveAlarm || !soundReady) return

    function playAlarmBeep() {
      const ctx = audioCtxRef.current
      if (!ctx || ctx.state !== 'running') return
      const start = ctx.currentTime
      ;[0, 0.35, 0.7].forEach(offset => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, start + offset)
        gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.25)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start + offset)
        osc.stop(start + offset + 0.3)
      })
    }

    playAlarmBeep()
    const id = setInterval(playAlarmBeep, ALARM_REPEAT_MS)
    return () => clearInterval(id)
  }, [hasActiveAlarm, soundReady])

  async function markReady(reservationId: string) {
    setMarkingId(reservationId)
    try {
      await markReservationReady(reservationId)
      await loadReservations()
    } finally {
      setMarkingId(null)
    }
  }

  function dismiss(reservationId: string) {
    const next = [...dismissedIds, reservationId].slice(-200)
    setDismissedIds(next)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)) } catch {}
  }

  return { enabled, activeAlarms, now, soundReady, markingId, markReady, dismiss }
}