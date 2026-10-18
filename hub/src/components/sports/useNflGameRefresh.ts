'use client'
import { useEffect, useState } from 'react'
import type { ESPNGame, ESPNSummary } from '@slipsurge/core/espn-api'
import type { NflQuarterRow } from '@/lib/nflGameCenter'

type Center = { game: ESPNGame; summary: ESPNSummary; quarters: NflQuarterRow[]; date: string; updatedAt: string | null; complete: boolean }

export function useNflGameRefresh(gameId: string, enabled: boolean, initialState?: string, initialComplete = false) {
  const [snapshot, setSnapshot] = useState<Center | null>(null)
  const current = snapshot?.game.id === gameId ? snapshot : null
  const completed = (current?.game.status.type.state ?? initialState) === 'post' && (current?.complete ?? initialComplete)
  useEffect(() => {
    if (!enabled || completed) return
    let active = true
    let pending: AbortController | null = null
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || pending) return
      const controller = new AbortController()
      pending = controller
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const response = await fetch(`/api/sports/nfl/${encodeURIComponent(gameId)}`, { signal: controller.signal })
        if (!response.ok) return
        const next = await response.json() as Center
        if (active && next.game?.id === gameId && next.summary?.header?.id === gameId) setSnapshot(next)
      } catch { /* Keep the last successful board during temporary outages. */ }
      finally { clearTimeout(timeout); pending = null }
    }
    const timer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; clearInterval(timer); pending?.abort(); document.removeEventListener('visibilitychange', refresh) }
  }, [gameId, enabled, completed])
  return current
}
