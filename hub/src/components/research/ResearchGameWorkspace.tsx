'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, Check, ChevronRight, CircleDot,
  Crosshair, Dna, Filter, Flame, Layers3, Search, SlidersHorizontal, Target,
} from 'lucide-react'
import { mlbHeadshot, pitchLabel } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import { normName, resolveNameEntry } from '@slipsurge/core/nameNorm'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import type { GameMechanicsResult, MechanicsPlayer, MechanicsWindow } from '@/lib/hrMechanics'
import { GameMatchup } from '@/components/slate/GameMatchup'
import type { MatchupResearchContext } from '@/components/slate/PitcherVsLineupExperience'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { ParkFieldSvg } from '@/components/sports/ParkFieldSvg'
import { BookLogo } from '@/components/BookLogo'
import type { SprayPitchRow } from '@/components/players/BattedBallSprayChart'
import { computeDugoutPercentValue, getDugoutPercentStyle } from '@/lib/dugoutPercentColor'
import styles from './ResearchGameWorkspace.module.css'

type Snapshot = { captured_at: string; prop_map: Record<string, SnapshotPlayer> }
type SnapshotPlayer = { name?: string; [market: string]: string | Record<string, number | string> | undefined }
type PriceReceipt = { open: number; current: number; delta: number }
type HistoryPlayer = { name: string; markets: Record<string, Record<string, PriceReceipt>> }
type SortKey = 'mechanics' | 'mm' | 'fhr' | 'hr' | 'picks'
type JsonRecord = Record<string, unknown>
type DugoutResearch = {
  communityPicks?: JsonRecord | null
  mmByWindow?: JsonRecord | null
  bookRankByWindow?: JsonRecord | null
  paperRankByWindow?: JsonRecord | null
}
type DugoutPlayer = { mlb_id: number; props?: JsonRecord | null; research?: DugoutResearch | null }
type DugoutGame = { gamePk: number; awayLineup?: DugoutPlayer[]; homeLineup?: DugoutPlayer[] }
type DugoutPayload = { fhrAvg?: unknown[]; saAvg?: unknown[]; communityPicks?: unknown[]; games?: DugoutGame[] }

const WINDOWS: MechanicsWindow[] = [1, 3, 5, 10]
const MARKET_GROUPS = [
  { label: 'Home run', markets: [['fhr', 'First HR'], ['sa', 'Anytime HR'], ['hr2', '2+ HR'], ['laser105', '105+ mph HR'], ['laser110', '110+ mph HR'], ['moonshot', 'Moonshot'], ['pa1', '1st PA HR'], ['hrMl', 'HR + team win']] },
  { label: 'Run production', markets: [['hrr', 'H + R + RBI'], ['rbi', '1+ RBI'], ['rbi2', '2+ RBI'], ['rbi3', '3+ RBI']] },
  { label: 'Bases and contact', markets: [['tb', '2+ TB'], ['tb3', '3+ TB'], ['tb4', '4+ TB'], ['tb5', '5+ TB'], ['singles', 'Single'], ['doubles', 'Double'], ['triples', 'Triple'], ['hits', '1+ Hit'], ['hits2', '2+ Hits']] },
  { label: 'Traffic', markets: [['runs', '1+ Run'], ['runs2', '2+ Runs'], ['stolen_bases', '1+ SB'], ['stolen_bases2', '2+ SB']] },
] as const

