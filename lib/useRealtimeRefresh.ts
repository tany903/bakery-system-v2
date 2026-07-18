'use client'
import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Subscribes to Postgres changes on one or more tables and calls `onChange`
 * whenever any row is inserted/updated/deleted. Use this to keep pages in
 * sync across tabs/devices without manual refreshing.
 *
 * Usage:
 *   useRealtimeRefresh(['products'], loadProducts)
 *   useRealtimeRefresh(['restock_requests', 'restock_request_items'], loadRequests)
 */
export function useRealtimeRefresh(tables: string[], onChange: () => void) {
  // keep the latest onChange without re-subscribing every render
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const channelName = `realtime-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`
    const channel = supabase.channel(channelName)

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onChangeRef.current()
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(',')])
}