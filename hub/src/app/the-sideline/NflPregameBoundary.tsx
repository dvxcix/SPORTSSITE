'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { nflKickoffAt } from './kickoff'
import type { SidelineGame } from './types'

/** Refresh the server-rendered research once when an open tab crosses kickoff. */
export function NflPregameBoundary({ game, wasOpen }: { game: SidelineGame; wasOpen: boolean }) {
  const router = useRouter(), kickoff = nflKickoffAt(game)?.getTime()
  useEffect(() => {
    if (kickoff == null || !wasOpen) return
    let refreshed = false
    const refresh = () => {
      if (!refreshed && document.visibilityState !== 'hidden' && Date.now() >= kickoff) {
        refreshed = true; router.refresh()
      }
    }
    const timer = window.setTimeout(refresh, Math.max(0, Math.min(2_147_483_647, kickoff - Date.now() + 100)))
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [game.id, kickoff, router, wasOpen])
  return null
}
