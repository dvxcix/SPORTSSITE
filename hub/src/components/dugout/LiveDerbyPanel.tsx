'use client'

import { useEffect, useState } from 'react'
import type { DerbyPlayer } from './HrDerbyTable'
import { LiveDerbyTracker, type LiveStatus } from './LiveDerbyTracker'
import { LiveCashedProps } from './LiveCashedProps'
import type { LiveHr } from '@/lib/hrDerbyLiveCash'

// One shared poll (every 30s while the derby is actually live) feeds both
// the leaderboard tracker and the cashed-props list below, instead of each
// hitting the Savant proxy on its own timer.
export function LiveDerbyPanel({ players }: { players: DerbyPlayer[] }) {
  const [status, setStatus] = useState<LiveStatus>(null)
  const [hrs, setHrs] = useState<LiveHr[]>([])

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/dugout/hr-derby-live')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setStatus(data.status)
        setHrs(data.hrs ?? [])
      } catch {}
    }
    poll()
    const id = setInterval(poll, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <>
      <LiveCashedProps hrs={hrs} players={players} status={status} />
      <LiveDerbyTracker players={players} status={status} hrs={hrs} />
    </>
  )
}
