'use client'

import { useEffect, useState } from 'react'
import type { DerbyPlayer } from './HrDerbyTable'
import { HrDerbyTable } from './HrDerbyTable'
import { HrDerbyOddsPanel } from './HrDerbyOddsPanel'
import { LiveDerbyTracker, type LiveStatus } from './LiveDerbyTracker'
import { LiveCashedProps } from './LiveCashedProps'
import type { LiveHr } from '@/lib/hrDerbyLiveCash'

// One shared poll (every 30s while the derby is actually live) feeds the
// leaderboard tracker, the cashed-props list, and every row's won/lost
// highlight in the odds panel below — instead of each hitting the Savant
// proxy on its own timer.
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
      <HrDerbyTable players={players} />
      <HrDerbyOddsPanel players={players} hrs={hrs} status={status} />
    </>
  )
}
