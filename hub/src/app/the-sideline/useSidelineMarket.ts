'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineOddsFrame } from './types'
import { unpackSidelineBoard, type PackedOdds } from '@/lib/sidelineWire'

export function useSidelineMarket(gameId: string, initialOdds: SidelineOddsBoard) {
  const [current, setCurrent] = useState(initialOdds)
  const [times, setTimes] = useState<string[]>([])
  const [selectedAt, setSelectedAt] = useState<string | null>(null)
  const [frame, setFrame] = useState<SidelineOddsFrame | null>(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const cache = useRef(new Map<string, SidelineOddsFrame>())
  const inFlight = useRef(new Map<string, Promise<SidelineOddsFrame>>())
  const slots = useRef({ active: 0, waiting: [] as (() => void)[] })
  const loadFrame = useCallback((at: string, foreground = true) => {
    const cached = cache.current.get(at)
    if (cached) return Promise.resolve(cached)
    const pending = inFlight.current.get(at)
    if (pending) return pending
    const acquire = new Promise<void>(resolve => {
      if (slots.current.active < 3) { slots.current.active++; resolve() }
      else if (foreground) slots.current.waiting.unshift(resolve)
      else slots.current.waiting.push(resolve)
    })
    const request = acquire.then(() => fetch('/the-sideline/market?packed=1&game=' + encodeURIComponent(gameId) + '&at=' + encodeURIComponent(at), {
      signal: AbortSignal.timeout(20000),
    })).then(async response => {
      if (!response.ok) throw new Error('Capture unavailable')
      const data = await response.json() as { frame: (Omit<SidelineOddsFrame,'board'> & {board:SidelineOddsBoard|PackedOdds}) | null }
      if (!data.frame) throw new Error('No odds at this capture')
      const frame={...data.frame,board:unpackSidelineBoard(data.frame.board)}
      cache.current.set(at, frame)
      // Bound memory without throwing away a stop every few slider movements.
      if (cache.current.size > 32) cache.current.delete(cache.current.keys().next().value!)
      return frame
    }).finally(() => {
      inFlight.current.delete(at)
      const next = slots.current.waiting.shift()
      if (next) next()
      else slots.current.active--
    })
    inFlight.current.set(at, request)
    return request
  }, [gameId])
  const timeline = useMemo(() => [...new Set([
    ...times,
    ...(current.capturedAt ? [new Date(current.capturedAt).toISOString()] : []),
    ...(current.picksCapturedAt ? [new Date(current.picksCapturedAt).toISOString()] : []),
  ])].sort(), [times, current.capturedAt, current.picksCapturedAt])
  const index = selectedAt == null ? Math.max(0, timeline.length - 1) : Math.max(0, timeline.indexOf(selectedAt))

  useEffect(() => {
    const controller = new AbortController()
    const update = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
        const base = '/the-sideline/market?packed=1&game=' + encodeURIComponent(gameId)
        const [indexResponse, currentResponse] = await Promise.all([
          fetch(base + '&index=1', { signal }), fetch(base, { signal }),
        ])
        if (!indexResponse.ok || !currentResponse.ok) throw new Error('Refresh unavailable')
        const [indexData, currentData] = await Promise.all([indexResponse.json(), currentResponse.json()])
        if (controller.signal.aborted) return
        setTimes(previous => { const next: string[]=indexData.timeline ?? []; return previous.length===next.length && previous.every((at,i)=>at===next[i]) ? previous : next })
        if (currentData.odds) { const next=unpackSidelineBoard(currentData.odds); setCurrent(previous => JSON.stringify(previous)===JSON.stringify(next) ? previous : next) }
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
    let active = true
    void (async () => {
      try {
        const loaded = await loadFrame(selectedAt)
        if (active) setFrame(loaded)
      } catch {
        if (active) setError('That capture could not load. Showing the previous board; retry or choose another stop.')
      }
    })()
    return () => { active = false }
  }, [loadFrame, selectedAt, refreshKey])

  // Warm nearby stops before the user reaches them. Two workers keep this bounded;
  // foreground requests share the same promise instead of repeating a DB read.
  useEffect(() => {
    let active = true
    const queue = [timeline[0], ...Array.from({ length: 12 }, (_, offset) => [timeline[index - offset - 1], timeline[index + offset + 1]]).flat()]
      .filter((at): at is string => Boolean(at) && !cache.current.has(at))
    const worker = async () => {
      while (active && queue.length) {
        const at = queue.shift()!
        try { await loadFrame(at, false) } catch { /* Explicit selection supplies retry UI. */ }
      }
    }
    void worker(); void worker()
    return () => { active = false }
  }, [timeline, index, loadFrame])

  const select = useCallback((next: number) => {
    setError('')
    const at = next === timeline.length - 1 ? null : timeline[next] ?? null
    if (at) {
      const cached = cache.current.get(at)
      if (cached) setFrame(cached)
    }
    setSelectedAt(at)
  }, [timeline])
  const retry = () => { setError(''); setRefreshKey(value => value + 1) }
  const board = selectedAt == null ? current : frame?.board ?? current
  return {
    board, current, timeline, index, select, retry, error,
    loading: selectedAt != null && frame?.capturedAt !== selectedAt && !error,
    capturedAt: selectedAt == null ? current.capturedAt : frame?.capturedAt ?? current.capturedAt,
  }
}
