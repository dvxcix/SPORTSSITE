'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { GameMatchup } from './GameMatchup'
import { GameLockedUpsell } from '@/components/layout/GameLockedUpsell'
import { Lock } from 'lucide-react'

// `locked` is added server-side by /api/slate/games for below-Advanced
// members — always `false` for Advanced+ (see that route for the exact
// per-game rule).
type SlateGame = TodayGame & { locked?: boolean }

export function SlateBreakdownClient({ date }: { date: string }) {
  const [games, setGames] = useState<SlateGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeGameKey, setActiveGameKeyState] = useState<string | null>(null)

  // Reported live (same fix as Dugout): refreshing always landed back on
  // the first game of the day. Captured once via a ref rather than read
  // reactively off searchParams, so restoring it on initial load doesn't
  // fight with setActiveGameKey's own router.replace calls below.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const initialGameParamRef = useRef(searchParams.get('game'))

  const setActiveGameKey = useCallback((gameKey: string | null) => {
    setActiveGameKeyState(gameKey)
    const params = new URLSearchParams(searchParams.toString())
    if (gameKey) params.set('game', gameKey)
    else params.delete('game')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    setGames(null)
    setError(null)
    setActiveGameKeyState(null)
    fetch(`/api/slate/games?date=${date}`)
      .then(r => r.json())
      .then(d => {
        setGames(d.games ?? [])
        const restored = initialGameParamRef.current
          ? d.games?.find((g: SlateGame) => g.gameKey === initialGameParamRef.current)
          : null
        setActiveGameKeyState((restored ?? d.games?.[0])?.gameKey ?? null)
      })
      .catch(() => setError('Failed to load the schedule for this date.'))
  }, [date])

  if (error) return <div style={{ padding: 24, color: 'var(--red)' }}>{error}</div>
  if (!games) return <div style={{ padding: 24, color: 'var(--text-3)' }}>Loading slate…</div>
  if (!games.length) return <div style={{ padding: 24, color: 'var(--text-3)' }}>No games scheduled for this date.</div>

  const activeGame = games.find(g => g.gameKey === activeGameKey) ?? games[0]
  const featuredGame = games.find(g => !g.locked)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {games.map(g => {
          const isActive = g.gameKey === activeGameKey
          return (
            <button
              key={g.gameKey}
              onClick={() => setActiveGameKey(g.gameKey)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: isActive ? 'var(--accent-dim)' : 'var(--surface)',
                color: isActive ? 'var(--accent)' : 'var(--text-2)',
                fontSize: 12, fontWeight: 700,
                opacity: g.locked ? 0.6 : 1,
              }}
            >
              <TeamLogo logo={getTeamLogoUrl(g.awayAbbr)} name={g.awayAbbr} size={18} />
              <span style={{ color: 'var(--text-3)', fontSize: 10 }}>@</span>
              <TeamLogo logo={getTeamLogoUrl(g.homeAbbr)} name={g.homeAbbr} size={18} />
              {!g.homePitcher && !g.awayPitcher && (
                <span style={{ fontSize: 9, color: 'var(--text-3)' }}>(TBD)</span>
              )}
              {g.locked && <Lock size={11} color="var(--text-3)" />}
            </button>
          )
        })}
      </div>

      {activeGame && (
        activeGame.locked
          ? <GameLockedUpsell
              label="Slate Breakdown"
              featuredMatchup={featuredGame ? `${featuredGame.awayAbbr} @ ${featuredGame.homeAbbr}` : undefined}
            />
          : <GameMatchup key={activeGame.gameKey} game={activeGame} />
      )}
    </div>
  )
}
