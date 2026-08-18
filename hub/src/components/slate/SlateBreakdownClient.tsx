'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { GameMatchup } from './GameMatchup'
import { GameLockedUpsell } from '@/components/layout/GameLockedUpsell'
import { Lock } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import controls from '@/components/product/ResearchControls.module.css'

// `locked` is added server-side by /api/slate/games for below-Advanced
// members — always `false` for Advanced+ (see that route for the exact
// per-game rule).
type SlateGame = TodayGame & { locked?: boolean }

type SlateBreakdownClientProps = {
  date: string
  embedded?: boolean
  selectedGameKey?: string | null
  onGameChange?: (gameKey: string) => void
}

export function SlateBreakdownClient({ date, embedded = false, selectedGameKey, onGameChange }: SlateBreakdownClientProps) {
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
  const selectedGameKeyRef = useRef(selectedGameKey)
  const onGameChangeRef = useRef(onGameChange)

  useEffect(() => { selectedGameKeyRef.current = selectedGameKey }, [selectedGameKey])
  useEffect(() => { onGameChangeRef.current = onGameChange }, [onGameChange])

  const setActiveGameKey = useCallback((gameKey: string | null) => {
    setActiveGameKeyState(gameKey)
    if (gameKey) onGameChange?.(gameKey)
    if (embedded) return
    const params = new URLSearchParams(searchParams.toString())
    if (gameKey) params.set('game', gameKey)
    else params.delete('game')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [embedded, onGameChange, pathname, router, searchParams])

  useEffect(() => {
    setGames(null)
    setError(null)
    setActiveGameKeyState(null)
    fetch(`/api/slate/games?date=${date}`)
      .then(r => r.json())
      .then(d => {
        setGames(d.games ?? [])
        const restoredKey = selectedGameKeyRef.current ?? initialGameParamRef.current
        const restored = restoredKey
          ? d.games?.find((g: SlateGame) => g.gameKey === restoredKey)
          : null
        const nextKey = (restored ?? d.games?.[0])?.gameKey ?? null
        setActiveGameKeyState(nextKey)
        if (nextKey && nextKey !== selectedGameKeyRef.current) onGameChangeRef.current?.(nextKey)
      })
      .catch(() => setError('Failed to load the schedule for this date.'))
  }, [date])

  if (error) return <PageState kind="error" title="Slate unavailable" message={error} />
  if (!games) return <PageState kind="loading" title="Loading slate" message="Preparing every matchup on the board." />
  if (!games.length) return <PageState kind="empty" title="No games scheduled" message="Choose another date to review a different slate." />

  const effectiveGameKey = selectedGameKey ?? activeGameKey
  const activeGame = games.find(g => g.gameKey === effectiveGameKey) ?? games[0]
  const featuredGame = games.find(g => !g.locked)

  return (
    <div>
      {!embedded && <div className={controls.scrollRail} aria-label="Choose a game">
        {games.map(g => {
          const isActive = g.gameKey === effectiveGameKey
          return (
            <button
              key={g.gameKey}
              onClick={() => setActiveGameKey(g.gameKey)}
              aria-pressed={isActive}
              className={`${controls.gameButton} ${isActive ? controls.gameButtonActive : ''}`}
              style={{
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
      </div>}

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
