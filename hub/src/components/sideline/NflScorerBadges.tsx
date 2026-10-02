'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { NflTouchdownEvent } from '@/lib/nflTouchdownFeed'
import { nflScorerBadge, type ScorerIdentity } from '@/lib/nflScorerBadges'
import { startNflPolling } from '@/lib/nflPolling'

const Scorers = createContext<{ gameId: string; events: readonly NflTouchdownEvent[] }>({ gameId: '', events: [] })

export function NflScorerProvider({ gameId, events, children }: { gameId: string; events: readonly NflTouchdownEvent[]; children: ReactNode }) {
  const value = useMemo(() => ({ gameId, events }), [gameId, events])
  return <Scorers.Provider value={value}>{children}</Scorers.Provider>
}

/** Cheatsheets refresh only the shared cached scoring feed, not odds/history. */
export function LiveNflScorerProvider({ gameId, events: initial, children }: { gameId: string; events: NflTouchdownEvent[]; children: ReactNode }) {
  const [events, setEvents] = useState(initial)
  useEffect(() => startNflPolling(async signal => {
    const response = await fetch('/the-sideline/market?touchdowns=1&game=' + encodeURIComponent(gameId), { signal })
    if (!response.ok) throw new Error('Scoring refresh unavailable')
    const data = await response.json()
    if (Array.isArray(data.touchdowns)) setEvents(data.touchdowns)
  }), [gameId])
  return <NflScorerProvider gameId={gameId} events={events}>{children}</NflScorerProvider>
}

export function NflScorerBadges({ player }: { player: ScorerIdentity }) {
  const { gameId, events } = useContext(Scorers)
  const result = nflScorerBadge(events, gameId, player)
  if (!result.count) return null
  return <span style={{ display: 'inline-flex', gap: 4, marginInlineStart: 6, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
    <span role="img" aria-label={`${result.count} touchdown${result.count === 1 ? '' : 's'} scored in this game`} title={`${result.count} TD${result.count === 1 ? '' : 's'}`}>🔥{result.count > 1 ? `×${result.count}` : ''}</span>
    {result.first ? <span role="img" aria-label="First touchdown scorer of this game" title="First TD scorer">🥇</span> : null}
  </span>
}
