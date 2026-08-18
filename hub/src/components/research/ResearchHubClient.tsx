'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Dna,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Menu,
  RefreshCw,
  SlidersHorizontal,
  Swords,
  X,
} from 'lucide-react'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { getTeamColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { DateButtonNavigator } from '@/components/product/DateButtonNavigator'
import { PageState } from '@/components/layout/PageState'
import styles from './ResearchHub.module.css'

const SlateBreakdownClient = dynamic(
  () => import('@/components/slate/SlateBreakdownClient').then(module => module.SlateBreakdownClient),
  { loading: () => <PanelLoader label="Loading matchup board" /> },
)
const PitcherReportClient = dynamic(
  () => import('@/components/pitcher-report/PitcherReportClient').then(module => module.PitcherReportClient),
  { loading: () => <PanelLoader label="Loading starter report" /> },
)
const BatterCostClient = dynamic(
  () => import('@/components/batter-cost/BatterCostClient').then(module => module.BatterCostClient),
  { loading: () => <PanelLoader label="Loading batter markets" /> },
)
const OddsTerminalClient = dynamic(
  () => import('@/components/odds-terminal/OddsTerminalClient').then(module => module.OddsTerminalClient),
  { loading: () => <PanelLoader label="Loading movement history" /> },
)
const MechanicsLab = dynamic(
  () => import('@/components/research/MechanicsLab').then(module => module.MechanicsLab),
  { loading: () => <PanelLoader label="Building mechanics field" /> },
)

type ResearchGame = TodayGame & { locked?: boolean }
type ResearchView = 'matchups' | 'mechanics' | 'board' | 'movement'
type MatchupDetail = 'overview' | 'pitcher'

const VIEWS: { key: ResearchView; label: string; shortLabel: string; description: string; icon: typeof Swords }[] = [
  { key: 'matchups', label: 'Matchups', shortLabel: 'Matchups', description: 'Starters, pitch mix, and lineup form', icon: Swords },
  { key: 'mechanics', label: 'HR Mechanics', shortLabel: 'Mechanics', description: 'Swing readiness and contact formation', icon: Dna },
  { key: 'board', label: 'Market Board', shortLabel: 'Board', description: 'Opening prices, current prices, and movement', icon: LayoutDashboard },
  { key: 'movement', label: 'Odds Movement', shortLabel: 'Movement', description: 'Captured sportsbook history before first pitch', icon: Activity },
]

function validView(value?: string): ResearchView {
  return VIEWS.some(view => view.key === value) ? value as ResearchView : 'matchups'
}

function validDetail(value?: string): MatchupDetail {
  return value === 'pitcher' ? 'pitcher' : 'overview'
}

function formatGameTime(game: ResearchGame) {
  if (/final/i.test(game.status)) return 'Final'
  if (/in progress|live/i.test(game.status)) return 'Live'
  const parsed = new Date(game.gameDate)
  return Number.isNaN(parsed.getTime()) ? game.status : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function PanelLoader({ label }: { label: string }) {
  return <div className={styles.panelLoader}><RefreshCw size={20} /><span>{label}</span></div>
}

function GameIdentity({ game, compact = false }: { game: ResearchGame; compact?: boolean }) {
  return (
    <>
      <span className={styles.teamIdentity} style={{ '--team-color': getTeamColor(game.awayAbbr) } as CSSProperties}>
        <img src={getTeamLogoUrl(game.awayAbbr)} alt={`${game.awayTeam} logo`} />
        {!compact && <b>{game.awayAbbr}</b>}
      </span>
      <small>@</small>
      <span className={styles.teamIdentity} style={{ '--team-color': getTeamColor(game.homeAbbr) } as CSSProperties}>
        <img src={getTeamLogoUrl(game.homeAbbr)} alt={`${game.homeTeam} logo`} />
        {!compact && <b>{game.homeAbbr}</b>}
      </span>
    </>
  )
}

export function ResearchHubClient({ initialDate, initialGameKey, initialView, initialDetail }: {
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
  const [view, setView] = useState<ResearchView>(() => validView(initialView))
  const [matchupDetail, setMatchupDetail] = useState<MatchupDetail>(() => validDetail(initialDetail))
  const [boardScope, setBoardScope] = useState<'game' | 'slate'>('game')
  const [gamePickerOpen, setGamePickerOpen] = useState(false)

  const syncUrl = useCallback((next: { date?: string; game?: string | null; view?: ResearchView; detail?: MatchupDetail }) => {
    const params = new URLSearchParams()
    const nextDate = next.date ?? date
    const nextGame = next.game === undefined ? selectedGameKey : next.game
    const nextView = next.view ?? view
    const nextDetail = next.detail ?? matchupDetail
    params.set('date', nextDate)
    if (nextGame) params.set('game', nextGame)
    params.set('view', nextView)
    if (nextView === 'matchups') params.set('detail', nextDetail)
    router.replace(`/research?${params.toString()}`, { scroll: false })
  }, [date, matchupDetail, router, selectedGameKey, view])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/slate/games?date=${date}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'The slate could not be loaded.')
        return body
      })
      .then(body => {
        if (cancelled) return
        const nextGames: ResearchGame[] = body.games ?? []
        setGames(nextGames)
        setSelectedGameKey(current => {
          if (current && nextGames.some(game => game.gameKey === current)) return current
          return nextGames[0]?.gameKey ?? null
        })
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The slate could not be loaded.')
      })
    return () => { cancelled = true }
  }, [date, reloadKey])

  useEffect(() => {
    if (!gamePickerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGamePickerOpen(false)
    }
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
    setError(null)
    setDate(nextDate)
    setSelectedGameKey(null)
    syncUrl({ date: nextDate, game: null })
  }

  const retrySlate = () => {
    setGames(null)
    setError(null)
    setReloadKey(value => value + 1)
  }
  const selectGame = useCallback((gameKey: string) => {
    setSelectedGameKey(gameKey)
    setGamePickerOpen(false)
    syncUrl({ game: gameKey })
  }, [syncUrl])
  const selectView = (nextView: ResearchView) => {
    setView(nextView)
    syncUrl({ view: nextView })
  }
  const selectDetail = (nextDetail: MatchupDetail) => {
    setMatchupDetail(nextDetail)
    syncUrl({ detail: nextDetail })
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroMark}><FlaskConical size={25} /><i /></div>
        <div className={styles.heroCopy}>
          <span>ULTIMATE RESEARCH</span>
          <h1>Research Workspace</h1>
          <p>Move from matchup context to market movement without rebuilding your slate.</p>
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
        <PageState kind="error" title="Research slate unavailable" message={error} actionLabel="Try again" onAction={retrySlate} />
      ) : !games ? (
        <PageState kind="loading" title="Loading research slate" message="Preparing games and shared context." />
      ) : games.length === 0 ? (
        <PageState kind="empty" title="No games scheduled" message="Choose another date to open a different slate." />
      ) : selectedGame ? (
        <div className={styles.workspace}>
          <aside className={styles.gameRail} aria-label="Games on this slate">
            <header><span>SLATE</span><b>{games.length} games</b></header>
            <div>
              {games.map(game => {
                const active = game.gameKey === selectedGame.gameKey
                return (
                  <button key={game.gameKey} type="button" data-active={active} onClick={() => selectGame(game.gameKey)} aria-pressed={active}>
                    <span className={styles.gameLogos}><GameIdentity game={game} compact /></span>
                    <span className={styles.gameNames}><strong>{game.awayAbbr} at {game.homeAbbr}</strong><small>{formatGameTime(game)}</small></span>
                    <i>{game.homeLineupConfirmed && game.awayLineupConfirmed ? 'CONF' : 'PROJ'}</i>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className={styles.mainWorkspace}>
            <nav className={styles.viewTabs} aria-label="Research tools">
              {VIEWS.map(item => {
                const Icon = item.icon
                return (
                  <button key={item.key} type="button" data-active={view === item.key} onClick={() => selectView(item.key)} aria-pressed={view === item.key}>
                    <Icon size={17} />
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  </button>
                )
              })}
            </nav>

            <header className={styles.workspaceHeader}>
              <div className={styles.workspaceMatchup}>
                <GameIdentity game={selectedGame} />
                <span><small>{formatGameTime(selectedGame)}</small><b>{selectedGame.homeLineupConfirmed && selectedGame.awayLineupConfirmed ? 'Confirmed lineups' : 'Projected lineups'}</b></span>
              </div>
              <div className={styles.workspaceStatus}>
                <span>{VIEWS.find(item => item.key === view)?.shortLabel}</span>
                <i />
                <b>{date < new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) ? 'Archived' : 'Current'}</b>
              </div>
            </header>

            <div className={styles.toolPanel} data-view={view}>
              {view === 'matchups' && (
                <>
                  <div className={styles.toolBar}>
                    <div><Swords size={16} /><span><small>MATCHUP WORKSPACE</small><strong>Choose the level of detail</strong></span></div>
                    <div className={styles.segmented}>
                      <button type="button" data-active={matchupDetail === 'overview'} onClick={() => selectDetail('overview')}><BarChart3 size={13} />Game matchup</button>
                      <button type="button" data-active={matchupDetail === 'pitcher'} onClick={() => selectDetail('pitcher')}><Gauge size={13} />Starter report</button>
                    </div>
                  </div>
                  <div className={styles.toolBody}>
                    {matchupDetail === 'overview'
                      ? <SlateBreakdownClient date={date} embedded selectedGameKey={selectedGame.gameKey} onGameChange={selectGame} />
                      : <PitcherReportClient date={date} gameKey={selectedGame.gameKey} embedded />}
                  </div>
                </>
              )}

              {view === 'mechanics' && (
                <MechanicsLab
                  date={date}
                  gamePk={selectedGame.gamePk}
                  awayTeam={selectedGame.awayAbbr}
                  homeTeam={selectedGame.homeAbbr}
                />
              )}

              {view === 'board' && (
                <>
                  <div className={styles.toolBar}>
                    <div><LayoutDashboard size={16} /><span><small>MARKET BOARD</small><strong>Opening vs current price</strong></span></div>
                    <div className={styles.segmented}>
                      <button type="button" data-active={boardScope === 'game'} onClick={() => setBoardScope('game')}>Selected game</button>
                      <button type="button" data-active={boardScope === 'slate'} onClick={() => setBoardScope('slate')}>Full slate</button>
                    </div>
                  </div>
                  <div className={styles.boardLegend}>
                    <span><i data-tone="shorter" />Shorter price</span>
                    <span><i data-tone="longer" />Longer price</span>
                    <span><i data-tone="flat" />No material change</span>
                    <b><SlidersHorizontal size={12} />Select any header to sort</b>
                  </div>
                  <div className={styles.toolBody}>
                    <BatterCostClient date={date} gameKey={boardScope === 'game' ? selectedGame.gameKey : null} />
                  </div>
                </>
              )}

              {view === 'movement' && (
                <div className={styles.movementBody}>
                  <OddsTerminalClient
                    key={`${date}-${selectedGame.gamePk}`}
                    initialDate={date}
                    embedded
                    selectedGamePk={selectedGame.gamePk}
                    onGameChange={gamePk => {
                      const next = games.find(game => game.gamePk === gamePk)
                      if (next) selectGame(next.gameKey)
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {gamePickerOpen && (
        <div className={styles.pickerBackdrop} role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setGamePickerOpen(false)
        }}>
          <section className={styles.pickerSheet} role="dialog" aria-modal="true" aria-labelledby="research-game-picker-title">
            <header><div><small>SLATE CONTEXT</small><h2 id="research-game-picker-title">Choose a game</h2></div><button type="button" onClick={() => setGamePickerOpen(false)} aria-label="Close game picker"><X size={18} /></button></header>
            <div>
              {(games ?? []).map(game => (
                <button key={game.gameKey} type="button" data-active={game.gameKey === selectedGameKey} onClick={() => selectGame(game.gameKey)}>
                  <span><GameIdentity game={game} /></span>
                  <em><strong>{formatGameTime(game)}</strong><small>{game.homeLineupConfirmed && game.awayLineupConfirmed ? 'Confirmed' : 'Projected'}</small></em>
                  {game.gameKey === selectedGameKey && <Check size={16} />}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
