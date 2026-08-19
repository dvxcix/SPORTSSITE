'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Check, ChevronDown, FlaskConical, Menu, X } from 'lucide-react'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { getTeamColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { DateButtonNavigator } from '@/components/product/DateButtonNavigator'
import { PageState } from '@/components/layout/PageState'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { ResearchGameWorkspace } from './ResearchGameWorkspace'
import styles from './ResearchHub.module.css'

type ResearchGame = TodayGame & { locked?: boolean }

function formatGameTime(game: ResearchGame) {
  if (/final/i.test(game.status)) return 'Final'
  if (/in progress|live/i.test(game.status)) return 'Live'
  const parsed = new Date(game.gameDate)
  return Number.isNaN(parsed.getTime()) ? game.status : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function GameIdentity({ game, compact = false }: { game: ResearchGame; compact?: boolean }) {
  return (
    <>
      <span className={styles.teamIdentity} style={{ '--team-color': getTeamColor(game.awayAbbr) } as CSSProperties}>
        <TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayTeam} size={26} />
        {!compact && <b>{game.awayAbbr}</b>}
      </span>
      <small>@</small>
      <span className={styles.teamIdentity} style={{ '--team-color': getTeamColor(game.homeAbbr) } as CSSProperties}>
        <TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeTeam} size={26} />
        {!compact && <b>{game.homeAbbr}</b>}
      </span>
    </>
  )
}

export function ResearchHubClient({ initialDate, initialGameKey }: {
  initialDate: string
  initialGameKey: string | null
  initialView?: string
  initialDetail?: string
}) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate)
  const [games, setGames] = useState<ResearchGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(initialGameKey)
  const [gamePickerOpen, setGamePickerOpen] = useState(false)

  const syncUrl = useCallback((nextDate: string, nextGame: string | null) => {
    const params = new URLSearchParams({ date: nextDate })
    if (nextGame) params.set('game', nextGame)
    router.replace(`/research?${params.toString()}`, { scroll: false })
  }, [router])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/slate/games?date=${date}&research=1`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'The slate could not be loaded.')
        return body
      })
      .then(body => {
        setError(null)
        const nextGames: ResearchGame[] = body.games ?? []
        setGames(nextGames)
        setSelectedGameKey(current => current && nextGames.some(game => game.gameKey === current) ? current : nextGames[0]?.gameKey ?? null)
      })
      .catch(cause => {
        if (cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'The slate could not be loaded.')
      })
    return () => controller.abort()
  }, [date, reloadKey])

  useEffect(() => {
    if (!gamePickerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setGamePickerOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [gamePickerOpen])

  const selectedGame = useMemo(
    () => games?.find(game => game.gameKey === selectedGameKey) ?? games?.[0] ?? null,
    [games, selectedGameKey],
  )

  const selectDate = (nextDate: string) => {
    setGames(null)
    setDate(nextDate)
    setSelectedGameKey(null)
    syncUrl(nextDate, null)
  }

  const selectGame = useCallback((gameKey: string) => {
    setSelectedGameKey(gameKey)
    setGamePickerOpen(false)
    syncUrl(date, gameKey)
  }, [date, syncUrl])

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroMark}><FlaskConical size={25} /><i /></div>
        <div className={styles.heroCopy}>
          <span>ULTIMATE RESEARCH</span>
          <h1>Research Workspace</h1>
          <p>One game, every pitch, contact shape, mechanics score, market and movement in one connected workspace.</p>
        </div>
        <div className={styles.sessionState}>
          <CalendarDays size={15} />
          <span><small>ACTIVE SLATE</small><strong>{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</strong></span>
          <Check size={14} />
        </div>
      </header>

      <section className={styles.contextBar} aria-label="Research context">
        <DateButtonNavigator date={date} today={new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })} onChange={selectDate} label="Choose research date" />
        {selectedGame && (
          <button className={styles.mobileGameTrigger} type="button" onClick={() => setGamePickerOpen(true)} aria-haspopup="dialog">
            <Menu size={15} />
            <span><small>SELECTED GAME</small><b><GameIdentity game={selectedGame} /></b></span>
            <em>{formatGameTime(selectedGame)}</em>
            <ChevronDown size={15} />
          </button>
        )}
      </section>

      {error ? (
        <PageState kind="error" title="Research slate unavailable" message={error} actionLabel="Try again" onAction={() => { setGames(null); setError(null); setReloadKey(value => value + 1) }} />
      ) : !games ? (
        <PageState kind="loading" title="Loading research slate" message="Preparing games and shared context." />
      ) : games.length === 0 ? (
        <PageState kind="empty" title="No games scheduled" message="Choose another date to open a different slate." />
      ) : selectedGame ? (
        <div className={styles.workspace}>
          <aside className={styles.gameRail} aria-label="Games on this slate">
            <header><span>SLATE</span><b>{games.length} games</b></header>
            <div>{games.map(game => {
              const active = game.gameKey === selectedGame.gameKey
              return <button key={game.gameKey} type="button" data-active={active} onClick={() => selectGame(game.gameKey)} aria-pressed={active}>
                <span className={styles.gameLogos}><GameIdentity game={game} compact /></span>
                <span className={styles.gameNames}><strong>{game.awayAbbr} at {game.homeAbbr}</strong><small>{formatGameTime(game)}</small></span>
                <i>{game.homeLineupConfirmed && game.awayLineupConfirmed ? 'CONF' : 'PROJ'}</i>
              </button>
            })}</div>
          </aside>
          <section className={styles.mainWorkspace}>
            <ResearchGameWorkspace key={`${date}:${selectedGame.gamePk}`} date={date} game={selectedGame} />
          </section>
        </div>
      ) : null}

      {gamePickerOpen && (
        <div className={styles.pickerBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setGamePickerOpen(false) }}>
          <section className={styles.pickerSheet} role="dialog" aria-modal="true" aria-labelledby="research-game-picker-title">
            <header><div><small>SLATE CONTEXT</small><h2 id="research-game-picker-title">Choose a game</h2></div><button type="button" onClick={() => setGamePickerOpen(false)} aria-label="Close game picker"><X size={18} /></button></header>
            <div>{(games ?? []).map(game => <button key={game.gameKey} type="button" data-active={game.gameKey === selectedGameKey} onClick={() => selectGame(game.gameKey)}>
              <span><GameIdentity game={game} /></span>
              <em><strong>{formatGameTime(game)}</strong><small>{game.homeLineupConfirmed && game.awayLineupConfirmed ? 'Confirmed' : 'Projected'}</small></em>
              {game.gameKey === selectedGameKey && <Check size={16} />}
            </button>)}</div>
          </section>
        </div>
      )}
    </main>
  )
}
