'use client'

import { useEffect, useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { GameMatchup } from './GameMatchup'
import { GameLockedUpsell } from '@/components/layout/GameLockedUpsell'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import controls from '@/components/product/ResearchControls.module.css'
import styles from './SlateBreakdownClient.module.css'

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
  const [railEdges, setRailEdges] = useState({ start: true, end: true })
  const railRef = useRef<HTMLDivElement>(null)
  const gameButtonRefs = useRef(new Map<string, HTMLButtonElement>())

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

  const syncRailEdges = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth)
    setRailEdges({
      start: rail.scrollLeft <= 2,
      end: rail.scrollLeft >= maxScroll - 2,
    })
  }, [])

  const scrollRail = useCallback((direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({ left: direction * Math.max(280, rail.clientWidth * 0.72), behavior: 'smooth' })
  }, [])

  const handleRailWheel = useCallback((event: WheelEvent) => {
    const rail = railRef.current
    if (!rail || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    const maxScroll = rail.scrollWidth - rail.clientWidth
    const canMove = event.deltaY < 0 ? rail.scrollLeft > 0 : rail.scrollLeft < maxScroll - 1
    if (!canMove) return
    event.preventDefault()
    rail.scrollLeft += event.deltaY
  }, [])

  const handleRailKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!games?.length) return
    const currentIndex = Math.max(0, games.findIndex(game => game.gameKey === (selectedGameKey ?? activeGameKey)))
    let nextIndex = currentIndex
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1)
    else if (event.key === 'ArrowRight') nextIndex = Math.min(games.length - 1, currentIndex + 1)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = games.length - 1
    else return
    event.preventDefault()
    const game = games[nextIndex]
    setActiveGameKey(game.gameKey)
    gameButtonRefs.current.get(game.gameKey)?.focus()
  }, [activeGameKey, games, selectedGameKey, setActiveGameKey])

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

  const effectiveGameKey = selectedGameKey ?? activeGameKey

  useEffect(() => {
    const rail = railRef.current
    if (!rail || !games?.length) return
    rail.addEventListener('wheel', handleRailWheel, { passive: false })
    return () => rail.removeEventListener('wheel', handleRailWheel)
  }, [games, handleRailWheel])

  useEffect(() => {
    const rail = railRef.current
    if (!rail || !games?.length) return
    const frame = requestAnimationFrame(() => {
      gameButtonRefs.current.get(effectiveGameKey ?? '')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
      syncRailEdges()
    })
    const observer = new ResizeObserver(syncRailEdges)
    observer.observe(rail)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [effectiveGameKey, games, syncRailEdges])

  if (error) return <PageState kind="error" title="Slate unavailable" message={error} />
  if (!games) return <PageState kind="loading" title="Loading slate" message="Preparing every matchup on the board." />
  if (!games.length) return <PageState kind="empty" title="No games scheduled" message="Choose another date to review a different slate." />

  const activeGame = games.find(g => g.gameKey === effectiveGameKey) ?? games[0]
  const featuredGame = games.find(g => !g.locked)

  return (
    <div>
      {!embedded && (
        <div className={styles.gamePicker}>
          <button
            type="button"
            className={styles.railArrow}
            onClick={() => scrollRail(-1)}
            disabled={railEdges.start}
            aria-label="Show earlier games"
          >
            <ChevronLeft size={18} />
          </button>
          <div
            ref={railRef}
            className={`${controls.scrollRail} ${styles.gameRail}`}
            aria-label="Choose a game"
            role="toolbar"
            tabIndex={0}
            onScroll={syncRailEdges}
            onKeyDown={handleRailKeyDown}
          >
            {games.map(g => {
              const isActive = g.gameKey === effectiveGameKey
              return (
                <button
                  key={g.gameKey}
                  ref={node => {
                    if (node) gameButtonRefs.current.set(g.gameKey, node)
                    else gameButtonRefs.current.delete(g.gameKey)
                  }}
                  type="button"
                  onClick={() => setActiveGameKey(g.gameKey)}
                  aria-pressed={isActive}
                  className={`${controls.gameButton} ${isActive ? controls.gameButtonActive : ''}`}
                  style={{ opacity: g.locked ? 0.6 : 1 }}
                >
                  <TeamLogo logo={getTeamLogoUrl(g.awayAbbr)} name={g.awayAbbr} size={18} />
                  <span className={styles.atSign}>@</span>
                  <TeamLogo logo={getTeamLogoUrl(g.homeAbbr)} name={g.homeAbbr} size={18} />
                  <span className={styles.matchupLabel}>{g.awayAbbr} @ {g.homeAbbr}</span>
                  {!g.homePitcher && !g.awayPitcher && <span className={styles.tbd}>(TBD)</span>}
                  {g.locked && <Lock size={11} color="var(--text-3)" />}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className={styles.railArrow}
            onClick={() => scrollRail(1)}
            disabled={railEdges.end}
            aria-label="Show later games"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

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
