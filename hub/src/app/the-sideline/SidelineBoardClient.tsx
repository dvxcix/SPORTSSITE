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
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import { nflSampleReference, type NflSample } from '@/lib/nflSample'
import { createPortal } from 'react-dom'
import { useSidelineMarket } from './useSidelineMarket'
import { useWatchlist } from '@/context/WatchlistContext'
import { americanImpliedProbability, impliedProbabilityRatio } from '@/lib/nflMarketMath'
import { evaluateNflMatrix, type NflMatrix, type NflMatrixFactor } from '@/lib/nflMatrix'
import type { NflMarketOffer, NflOddsPlayer, NflPlayerMarket, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineGame, SidelineLens, SidelinePlayer, SidelineTeam, SidelineTeamProfile, SidelineWindow } from './types'
import styles from './sidelineBoard.module.css'

type BoardView = 'core' | 'touchdowns' | 'props' | 'usage' | 'tracking' | 'team' | 'all' | 'custom'
type RoleFilter = 'all' | 'passing' | 'receiving' | 'rushing' | 'kicking' | 'defense'
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
  vendors: string[]
}
type PublicPickSpec = {
  propType: string
  label: string
  group: 'touchdowns' | 'props'
  width: number
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
  aggregate?: boolean
  heat?: 'high' | 'low' | 'none'
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
  { id: 'core', label: 'Game Day' },
  { id: 'touchdowns', label: 'TDs' },
  { id: 'props', label: 'Props' },
  { id: 'usage', label: 'Usage' },
  { id: 'tracking', label: 'NFL Tracking' },
  { id: 'team', label: 'Team' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
]
const ROLE_OPTIONS: { id: RoleFilter; label: string; positions: string[] }[] = [
  { id: 'all', label: 'All roles', positions: [] },
  { id: 'passing', label: 'QB', positions: ['QB'] },
  { id: 'receiving', label: 'Receivers', positions: ['WR', 'TE'] },
  { id: 'rushing', label: 'Backfield', positions: ['RB', 'FB'] },
  { id: 'kicking', label: 'Kickers', positions: ['K'] },
  { id: 'defense', label: 'Defense', positions: ['DEF', 'DST'] },
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
  { prop: 'rushing_attempts', label: 'RUSH ATT', title: 'Rushing attempts', group: 'props' as const, width: 104 },
  { prop: 'rushing_receiving_yards', label: 'R+R YDS', title: 'Rushing plus receiving yards', group: 'props' as const, width: 110 },
  { prop: 'passing_yards', label: 'PASS YDS', title: 'Passing yards', group: 'props' as const, width: 108 },
  { prop: 'passing_tds', label: 'PASS TD', title: 'Passing touchdowns', group: 'props' as const, width: 104 },
  { prop: 'passing_attempts', label: 'ATT', title: 'Passing attempts', group: 'props' as const, width: 100 },
  { prop: 'passing_completions', label: 'COMP', title: 'Passing completions', group: 'props' as const, width: 100 },
  { prop: 'longest_reception', label: 'LONG REC', title: 'Longest reception', group: 'props' as const, width: 106 },
  { prop: 'longest_rush', label: 'LONG RUSH', title: 'Longest rush', group: 'props' as const, width: 106 },
]
const GAME_DAY_PROP_TYPES = new Set([
  'first_td',
  'anytime_td',
  'receptions',
  'receiving_yards',
  'rushing_yards',
  'rushing_receiving_yards',
  'passing_yards',
  'passing_tds',
])
const FIXED_PICK_MARKETS: PublicPickSpec[] = FEATURED_MARKETS
  .filter(market => GAME_DAY_PROP_TYPES.has(market.prop))
  .map(market => ({
    propType: market.prop,
    label: market.label,
    group: market.group,
    width: Math.max(96, market.width),
  }))
const GAME_DAY_FOUNDATIONS = new Set(['player', 'index'])
const GAME_DAY_ALWAYS_VISIBLE = new Set([
  ...GAME_DAY_FOUNDATIONS,
  'ftdPct', 'atdPct', 'ftdAtdRatio', 'atdTeamMlRatio',
  'atdRecRatio', 'atdRecYdsRatio', 'atdRushYdsRatio', 'atdScrimYdsRatio',
  'roleOpps', 'redZoneLooks',
  // FTD and ATD are the permanent TD anchors. Other PublicPicks columns appear as
  // soon as that market has captures, avoiding empty game-day table sections.
  'picks:first_td', 'picks:anytime_td',
])
const POSITION_ORDER: Record<string, number> = { QB: 0, RB: 1, FB: 2, WR: 3, TE: 4, K: 5, DEF: 6, DST: 6 }
const PREFS_KEY = 'slipsurge:sideline:columns:v2'

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

function findMarketPlayer(board: SidelineOddsBoard, player: Pick<SidelinePlayer, 'name' | 'team'>) {
  const name = normalizedName(player.name)
  return board.players.find(candidate => normalizedName(candidate.name) === name && (!candidate.team || normalizedTeam(candidate.team) === normalizedTeam(player.team))) ?? null
}

function findMarket(player: NflOddsPlayer | null, propType: string) {
  if (!player) return null
  return nflPrimaryMarket(player, propType)
}

function findMarketByKey(player: NflOddsPlayer | null, marketKey: string, vendor?: string) {
  if (marketKey.startsWith('primary:')) return nflPrimaryMarket(player, marketKey.slice(8), vendor)
  return player?.markets.find(market => market.key === marketKey) ?? null
}

function marketCatalog(boards: SidelineOddsBoard[]): MarketSpec[] {
  const seen = new Map<string, MarketSpec>()
  const featured = new Map(FEATURED_MARKETS.map((market, index) => [market.prop, { ...market, index }]))
  for (const board of boards) {
    for (const player of board.players) {
      for (const market of player.markets) {
        const presentVendors = market.offers.map(offer => offer.vendor)
        const columnKey = `primary:${market.propType}`
        const existing = seen.get(columnKey)
        if (existing) {
          existing.vendors = Array.from(new Set([...existing.vendors, ...presentVendors]))
          continue
        }
        const known = featured.get(market.propType)
        seen.set(columnKey, {
          key: columnKey,
          propType: market.propType,
          label: known?.label ?? market.label,
          title: market.label,
          group: market.category === 'touchdowns' ? 'touchdowns' : 'props',
          width: known?.width ?? 108,
          line: market.line,
          category: market.category,
          vendors: presentVendors,
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

function publicPickCatalog(boards: SidelineOddsBoard[]): PublicPickSpec[] {
  // Keep the core PublicPicks columns stable before the first capture lands. This
  // prevents the game-day board from changing shape while markets populate.
  const seen = new Map(FIXED_PICK_MARKETS.map(market => [market.propType, market]))
  const featured = new Map(FEATURED_MARKETS.map((market, index) => [market.prop, { ...market, index }]))
  for (const board of boards) {
    for (const player of board.players) {
      for (const market of player.publicPicks ?? []) {
        if (seen.has(market.propType)) continue
        const known = featured.get(market.propType)
        seen.set(market.propType, {
          propType: market.propType,
          label: known?.label ?? market.label,
          group: known?.group ?? (market.propType.includes('td') ? 'touchdowns' : 'props'),
          width: Math.max(94, known?.width ?? 104),
        })
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    const aFeatured = featured.get(a.propType)?.index ?? 999
    const bFeatured = featured.get(b.propType)?.index ?? 999
    return aFeatured - bFeatured || a.label.localeCompare(b.label)
  })
}

function publicPickCount(player: NflOddsPlayer | null, propType: string) {
  const counts = (player?.publicPicks ?? []).filter(item => item.propType === propType).map(item => item.picks)
  return counts.length ? Math.max(...counts) : null
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

function offerSummary(offer: NflMarketOffer, phase: 'current' | 'opening') {
  const value = phase === 'current' ? offer.current : offer.opening
  if (!value) return '-'
  if (offer.type === 'milestone') return oddsLabel(value.odds)
  return `O ${oddsLabel(value.over)} · U ${oddsLabel(value.under)}`
}

function marketMove(player: NflOddsPlayer | null, propType = 'anytime_td', vendor = 'fanduel') {
  const baseline = player?.tdBaselines?.find(item => item.propType === propType && normalizedName(item.vendor) === normalizedName(vendor))
  if (baseline?.sampleGames && baseline.sampleGames >= 2 && baseline.deltaPct != null) return baseline.deltaPct * 100
  const offer = findOffer(findMarket(player, propType), vendor)
  const current = offerCurrent(offer)
  const opening = offerOpening(offer)
  if (current == null || opening == null || opening === 0) return null
  return ((current - opening) / Math.abs(opening)) * 100
}

function primaryMarketOffer(player: NflOddsPlayer | null, propType: string, vendor = 'fanduel') {
  const market = nflPrimaryMarket(player, propType, vendor)
  const offer = findOffer(market, vendor)
  const odds = offerCurrent(offer)
  return market && offer && odds != null ? { market, offer, odds } : null
}

function RatioCell({ numerator, denominator, detail }: { numerator: number | null; denominator: number | null; detail: string }) {
  const ratio = impliedProbabilityRatio(numerator, denominator)
  if (ratio == null) return <span className={styles.empty}>-</span>
  return <span className={styles.ratioValue} title={detail}><b>{ratio.toFixed(2)}</b><small>IMPLIED P</small></span>
}

function bestOffer(market: NflPlayerMarket | null) {
  if (!market) return null
  return market.offers
    .map(offer => ({ offer, current: offerCurrent(offer) }))
    .filter((entry): entry is { offer: NflMarketOffer; current: number } => entry.current != null)
    .sort((a, b) => b.current - a.current)[0] ?? null
}

function BestMarketCell({ player, propType }: { player: PlayerRow; propType: string }) {
  const market = findMarket(player.market, propType)
  const best = bestOffer(market)
  if (!market || !best) return <span className={styles.empty}>-</span>
  const opening = offerOpening(best.offer)
  const moved = opening == null ? 0 : best.current - opening
  return <span className={styles.bestMarketValue}>
    <BookLogo vendor={best.offer.vendor} size={15} />
    <b>{oddsLabel(best.current)}</b>
    <small>{opening == null ? 'OPEN -' : `OPEN ${oddsLabel(opening)}`}</small>
    {moved ? <em className={moved < 0 ? styles.moveUp : styles.moveDown}>{moved < 0 ? <ChevronDown size={9} /> : <ChevronUp size={9} />}</em> : null}
  </span>
}

function roleOpportunity(row: PlayerRow) {
  if (row.position === 'QB') return row.passAttempts
  if (['RB', 'FB'].includes(row.position)) return row.carries + row.targets
  if (['WR', 'TE'].includes(row.position)) return row.targets
  return row.games
}

function roleShare(row: PlayerRow) {
  if (['RB', 'FB'].includes(row.position)) return row.carryShare
  if (['WR', 'TE'].includes(row.position)) return row.targetShare
  if (row.position === 'QB') return row.completionRate
  return row.evidence
}

function roleYards(row: PlayerRow) {
  if (row.position === 'QB') return row.passingYards
  if (['RB', 'FB'].includes(row.position)) return row.rushingYards + row.receivingYards
  if (['WR', 'TE'].includes(row.position)) return row.receivingYards
  return row.explosivePlays
}

function baselineMove(player: NflOddsPlayer | null, propType: 'first_td' | 'anytime_td', vendor = 'fanduel') {
  return player?.tdBaselines?.find(item => item.propType === propType && normalizedName(item.vendor) === normalizedName(vendor)) ?? null
}

function BaselineCell({ player, propType }: { player: NflOddsPlayer | null; propType: 'first_td' | 'anytime_td' }) {
  const baseline = baselineMove(player, propType)
  if (baseline?.deltaPct == null || baseline.sampleGames < 2) return <span className={styles.empty}>-</span>
  const value = baseline.deltaPct * 100
  const tone = value <= -5 ? styles.baselineAdvertised : value >= 5 ? styles.baselineHidden : styles.baselineFlat
  return <span className={`${styles.baselineValue} ${tone}`} title={`Current FanDuel price versus this player's ${baseline.sampleGames}-game average (${oddsLabel(Math.round(baseline.averageOdds))})`}><b>{value > 0 ? '+' : ''}{value.toFixed(1)}%</b><small>{baseline.sampleGames}G AVG {oddsLabel(Math.round(baseline.averageOdds))}</small></span>
}

function scoreTone(value: number) {
  if (value >= 72) return styles.strong
  if (value >= 55) return styles.good
  if (value >= 42) return styles.neutral
  return styles.weak
}

function heatStyle(column: ColumnDefinition, row: PlayerRow, peers: PlayerRow[]): CSSProperties | undefined {
  if (!column.heat || column.heat === 'none' || column.id === 'player') return undefined
  const current = column.value(row)
  if (typeof current !== 'number' || !Number.isFinite(current)) return undefined
  const values = peers.map(peer => column.value(peer)).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (values.length < 2) return undefined
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return { '--cell-heat': 0.34 } as CSSProperties
  const normalized = (current - min) / (max - min)
  return { '--cell-heat': column.heat === 'low' ? 1 - normalized : normalized } as CSSProperties
}

function metricDisplay(value: number, suffix = '', decimals = 0) {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(decimals)}${suffix}`
}

function TeamLogo({ team, size = 28 }: { team: SidelineTeam; size?: number }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  if (team.logo && team.logo !== failedSource) return <Image unoptimized className={styles.teamLogo} src={team.logo} alt={`${team.name} logo`} width={size} height={size} onError={() => setFailedSource(team.logo)} />
  return <span className={styles.teamFallback} style={{ width: size, height: size, background: team.color }}>{team.abbr.slice(0, 2)}</span>
}

function PlayerAvatar({ player, team }: { player: PlayerRow; team: SidelineTeam }) {
  const sources = useMemo(() => Array.from(new Set([player.headshot, ...(player.headshotFallbacks ?? [])].filter((source): source is string => Boolean(source)))), [player.headshot, player.headshotFallbacks])
  const [failedSources, setFailedSources] = useState<string[]>([])
  const [failedTeamLogo, setFailedTeamLogo] = useState<string | null>(null)
  const source = sources.find(candidate => !failedSources.includes(candidate)) ?? null
  return (
    <span className={styles.avatar} style={{ background: `linear-gradient(145deg, ${team.color}, ${team.color2 || '#111820'})` }}>
      {source ? <Image unoptimized src={source} alt={`${player.name} headshot`} width={42} height={42} onError={() => setFailedSources(current => current.includes(source) ? current : [...current, source])} /> : <b>{player.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</b>}
      {team.logo && team.logo !== failedTeamLogo ? <Image unoptimized className={styles.avatarTeam} src={team.logo} alt={`${team.name} logo`} width={17} height={17} onError={() => setFailedTeamLogo(team.logo)} /> : null}
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
  const market = findMarketByKey(player.market, marketKey, vendor)
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
        title={saved ? 'Remove saved market' : 'Save this market'}
        onClick={event => { event.stopPropagation(); onToggleSaved(player, market.key, vendor) }}
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
    id: market.gsisId ?? `bdl-${market.id}`,
    name: market.name,
    team: normalizedTeam(market.team),
    position: market.position || '-',
    headshot: market.headshot ?? null,
    headshotFallbacks: market.headshotFallbacks ?? [],
    jersey: market.jersey ?? null,
    rookieSeason: market.rookieSeason ?? null,
    latestTeam: market.latestTeam ?? null,
    rosterStatus: market.rosterStatus ?? null,
    sampleTeam: null,
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
    lane: market.rookieSeason && market.rookieSeason >= 2026 ? 'Rookie · market posted' : 'Market posted · tracking pending',
  }
}

function mergePlayerIdentity(player: SidelinePlayer, market: NflOddsPlayer | null): SidelinePlayer {
  if (!market) return player
  const fallbacks = Array.from(new Set([
    ...(player.headshotFallbacks ?? []),
    ...(market.headshotFallbacks ?? []),
    market.headshot,
  ].filter((source): source is string => Boolean(source && source !== player.headshot))))
  return {
    ...player,
    headshot: player.headshot ?? market.headshot ?? fallbacks[0] ?? null,
    headshotFallbacks: fallbacks,
    jersey: player.jersey ?? market.jersey ?? null,
    rookieSeason: player.rookieSeason ?? market.rookieSeason ?? null,
    latestTeam: market.latestTeam ?? player.latestTeam ?? null,
    rosterStatus: market.rosterStatus ?? player.rosterStatus ?? null,
  }
}

function useColumnDefinitions({ markets, pickMarkets, books, board, game, savedKeys, onToggleSaved }: {
  markets: MarketSpec[]
  pickMarkets: PublicPickSpec[]
  books: BookSpec[]
  board: SidelineOddsBoard
  game: SidelineGame
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
      heat: 'high',
      value: row => row.hasTracking && !row.unavailableMetrics?.includes(id) ? get(row) : null,
      render: row => row.hasTracking && !row.unavailableMetrics?.includes(id) ? <b className={scoreTone(get(row))}>{metricDisplay(get(row), suffix, decimals)}</b> : <span className={styles.empty} title="Not available in this statistical sample">-</span>,
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
      heat: inverse ? 'low' : 'high',
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
        id: 'lane', label: 'Role', title: 'Primary usage role in the selected window', group: 'core', width: 116,
        value: row => row.lane,
        render: row => <span className={styles.lane}>{row.lane}</span>,
      },
      {
        id: 'bestFtd', label: 'Best FTD', title: 'Best currently available first-touchdown price', group: 'core', width: 106, aggregate: true, heat: 'high', propType: 'first_td',
        value: row => americanImpliedProbability(bestOffer(findMarket(row.market, 'first_td'))?.current ?? null),
        render: row => <BestMarketCell player={row} propType="first_td" />,
      },
      {
        id: 'bestAtd', label: 'Best ATD', title: 'Best currently available anytime-touchdown price', group: 'core', width: 106, aggregate: true, heat: 'high', propType: 'anytime_td',
        value: row => americanImpliedProbability(bestOffer(findMarket(row.market, 'anytime_td'))?.current ?? null),
        render: row => <BestMarketCell player={row} propType="anytime_td" />,
      },
      {
        id: 'ftdPct', label: 'FTD%', title: "Current FanDuel first-touchdown price versus this player's historical average", group: 'touchdowns', width: 116,
        value: row => baselineMove(row.market, 'first_td')?.deltaPct ?? null,
        render: row => <BaselineCell player={row.market} propType="first_td" />,
      },
      {
        id: 'atdPct', label: 'ATD%', title: "Current FanDuel anytime-touchdown price versus this player's historical average", group: 'touchdowns', width: 116,
        value: row => baselineMove(row.market, 'anytime_td')?.deltaPct ?? null,
        render: row => <BaselineCell player={row.market} propType="anytime_td" />,
      },
      {
        id: 'ftdAtdRatio', label: 'FTD:ATD', title: 'FanDuel first-TD implied probability divided by anytime-TD implied probability', group: 'core', width: 92, heat: 'high',
        value: row => impliedProbabilityRatio(primaryMarketOffer(row.market, 'first_td')?.odds ?? null, primaryMarketOffer(row.market, 'anytime_td')?.odds ?? null),
        render: row => <RatioCell numerator={primaryMarketOffer(row.market, 'first_td')?.odds ?? null} denominator={primaryMarketOffer(row.market, 'anytime_td')?.odds ?? null} detail="FanDuel FTD implied probability / ATD implied probability" />,
      },
      ...([
        ['atdRecRatio', 'ATD:REC', 'receptions', 'Anytime TD / receptions'],
        ['atdRecYdsRatio', 'ATD:REC YDS', 'receiving_yards', 'Anytime TD / receiving yards'],
        ['atdRushYdsRatio', 'ATD:RUSH YDS', 'rushing_yards', 'Anytime TD / rushing yards'],
        ['atdScrimYdsRatio', 'ATD:R+R YDS', 'rushing_receiving_yards', 'Anytime TD / scrimmage yards'],
      ] as const).map(([id, label, propType, title]): ColumnDefinition => ({
        id, label, title: `${title} FanDuel implied-probability ratio`, group: 'core', width: 108, heat: 'high',
        value: row => impliedProbabilityRatio(primaryMarketOffer(row.market, 'anytime_td')?.odds ?? null, primaryMarketOffer(row.market, propType)?.odds ?? null),
        render: row => <RatioCell numerator={primaryMarketOffer(row.market, 'anytime_td')?.odds ?? null} denominator={primaryMarketOffer(row.market, propType)?.odds ?? null} detail={`${title} using FanDuel prices`} />,
      })),
      {
        id: 'atdTeamMlRatio', label: 'ATD:TEAM ML', title: 'FanDuel anytime-TD implied probability divided by team moneyline implied probability', group: 'core', width: 108, heat: 'high',
        value: row => {
          const line = board.gameLines.find(item => normalizedName(item.vendor) === 'fanduel') ?? board.gameLines[0]
          const teamMl = normalizedTeam(row.team) === normalizedTeam(game.home.abbr) ? line?.moneylineHome ?? null : line?.moneylineAway ?? null
          return impliedProbabilityRatio(primaryMarketOffer(row.market, 'anytime_td')?.odds ?? null, teamMl)
        },
        render: row => {
          const line = board.gameLines.find(item => normalizedName(item.vendor) === 'fanduel') ?? board.gameLines[0]
          const teamMl = normalizedTeam(row.team) === normalizedTeam(game.home.abbr) ? line?.moneylineHome ?? null : line?.moneylineAway ?? null
          return <RatioCell numerator={primaryMarketOffer(row.market, 'anytime_td')?.odds ?? null} denominator={teamMl} detail="FanDuel ATD implied probability / team moneyline implied probability" />
        },
      },
      metric('volume', 'VOL', 'Volume score', 'core', 70, row => row.volume),
      metric('geometry', 'GEO', 'Field geometry score', 'core', 70, row => row.geometry),
      metric('redZone', 'RZ', 'Red-zone role score', 'core', 70, row => row.redZone),
      metric('breakaway', 'BURST', 'Explosive-play score', 'core', 74, row => row.breakaway),
      metric('roleOpps', 'OPPS', 'Role-aware opportunities: attempts for QBs, carries plus targets for backs, targets for receivers', 'core', 72, roleOpportunity),
      metric('roleShare', 'SHARE', 'Role-aware team share or completion rate', 'core', 76, roleShare, '%', 1),
      metric('roleYards', 'YARDS', 'Role-aware passing, scrimmage, or receiving yards', 'core', 78, roleYards),
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
      metric('touchdowns', 'TD', 'Rushing and receiving touchdowns scored', 'usage', 64, row => row.touchdowns),
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
    for (const market of pickMarkets) {
      columns.push({
        id: `picks:${market.propType}`,
        label: `${market.label} PICKS`,
        title: `Public picks for ${market.label}`,
        group: market.group,
        width: market.width,
        propType: market.propType,
        heat: 'high',
        value: row => publicPickCount(row.market, market.propType),
        render: row => {
          const count = publicPickCount(row.market, market.propType)
          return count == null
            ? <span className={styles.empty}>-</span>
            : <span className={styles.publicPickValue}><b>{count.toLocaleString()}</b><small>PICKS</small></span>
        },
      })
    }
    for (const market of markets) {
      if (!['first_td', 'anytime_td'].includes(market.propType)) {
        columns.push({
          id: `best:${market.key}`,
          label: market.label,
          title: `Best available ${market.title} price across sportsbooks`,
          group: market.group,
          width: Math.max(94, market.width),
          aggregate: true,
          propType: market.propType,
          heat: 'high',
          value: row => americanImpliedProbability(bestOffer(findMarketByKey(row.market, market.key))?.current ?? null),
          render: row => {
            const target = findMarketByKey(row.market, market.key)
            const best = bestOffer(target)
            if (!target || !best) return <span className={styles.empty}>-</span>
            const opening = offerOpening(best.offer)
            return <span className={styles.bestMarketValue}><BookLogo vendor={best.offer.vendor} size={15} /><b>{target.line != null ? <i>{target.line}</i> : null}{oddsLabel(best.current)}</b><small>{opening == null ? 'OPEN -' : `OPEN ${oddsLabel(opening)}`}</small></span>
          },
        })
      }
      for (const book of books) {
        if (!market.vendors.some(vendor => normalizedName(vendor) === normalizedName(book.id))) continue
        const id = `${book.id}:${market.key}`
        columns.push({
          id,
          label: `${book.short} ${market.label}`,
          title: `${book.short} ${market.title}`,
          group: market.group,
          width: market.width,
          vendor: book.id,
          propType: market.propType,
          heat: 'high',
          value: row => americanImpliedProbability(offerCurrent(findOffer(findMarketByKey(row.market, market.key, book.id), book.id))),
          render: row => <MarketCell player={row} marketKey={market.key} vendor={book.id} saved={savedKeys.has(`${normalizedTeam(row.team)}:${normalizedName(row.name)}:${findMarketByKey(row.market, market.key, book.id)?.key}:${book.id}`)} onToggleSaved={onToggleSaved} />,
        })
      }
    }
    const propRank = new Map(FEATURED_MARKETS.map((market, index) => [market.prop, index]))
    const bookRank = new Map(PREFERRED_BOOKS.map((book, index) => [book.id, index]))
    const fixedRank = new Map([
      ['player', 0], ['index', 1], ['lane', 2],
      ['ftdPct', 80], ['atdPct', 180], ['ftdAtdRatio', 190], ['atdTeamMlRatio', 195],
      ['atdRecRatio', 196], ['atdRecYdsRatio', 197], ['atdRushYdsRatio', 198], ['atdScrimYdsRatio', 199],
      ['volume', 9000], ['geometry', 9001], ['redZone', 9002], ['breakaway', 9003],
      ['roleOpps', 9004], ['roleShare', 9005], ['roleYards', 9006], ['redZoneLooks', 9007],
    ])
    const rank = (column: ColumnDefinition) => {
      const fixed = fixedRank.get(column.id)
      if (fixed != null) return fixed
      if (column.propType) {
        const section = 20 + (propRank.get(column.propType) ?? 50) * 100
        if (column.id.startsWith('picks:')) return section
        if (column.id === 'bestFtd' || column.id === 'bestAtd') return section + 10
        if (column.aggregate) return section + 11
        if (column.vendor) return section + 20 + (bookRank.get(column.vendor) ?? 20)
      }
      const groupRank: Record<ColumnGroup, number> = { core: 900, touchdowns: 1000, props: 2000, usage: 3000, tracking: 4000, team: 5000 }
      return groupRank[column.group] + columns.indexOf(column)
    }
    return [...columns].sort((a, b) => rank(a) - rank(b))
  }, [board, books, game.home.abbr, markets, onToggleSaved, pickMarkets, savedKeys])
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
  const advertised = movers.filter(item => item.move < 0).sort((a, b) => a.move - b.move)[0]
  const hidden = movers.filter(item => item.move > 0).sort((a, b) => b.move - a.move)[0]
  const fanduel = board.gameLines.find(line => normalizedName(line.vendor) === 'fanduel') ?? board.gameLines[0]
  const moneyline = side === 'home' ? fanduel?.moneylineHome : fanduel?.moneylineAway
  const signal = (item: { row: PlayerRow; move: number } | undefined) => {
    if (!item) return <b className={styles.noSignal}>No qualifying move</b>
    const offer = primaryMarketOffer(item.row.market, 'anytime_td')
    return <b className={styles.signalValue}><span>{item.move > 0 ? '+' : ''}{item.move.toFixed(1)}%</span><strong>{item.row.name}</strong>{offer ? <em><BookLogo vendor={offer.offer.vendor} size={13} />{oddsLabel(offer.odds)}</em> : null}</b>
  }
  return (
    <header className={styles.teamHeader} style={{ '--team-color': team.color, '--team-color-2': team.color2 || team.color } as CSSProperties}>
      <div className={styles.teamIdentity}>
        <button type="button" className={`${styles.collapseTeam} ${collapsed ? styles.teamCollapsed : ''}`} onClick={onToggle} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${team.name}`}><ChevronDown size={16} /></button>
        <TeamLogo team={team} size={34} />
        <div><strong>{team.name}</strong><span>vs {opponent.abbr} · {rows.filter(row => row.market).length} priced · {rows.filter(row => row.hasTracking).length} with production</span></div>
      </div>
      <div className={styles.teamSignals}>
        <div className={styles.teamWindows}><small>WINDOW</small><span>{WINDOW_OPTIONS.map(option => <button type="button" key={option.id} className={selectedWindow === option.id ? styles.teamWindowActive : ''} onClick={() => onSelectWindow(option.id)}>{option.label.replace('Last ', 'L')}</button>)}</span></div>
        <div><small>TOP SLIPSURGE SCORE</small><b>{topScore ? `${topScore.name} ${topScore.index}` : 'Syncing'}</b></div>
        <div className={styles.advertised}><small>MOST ADVERTISED · ATD</small>{signal(advertised)}</div>
        <div className={styles.hidden}><small>MOST HIDDEN · ATD</small>{signal(hidden)}</div>
        <div><small>TEAM ML</small><b>{oddsLabel(moneyline)}</b></div>
        <div><small>SAVED MARKETS</small><b>{savedCount}</b></div>
      </div>
    </header>
  )
}

function GameLines({ game, board }: { game: SidelineGame; board: SidelineOddsBoard }) {
  if (!board.gameLines.length) return null
  return (
    <section className={styles.gameLines} aria-label="All sportsbook game lines">
      <header><div><small>GAME MARKET</small><strong>Moneyline · spread · total</strong></div><span><b>{board.gameLines.length}</b> live books</span></header>
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

function PlayerModal({ player, players, team, lens, initialWindow, onSelect, onClose, gameSeason }: {
  player: PlayerRow
  players: PlayerRow[]
  team: SidelineTeam
  lens: SidelineLens
  initialWindow: SidelineWindow
  gameSeason: number
  onSelect: (player: PlayerRow) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'matchup' | 'tracking' | 'markets'>('matchup')
  const [detailWindow, setDetailWindow] = useState<SidelineWindow>(initialWindow)
  const playerIndex = players.findIndex(candidate => candidate.id === player.id)
  const previousPlayer = playerIndex > 0 ? players[playerIndex - 1] : null
  const nextPlayer = playerIndex >= 0 && playerIndex < players.length - 1 ? players[playerIndex + 1] : null
  const activePlayer = useMemo<PlayerRow>(() => {
    const found = lens.windows[detailWindow].players.find(candidate => normalizedTeam(candidate.team) === normalizedTeam(player.team) && normalizedName(candidate.name) === normalizedName(player.name))
    return found ? { ...player, ...found } : player
  }, [detailWindow, lens.windows, player])
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
          <div className={styles.modalHeaderActions}>
            <button type="button" disabled={!previousPlayer} onClick={() => previousPlayer && onSelect(previousPlayer)} aria-label="Previous player"><ChevronLeft size={18} /></button>
            <button type="button" disabled={!nextPlayer} onClick={() => nextPlayer && onSelect(nextPlayer)} aria-label="Next player"><ChevronRight size={18} /></button>
            <button type="button" onClick={onClose}><X size={19} /> Close</button>
          </div>
        </header>
        <nav>
          {(['matchup', 'tracking', 'markets'] as const).map(item => <button key={item} type="button" className={tab === item ? styles.modalTabActive : ''} onClick={() => setTab(item)}>{item === 'matchup' ? 'Matchup' : item === 'tracking' ? 'NFL Tracking' : 'Sportsbooks'}</button>)}
        </nav>
        <div className={styles.modalBody}>
          <div className={styles.modalWindows}>{WINDOW_OPTIONS.map(option => <button type="button" key={option.id} className={detailWindow === option.id ? styles.modalWindowActive : ''} onClick={() => setDetailWindow(option.id)}>{option.label}</button>)}</div>
          {tab === 'matchup' ? (
            <>
              <div className={styles.modalHero}><div className={styles.scoreRing}><Image src="/brand-bolt.png" alt="" width={13} height={18} /><b>{activePlayer.hasTracking ? activePlayer.index : '-'}</b><span>SLIPSURGE SCORE</span></div><div><small>PRIMARY EDGE · {WINDOW_OPTIONS.find(option => option.id === detailWindow)?.label}</small><strong>{activePlayer.lane}</strong><div className={styles.identityBadges}>{activePlayer.rookieSeason === gameSeason ? <span>ROOKIE</span> : null}{activePlayer.sampleTeam && normalizedTeam(activePlayer.sampleTeam) !== normalizedTeam(activePlayer.team) ? <span>PRIOR TEAM: {activePlayer.sampleTeam}</span> : null}{activePlayer.rosterStatus ? <span>{activePlayer.rosterStatus}</span> : null}</div><p>{activePlayer.hasTracking ? 'Current production, role, field geometry and matchup context in the selected window.' : activePlayer.rookieSeason === gameSeason ? 'Player markets are live. Production will populate after the rookie records a qualifying game.' : 'Player markets are live, but no qualifying production sample exists in this selected window.'}</p></div></div>
              <div className={styles.metricCards}>
                {[['Volume', activePlayer.volume], ['Geometry', activePlayer.geometry], ['Red zone', activePlayer.redZone], ['Breakaway', activePlayer.breakaway], ['Evidence', activePlayer.evidence], ['RZ looks', activePlayer.redZoneLooks]].map(([label, value]) => <div key={label}><small>{label}</small><b className={scoreTone(Number(value))}>{activePlayer.hasTracking ? value : '-'}</b></div>)}
              </div>
            </>
          ) : tab === 'tracking' ? (
            <div className={styles.metricCards}>
              {[['Targets', activePlayer.targets], ['Receptions', activePlayer.receptions], ['Target share', `${activePlayer.targetShare}%`], ['Carries', activePlayer.carries], ['Carry share', `${activePlayer.carryShare}%`], ['aDOT', activePlayer.airYards], ['Separation', activePlayer.separation], ['YACOE', activePlayer.yacAboveExpected], ['RYOE/A', activePlayer.rushOverExpected], ['Explosives', activePlayer.explosivePlays], ['Pass yards', activePlayer.passingYards], ['CPOE', activePlayer.cpoe]].map(([label, value]) => <div key={label}><small>{label}</small><b>{activePlayer.hasTracking ? value : '-'}</b></div>)}
            </div>
          ) : (
            <div className={styles.modalMarkets}>
              {markets.map(market => <article key={market.key}><header><strong>{market.label}</strong>{market.line != null ? <span>Line {market.line}</span> : null}</header><div>{market.offers.map(offer => <span key={offer.vendor}><BookLogo vendor={offer.vendor} size={19} /><b>{offerSummary(offer, 'current')}</b><small>{offer.openingLine != null && offer.openingLine !== offer.line ? `OPEN ${offer.openingLine} · ${offerSummary(offer, 'opening')}` : `OPEN ${offerSummary(offer, 'opening')}`}</small></span>)}</div></article>)}
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
          const ftdBaseline = baselineMove(marketPlayer, 'first_td')
          const atdBaseline = baselineMove(marketPlayer, 'anytime_td')
          const ftdAtd = impliedProbabilityRatio(offerCurrent(ftd), offerCurrent(atd))
          const comparisonMarkets = ['first_td', 'anytime_td', 'receptions', 'receiving_yards', 'rushing_yards', 'rushing_receiving_yards', 'passing_yards', 'passing_tds']
            .map(propType => findMarket(marketPlayer, propType))
            .filter(Boolean) as NflPlayerMarket[]
          return <article key={player.id}>
            <header><div><PlayerAvatar player={player} team={team} /><span><b>{player.name}</b><small>{player.team} · {player.position}</small></span></div><button type="button" onClick={() => onRemove(player.id)}><X size={14} /></button></header>
            <div className={styles.compareScore}>
              <span><small><Image src="/brand-bolt.png" alt="" width={9} height={13} /> SLIPSURGE SCORE</small><b className={scoreTone(player.index)}>{player.hasTracking ? player.index : '-'}</b></span>
              <span><small><span className={styles.comparePublicPicks}>$</span> FTD PICKS</small><b>{publicPickCount(marketPlayer, 'first_td')?.toLocaleString() ?? '-'}</b></span>
              <span><small><BookLogo vendor="fanduel" size={13} /> FTD</small><b>{oddsLabel(offerCurrent(ftd))}</b><i>{ftdBaseline?.deltaPct == null ? 'FTD% -' : `FTD% ${(ftdBaseline.deltaPct * 100).toFixed(1)}%`}</i></span>
              <span><small><span className={styles.comparePublicPicks}>$</span> ATD PICKS</small><b>{publicPickCount(marketPlayer, 'anytime_td')?.toLocaleString() ?? '-'}</b></span>
              <span><small><BookLogo vendor="fanduel" size={13} /> ATD</small><b>{oddsLabel(offerCurrent(atd))}</b><i>{atdBaseline?.deltaPct == null ? 'ATD% -' : `ATD% ${(atdBaseline.deltaPct * 100).toFixed(1)}%`}</i></span>
              <span><small>FTD:ATD</small><b>{ftdAtd?.toFixed(2) ?? '-'}</b><i>IMPLIED P</i></span>
            </div>
            <div className={styles.compareMetrics}><span><small>Volume</small><b>{player.volume}</b></span><span><small>RZ</small><b>{player.redZone}</b></span><span><small>Tgt%</small><b>{player.targetShare}%</b></span><span><small>RZ looks</small><b>{player.redZoneLooks}</b></span></div>
            <div className={styles.compareMarkets}>
              {comparisonMarkets.map(market => (
                <div key={market.key}>
                  <small>{market.label}{publicPickCount(marketPlayer, market.propType) != null ? <b>{publicPickCount(marketPlayer, market.propType)!.toLocaleString()} PICKS</b> : null}</small>
                  <span>{market.offers.map(offer => <em key={offer.vendor}><BookLogo vendor={offer.vendor} size={14} /><b>{market.line != null ? `${market.line} ` : ''}{oddsLabel(offerCurrent(offer))}</b><i>{offerOpening(offer) == null ? 'OPEN -' : `OPEN ${oddsLabel(offerOpening(offer))}`}</i></em>)}</span>
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

export function SidelineBoardClient({ games, selectedId, selectedDate, lens, odds, sample = 'previous' }: {
  sample?: NflSample
  games: SidelineGame[]
  selectedId: string
  selectedDate: string
  lens: SidelineLens
  odds: SidelineOddsBoard
}) {
  const router = useRouter()
  const { items: watchlistItems, add: addWatchlist, remove: removeWatchlist } = useWatchlist()
  const selected = games.find(game => game.id === selectedId) ?? games[0]
  const [isPending, startTransition] = useTransition()
  const [windowId, setWindowId] = useState<SidelineWindow>('season')
  const [view, setView] = useState<BoardView>('core')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const marketStory = useSidelineMarket(selectedId, odds)
  const { index: frameIndex, select: setFrameIndex, timeline: history } = marketStory
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
  const [matrices, setMatrices] = useState<NflMatrix[]>([])
  const board = marketStory.board
  const currentBoard = marketStory.current
  const sourceBoards = useMemo(() => [currentBoard, board], [currentBoard, board])
  const availableMarkets = useMemo(() => marketCatalog(sourceBoards), [sourceBoards])
  const availablePickMarkets = useMemo(() => publicPickCatalog(sourceBoards), [sourceBoards])
  const availableBooks = useMemo(() => sportsbookCatalog(sourceBoards), [sourceBoards])
  const savedItems = useMemo(() => watchlistItems.filter(item => item.status === 'pending' && item.sport.toLowerCase() === 'nfl' && item.game_pk === selected.id), [selected.id, watchlistItems])
  const savedKeys = useMemo(() => new Set(savedItems.map(item => `${normalizedTeam(item.team ?? '')}:${normalizedName(item.player_name)}:${item.prop_key.replace(/^nfl:/, '')}:${item.book ?? ''}`)), [savedItems])
  const toggleSavedMarket = useCallback((player: PlayerRow, marketKey: string, vendor: string) => {
    const market = findMarketByKey(player.market, marketKey, vendor)
    const offer = findOffer(market, vendor)
    if (!market || !offer) return
    const key = `${normalizedTeam(player.team)}:${normalizedName(player.name)}:${market.key}:${vendor}`
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
  const columns = useColumnDefinitions({ markets: availableMarkets, pickMarkets: availablePickMarkets, books: availableBooks, board, game: selected, savedKeys, onToggleSaved: toggleSavedMarket })
  const columnSignature = columns.map(column => column.id).join('|')
  const defaultOrder = useMemo(() => columnSignature.split('|'), [columnSignature])
  const defaultVisible = useMemo(() => new Set(columns.filter(column =>
    GAME_DAY_ALWAYS_VISIBLE.has(column.id)
    || (column.propType != null && GAME_DAY_PROP_TYPES.has(column.propType))
  ).map(column => column.id)), [columns])
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder)
  const [visibleIds, setVisibleIds] = useState<Set<string>>(defaultVisible)
  const windowData = lens.windows[windowId]

  useEffect(() => {
    let active = true
    const loadMatrices = async () => {
      try {
        const response = await fetch('/api/nfl-matrices', { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json() as { matrices?: NflMatrix[] }
        if (active) setMatrices(payload.matrices ?? [])
      } catch { /* signed-out and unavailable matrix states are non-fatal */ }
    }
    void loadMatrices()
    window.addEventListener('ss:nfl-matrices-updated', loadMatrices)
    return () => { active = false; window.removeEventListener('ss:nfl-matrices-updated', loadMatrices) }
  }, [])

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
      const identified = mergePlayerIdentity(player, market)
      byId.set(player.id, { ...identified, market, hasTracking: true, teamProfile: profileFor(player.team), opponentProfile: opponentFor(player.team) })
    }
    for (const market of board.players) {
      if (![selected.away.abbr, selected.home.abbr].map(normalizedTeam).includes(normalizedTeam(market.team))) continue
      const tracked = tracking.get(`${normalizedTeam(market.team)}:${normalizedName(market.name)}`)
      if (tracked) continue
      const trackedById = market.gsisId ? byId.get(market.gsisId) : null
      if (trackedById) {
        const identified = mergePlayerIdentity(trackedById, market)
        byId.set(market.gsisId!, { ...trackedById, ...identified, market })
        continue
      }
      const empty = buildEmptyPlayer(market)
      byId.set(empty.id, { ...empty, market, hasTracking: false, teamProfile: profileFor(empty.team), opponentProfile: opponentFor(empty.team) })
    }
    return Array.from(byId.values())
  }, [board, selected.away.abbr, selected.home.abbr, windowData.players, windowData.teams])

  const matrixMatches = useMemo(() => {
    if (!matrices.length) return new Map<string, NflMatrix[]>()
    const playerByWindow = new Map<SidelineWindow, Map<string, SidelinePlayer>>()
    const teamByWindow = new Map<SidelineWindow, Map<string, SidelineTeamProfile>>()
    WINDOW_OPTIONS.forEach(option => {
      playerByWindow.set(option.id, new Map(lens.windows[option.id].players.map(player => [`${normalizedTeam(player.team)}:${normalizedName(player.name)}`, player])))
      teamByWindow.set(option.id, new Map(lens.windows[option.id].teams.map(profile => [normalizedTeam(profile.team.abbr), profile])))
    })
    const candidateFor = (row: PlayerRow) => ({
      id: row.id,
      team: normalizedTeam(row.team),
      values: (factor: NflMatrixFactor) => {
        if (factor.category === 'picks') return publicPickCount(row.market, factor.propType ?? 'anytime_td')
        if (factor.category === 'market') {
          const market = row.market?.markets.find(item => item.propType === factor.propType && (!factor.field || factor.field === 'market')) ?? null
          const offer = findOffer(market, factor.vendor ?? 'fanduel')
          if (factor.marketValue === 'line') return market?.line ?? null
          const current = offerCurrent(offer)
          const opening = offerOpening(offer)
          if (factor.marketValue === 'opening') return opening
          if (factor.marketValue === 'move') return current != null && opening != null ? current - opening : null
          return current
        }
        if (factor.category === 'baseline') {
          const prop = factor.field === 'ftdPct' ? 'first_td' : 'anytime_td'
          const delta = baselineMove(row.market, prop)?.deltaPct
          return delta == null ? null : Math.round(delta * 1000) / 10
        }
        const key = `${normalizedTeam(row.team)}:${normalizedName(row.name)}`
        const windowPlayer = playerByWindow.get(factor.window)?.get(key)
        if (factor.category === 'team') {
          const profile = teamByWindow.get(factor.window)?.get(normalizedTeam(row.team))
          const opponent = teamByWindow.get(factor.window)?.get(normalizedTeam(row.team) === normalizedTeam(selected.away.abbr) ? normalizedTeam(selected.home.abbr) : normalizedTeam(selected.away.abbr))
          const values: Record<string, number | undefined> = {
            teamPassRate: profile?.passRate,
            teamNeutralPassRate: profile?.neutralPassRate,
            teamShotgunRate: profile?.shotgunRate,
            teamNoHuddleRate: profile?.noHuddleRate,
            teamSuccessRate: profile?.successRate,
            teamExplosiveRate: profile?.explosiveRate,
            teamRedZoneTdRate: profile?.redZoneTdRate,
            teamThirdDownRate: profile?.thirdDownRate,
            oppSuccessAllowed: opponent?.defenseSuccessAllowed,
            oppExplosiveAllowed: opponent?.defenseExplosiveAllowed,
          }
          return values[factor.field] ?? null
        }
        if (!windowPlayer) return null
        const values: Record<string, number> = {
          index: windowPlayer.index, volume: windowPlayer.volume, geometry: windowPlayer.geometry, redZone: windowPlayer.redZone,
          breakaway: windowPlayer.breakaway, evidence: windowPlayer.evidence, targets: windowPlayer.targets,
          targetShare: windowPlayer.targetShare, receptions: windowPlayer.receptions, receivingYards: windowPlayer.receivingYards,
          carries: windowPlayer.carries, carryShare: windowPlayer.carryShare, rushingYards: windowPlayer.rushingYards,
          passAttempts: windowPlayer.passAttempts, completions: windowPlayer.completions, passingYards: windowPlayer.passingYards,
          touchdowns: windowPlayer.touchdowns, redZoneLooks: windowPlayer.redZoneLooks, goalLineLooks: windowPlayer.goalLineLooks,
          airYards: windowPlayer.airYards, airYardsShare: windowPlayer.airYardsShare, separation: windowPlayer.separation,
          yacAboveExpected: windowPlayer.yacAboveExpected, rushOverExpected: windowPlayer.rushOverExpected,
          catchRate: windowPlayer.catchRate, completionRate: windowPlayer.completionRate, cpoe: windowPlayer.cpoe,
          timeToThrow: windowPlayer.timeToThrow, explosivePlays: windowPlayer.explosivePlays,
        }
        return values[factor.field] ?? null
      },
    })
    const candidates = rows.map(candidateFor)
    const result = new Map<string, NflMatrix[]>()
    matrices.filter(matrix => matrix.enabled).forEach(matrix => {
      evaluateNflMatrix(matrix, candidates).forEach(id => result.set(id, [...(result.get(id) ?? []), matrix]))
    })
    return result
  }, [lens.windows, matrices, rows, selected.away.abbr, selected.home.abbr])

  const resolvedColumns = useMemo(() => {
    const ordered = columnOrder.map(id => columns.find(column => column.id === id)).filter(Boolean) as ColumnDefinition[]
    if (view === 'custom') return ordered.filter(column => visibleIds.has(column.id))
    const positions = ROLE_OPTIONS.find(option => option.id === roleFilter)?.positions ?? []
    const activeRows = rows.filter(row => !erased.has(row.id) && (!positions.length || positions.includes(row.position)))
    const hasValue = (column: ColumnDefinition) => GAME_DAY_FOUNDATIONS.has(column.id) || activeRows.some(row => column.value(row) != null)
    if (view === 'all') return ordered.filter(hasValue)
    if (view === 'core') {
      return ordered.filter(column => {
        const isGameDayColumn = GAME_DAY_ALWAYS_VISIBLE.has(column.id)
          || (column.propType != null && GAME_DAY_PROP_TYPES.has(column.propType))
        const defaultBook = !column.vendor || (column.vendor === 'fanduel' && ['first_td', 'anytime_td'].includes(column.propType ?? ''))
        return isGameDayColumn && defaultBook && (!column.id.startsWith('picks:') || GAME_DAY_ALWAYS_VISIBLE.has(column.id)) && (GAME_DAY_ALWAYS_VISIBLE.has(column.id) || hasValue(column))
      })
    }
    return ordered.filter(column => GAME_DAY_FOUNDATIONS.has(column.id) || (column.group === view && hasValue(column)))
  }, [columnOrder, columns, erased, roleFilter, rows, view, visibleIds])

  const columnById = useMemo(() => new Map(columns.map(column => [column.id, column])), [columns])
  const sortedRows = (team: string) => rows
    .filter(row => {
      if (normalizedTeam(row.team) !== normalizedTeam(team) || erased.has(row.id)) return false
      const positions = ROLE_OPTIONS.find(option => option.id === roleFilter)?.positions ?? []
      return !positions.length || positions.includes(row.position)
    })
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

  const selectGame = (game: SidelineGame) => startTransition(() => router.replace(`/the-sideline?date=${game.gameday}&game=${encodeURIComponent(game.id)}&sample=${sample}`, { scroll: false }))
  const selectDate = (date: string) => startTransition(() => router.replace(`/the-sideline?date=${date}&sample=${sample}`, { scroll: false }))
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
  const frameTime = marketStory.capturedAt ?? board.capturedAt
  const capturedLabel = frameTime ? new Date(frameTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : 'Awaiting markets'

  return (
    <div className={`${styles.page} ${isPending ? styles.loading : ''}`}>
      <header className={styles.brandHeader}>
        <div className={styles.brandIcon}><Image src="/brand-bolt.png" alt="" width={18} height={28} /></div>
        <div><h1>The Sideline <span>ULTIMATE</span></h1><p>NFL markets, player roles and matchup intelligence</p></div>
        <div className={styles.brandActions}>
          <label className={styles.sampleControl}>Stat sample
            <select aria-label="NFL statistical sample" value={sample} disabled={isPending} onChange={event => startTransition(() => router.replace(`/the-sideline?date=${selectedDate}&game=${encodeURIComponent(selected.id)}&sample=${event.target.value}`, { scroll: false }))}>
              {(['previous', 'preseason', 'regular'] as const).map(value => <option key={value} value={value}>{nflSampleReference(selected.season, value).label}</option>)}
            </select>
          </label>
          <span className={styles.coverageBadge} title={lens.coverage.detail}>{lens.coverage.label} · {lens.status === 'awaiting-data' ? 'Awaiting data' : 'Stored sample'}</span>
          <div className={styles.privateBadge}><LockKeyhole size={13} /> Admin preview · private</div>
        </div>
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
        <article title={lens.coverage.detail}><small>MATCHUP + DATA</small><strong>{lens.headline}</strong><span>{lens.coverage.label} · {lens.headlineDetail}</span></article>
        <article><small>FANDUEL GAME LINE</small><strong>{selected.away.abbr} {oddsLabel(gameMoneyline(board, 'away'))} · {selected.home.abbr} {oddsLabel(gameMoneyline(board, 'home'))}</strong><span>{board.gameLines.length} sportsbooks captured</span></article>
        <article className={styles.marketStory}>
          <div><small>MARKET STORY</small><strong>{frameIndex === 0 ? 'OPENING CAPTURE' : frameIndex === history.length - 1 ? 'CURRENT' : `CAPTURE ${frameIndex + 1}`}</strong></div>
          {marketStory.error ? <span role="alert">{marketStory.error} <button type="button" onClick={marketStory.retry}>Retry</button></span> : null}
          <input aria-label="Market Story capture" type="range" min={0} max={Math.max(0, history.length - 1)} value={frameIndex} disabled={history.length < 2} onChange={event => setFrameIndex(Number(event.target.value))} />
          <span>{marketStory.loading ? 'Loading selected capture · ' : ''}{history.length} captures · {capturedLabel}{board.picksCapturedAt ? ` · Picks ${new Date(board.picksCapturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
        </article>
      </section>

      {board.status !== 'ready' ? <section className={styles.marketStatus}>
        <div><strong>{board.status === 'not-posted' ? 'Player markets have not posted yet' : 'Sportsbook feed is temporarily unavailable'}</strong><span>{board.status === 'not-posted' ? 'Tracking, matchup and team context remain available. Odds columns will appear automatically when books publish this game.' : 'The board is showing the last valid context without inventing or zero-filling missing prices.'}</span></div>
      </section> : null}

      <details className={styles.gameLinesDisclosure}>
        <summary>Sportsbook game lines <span>{board.gameLines.length} books · moneyline, spread, total</span></summary>
        <GameLines game={selected} board={board} />
      </details>

      {toolsOpen ? <section className={styles.toolsPanel}>
        <button type="button" className={stickySort ? styles.toolActive : ''} onClick={() => setStickySort(value => !value)}><Layers3 size={15} /> Sticky sort {stickySort ? 'on' : 'off'}</button>
        <button type="button" className={highlighter ? styles.toolActive : ''} onClick={() => { setHighlighter(value => !value); setEraser(false) }}><Highlighter size={15} /> Highlighter</button>
        <div className={styles.palette}>{(['lime', 'cyan', 'amber', 'rose'] as HighlightColor[]).map(color => <button key={color} type="button" className={`${styles[color]} ${highlightColor === color ? styles.paletteActive : ''}`} onClick={() => { setHighlightColor(color); setHighlighter(true); setEraser(false) }} aria-label={`${color} highlighter`} />)}</div>
        <button type="button" className={eraser ? styles.eraseActive : ''} onClick={() => { setEraser(value => !value); setHighlighter(false) }}><Eraser size={15} /> Eraser</button>
        <button type="button" onClick={() => { setSorts([{ id: 'index', direction: 'desc' }]); setHighlights({}); setErased(new Set()) }}><RotateCcw size={15} /> Clear board tools</button>
      </section> : null}

      <nav className={styles.viewTabs} aria-label="NFL board column groups">{VIEW_OPTIONS.map(option => <button key={option.id} type="button" className={view === option.id ? styles.viewActive : ''} onClick={() => setView(option.id)}>{option.label}</button>)}</nav>
      <nav className={styles.roleTabs} aria-label="NFL position lanes">{ROLE_OPTIONS.map(option => <button key={option.id} type="button" className={roleFilter === option.id ? styles.roleActive : ''} onClick={() => setRoleFilter(option.id)}>{option.label}</button>)}</nav>

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
                const isPublicPicks = column.id.startsWith('picks:')
                return <th key={column.id} className={`${column.sticky ? styles.stickyCell : ''} ${isPublicPicks ? styles.picksColumn : ''}`} style={{ width: column.width, minWidth: column.width }} title={column.title}><button type="button" onClick={() => changeSort(column.id)}>{column.brand ? <Image className={styles.scoreLogo} src="/brand-bolt.png" alt="SlipSurge" width={9} height={13} /> : column.vendor ? <BookLogo vendor={column.vendor} size={14} /> : isPublicPicks ? <i className={styles.picksHeaderMark}>$</i> : null}<span>{column.label}</span>{sort ? <em>{sort.direction === 'desc' ? <ChevronDown size={9} /> : <ChevronUp size={9} />}{stickySort ? rank + 1 : ''}</em> : null}</button></th>
              })}</tr></thead>
              <tbody>{section.rows.map((player, index) => {
                const compareActive = compareIds.includes(player.id)
                return <tr key={player.id} className={eraser ? styles.eraserRow : ''} onClick={() => { if (eraser) setErased(current => new Set([...current, player.id])) }}>
                  {resolvedColumns.map(column => {
                    const highlight = highlights[`${player.id}:${column.id}`]
                    const automaticHeat = heatStyle(column, player, section.rows)
                    const matches = matrixMatches.get(player.id) ?? []
                    return <td key={column.id} className={`${column.sticky ? styles.stickyCell : ''} ${column.id.startsWith('picks:') ? styles.picksColumn : ''} ${automaticHeat ? styles.heatCell : ''} ${highlight ? styles[`highlight${highlight.charAt(0).toUpperCase()}${highlight.slice(1)}`] : ''}`} style={{ width: column.width, minWidth: column.width, ...automaticHeat }} onClick={() => toggleHighlight(player, column)}>
                      {column.id === 'player' && matches.length ? <span className={styles.matrixRail} title={matches.map(matrix => matrix.name).join(' · ')}>{matches.slice(0, 5).map(matrix => <i key={matrix.id} style={{ background: matrix.color }} />)}{matches.length > 5 ? <b>+{matches.length - 5}</b> : null}</span> : null}
                      {column.id === 'player' ? <div className={styles.playerCell}><span className={styles.depth}>{index + 1}</span><PlayerAvatar player={player} team={section.team} /><button type="button" className={styles.playerName} onClick={event => { event.stopPropagation(); setExpanded(player) }}><b>{player.name}</b><small>{player.position}{player.jersey ? ` · #${player.jersey}` : ''}{player.rookieSeason === selected.season ? ' · ROOKIE' : ''}{player.sampleTeam && normalizedTeam(player.sampleTeam) !== normalizedTeam(player.team) ? ` · ${player.sampleTeam} SAMPLE` : ''}</small></button><button type="button" className={compareActive ? styles.compareActive : ''} onClick={event => { event.stopPropagation(); toggleCompare(player.id) }} aria-label={`Compare ${player.name}`}>{compareActive ? <Minus size={14} /> : <Plus size={14} />}</button><button type="button" onClick={event => { event.stopPropagation(); setExpanded(player) }} aria-label={`Open ${player.name}`}><ChevronDown size={14} /></button></div> : column.render(player)}
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

      {(expanded || columnsOpen) ? createPortal(<div className={styles.modalTheme}>
        {expanded ? <PlayerModal player={expanded} players={rows} team={allTeams.find(team => normalizedTeam(team.abbr) === normalizedTeam(expanded.team)) ?? selected.away} lens={lens} gameSeason={selected.season} initialWindow={windowId} onSelect={setExpanded} onClose={() => setExpanded(null)} /> : null}
        {columnsOpen ? <ColumnManager columns={columns} visibleIds={visibleIds} order={columnOrder} onVisible={id => setVisibleIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); next.add('player'); return next })} onMove={moveColumn} onReset={() => { setColumnOrder(defaultOrder); setVisibleIds(defaultVisible) }} onClose={() => setColumnsOpen(false)} /> : null}
      </div>, document.body) : null}
    </div>
  )
}
