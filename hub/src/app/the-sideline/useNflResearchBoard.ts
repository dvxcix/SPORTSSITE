'use client'

import { useEffect, useMemo, useState } from 'react'
import { withoutNflCurrentMarkets } from '@/lib/nflAvailability'
import { startNflPolling } from '@/lib/nflPolling'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'

/** Independent expiry: successful clock polls cannot keep old eligibility alive. */
export function useNflAvailabilityBoard(board: SidelineOddsBoard) {
  const [expired, setExpired] = useState<SidelineOddsBoard | null>(null)
  useEffect(() => {
    if (board === expired) return
    const cutoff = Date.parse(board.availabilityCutoffAt ?? ''), observed = Date.parse(board.availabilityObservedAt ?? ''), now = Date.now()
    // Historical research keeps the game-scoped evidence observed before kickoff.
    if (!Number.isFinite(cutoff) || now >= cutoff) return
    const expires = Number.isFinite(observed) ? observed + 90000 : now
    if (expires >= cutoff) return
    const timer = setTimeout(() => setExpired(board), Math.max(0, Math.min(expires - now, 2147000000)))
    return () => clearTimeout(timer)
  }, [board, expired])
  return useMemo(() => board === expired || board.availabilityStale ? withoutNflCurrentMarkets(board) : board, [board, expired])
}

/** Reuse the existing visible/online polling policy for every matchup research tool. */
export function useNflResearchBoard(initialBoard: SidelineOddsBoard, gameId?: string) {
  const [observed, setObserved] = useState(initialBoard)
  useEffect(() => {
    if (!gameId) return
    const controller = new AbortController()
    const stop = startNflPolling(async signal => {
      const response = await fetch(`/the-sideline/market?game=${encodeURIComponent(gameId)}&summary=1`, {
        cache: 'no-store', signal: AbortSignal.any([controller.signal, signal]),
      })
      if (!response.ok) throw new Error('Research refresh unavailable')
      const next = await response.json() as { odds?: SidelineOddsBoard }
      if (!Array.isArray(next.odds?.players)) throw new Error('Research refresh unavailable')
      if (!controller.signal.aborted) setObserved(next.odds!)
    })
    return () => { controller.abort(); stop() }
  }, [gameId])
  return useNflAvailabilityBoard(observed)
}
