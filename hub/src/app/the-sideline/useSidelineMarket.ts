'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineOddsFrame } from './types'

export function useSidelineMarket(gameId: string, initialOdds: SidelineOddsBoard) {
  const [current, setCurrent] = useState(initialOdds)
  const [times, setTimes] = useState<string[]>([])
  const [selectedAt, setSelectedAt] = useState<string | null>(null)
  const [frame, setFrame] = useState<SidelineOddsFrame | null>(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const cache = useRef(new Map<string, SidelineOddsFrame>())
  const timeline = useMemo(() => [...new Set([
    ...times,
    ...(current.capturedAt ? [new Date(current.capturedAt).toISOString()] : []),
    ...(current.pikkitCapturedAt ? [new Date(current.pikkitCapturedAt).toISOString()] : []),
  ])].sort(), [times, current.capturedAt, current.pikkitCapturedAt])
  const index = selectedAt == null ? Math.max(0, timeline.length - 1) : Math.max(0, timeline.indexOf(selectedAt))

  useEffect(() => {
    const controller = new AbortController()
    const update = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
        const base = '/the-sideline/market?game=' + encodeURIComponent(gameId)
        const [indexResponse, currentResponse] = await Promise.all([
          fetch(base + '&index=1', { signal }), fetch(base, { signal }),
        ])
        if (!indexResponse.ok || !currentResponse.ok) throw new Error('Refresh unavailable')
        const [indexData, currentData] = await Promise.all([indexResponse.json(), currentResponse.json()])
        if (controller.signal.aborted) return
        setTimes(indexData.timeline ?? [])
        if (currentData.odds) setCurrent(currentData.odds)
      } catch {
        if (!controller.signal.aborted) setError('Refresh unavailable. Showing the last loaded capture.')
      }
    }
    void update()
    const interval = window.setInterval(update, 30000)
    window.addEventListener('visibilitychange', update)
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('visibilitychange', update) }
  }, [gameId, refreshKey])

  useEffect(() => {
    if (!selectedAt) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const cached = cache.current.get(selectedAt)
        if (cached) { setFrame(cached); return }
        const response = await fetch('/the-sideline/market?game=' + encodeURIComponent(gameId) + '&at=' + encodeURIComponent(selectedAt), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        })
        if (!response.ok) throw new Error('Capture unavailable')
        const data = await response.json() as { frame: SidelineOddsFrame | null }
        if (!data.frame) throw new Error('No odds at this capture')
        if (controller.signal.aborted) return
        cache.current.set(selectedAt, data.frame)
        if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!)
        setFrame(data.frame)
      } catch {
        if (!controller.signal.aborted) setError('That capture could not load. Showing the previous board; retry or choose another stop.')
      }
    }, 150)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [gameId, selectedAt, refreshKey])

  const select = useCallback((next: number) => {
    setError('')
    setSelectedAt(next === timeline.length - 1 ? null : timeline[next] ?? null)
  }, [timeline])
  const retry = () => { setError(''); setRefreshKey(value => value + 1) }
  const board = selectedAt == null ? current : frame?.board ?? current
  return {
    board, current, timeline, index, select, retry, error,
    loading: selectedAt != null && frame?.capturedAt !== selectedAt && !error,
    capturedAt: selectedAt == null ? current.capturedAt : frame?.capturedAt ?? current.capturedAt,
  }
}