const OPEN_FIELD_BY_MARKET_BOOK: Record<string, string> = {
  'fhr:fanduel': 'fhr', 'fhr:caesars': 'fhrCz', 'fhr:fanatics': 'fhrFan',
  'sa:fanduel': 'saFd', 'sa:caesars': 'saCz', 'sa:betmgm': 'saMgm', 'sa:betrivers': 'saBr', 'sa:fanatics': 'saFan',
  'hr2:fanduel': 'hr2Fd', 'hr2:betmgm': 'hr2Mgm',
  'singles:fanduel': 'sngFd', 'doubles:fanduel': 'dblFd', 'triples:fanduel': 'triFd',
  'rbi:fanduel': 'rbiFd', 'rbi2:fanduel': 'rbi2Fd', 'rbi3:fanduel': 'rbi3Fd',
  'tb:fanduel': 'tbFd', 'tb3:fanduel': 'tb3Fd', 'tb4:fanduel': 'tb4Fd', 'tb5:fanduel': 'tb5Fd',
  'hrr:fanduel': 'hrrFd', 'laser105:fanduel': 'laser105', 'laser110:fanduel': 'laser110',
  'moonshot:fanduel': 'moonshot', 'pa1:fanduel': 'pa1', 'hrMl:fanduel': 'hrMl',
  'hits:fanduel': 'hits', 'hits2:fanduel': 'hits2', 'runs:fanduel': 'runs', 'runs2:fanduel': 'runs2',
  'stolen_bases:fanduel': 'stolenBases', 'stolen_bases2:fanduel': 'stolenBases2',
}

