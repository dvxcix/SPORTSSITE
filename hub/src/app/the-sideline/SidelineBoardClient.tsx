'use client'

import { useCallback, useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Eraser,
  Eye,
  Highlighter,
  Layers3,
  LockKeyhole,
  Minus,
  MoveDown,
  MoveUp,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { useWatchlist } from '@/context/WatchlistContext'
import type { NflMarketOffer, NflOddsPlayer, NflPlayerMarket, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineGame, SidelineLens, SidelineOddsFrame, SidelinePlayer, SidelineTeam, SidelineTeamProfile, SidelineWindow } from './types'
import styles from './sidelineBoard.module.css'

type BoardView = 'core' | 'touchdowns' | 'props' | 'usage' | 'tracking' | 'team' | 'all' | 'custom'
type ColumnGroup = Exclude<BoardView, 'all' | 'custom'>
type SortEntry = { id: string; direction: 'asc' | 'desc' }
type HighlightColor = 'lime' | 'cyan' | 'amber' | 'rose'
type PlayerRow = SidelinePlayer & {
  market: NflOddsPlayer | null
  hasTracking: boolean
  teamProfile: SidelineTeamProfile | null
  opponentProfile: SidelineTeamProfile | null
}
type MarketSpec = {
  key: string
  propType: string
  label: string
  title: string
  group: 'touchdowns' | 'props'
  width: number
  line: number | null
  category: NflPlayerMarket['category']
}
type BookSpec = { id: string; short: string }

type ColumnDefinition = {
  id: string
  label: string
  title: string
  group: ColumnGroup
  width: number
  sticky?: boolean
  vendor?: string
  propType?: string
  brand?: boolean
  value: (row: PlayerRow) => number | string | null
  render: (row: PlayerRow) => ReactNode
}

const WINDOW_OPTIONS: { id: SidelineWindow; label: string }[] = [
  { id: 'season', label: 'Season' },
  { id: 'l1', label: 'Last 1' },
  { id: 'l3', label: 'Last 3' },
  { id: 'l5', label: 'Last 5' },
  { id: 'l10', label: 'Last 10' },
]
const VIEW_OPTIONS: { id: BoardView; label: string }[] = [
  { id: 'core', label: 'Core' },
  { id: 'touchdowns', label: 'TDs' },
  { id: 'props', label: 'Props' },
  { id: 'usage', label: 'Usage' },
  { id: 'tracking', label: 'NFL Tracking' },
  { id: 'team', label: 'Team' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
]
const PREFERRED_BOOKS: BookSpec[] = [
  { id: 'fanduel', short: 'FD' },
  { id: 'draftkings', short: 'DK' },
  { id: 'betmgm', short: 'MGM' },
  { id: 'caesars', short: 'CZ' },
  { id: 'fanatics', short: 'FAN' },
  { id: 'betrivers', short: 'BR' },
]
const FEATURED_MARKETS = [
  { prop: 'first_td', label: 'FTD', title: 'First touchdown scorer', group: 'touchdowns' as const, width: 88 },
  { prop: 'anytime_td', label: 'ATD', title: 'Anytime touchdown scorer', group: 'touchdowns' as const, width: 88 },
  { prop: 'anytime_td_1h', label: '1H TD', title: 'Anytime touchdown in the first half', group: 'touchdowns' as const, width: 88 },
  { prop: 'receptions', label: 'REC', title: 'Receptions', group: 'props' as const, width: 104 },
  { prop: 'receiving_yards', label: 'REC YDS', title: 'Receiving yards', group: 'props' as const, width: 108 },
  { prop: 'rushing_yards', label: 'RUSH YDS', title: 'Rushing yards', group: 'props' as const, width: 108 },
  { prop: 'rushing_receiving_yards', label: 'R+R YDS', title: 'Rushing plus receiving yards', group: 'props' as const, width: 110 },
  { prop: 'passing_yards', label: 'PASS YDS', title: 'Passing yards', group: 'props' as const, width: 108 },
  { prop: 'passing_tds', label: 'PASS TD', title: 'Passing touchdowns', group: 'props' as const, width: 104 },
  { prop: 'passing_attempts', label: 'ATT', title: 'Passing attempts', group: 'props' as const, width: 100 },
  { prop: 'passing_completions', label: 'COMP', title: 'Passing completions', group: 'props' as const, width: 100 },
  { prop: 'longest_reception', label: 'LONG REC', title: 'Longest reception', group: 'props' as const, width: 106 },
  { prop: 'longest_rush', label: 'LONG RUSH', title: 'Longest rush', group: 'props' as const, width: 106 },
]
const POSITION_ORDER: Record<string, number> = { QB: 0, RB: 1, FB: 2, WR: 3, TE: 4, K: 5, DEF: 6, DST: 6 }
const PREFS_KEY = 'slipsurge:sideline:columns:v1'

function normalizedName(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function normalizedTeam(value: string) {
  const upper = value.toUpperCase()
  return ({ LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' } as Record<string, string>)[upper] ?? upper
}

function oddsLabel(value: number | null | undefined) {
  if (value == null) return '—'
  return value > 0 ? `+${value}` : String(value)
}

function impliedProbability(american: number | null | undefined) {
  if (american == null || american === 0) return null
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100)
}

function findMarketPlayer(board: SidelineOddsBoard, player: Pick<SidelinePlayer, 'name' | 'team'>) {
  const name = normalizedName(player.name)
  return board.players.find(candidate => normalizedName(candidate.name) === name && (!candidate.team || normalizedTeam(candidate.team) === normalizedTeam(player.team))) ?? null
}

function findMarket(player: NflOddsPlayer | null, propType: string) {
  if (!player) return null
  return player.markets.find(market => market.propType === propType) ?? null
}

function findMarketByKey(player: NflOddsPlayer | null, marketKey: string) {
  return player?.markets.find(market => market.key === marketKey) ?? null
}

function marketCatalog(boards: SidelineOddsBoard[]): MarketSpec[] {
  const seen = new Map<string, MarketSpec>()
  const featured = new Map(FEATURED_MARKETS.map((market, index) => [market.prop, { ...market, index }]))
  for (const board of boards) {
    for (const player of board.players) {
      for (const market of player.markets) {
        if (seen.has(market.key)) continue
        const known = featured.get(market.propType)
        seen.set(market.key, {
          key: market.key,
          propType: market.propType,
          label: known?.label ?? market.label,
          title: market.label,
          group: market.category === 'touchdowns' ? 'touchdowns' : 'props',
          width: known?.width ?? 108,
          line: market.line,
          category: market.category,
        })
      }
    }
  }
  const categoryRank: Record<NflPlayerMarket['category'], number> = {
    touchdowns: 0, passing: 1, receiving: 2, rushing: 3, kicking: 4, defense: 5, other: 6,
  }
  return Array.from(seen.values()).sort((a, b) => {
    const aFeatured = featured.get(a.propType)?.index ?? 999
    const bFeatured = featured.get(b.propType)?.index ?? 999
    return categoryRank[a.category] - categoryRank[b.category]
      || aFeatured - bFeatured
      || a.label.localeCompare(b.label)
      || (a.line ?? -Infinity) - (b.line ?? -Infinity)
  })
}

function sportsbookCatalog(boards: SidelineOddsBoard[]): BookSpec[] {
  const ids = new Set(PREFERRED_BOOKS.map(book => book.id))
  boards.forEach(board => {
    board.gameLines.forEach(line => ids.add(line.vendor))
    board.players.forEach(player => player.markets.forEach(market => market.offers.forEach(offer => ids.add(offer.vendor))))
  })
  const preferred = new Map(PREFERRED_BOOKS.map((book, index) => [book.id, { ...book, index }]))
  return Array.from(ids).map(id => ({ id, short: preferred.get(id)?.short ?? id.replace(/bet|sportsbook/gi, '').slice(0, 4).toUpperCase() }))
    .sort((a, b) => (preferred.get(a.id)?.index ?? 999) - (preferred.get(b.id)?.index ?? 999) || a.id.localeCompare(b.id))
}

function findOffer(market: NflPlayerMarket | null, vendor: string) {
  return market?.offers.find(offer => normalizedName(offer.vendor) === normalizedName(vendor)) ?? null
}

function offerCurrent(offer: NflMarketOffer | null) {
  if (!offer) return null
  return offer.type === 'milestone' ? offer.current.odds ?? null : offer.current.over ?? null
}

function offerOpening(offer: NflMarketOffer | null) {
  if (!offer?.opening) return null
  return offer.type === 'milestone' ? offer.opening.odds ?? null : offer.opening.over ?? null
}

function marketMove(player: NflOddsPlayer | null, propType = 'anytime_td', vendor = 'fanduel') {
  const offer = findOffer(findMarket(player, propType), vendor)
  const current = impliedProbability(offerCurrent(offer))
  const opening = impliedProbability(offerOpening(offer))
  return current != null && opening != null ? Math.round((current - opening) * 1000) / 10 : null
}

function scoreTone(value: number) {
  if (value >= 72) return styles.strong
  if (value >= 55) return styles.good
  if (value >= 42) return styles.neutral
  return styles.weak
}

function metricDisplay(value: number, suffix = '', decimals = 0) {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(decimals)}${suffix}`
}

function TeamLogo({ team, size = 28 }: { team: SidelineTeam; size?: number }) {
  if (team.logo) return <Image unoptimized className={styles.teamLogo} src={team.logo} alt={`${team.name} logo`} width={size} height={size} />
  return <span className={styles.teamFallback} style={{ width: size, height: size, background: team.color }}>{team.abbr.slice(0, 2)}</span>
}

function PlayerAvatar({ player, team }: { player: PlayerRow; team: SidelineTeam }) {
  return (
    <span className={styles.avatar} style={{ background: `linear-gradient(145deg, ${team.color}, ${team.color2 || '#111820'})` }}>
      {player.headshot ? <Image unoptimized src={player.headshot} alt="" width={42} height={42} /> : <b>{player.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</b>}
      {team.logo ? <Image unoptimized className={styles.avatarTeam} src={team.logo} alt="" width={17} height={17} /> : null}
    </span>
  )
}

function MarketCell({ player, marketKey, vendor, saved, onToggleSaved }: {
  player: PlayerRow
  marketKey: string
  vendor: string
  saved: boolean
  onToggleSaved: (player: PlayerRow, marketKey: string, vendor: string) => void
}) {
  const market = findMarketByKey(player.market, marketKey)
  const offer = findOffer(market, vendor)
  if (!market || !offer) return <span className={styles.empty}>—</span>
  const current = offerCurrent(offer)
  const opening = offerOpening(offer)
  const moved = current != null && opening != null ? current - opening : 0
  return (
    <span className={styles.marketValue}>
      <b>{market.line != null ? <i>{market.line}</i> : null}{oddsLabel(current)}</b>
      <small>{opening != null ? `OPEN ${oddsLabel(opening)}` : 'OPEN -'}</small>
      {moved !== 0 ? <em className={moved < 0 ? styles.moveUp : styles.moveDown}>{moved < 0 ? <ChevronDown size={9} /> : <ChevronUp size={9} />}</em> : null}
      <button
        type="button"
        className={saved ? styles.marketSaved : styles.marketSave}
        aria-label={`${saved ? 'Remove' : 'Add'} ${player.name} ${market.label} ${vendor} ${saved ? 'from' : 'to'} watchlist`}
        title={saved ? 'Remove saved read' : 'Save this market'}
        onClick={event => { event.stopPropagation(); onToggleSaved(player, marketKey, vendor) }}
      ><Star size={10} fill={saved ? 'currentColor' : 'none'} /></button>
    </span>
  )
}

function offsetDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function shortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function buildEmptyPlayer(market: NflOddsPlayer): SidelinePlayer {
  return {
    id: `bdl-${market.id}`,
    name: market.name,
    team: normalizedTeam(market.team),
    position: market.position || '—',
    headshot: null,
    jersey: null,
    games: 0,
    index: 0,
    volume: 0,
    geometry: 0,
    redZone: 0,
    breakaway: 0,
    evidence: 0,
    targets: 0,
    receptions: 0,
    receivingYards: 0,
    carries: 0,
    rushingYards: 0,
    passAttempts: 0,
    completions: 0,
    passingYards: 0,
    touchdowns: 0,
    targetShare: 0,
    carryShare: 0,
    airYards: 0,
    airYardsShare: 0,
    separation: 0,
    yacAboveExpected: 0,
    rushOverExpected: 0,
    catchRate: 0,
    completionRate: 0,
    cpoe: 0,
    timeToThrow: 0,
    redZoneLooks: 0,
    goalLineLooks: 0,
    explosivePlays: 0,
    lane: 'Market only',
  }
}

function useColumnDefinitions({ markets, books, savedKeys, onToggleSaved }: {
  markets: MarketSpec[]
  books: BookSpec[]
  savedKeys: Set<string>
  onToggleSaved: (player: PlayerRow, marketKey: string, vendor: string) => void
}) {
  return useMemo<ColumnDefinition[]>(() => {
    const metric = (
      id: string,
      label: string,
      title: string,
      group: ColumnGroup,
      width: number,
      get: (row: PlayerRow) => number,
      suffix = '',
      decimals = 0,
    ): ColumnDefinition => ({
      id,
      label,
      title,
      group,
      width,
      value: row => row.hasTracking ? get(row) : null,
      render: row => row.hasTracking ? <b className={scoreTone(get(row))}>{metricDisplay(get(row), suffix, decimals)}</b> : <span className={styles.empty}>-</span>,
    })
    const teamMetric = (
      id: string,
      label: string,
      title: string,
      get: (row: PlayerRow) => number | null,
      inverse = false,
    ): ColumnDefinition => ({
      id,
      label,
      title,
      group: 'team',
      width: 92,
      value: get,
      render: row => {
        const value = get(row)
        if (value == null) return <span className={styles.empty}>-</span>
        const toneValue = inverse ? 100 - value : value
        return <b className={scoreTone(toneValue)}>{metricDisplay(value, '%', 1)}</b>
      },
    })
    const columns: ColumnDefinition[] = [
      {
        id: 'player', label: 'Player / role', title: 'Player, team and position', group: 'core', width: 250, sticky: true,
        value: row => row.name,
        render: () => null,
      },
      { ...metric('index', 'Score', 'SlipSurge Score for the selected NFL window', 'core', 118, row => row.index), brand: true },
      {
        id: 'lane', label: 'Read', title: 'Strongest structural lane', group: 'core', width: 116,
        value: row => row.lane,
        render: row => <span className={styles.lane}>{row.lane}</span>,
      },
      metric('volume', 'VOL', 'Volume score', 'core', 70, row => row.volume),
      metric('geometry', 'GEO', 'Field geometry score', 'core', 70, row => row.geometry),
      metric('redZone', 'RZ', 'Red-zone role score', 'core', 70, row => row.redZone),
      metric('breakaway', 'BURST', 'Explosive-play score', 'core', 74, row => row.breakaway),
      metric('targets', 'TGT', 'Targets in selected window', 'usage', 68, row => row.targets),
      metric('targetShare', 'TGT%', 'Share of team targets', 'usage', 74, row => row.targetShare, '%', 1),
      metric('receptions', 'REC', 'Receptions in selected window', 'usage', 68, row => row.receptions),
      metric('carries', 'CAR', 'Carries in selected window', 'usage', 68, row => row.carries),
      metric('carryShare', 'CAR%', 'Share of team carries', 'usage', 74, row => row.carryShare, '%', 1),
      metric('redZoneLooks', 'RZ LOOK', 'Red-zone opportunities', 'usage', 80, row => row.redZoneLooks),
      metric('goalLineLooks', 'GL LOOK', 'Opportunities inside the five', 'usage', 80, row => row.goalLineLooks),
      metric('receivingYards', 'REC YDS', 'Receiving yards in selected window', 'usage', 84, row => row.receivingYards),
      metric('rushingYards', 'RUSH YDS', 'Rushing yards in selected window', 'usage', 88, row => row.rushingYards),
      metric('passingYards', 'PASS YDS', 'Passing yards in selected window', 'usage', 88, row => row.passingYards),
      metric('touchdowns', 'TD', 'Total passing, rushing and receiving touchdowns', 'usage', 64, row => row.touchdowns),
      metric('airYards', 'aDOT', 'Average intended air yards', 'tracking', 72, row => row.airYards, '', 1),
      metric('airYardsShare', 'AIR%', 'Share of intended team air yards', 'tracking', 74, row => row.airYardsShare, '%', 1),
      metric('separation', 'SEP', 'Average route separation', 'tracking', 70, row => row.separation, '', 1),
      metric('yacAboveExpected', 'YACOE', 'Yards after catch above expectation', 'tracking', 76, row => row.yacAboveExpected, '', 1),
      metric('rushOverExpected', 'RYOE/A', 'Rush yards over expected per attempt', 'tracking', 80, row => row.rushOverExpected, '', 1),
      metric('catchRate', 'CATCH%', 'Catch rate', 'tracking', 78, row => row.catchRate, '%', 1),
      metric('completionRate', 'COMP%', 'Quarterback completion rate', 'tracking', 78, row => row.completionRate, '%', 1),
      metric('cpoe', 'CPOE', 'Completion percentage over expectation', 'tracking', 74, row => row.cpoe, '', 1),
      metric('timeToThrow', 'TTT', 'Average time to throw', 'tracking', 70, row => row.timeToThrow, 's', 2),
      metric('explosivePlays', 'EXP', 'Explosive receptions or rushes', 'tracking', 66, row => row.explosivePlays),
      teamMetric('teamPassRate', 'PASS%', 'Team pass rate in the selected window', row => row.teamProfile?.passRate ?? null),
      teamMetric('teamNeutralPassRate', 'NTRL PASS%', 'Team neutral-script pass rate', row => row.teamProfile?.neutralPassRate ?? null),
      teamMetric('teamShotgunRate', 'SHOTGUN%', 'Team shotgun rate', row => row.teamProfile?.shotgunRate ?? null),
      teamMetric('teamNoHuddleRate', 'NO HUDDLE%', 'Team no-huddle rate', row => row.teamProfile?.noHuddleRate ?? null),
      teamMetric('teamSuccessRate', 'SUCCESS%', 'Team offensive success rate', row => row.teamProfile?.successRate ?? null),
      teamMetric('teamExplosiveRate', 'EXP%', 'Team explosive-play rate', row => row.teamProfile?.explosiveRate ?? null),
      teamMetric('teamRedZoneTdRate', 'RZ TD%', 'Team red-zone touchdown rate', row => row.teamProfile?.redZoneTdRate ?? null),
      teamMetric('teamThirdDownRate', '3D%', 'Team third-down conversion rate', row => row.teamProfile?.thirdDownRate ?? null),
      teamMetric('oppSuccessAllowed', 'OPP SUCC%', 'Opponent defensive success rate allowed', row => row.opponentProfile?.defenseSuccessAllowed ?? null),
      teamMetric('oppExplosiveAllowed', 'OPP EXP%', 'Opponent defensive explosive-play rate allowed', row => row.opponentProfile?.defenseExplosiveAllowed ?? null),
    ]
    for (const market of markets) {
      for (const book of books) {
        const id = `${book.id}:${market.key}`
        columns.push({
          id,
          label: `${book.short} ${market.label}`,
          title: `${book.short} ${market.title}`,
          group: market.group,
          width: market.width,
          vendor: book.id,
          propType: market.propType,
          value: row => offerCurrent(findOffer(findMarketByKey(row.market, market.key), book.id)),
          render: row => <MarketCell player={row} marketKey={market.key} vendor={book.id} saved={savedKeys.has(`${normalizedTeam(row.team)}:${normalizedName(row.name)}:${market.key}:${book.id}`)} onToggleSaved={onToggleSaved} />,
        })
      }
    }
    return columns
  }, [books, markets, onToggleSaved, savedKeys])
}

function TeamSummary({ team, opponent, rows, board, selectedWindow, side, savedCount, collapsed, onToggle, onSelectWindow }: {
  team: SidelineTeam
  opponent: SidelineTeam
  rows: PlayerRow[]
  board: SidelineOddsBoard
  selectedWindow: SidelineWindow
  side: 'away' | 'home'
  savedCount: number
  collapsed: boolean
  onToggle: () => void
  onSelectWindow: (window: SidelineWindow) => void
}) {
  const topScore = [...rows].filter(row => row.hasTracking).sort((a, b) => b.index - a.index)[0]
  const movers = rows.map(row => ({ row, move: marketMove(row.market) })).filter(item => item.move != null) as { row: PlayerRow; move: number }[]
  const advertised = [...movers].sort((a, b) => b.move - a.move)[0]
  const hidden = [...movers].sort((a, b) => a.move - b.move)[0]
  const fanduel = board.gameLines.find(line => normalizedName(line.vendor) === 'fanduel') ?? board.gameLines[0]
  const moneyline = side === 'home' ? fanduel?.moneylineHome : fanduel?.moneylineAway
  return (
    <header className={styles.teamHeader} style={{ '--team-color': team.color, '--team-color-2': team.color2 || team.color } as CSSProperties}>
      <div className={styles.teamIdentity}>
        <button type="button" className={`${styles.collapseTeam} ${collapsed ? styles.teamCollapsed : ''}`} onClick={onToggle} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${team.name}`}><ChevronDown size={16} /></button>
        <TeamLogo team={team} size={34} />
        <div><strong>{team.name}</strong><span>vs {opponent.abbr} · {rows.length} market players</span></div>
      </div>
      <div className={styles.teamSignals}>
        <div className={styles.teamWindows}><small>WINDOW</small><span>{WINDOW_OPTIONS.map(option => <button type="button" key={option.id} className={selectedWindow === option.id ? styles.teamWindowActive : ''} onClick={() => onSelectWindow(option.id)}>{option.label.replace('Last ', 'L')}</button>)}</span></div>
        <div><small>TOP SLIPSURGE SCORE</small><b>{topScore ? `${topScore.name} ${topScore.index}` : 'Syncing'}</b></div>
        <div className={styles.advertised}><small>MOST ADVERTISED</small><b>{advertised ? `${advertised.move > 0 ? '+' : ''}${advertised.move} ${advertised.row.name}` : '—'}</b></div>
        <div className={styles.hidden}><small>MOST HIDDEN</small><b>{hidden ? `${hidden.move > 0 ? '+' : ''}${hidden.move} ${hidden.row.name}` : '—'}</b></div>
        <div><small>TEAM ML</small><b>{oddsLabel(moneyline)}</b></div>
        <div><small>SAVED READS</small><b>{savedCount}</b></div>
      </div>
    </header>
  )
}

function GameLines({ game, board }: { game: SidelineGame; board: SidelineOddsBoard }) {
  if (!board.gameLines.length) return null
  return (
    <section className={styles.gameLines} aria-label="All sportsbook game lines">
      <header><div><small>ALL SPORTSBOOKS</small><strong>Live game lines</strong></div><span>{board.gameLines.length} books</span></header>
      <div>
        {board.gameLines.map(line => (
          <article className={styles.gameLineCard} key={line.vendor}>
            <header><BookLogo vendor={line.vendor} size={19} /><b>{line.vendor}</b></header>
            <dl>
              <div><dt>{game.away.abbr} ML</dt><dd>{oddsLabel(line.moneylineAway)}</dd><small>{line.opening?.moneylineAway != null ? `OPEN ${oddsLabel(line.opening.moneylineAway)}` : 'OPEN -'}</small></div>
              <div><dt>{game.home.abbr} ML</dt><dd>{oddsLabel(line.moneylineHome)}</dd><small>{line.opening?.moneylineHome != null ? `OPEN ${oddsLabel(line.opening.moneylineHome)}` : 'OPEN -'}</small></div>
              <div><dt>{game.away.abbr} SPREAD</dt><dd>{line.spreadAway == null ? '-' : `${line.spreadAway > 0 ? '+' : ''}${line.spreadAway} ${oddsLabel(line.spreadAwayOdds)}`}</dd><small>{line.opening?.spreadAway == null ? 'OPEN -' : `OPEN ${line.opening.spreadAway > 0 ? '+' : ''}${line.opening.spreadAway}`}</small></div>
              <div><dt>TOTAL</dt><dd>{line.total == null ? '-' : `${line.total} O ${oddsLabel(line.totalOverOdds)}`}</dd><small>{line.opening?.total == null ? 'OPEN -' : `OPEN ${line.opening.total}`}</small></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function PlayerModal({ player, team, onClose }: { player: PlayerRow; team: SidelineTeam; onClose: () => void }) {
  const [tab, setTab] = useState<'matchup' | 'tracking' | 'markets'>('matchup')
  const markets = player.market?.markets ?? []
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose() }}>
      <section className={styles.playerModal} role="dialog" aria-modal="true" aria-label={`${player.name} NFL breakdown`}>
        <header>
          <div className={styles.modalPlayer}><PlayerAvatar player={player} team={team} /><div><small>{team.abbr} · {player.position}{player.jersey ? ` · #${player.jersey}` : ''}</small><h2>{player.name}</h2></div></div>
          <button type="button" onClick={onClose}><X size={19} /> Close</button>
        </header>
        <nav>
          {(['matchup', 'tracking', 'markets'] as const).map(item => <button key={item} type="button" className={tab === item ? styles.modalTabActive : ''} onClick={() => setTab(item)}>{item === 'matchup' ? 'Matchup' : item === 'tracking' ? 'NFL Tracking' : 'Sportsbooks'}</button>)}
        </nav>
        <div className={styles.modalBody}>
          {tab === 'matchup' ? (
            <>
              <div className={styles.modalHero}><div className={styles.scoreRing}><Image src="/brand-bolt.png" alt="" width={13} height={18} /><b>{player.hasTracking ? player.index : '-'}</b><span>SLIPSURGE SCORE</span></div><div><small>PRIMARY READ</small><strong>{player.lane}</strong><p>Usage, field geometry, scoring role, explosive ability and sample strength in the selected window.</p></div></div>
              <div className={styles.metricCards}>
                {[['Volume', player.volume], ['Geometry', player.geometry], ['Red zone', player.redZone], ['Breakaway', player.breakaway], ['Evidence', player.evidence], ['RZ looks', player.redZoneLooks]].map(([label, value]) => <div key={label}><small>{label}</small><b className={scoreTone(Number(value))}>{player.hasTracking ? value : '—'}</b></div>)}
              </div>
            </>
          ) : tab === 'tracking' ? (
            <div className={styles.metricCards}>
              {[['Targets', player.targets], ['Receptions', player.receptions], ['Target share', `${player.targetShare}%`], ['Carries', player.carries], ['Carry share', `${player.carryShare}%`], ['aDOT', player.airYards], ['Separation', player.separation], ['YACOE', player.yacAboveExpected], ['RYOE/A', player.rushOverExpected], ['Explosives', player.explosivePlays], ['Pass yards', player.passingYards], ['CPOE', player.cpoe]].map(([label, value]) => <div key={label}><small>{label}</small><b>{player.hasTracking ? value : '—'}</b></div>)}
            </div>
          ) : (
            <div className={styles.modalMarkets}>
              {markets.map(market => <article key={market.key}><header><strong>{market.label}</strong>{market.line != null ? <span>Line {market.line}</span> : null}</header><div>{market.offers.map(offer => <span key={offer.vendor}><BookLogo vendor={offer.vendor} size={19} /><b>{oddsLabel(offerCurrent(offer))}</b><small>{offerOpening(offer) != null ? `OPEN ${oddsLabel(offerOpening(offer))}` : 'OPEN —'}</small></span>)}</div></article>)}
              {!markets.length ? <p className={styles.noData}>No player markets posted in this capture.</p> : null}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ColumnManager({ columns, visibleIds, order, onVisible, onMove, onReset, onClose }: {
  columns: ColumnDefinition[]
  visibleIds: Set<string>
  order: string[]
  onVisible: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onReset: () => void
  onClose: () => void
}) {
  const ordered = order.map(id => columns.find(column => column.id === id)).filter(Boolean) as ColumnDefinition[]
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose() }}>
      <section className={styles.columnModal} role="dialog" aria-modal="true" aria-label="Customize NFL board columns">
        <header><div><small>THE SIDELINE</small><h2>Customize columns</h2><p>Your NFL layout is saved separately from TheDugout.</p></div><button type="button" onClick={onClose}><X size={19} /> Close</button></header>
        <div className={styles.columnList}>
          {ordered.map((column, index) => <article key={column.id}>
            <label><input type="checkbox" checked={visibleIds.has(column.id)} disabled={column.id === 'player'} onChange={() => onVisible(column.id)} /><span><b>{column.label}</b><small>{column.title}</small></span></label>
            <em>{column.group}</em>
            <div><button type="button" disabled={index === 0} onClick={() => onMove(column.id, -1)} aria-label={`Move ${column.label} left`}><MoveUp size={15} /></button><button type="button" disabled={index === ordered.length - 1} onClick={() => onMove(column.id, 1)} aria-label={`Move ${column.label} right`}><MoveDown size={15} /></button></div>
          </article>)}
        </div>
        <footer><button type="button" onClick={onReset}><RotateCcw size={15} /> Reset NFL layout</button><button type="button" className={styles.primaryButton} onClick={onClose}>Done</button></footer>
      </section>
    </div>
  )
}

function ComparisonPanel({ players, teams, window, board, onRemove, onClear }: {
  players: PlayerRow[]
  teams: SidelineTeam[]
  window: SidelineWindow
  board: SidelineOddsBoard
  onRemove: (id: string) => void
  onClear: () => void
}) {
  if (!players.length) return null
  return (
    <section className={styles.comparison}>
      <header><div><small>PLAYER COMPARISON</small><h2>{players.length}/4 selected · {WINDOW_OPTIONS.find(item => item.id === window)?.label}</h2></div><button type="button" onClick={onClear}>Clear</button></header>
      <div className={styles.comparisonGrid}>
        {players.map(player => {
          const team = teams.find(item => normalizedTeam(item.abbr) === normalizedTeam(player.team)) ?? teams[0]
          const marketPlayer = findMarketPlayer(board, player)
          const atdMarket = findMarket(marketPlayer, 'anytime_td')
          const ftdMarket = findMarket(marketPlayer, 'first_td')
          const atd = findOffer(atdMarket, 'fanduel')
          const ftd = findOffer(ftdMarket, 'fanduel')
          return <article key={player.id}>
            <header><div><PlayerAvatar player={player} team={team} /><span><b>{player.name}</b><small>{player.team} · {player.position}</small></span></div><button type="button" onClick={() => onRemove(player.id)}><X size={14} /></button></header>
            <div className={styles.compareScore}><span><small><Image src="/brand-bolt.png" alt="" width={9} height={13} /> SLIPSURGE SCORE</small><b className={scoreTone(player.index)}>{player.hasTracking ? player.index : '-'}</b></span><span><small><BookLogo vendor="fanduel" size={13} /> FTD</small><b>{oddsLabel(offerCurrent(ftd))}</b></span><span><small><BookLogo vendor="fanduel" size={13} /> ATD</small><b>{oddsLabel(offerCurrent(atd))}</b></span></div>
            <div className={styles.compareMetrics}><span><small>Volume</small><b>{player.volume}</b></span><span><small>RZ</small><b>{player.redZone}</b></span><span><small>Tgt%</small><b>{player.targetShare}%</b></span><span><small>RZ looks</small><b>{player.redZoneLooks}</b></span></div>
            <div className={styles.compareMarkets}>
              {[ftdMarket, atdMarket].filter(Boolean).map(market => (
                <div key={market!.key}>
                  <small>{market!.label}</small>
                  <span>{market!.offers.map(offer => <em key={offer.vendor}><BookLogo vendor={offer.vendor} size={14} /><b>{oddsLabel(offerCurrent(offer))}</b><i>{offerOpening(offer) == null ? 'OPEN -' : `OPEN ${oddsLabel(offerOpening(offer))}`}</i></em>)}</span>
                </div>
              ))}
            </div>
          </article>
        })}
      </div>
    </section>
  )
}

function gameMoneyline(board: SidelineOddsBoard, side: 'away' | 'home') {
  const book = board.gameLines.find(line => normalizedName(line.vendor) === 'fanduel') ?? board.gameLines[0]
  return side === 'away' ? book?.moneylineAway : book?.moneylineHome
}

export function SidelineBoardClient({ games, selectedId, selectedDate, lens, odds, history }: {
  games: SidelineGame[]
  selectedId: string
  selectedDate: string
  lens: SidelineLens
  odds: SidelineOddsBoard
  history: SidelineOddsFrame[]
}) {
  const router = useRouter()
  const { items: watchlistItems, add: addWatchlist, remove: removeWatchlist } = useWatchlist()
  const selected = games.find(game => game.id === selectedId) ?? games[0]
  const [isPending, startTransition] = useTransition()
  const [windowId, setWindowId] = useState<SidelineWindow>('season')
  const [view, setView] = useState<BoardView>('core')
  const [frameIndex, setFrameIndex] = useState(Math.max(0, history.length - 1))
  const [sorts, setSorts] = useState<SortEntry[]>([{ id: 'index', direction: 'desc' }])
  const [stickySort, setStickySort] = useState(false)
  const [highlighter, setHighlighter] = useState(false)
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('lime')
  const [eraser, setEraser] = useState(false)
  const [highlights, setHighlights] = useState<Record<string, HighlightColor>>({})
  const [erased, setErased] = useState<Set<string>>(new Set())
  const [toolsOpen, setToolsOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [expanded, setExpanded] = useState<PlayerRow | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set())
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [highlightsReady, setHighlightsReady] = useState(false)
  const sourceBoards = useMemo(() => [odds, ...history.map(frame => frame.board)], [history, odds])
  const availableMarkets = useMemo(() => marketCatalog(sourceBoards), [sourceBoards])
  const availableBooks = useMemo(() => sportsbookCatalog(sourceBoards), [sourceBoards])
  const savedItems = useMemo(() => watchlistItems.filter(item => item.status === 'pending' && item.sport.toLowerCase() === 'nfl' && item.game_pk === selected.id), [selected.id, watchlistItems])
  const savedKeys = useMemo(() => new Set(savedItems.map(item => `${normalizedTeam(item.team ?? '')}:${normalizedName(item.player_name)}:${item.prop_key.replace(/^nfl:/, '')}:${item.book ?? ''}`)), [savedItems])
  const toggleSavedMarket = useCallback((player: PlayerRow, marketKey: string, vendor: string) => {
    const market = findMarketByKey(player.market, marketKey)
    const offer = findOffer(market, vendor)
    if (!market || !offer) return
    const key = `${normalizedTeam(player.team)}:${normalizedName(player.name)}:${marketKey}:${vendor}`
    const existing = savedItems.find(item => `${normalizedTeam(item.team ?? '')}:${normalizedName(item.player_name)}:${item.prop_key.replace(/^nfl:/, '')}:${item.book ?? ''}` === key)
    if (existing) {
      void removeWatchlist(existing.id).catch(error => console.error('[the-sideline] failed to remove saved market', error))
      return
    }
    const oddsByBook = Object.fromEntries(market.offers.flatMap(candidate => {
      const price = offerCurrent(candidate)
      return price == null ? [] : [[candidate.vendor, price]]
    }))
    void addWatchlist({
      sport: 'nfl',
      game_pk: selected.id,
      game_date: selected.gameday,
      mlb_id: null,
      player_name: player.name,
      team: player.team,
      position: player.position,
      headshot_url: player.headshot,
      prop_key: `nfl:${market.key}`,
      prop_label: market.label,
      line: market.line == null ? null : String(market.line),
      book: vendor,
      odds: offerCurrent(offer),
      odds_by_book: oddsByBook,
    }).catch(error => console.error('[the-sideline] failed to save market', error))
  }, [addWatchlist, removeWatchlist, savedItems, selected.gameday, selected.id])
  const columns = useColumnDefinitions({ markets: availableMarkets, books: availableBooks, savedKeys, onToggleSaved: toggleSavedMarket })
  const defaultOrder = useMemo(() => columns.map(column => column.id), [columns])
  const defaultVisible = useMemo(() => new Set(columns.filter(column =>
    ['player', 'index', 'lane', 'volume', 'redZone', 'targets', 'targetShare', 'carries', 'carryShare', 'airYards', 'separation', 'redZoneLooks'].includes(column.id)
    || (['fanduel', 'betmgm', 'draftkings'].includes(column.vendor ?? '') && ['first_td', 'anytime_td'].includes(column.propType ?? ''))
    || (column.vendor === 'fanduel' && ['receptions', 'receiving_yards', 'rushing_yards', 'passing_yards'].includes(column.propType ?? ''))
  ).map(column => column.id)), [columns])
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder)
  const [visibleIds, setVisibleIds] = useState<Set<string>>(defaultVisible)
  const board = history[frameIndex]?.board ?? odds
  const windowData = lens.windows[windowId]

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(PREFS_KEY)
        if (raw) {
          const prefs = JSON.parse(raw) as { order?: string[]; visible?: string[] }
          const known = new Set(defaultOrder)
          const savedOrder = (prefs.order ?? []).filter(id => known.has(id))
          setColumnOrder([...savedOrder, ...defaultOrder.filter(id => !savedOrder.includes(id))])
          if (prefs.visible?.length) setVisibleIds(new Set(['player', ...prefs.visible.filter(id => known.has(id))]))
        }
      } catch { /* local preferences are optional */ }
      finally { setPreferencesReady(true) }
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [defaultOrder])

  useEffect(() => {
    if (!preferencesReady) return
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ order: columnOrder, visible: Array.from(visibleIds) })) } catch { /* private mode */ }
  }, [columnOrder, preferencesReady, visibleIds])

  useEffect(() => {
    const key = `slipsurge:sideline:highlights:v1:${selectedId}`
    const animationFrame = window.requestAnimationFrame(() => {
      try { setHighlights(JSON.parse(window.localStorage.getItem(key) ?? '{}')) } catch { setHighlights({}) }
      finally { setHighlightsReady(true) }
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [selectedId])

  useEffect(() => {
    if (!highlightsReady) return
    const key = `slipsurge:sideline:highlights:v1:${selectedId}`
    try { window.localStorage.setItem(key, JSON.stringify(highlights)) } catch { /* private mode */ }
  }, [highlights, highlightsReady, selectedId])

  const rows = useMemo(() => {
    const tracking = new Map(windowData.players.map(player => [`${normalizedTeam(player.team)}:${normalizedName(player.name)}`, player]))
    const teamProfiles = new Map(windowData.teams.map(profile => [normalizedTeam(profile.team.abbr), profile]))
    const profileFor = (team: string) => teamProfiles.get(normalizedTeam(team)) ?? null
    const opponentFor = (team: string) => profileFor(normalizedTeam(team) === normalizedTeam(selected.away.abbr) ? selected.home.abbr : selected.away.abbr)
    const byId = new Map<string, PlayerRow>()
    for (const player of windowData.players) {
      const market = findMarketPlayer(board, player)
      byId.set(player.id, { ...player, market, hasTracking: true, teamProfile: profileFor(player.team), opponentProfile: opponentFor(player.team) })
    }
    for (const market of board.players) {
      if (![selected.away.abbr, selected.home.abbr].map(normalizedTeam).includes(normalizedTeam(market.team))) continue
      const tracked = tracking.get(`${normalizedTeam(market.team)}:${normalizedName(market.name)}`)
      if (tracked) continue
      const empty = buildEmptyPlayer(market)
      byId.set(empty.id, { ...empty, market, hasTracking: false, teamProfile: profileFor(empty.team), opponentProfile: opponentFor(empty.team) })
    }
    return Array.from(byId.values())
  }, [board, selected.away.abbr, selected.home.abbr, windowData.players, windowData.teams])

  const resolvedColumns = useMemo(() => {
    const ordered = columnOrder.map(id => columns.find(column => column.id === id)).filter(Boolean) as ColumnDefinition[]
    if (view === 'all') return ordered
    if (view === 'custom') return ordered.filter(column => visibleIds.has(column.id))
    const foundations = new Set(['player', 'index', 'lane'])
    return ordered.filter(column => foundations.has(column.id) || column.group === view)
  }, [columnOrder, columns, view, visibleIds])

  const columnById = useMemo(() => new Map(columns.map(column => [column.id, column])), [columns])
  const sortedRows = (team: string) => rows
    .filter(row => normalizedTeam(row.team) === normalizedTeam(team) && !erased.has(row.id))
    .sort((a, b) => {
      for (const sort of sorts) {
        const column = columnById.get(sort.id)
        if (!column) continue
        const av = column.value(a)
        const bv = column.value(b)
        if (av == null && bv == null) continue
        if (av == null) return 1
        if (bv == null) return -1
        const difference = typeof av === 'string' || typeof bv === 'string' ? String(av).localeCompare(String(bv)) : av - bv
        if (difference) return sort.direction === 'asc' ? difference : -difference
      }
      return (POSITION_ORDER[a.position] ?? 20) - (POSITION_ORDER[b.position] ?? 20) || a.name.localeCompare(b.name)
    })

  const awayRows = sortedRows(selected.away.abbr)
  const homeRows = sortedRows(selected.home.abbr)
  const comparePlayers = compareIds.map(id => rows.find(row => row.id === id)).filter(Boolean) as PlayerRow[]
  const allTeams = [selected.away, selected.home]

  const changeSort = (id: string) => {
    setSorts(current => {
      const existing = current.find(item => item.id === id)
      if (!stickySort) return [{ id, direction: existing?.direction === 'desc' ? 'asc' : 'desc' }]
      if (!existing) return [...current, { id, direction: 'desc' }]
      if (existing.direction === 'desc') return current.map(item => item.id === id ? { ...item, direction: 'asc' } : item)
      return current.filter(item => item.id !== id)
    })
  }

  const selectGame = (game: SidelineGame) => startTransition(() => router.replace(`/the-sideline?date=${game.gameday}&game=${encodeURIComponent(game.id)}`, { scroll: false }))
  const selectDate = (date: string) => startTransition(() => router.replace(`/the-sideline?date=${date}`, { scroll: false }))
  const toggleCompare = (id: string) => setCompareIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 4 ? [...current, id] : current)
  const toggleHighlight = (row: PlayerRow, column: ColumnDefinition) => {
    if (!highlighter || column.id === 'player') return
    const key = `${row.id}:${column.id}`
    setHighlights(current => {
      const next = { ...current }
      if (next[key] === highlightColor) delete next[key]
      else next[key] = highlightColor
      return next
    })
  }
  const moveColumn = (id: string, direction: -1 | 1) => setColumnOrder(current => {
    const index = current.indexOf(id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= current.length) return current
    const copy = [...current]
    ;[copy[index], copy[next]] = [copy[next], copy[index]]
    return copy
  })

  if (!selected) return null
  const frameTime = history[frameIndex]?.capturedAt ?? board.capturedAt
  const capturedLabel = frameTime ? new Date(frameTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Awaiting markets'

  return (
    <div className={`${styles.page} ${isPending ? styles.loading : ''}`}>
      <header className={styles.brandHeader}>
        <div className={styles.brandIcon}><Image src="/brand-bolt.png" alt="" width={18} height={28} /></div>
        <div><h1>The Sideline <span>ULTIMATE</span></h1><p>Proprietary NFL game matrix · built from TheDugout system</p></div>
        <div className={styles.privateBadge}><LockKeyhole size={13} /> Admin preview · private</div>
      </header>

      <nav className={styles.dateStrip} aria-label="NFL slate date">
        <button type="button" onClick={() => selectDate(offsetDate(selectedDate, -1))}><ChevronLeft size={17} /></button>
        {[-3, -2, -1, 0, 1, 2, 3].map(offset => {
          const date = offsetDate(selectedDate, offset)
          const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
          return <button key={date} type="button" className={offset === 0 ? styles.dateActive : ''} onClick={() => selectDate(date)}><small>{day}</small><b>{shortDate(date)}</b></button>
        })}
        <button type="button" onClick={() => selectDate(offsetDate(selectedDate, 1))}><ChevronRight size={17} /></button>
      </nav>

      <section className={styles.gameRailSection}>
        <header><span>Games</span><b>{games.findIndex(game => game.id === selected.id) + 1}/{games.length}</b></header>
        <div className={styles.gameRail}>{games.map(game => <button key={game.id} type="button" className={game.id === selected.id ? styles.gameActive : ''} onClick={() => selectGame(game)}><span><TeamLogo team={game.away} size={25} /><i>{game.away.abbr}</i></span><em>@</em><span><TeamLogo team={game.home} size={25} /><i>{game.home.abbr}</i></span><small>{game.gametime ?? 'TBD'}</small></button>)}</div>
      </section>

      <section className={styles.controlBar}>
        <div className={styles.matchupMini}><TeamLogo team={selected.away} size={28} /><b>{selected.away.abbr}</b><span>@</span><TeamLogo team={selected.home} size={28} /><b>{selected.home.abbr}</b></div>
        <div className={styles.windowTabs}>{WINDOW_OPTIONS.map(option => <button key={option.id} type="button" className={windowId === option.id ? styles.activeControl : ''} onClick={() => setWindowId(option.id)}>{option.label}</button>)}</div>
        <button type="button" onClick={() => setView('all')}><BarChart3 size={15} /> All</button>
        <button type="button" onClick={() => setColumnsOpen(true)}><Columns3 size={15} /> Columns</button>
        <button type="button" className={toolsOpen ? styles.activeControl : ''} onClick={() => setToolsOpen(value => !value)}><Sparkles size={15} /> Tools</button>
      </section>

      <section className={styles.storyGrid}>
        <article className={styles.stadiumCard} style={{ '--home-color': selected.home.color } as CSSProperties}><small>STADIUM / CONDITIONS</small><strong>{selected.stadium ?? 'Stadium TBD'}</strong><span>{selected.temp != null ? `${selected.temp}°F` : 'Weather syncing'} · {selected.wind != null ? `${selected.wind} mph wind` : selected.roof ?? 'Roof TBD'} · {selected.surface ?? 'Surface TBD'}</span></article>
        <article><small>GAME STATUS</small><strong>{selected.gametime ?? 'TBD'}</strong><span>{selected.gameType} · Week {selected.week}</span></article>
        <article><small>MATCHUP STORY</small><strong>{lens.headline}</strong><span>{lens.headlineDetail}</span></article>
        <article><small>FANDUEL GAME LINE</small><strong>{selected.away.abbr} {oddsLabel(gameMoneyline(board, 'away'))} · {selected.home.abbr} {oddsLabel(gameMoneyline(board, 'home'))}</strong><span>{board.gameLines.length} sportsbooks captured</span></article>
        <article className={styles.marketStory}>
          <div><small>MARKET STORY</small><strong>{frameIndex === 0 ? 'OPENING CAPTURE' : frameIndex === history.length - 1 ? 'CURRENT' : `CAPTURE ${frameIndex + 1}`}</strong></div>
          <input type="range" min={0} max={Math.max(0, history.length - 1)} value={frameIndex} disabled={history.length < 2} onChange={event => setFrameIndex(Number(event.target.value))} />
          <span>{history.length} captures · {capturedLabel}</span>
        </article>
      </section>

      <GameLines game={selected} board={board} />

      {toolsOpen ? <section className={styles.toolsPanel}>
        <button type="button" className={stickySort ? styles.toolActive : ''} onClick={() => setStickySort(value => !value)}><Layers3 size={15} /> Sticky sort {stickySort ? 'on' : 'off'}</button>
        <button type="button" className={highlighter ? styles.toolActive : ''} onClick={() => { setHighlighter(value => !value); setEraser(false) }}><Highlighter size={15} /> Highlighter</button>
        <div className={styles.palette}>{(['lime', 'cyan', 'amber', 'rose'] as HighlightColor[]).map(color => <button key={color} type="button" className={`${styles[color]} ${highlightColor === color ? styles.paletteActive : ''}`} onClick={() => { setHighlightColor(color); setHighlighter(true); setEraser(false) }} aria-label={`${color} highlighter`} />)}</div>
        <button type="button" className={eraser ? styles.eraseActive : ''} onClick={() => { setEraser(value => !value); setHighlighter(false) }}><Eraser size={15} /> Eraser</button>
        <button type="button" onClick={() => { setSorts([{ id: 'index', direction: 'desc' }]); setHighlights({}); setErased(new Set()) }}><RotateCcw size={15} /> Clear board tools</button>
      </section> : null}

      <nav className={styles.viewTabs} aria-label="NFL board column groups">{VIEW_OPTIONS.map(option => <button key={option.id} type="button" className={view === option.id ? styles.viewActive : ''} onClick={() => setView(option.id)}>{option.label}</button>)}</nav>

      {[{ team: selected.away, opponent: selected.home, rows: awayRows, side: 'away' as const }, { team: selected.home, opponent: selected.away, rows: homeRows, side: 'home' as const }].map(section => (
        <section className={styles.teamBoard} key={section.team.abbr} style={{ '--team-color': section.team.color } as CSSProperties}>
          <TeamSummary
            team={section.team}
            opponent={section.opponent}
            rows={section.rows}
            board={board}
            selectedWindow={windowId}
            side={section.side}
            savedCount={savedItems.filter(item => normalizedTeam(item.team ?? '') === normalizedTeam(section.team.abbr)).length}
            collapsed={collapsedTeams.has(section.team.abbr)}
            onToggle={() => setCollapsedTeams(current => {
              const next = new Set(current)
              if (next.has(section.team.abbr)) next.delete(section.team.abbr)
              else next.add(section.team.abbr)
              return next
            })}
            onSelectWindow={setWindowId}
          />
          {!collapsedTeams.has(section.team.abbr) ? <div className={styles.tableScroller}>
            <table className={styles.boardTable} style={{ minWidth: resolvedColumns.reduce((total, column) => total + column.width, 0) }}>
              <thead><tr>{resolvedColumns.map(column => {
                const sort = sorts.find(item => item.id === column.id)
                const rank = sorts.findIndex(item => item.id === column.id)
                return <th key={column.id} className={column.sticky ? styles.stickyCell : ''} style={{ width: column.width, minWidth: column.width }} title={column.title}><button type="button" onClick={() => changeSort(column.id)}>{column.brand ? <Image className={styles.scoreLogo} src="/brand-bolt.png" alt="SlipSurge" width={9} height={13} /> : column.vendor ? <BookLogo vendor={column.vendor} size={14} /> : null}<span>{column.label}</span>{sort ? <em>{sort.direction === 'desc' ? <ChevronDown size={9} /> : <ChevronUp size={9} />}{stickySort ? rank + 1 : ''}</em> : null}</button></th>
              })}</tr></thead>
              <tbody>{section.rows.map((player, index) => {
                const compareActive = compareIds.includes(player.id)
                return <tr key={player.id} className={eraser ? styles.eraserRow : ''} onClick={() => { if (eraser) setErased(current => new Set([...current, player.id])) }}>
                  {resolvedColumns.map(column => {
                    const highlight = highlights[`${player.id}:${column.id}`]
                    return <td key={column.id} className={`${column.sticky ? styles.stickyCell : ''} ${highlight ? styles[`highlight${highlight.charAt(0).toUpperCase()}${highlight.slice(1)}`] : ''}`} style={{ width: column.width, minWidth: column.width }} onClick={() => toggleHighlight(player, column)}>
                      {column.id === 'player' ? <div className={styles.playerCell}><span className={styles.depth}>{index + 1}</span><PlayerAvatar player={player} team={section.team} /><button type="button" className={styles.playerName} onClick={event => { event.stopPropagation(); setExpanded(player) }}><b>{player.name}</b><small>{player.position}{player.jersey ? ` · #${player.jersey}` : ''}</small></button><button type="button" className={compareActive ? styles.compareActive : ''} onClick={event => { event.stopPropagation(); toggleCompare(player.id) }} aria-label={`Compare ${player.name}`}>{compareActive ? <Minus size={14} /> : <Plus size={14} />}</button><button type="button" onClick={event => { event.stopPropagation(); setExpanded(player) }} aria-label={`Open ${player.name}`}><ChevronDown size={14} /></button></div> : column.render(player)}
                    </td>
                  })}
                </tr>
              })}</tbody>
            </table>
            {!section.rows.length ? <div className={styles.emptyTeam}><Eye size={18} /><span>No posted player markets or tracking rows for {section.team.abbr} in this capture.</span></div> : null}
          </div> : null}
        </section>
      ))}

      <ComparisonPanel players={comparePlayers} teams={allTeams} window={windowId} board={board} onRemove={id => setCompareIds(current => current.filter(item => item !== id))} onClear={() => setCompareIds([])} />

      {expanded ? <PlayerModal player={expanded} team={allTeams.find(team => normalizedTeam(team.abbr) === normalizedTeam(expanded.team)) ?? selected.away} onClose={() => setExpanded(null)} /> : null}
      {columnsOpen ? <ColumnManager columns={columns} visibleIds={visibleIds} order={columnOrder} onVisible={id => setVisibleIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); next.add('player'); return next })} onMove={moveColumn} onReset={() => { setColumnOrder(defaultOrder); setVisibleIds(defaultVisible) }} onClose={() => setColumnsOpen(false)} /> : null}
    </div>
  )
}