function numberPrice(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function odds(value: number | null | undefined) {
  if (value == null) return '—'
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`
}

function pct(value: number | null) {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function moveTone(value: number | null | undefined) {
  if (value == null || Math.abs(value) < 3) return 'flat'
  return value < 0 ? 'shorter' : 'longer'
}

function impliedProbability(value: number) {
  return value > 0 ? 100 / (value + 100) : -value / (-value + 100)
}

function probabilityPoints(receipt: PriceReceipt) {
  return (impliedProbability(receipt.current) - impliedProbability(receipt.open)) * 100
}

function probabilityMove(receipt: PriceReceipt) {
  const points = probabilityPoints(receipt)
  return `${points > 0 ? '+' : ''}${points.toFixed(1)} pp`
}

function movementHeat(receipt: PriceReceipt | null, pool: Array<PriceReceipt | null>): CSSProperties {
  if (!receipt) return {}
  const move = probabilityPoints(receipt)
  const max = Math.max(...pool.filter(Boolean).map(item => Math.abs(probabilityPoints(item!))), 0.01)
  const strength = Math.min(1, Math.abs(move) / max)
  if (Math.abs(move) < 0.02) return {}
  return {
    background: move > 0
      ? `rgba(98, 232, 136, ${(0.025 + strength * 0.15).toFixed(3)})`
      : `rgba(255, 122, 130, ${(0.025 + strength * 0.15).toFixed(3)})`,
  }
}

function reconstructHistory(snapshots: Snapshot[]) {
  const state = new Map<string, HistoryPlayer>()
  for (const snapshot of snapshots) {
    for (const [rawKey, entry] of Object.entries(snapshot.prop_map ?? {})) {
      const key = normName(entry.name ?? rawKey)
      if (!key) continue
      const player = state.get(key) ?? { name: entry.name ?? rawKey, markets: {} }
      for (const [market, rawBooks] of Object.entries(entry)) {
        if (market === 'name' || !rawBooks || typeof rawBooks !== 'object' || Array.isArray(rawBooks)) continue
        const books = player.markets[market] ??= {}
        for (const [book, rawPrice] of Object.entries(rawBooks)) {
          const price = numberPrice(rawPrice)
          if (price == null) continue
          const old = books[book]
          books[book] = { open: old?.open ?? price, current: price, delta: price - (old?.open ?? price) }
        }
      }
      state.set(key, player)
    }
  }
  return state
}

function mergeDugoutMarkets(history: HistoryPlayer | null, props: unknown, playerName: string): HistoryPlayer | null {
  const propMap = asRecord(props)
  if (!propMap && !history) return null
  const merged: HistoryPlayer = {
    name: history?.name ?? playerName,
    markets: Object.fromEntries(Object.entries(history?.markets ?? {}).map(([market, books]) => [market, { ...books }])),
  }
  for (const group of MARKET_GROUPS) {
    for (const [market] of group.markets) {
      const currentBooks = asRecord(propMap?.[market])
      if (!currentBooks) continue
      const books = merged.markets[market] ??= {}
      for (const [book, rawCurrent] of Object.entries(currentBooks)) {
        const current = numberPrice(rawCurrent)
        if (current == null) continue
        const openField = OPEN_FIELD_BY_MARKET_BOOK[`${market}:${book}`]
        const open = numberPrice(openField ? asRecord(propMap?.open)?.[openField] : null) ?? books[book]?.open ?? current
        books[book] = { open, current, delta: current - open }
      }
    }
  }
  return merged
}

function averageMaps(data: DugoutPayload | null, key: 'fhrAvg' | 'saAvg') {
  const map: Record<string, { fd?: number; cz?: number }> = {}
  for (const rawRow of data?.[key] ?? []) {
    const row = asRecord(rawRow)
    if (!row) continue
    const name = normName(String(row.name_norm || row.player_name || ''))
    if (!name) continue
    map[name] ??= {}
    if (row.bookmaker === 'fanduel') map[name].fd = Number(row.avg_price)
    if (row.bookmaker === 'williamhill_us') map[name].cz = Number(row.avg_price)
  }
  return map
}

function pickMap(data: DugoutPayload | null, gameKey: string) {
  const map: Record<string, Record<string, number>> = {}
  for (const rawRow of data?.communityPicks ?? []) {
    const row = asRecord(rawRow)
    if (!row) continue
    if (row.game_key && row.game_key !== gameKey) continue
    const name = normName(String(row.player_name || ''))
    const market = String(row.prop_type || row.market || '')
    if (!name || !market || typeof row.picks !== 'number') continue
    map[name] ??= {}
    map[name][market] = row.picks
  }
  return map
}

function windowKey(window: MechanicsWindow) {
  return `l${window}`
}

type UnifiedPlayer = MechanicsPlayer & {
  dugout: DugoutPlayer | null
  history: HistoryPlayer | null
  fhrPct: number | null
  hrPct: number | null
  mm: number | null
  bookRank: number | null
  paperRank: number | null
  hrPicks: number
  fhr: PriceReceipt | null
  hr: PriceReceipt | null
  fhrDeltaVsAverage: number | null
  hrDeltaVsAverage: number | null
}

export function ResearchGameWorkspace({ date, game }: { date: string; game: TodayGame }) {
  const [window, setWindow] = useState<MechanicsWindow>(5)
  const [mechanics, setMechanics] = useState<GameMechanicsResult | null>(null)
  const [dugout, setDugout] = useState<DugoutPayload | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [captureCount, setCaptureCount] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [teamFilter, setTeamFilter] = useState<'all' | string>('all')
  const [showCandidates, setShowCandidates] = useState(false)
  const [sort, setSort] = useState<SortKey>('mechanics')
  const [query, setQuery] = useState('')
  const [matchupContext, setMatchupContext] = useState<MatchupResearchContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mechanicsWaitReason, setMechanicsWaitReason] = useState<string | null>(null)
  const [mechanicsRetry, setMechanicsRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    fetch(`/api/research/mechanics?date=${date}&gamePk=${game.gamePk}&window=${window}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw Object.assign(new Error(body?.error ?? 'Mechanics data is unavailable.'), {
            status: response.status,
            retryAfter: Number(response.headers.get('Retry-After')) || 30,
          })
        }
        return body as GameMechanicsResult
      })
      .then(mechanicsBody => {
        setError(null)
        setMechanicsWaitReason(null)
        setMechanics(mechanicsBody)
        setSelectedId(current => mechanicsBody.players.some(player => player.playerId === current) ? current : mechanicsBody.players[0]?.playerId ?? null)
      })
      .catch(cause => {
        if (cause?.name === 'AbortError') return
        if (cause?.status === 425) {
          setError(null)
          setMechanicsWaitReason(cause instanceof Error ? cause.message : 'Verified Statcast inputs are still being prepared.')
          retryTimer = setTimeout(
            () => setMechanicsRetry(value => value + 1),
            Math.min(60_000, Math.max(5_000, Number(cause.retryAfter || 30) * 1_000)),
          )
          return
        }
        setError(cause instanceof Error ? cause.message : 'Mechanics data could not be loaded.')
      })
    return () => {
      controller.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [date, game.gamePk, mechanicsRetry, window])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch(`/api/dugout/data?date=${date}&research=1`, { cache: 'no-store', signal: controller.signal }).then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'Market board is unavailable.')
        return body as DugoutPayload
      }),
      fetch(`/api/odds-terminal?date=${date}&gamePk=${game.gamePk}&gameKey=${encodeURIComponent(game.gameKey)}`, { signal: controller.signal }).then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok) return { snapshots: [], sourceCount: 0 }
        return body
      }).catch(cause => cause?.name === 'AbortError' ? Promise.reject(cause) : { snapshots: [], sourceCount: 0 }),
    ]).then(([dugoutBody, historyBody]) => {
      setDugout(dugoutBody)
      setSnapshots(historyBody.snapshots ?? [])
      setCaptureCount(historyBody.sourceCount ?? historyBody.snapshots?.length ?? 0)
    }).catch(cause => {
      if (cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Market data could not be loaded.')
    })
    return () => controller.abort()
  }, [date, game.gameKey, game.gamePk])

  const history = useMemo(() => reconstructHistory(snapshots), [snapshots])
  const historyByName = useMemo(() => Object.fromEntries(history), [history])
  const fhrAverages = useMemo(() => averageMaps(dugout, 'fhrAvg'), [dugout])
  const hrAverages = useMemo(() => averageMaps(dugout, 'saAvg'), [dugout])
  const picks = useMemo(() => pickMap(dugout, game.gameKey), [dugout, game.gameKey])
  const dugoutGame = useMemo(() => dugout?.games?.find(item => Number(item.gamePk) === game.gamePk) ?? null, [dugout, game.gamePk])
  const dugoutPlayers = useMemo(() => new Map<number, DugoutPlayer>([
    ...(dugoutGame?.awayLineup ?? []), ...(dugoutGame?.homeLineup ?? []),
  ].map(player => [Number(player.mlb_id), player])), [dugoutGame])

  const players = useMemo<UnifiedPlayer[]>(() => (mechanics?.players ?? []).map(player => {
    const board = dugoutPlayers.get(player.playerId) ?? null
    const name = normName(player.playerName)
    const capturedHistory = resolveNameEntry(historyByName, name) as HistoryPlayer | undefined
    const playerHistory = mergeDugoutMarkets(capturedHistory ?? null, board?.props, player.playerName)
    const fhr = playerHistory?.markets?.fhr?.fanduel ?? null
    const hr = playerHistory?.markets?.sa?.fanduel ?? null
    const fhrCurrent = fhr?.current ?? null
    const hrCurrent = hr?.current ?? null
    const fhrAverage = fhrAverages[name]?.fd ?? null
    const hrAverage = hrAverages[name]?.fd ?? hrAverages[name]?.cz ?? null
    const research = board?.research ?? null
    return {
      ...player,
      dugout: board,
      history: playerHistory,
      fhrPct: computeDugoutPercentValue(fhrCurrent, fhrAverage),
      hrPct: computeDugoutPercentValue(hrCurrent, hrAverage),
      fhrDeltaVsAverage: fhrCurrent != null && fhrAverage != null ? fhrCurrent - fhrAverage : null,
      hrDeltaVsAverage: hrCurrent != null && hrAverage != null ? hrCurrent - hrAverage : null,
      mm: numberPrice(research?.mmByWindow?.[windowKey(window)]),
      bookRank: numberPrice(research?.bookRankByWindow?.[windowKey(window)]),
      paperRank: numberPrice(research?.paperRankByWindow?.[windowKey(window)]),
      hrPicks: picks[name]?.home_runs ?? numberPrice(asRecord(research?.communityPicks?.home_runs)?.picks) ?? 0,
      fhr,
      hr,
    }
  }), [dugoutPlayers, fhrAverages, historyByName, hrAverages, mechanics?.players, picks, window])

  const lineupsConfirmed = game.awayLineupConfirmed && game.homeLineupConfirmed
  const visiblePlayers = useMemo(() => players.filter(player => (
    (teamFilter === 'all' || player.team === teamFilter)
    && (!lineupsConfirmed || showCandidates || player.lineupStatus !== 'candidate')
    && (!query.trim() || normName(player.playerName).includes(normName(query)))
  )).sort((a, b) => {
    if (sort === 'mm') return (a.mm ?? 999) - (b.mm ?? 999) || b.scores.overall - a.scores.overall
    if (sort === 'fhr') return (b.fhr ? probabilityPoints(b.fhr) : -9999) - (a.fhr ? probabilityPoints(a.fhr) : -9999)
    if (sort === 'hr') return (b.hr ? probabilityPoints(b.hr) : -9999) - (a.hr ? probabilityPoints(a.hr) : -9999)
    if (sort === 'picks') return b.hrPicks - a.hrPicks
    return b.scores.overall - a.scores.overall
  }), [lineupsConfirmed, players, query, showCandidates, sort, teamFilter])

  const fhrAverageDeltaPool = useMemo(() => players.map(player => player.fhrDeltaVsAverage), [players])
  const hrAverageDeltaPool = useMemo(() => players.map(player => player.hrDeltaVsAverage), [players])
  const fhrMovementPool = useMemo(() => players.map(player => player.fhr), [players])
  const hrMovementPool = useMemo(() => players.map(player => player.hr), [players])

  const selected = players.find(player => player.playerId === selectedId) ?? players[0] ?? null
  const onMatchupContext = useCallback((context: MatchupResearchContext) => {
    setMatchupContext(context)
    if (context.selectedBatterId != null) setSelectedId(context.selectedBatterId)
  }, [])

  if (error && (!mechanics || !dugout)) return <div className={styles.state} data-error><Flame /><strong>Unified game workspace unavailable</strong><span>{error}</span></div>
  if (!mechanics || !dugout) return <div className={styles.state}><Dna className={styles.spin} /><strong>Assembling the complete game</strong><span>{mechanicsWaitReason ?? 'Mechanics, matchup science, Dugout structure, public action and every captured price.'}</span></div>

  return (
    <div className={styles.workspace}>
      <section className={styles.commandBar}>
        <div className={styles.commandIdentity}>
          <span><TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayTeam} size={37} /><b>{game.awayAbbr}</b></span>
          <i>@</i>
          <span><TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeTeam} size={37} /><b>{game.homeAbbr}</b></span>
          <div><small>ONE GAME · ONE DATA MODEL</small><strong>{players.length} scored candidates</strong></div>
        </div>
        <div className={styles.commandMetrics}>
          <span><Activity /><b>{captureCount.toLocaleString()}</b><small>pregame captures</small></span>
          <span><Check /><b>{game.awayLineupConfirmed && game.homeLineupConfirmed ? 'Confirmed' : 'Projected + candidates'}</b><small>lineup state</small></span>
        </div>
        <nav className={styles.windowControl} aria-label="Rolling mechanics and MM window">
          <small>SHARED WINDOW</small>
          <div>{WINDOWS.map(value => <button key={value} type="button" data-active={window === value} onClick={() => setWindow(value)}>L{value}</button>)}</div>
        </nav>
      </section>

      <section className={styles.sectionShell}>
        <header className={styles.sectionTitle}>
          <div><Crosshair /><span><small>01 · MATCHUP LAB</small><h2>Pitcher arsenal against today&apos;s hitters</h2><p>Pin pitch types and change batter recency here. Those same filters drive the park projection below.</p></span></div>
          <span className={styles.liveLink}><CircleDot /> CONNECTED FILTERS</span>
        </header>
        <GameMatchup game={game} selectedBatterId={selectedId} onResearchContextChange={onMatchupContext} />
      </section>

      <section className={styles.sectionShell}>
        <header className={styles.sectionTitle}>
          <div><Dna /><span><small>02 · COMPLETE PLAYER FIELD</small><h2>Mechanics, market structure and public positioning</h2><p>Confirmed starters stay primary. Projected and odds-backed candidates remain scored and clearly labeled.</p></span></div>
        </header>
        <div className={styles.boardTools}>
          <label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search any candidate" /></label>
          <div><Filter />{(['all', game.awayAbbr, game.homeAbbr] as const).map(value => <button key={value} type="button" data-active={teamFilter === value} onClick={() => setTeamFilter(value)}>{value === 'all' ? 'Both teams' : value}</button>)}{lineupsConfirmed && <button type="button" data-active={showCandidates} onClick={() => setShowCandidates(value => !value)}>{showCandidates ? 'All scored' : 'Starters only'}</button>}</div>
          <label><SlidersHorizontal /><select value={sort} onChange={event => setSort(event.target.value as SortKey)}><option value="mechanics">Mechanics index</option><option value="mm">MM, lowest first</option><option value="fhr">FHR movement</option><option value="hr">HR movement</option><option value="picks">Public HR picks</option></select></label>
        </div>
        <div className={styles.boardLegend}><span data-tone="shorter"><i />Shorter / conviction</span><span data-tone="longer"><i />Longer</span><span><b>MM</b> book rank minus paper rank</span><small>Percentages are the exact Dugout current-price vs player-average calculations.</small></div>
        <div className={styles.playerTableShell}>
          <div className={styles.playerHeader}><span>PLAYER</span><span>SCORE</span><span>FHR</span><span>HR</span><span>FHR%</span><span>HR%</span><span>MM</span><span>BOOK / PAPER</span><span>PUBLIC HR</span><span /></div>
          {visiblePlayers.map(player => <PlayerSignalRow key={player.playerId} player={player} active={selected?.playerId === player.playerId} fhrDeltaPool={fhrAverageDeltaPool} hrDeltaPool={hrAverageDeltaPool} fhrMovementPool={fhrMovementPool} hrMovementPool={hrMovementPool} onSelect={() => setSelectedId(player.playerId)} />)}
        </div>
      </section>

      {selected && (
        <section className={styles.sectionShell}>
          <header className={styles.sectionTitle}>
            <div><Target /><span><small>03 · SELECTED PLAYER RECEIPT</small><h2>{selected.playerName}: contact shape and complete market</h2><p>Historical contact is filtered by the matchup controls above and drawn on today&apos;s park for visual context.</p></span></div>
            <PlayerAvatar headshot={mlbHeadshot(selected.playerId)} teamLogo={getTeamLogoUrl(selected.team)} teamAbbr={selected.team} name={selected.playerName} size={48} />
          </header>
          <div className={styles.inspectorGrid}>
            <ResearchSprayChart player={selected} game={game} context={matchupContext} fallbackWindow={window} />
            <MarketReceipt player={selected} />
          </div>
        </section>
      )}
    </div>
  )
}

function PlayerSignalRow({ player, active, fhrDeltaPool, hrDeltaPool, fhrMovementPool, hrMovementPool, onSelect }: {
  player: UnifiedPlayer
  active: boolean
  fhrDeltaPool: Array<number | null>
  hrDeltaPool: Array<number | null>
  fhrMovementPool: Array<PriceReceipt | null>
  hrMovementPool: Array<PriceReceipt | null>
  onSelect: () => void
}) {
  return (
    <button className={styles.playerRow} data-active={active} type="button" onClick={onSelect}>
      <span className={styles.playerCell}><em>{player.battingOrder <= 9 ? player.battingOrder : '—'}</em><PlayerAvatar headshot={mlbHeadshot(player.playerId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.playerName} size={34} /><span><strong>{player.playerName}</strong><small>{player.team} · {player.position} · <b data-status={player.lineupStatus}>{player.lineupStatus}</b></small></span></span>
      <span className={styles.scoreCell}><MechanicsScoreRing score={player.scores.overall} label="INDEX" size="small" /><small>#{player.rank}</small></span>
      <PriceCell receipt={player.fhr} vendor="fanduel" pool={fhrMovementPool} />
      <PriceCell receipt={player.hr} vendor="fanduel" pool={hrMovementPool} />
      <span className={styles.pctCell} style={getDugoutPercentStyle(player.fhrPct, player.fhrDeltaVsAverage, fhrDeltaPool)}>{pct(player.fhrPct)}</span>
      <span className={styles.pctCell} style={getDugoutPercentStyle(player.hrPct, player.hrDeltaVsAverage, hrDeltaPool)}>{pct(player.hrPct)}</span>
      <span className={styles.mmCell} data-tone={player.mm != null && player.mm < 0 ? 'shorter' : player.mm != null && player.mm > 0 ? 'longer' : 'flat'}>{player.mm == null ? '—' : player.mm > 0 ? `+${player.mm}` : player.mm}</span>
      <span className={styles.rankCell}><b>{player.bookRank ?? '—'}</b><i>/</i><b>{player.paperRank ?? '—'}</b></span>
      <span className={styles.picksCell}>{player.hrPicks.toLocaleString()}<small>picks</small></span>
      <ChevronRight />
    </button>
  )
}

function PriceCell({ receipt, vendor, pool }: { receipt: PriceReceipt | null; vendor: string; pool: Array<PriceReceipt | null> }) {
  const tone = moveTone(receipt?.delta)
  return <span className={styles.priceCell} data-tone={tone} style={movementHeat(receipt, pool)}><i className={styles.priceBook}><BookLogo vendor={vendor} size={13} /></i><span><strong>{odds(receipt?.current)}</strong><small>{receipt ? `${odds(receipt.open)} · ${probabilityMove(receipt)}` : 'unavailable'}</small></span>{receipt && receipt.delta !== 0 && (receipt.delta < 0 ? <ArrowDownRight className={styles.priceArrow} /> : <ArrowUpRight className={styles.priceArrow} />)}</span>
}

function resultColor(row: SprayPitchRow) {
  if (row.is_home_run) return '#a6ff3f'
  if (row.is_near_hr) return '#ff9f43'
  if (row.events === 'triple') return '#d78cff'
  if (row.events === 'double') return '#49a8ff'
  if (row.events === 'single') return '#30e6d0'
  return '#9ca8bc'
}

function ResearchSprayChart({ player, game, context, fallbackWindow }: { player: UnifiedPlayer; game: TodayGame; context: MatchupResearchContext | null; fallbackWindow: MechanicsWindow }) {
  const [sprayData, setSprayData] = useState<{ playerId: number; rows: SprayPitchRow[] } | null>(null)
  const [selectedKey, setSelectedKey] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/players/${player.playerId}/pitch-log`, { signal: controller.signal })
      .then(response => response.json())
      .then(body => setSprayData({ playerId: player.playerId, rows: body.sprayRows ?? [] }))
      .catch(cause => { if (cause?.name !== 'AbortError') setSprayData({ playerId: player.playerId, rows: [] }) })
    return () => controller.abort()
  }, [player.playerId])

  const rows = sprayData?.playerId === player.playerId ? sprayData.rows : null

  const filtered = useMemo(() => {
    const eligible = (rows ?? []).filter(row => row.is_in_play && Number.isFinite(Number(row.hc_x)) && Number.isFinite(Number(row.hc_y)))
    const pitchTypes = context?.opposingTeamAbbr === player.team ? new Set(context.pitchTypes) : new Set<string>()
    let scoped = pitchTypes.size ? eligible.filter(row => row.pitch_type && pitchTypes.has(row.pitch_type)) : eligible
    if (context?.opposingTeamAbbr === player.team && context.batterScope === 'vsPitcher') scoped = scoped.filter(row => row.pitcher_id === context.pitcherId)
    if (context?.opposingTeamAbbr === player.team && /^\d+$/.test(context.batterScope)) {
      const games = [...new Set(eligible.slice().sort((a, b) => b.game_date.localeCompare(a.game_date) || Number(b.game_pk) - Number(a.game_pk)).map(row => row.game_pk))]
      const allowed = new Set(games.slice(0, Number(context.batterScope)))
      scoped = scoped.filter(row => allowed.has(row.game_pk))
    } else if (!context || context.opposingTeamAbbr !== player.team) {
      const games = [...new Set(eligible.slice().sort((a, b) => b.game_date.localeCompare(a.game_date) || Number(b.game_pk) - Number(a.game_pk)).map(row => row.game_pk))]
      const allowed = new Set(games.slice(0, fallbackWindow))
      scoped = scoped.filter(row => allowed.has(row.game_pk))
    }
    return scoped
  }, [context, fallbackWindow, player.team, rows])

  const selected = filtered.find(row => `${row.game_pk}:${row.at_bat_index}:${row.pitch_number}` === selectedKey) ?? filtered.find(row => row.is_home_run) ?? filtered[0]
  const primary = getTeamColor(game.homeAbbr)
  const secondary = getTeamSecondaryColor(game.homeAbbr)
  const activePitchLabel = context?.opposingTeamAbbr === player.team && context.pitchTypes.length
    ? context.pitchTypes.map(type => pitchLabel(type)).join(' + ')
    : 'active matchup mix'

  return <article className={styles.sprayCard} style={{ '--park-color': primary } as CSSProperties}>
    <header><span><Crosshair /><i /></span><div><small>TODAY&apos;S PARK TRANSLATION</small><strong>{game.venueName ?? `${game.homeAbbr} home park`}</strong><p>{activePitchLabel} · {context?.opposingTeamAbbr === player.team ? context.batterScope : `L${fallbackWindow}`} sample</p></div><TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeTeam} size={38} /></header>
    <div className={styles.parkStage} style={{ '--park-logo': `url("${getTeamLogoUrl(game.homeAbbr)}")` } as CSSProperties}>
      <ParkFieldSvg primary={primary} secondary={secondary} teamAbbr={game.homeAbbr} className={styles.parkField} ariaLabel={`${player.playerName} filtered contact drawn on ${game.venueName ?? game.homeTeam} park geometry`}>
        {filtered.map(row => {
          const key = `${row.game_pk}:${row.at_bat_index}:${row.pitch_number}`
          const active = selected === row
          return <g key={key} className={styles.sprayPoint} data-active={active} role="button" tabIndex={0} onMouseEnter={() => setSelectedKey(key)} onFocus={() => setSelectedKey(key)} onClick={() => setSelectedKey(key)}>
            <circle cx={Number(row.hc_x)} cy={Number(row.hc_y)} r={active ? 4.7 : 3.1} fill={resultColor(row)} stroke={active ? '#fff' : '#061018'} strokeWidth={active ? 1.4 : .75} />
          </g>
        })}
      </ParkFieldSvg>
      {rows === null && <span className={styles.chartState}>Loading contact…</span>}
      {rows !== null && !filtered.length && <span className={styles.chartState}>No batted balls match the connected filters.</span>}
    </div>
    <div className={styles.contactStrip}>
      <span><b>{filtered.length}</b><small>filtered BBE</small></span>
      <span><b>{filtered.filter(row => row.is_home_run).length}</b><small>home runs</small></span>
      <span><b>{filtered.filter(row => Number(row.launch_speed) >= 95).length}</b><small>hard hit</small></span>
      {selected ? <div><i style={{ background: resultColor(selected) }} /><span><b>{selected.events?.replaceAll('_', ' ') ?? 'ball in play'}</b><small>{selected.launch_speed ?? '—'} mph · {selected.launch_angle ?? '—'}° · {selected.hit_distance ?? '—'} ft · {selected.pitch_type ? pitchLabel(selected.pitch_type) : 'pitch unavailable'}</small></span></div> : null}
    </div>
    <footer>Official Statcast coordinates are preserved. The current park outline is visual context; it does not relabel historical outcomes.</footer>
  </article>
}

function MarketReceipt({ player }: { player: UnifiedPlayer }) {
  let available = 0
  for (const group of MARKET_GROUPS) {
    for (const [key] of group.markets) available += Object.keys(player.history?.markets?.[key] ?? {}).length
  }
  return <article className={styles.marketCard}>
    <header><span><Layers3 /><i /></span><div><small>COMPLETE PREGAME RECEIPT</small><strong>Every captured market</strong><p>{available} book-market lines · frozen before first pitch</p></div></header>
    <div className={styles.marketGroups}>
      {MARKET_GROUPS.map(group => <section key={group.label}><h3>{group.label}</h3>{group.markets.map(([key, label]) => {
        const books = player.history?.markets?.[key] ?? {}
        return <div className={styles.marketRow} key={key}><span><strong>{label}</strong><small>{key}</small></span><div>{Object.entries(books).length ? Object.entries(books).map(([book, receipt]) => <span className={styles.bookPrice} data-tone={moveTone(receipt.delta)} key={book}><BookLogo vendor={book} size={15} /><b>{odds(receipt.current)}</b><small>{odds(receipt.open)} open · {probabilityMove(receipt)}</small></span>) : <em>Not offered / not captured</em>}</div></div>
      })}</section>)}
    </div>
  </article>
}
