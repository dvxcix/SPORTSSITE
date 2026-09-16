'use client'

import Image from 'next/image'
import { useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react'
import {
  Activity,
  BarChart3,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flame,
  Gauge,
  Layers3,
  Radar,
  ScanSearch,
  Search,
  Target,
  TimerReset,
  TrendingUp,
  UsersRound,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import { rankMlbSlateEdge, type MlbSlateEdgeRank } from '@/lib/mlbSlateEdgeRanking'
import type { DugoutMomentumResult } from '@/lib/dugoutMomentum'
import { BatterCharge } from './BatterCharge'
import styles from './SlateEdgeOverlay.module.css'

export type SlateEdgeWindow = 'l1' | 'l3' | 'l5' | 'l10'

export type SlateEdgeEntry = {
  gameKey: string
  gamePk: string | null
  gameLabel: string
  awayAbbr: string
  homeAbbr: string
  status: string | null
  gameTime: string | null
  lineupsConfirmed: boolean
  mlbId: number | null
  name: string
  team: string
  position: string
  battingOrder: number | null
  score: number | null
  scoreRank: number | null
  scoreConfidence: number | null
  paper: number | null
  bookRank: number | null
  modelRank: number | null
  mm: number | null
  pitchFit: number | null
  barrelSeason: number | null
  barrelRecent: number | null
  barrelDelta: number | null
  barrelL3: number | null
  barrelL3Delta: number | null
  barrelL5: number | null
  barrelL5Delta: number | null
  hardHitDelta: number | null
  pullAirRecent: number | null
  pullAirDelta: number | null
  timingDelta: number | null
  fhr: number | null
  fhrOpen: number | null
  fhrBaseline: number | null
  hr: number | null
  hrOpen: number | null
  hrBaseline: number | null
  hrBooks: Array<{ book: string; price: number }>
  marketLadder: Array<{ key: string; label: string; current: number | null; open: number | null }>
  publicPicks: number | null
  momentum: DugoutMomentumResult
}

type View = 'rankings' | 'matchups' | 'market' | 'signals'
type Sort = 'edge' | 'signals' | 'score' | 'model' | 'movement' | 'picks' | 'pitch'
type SignalKind = 'model' | 'market' | 'pitch' | 'barrel' | 'hardHit' | 'pullAir' | 'timing' | 'fhr' | 'hr' | 'books' | 'picks' | 'lineup' | 'quiet' | 'retained' | 'baseline' | 'structure'
type SignalChip = {
  label: string
  value: number
  kind: SignalKind
  direction?: 'shortened' | 'lengthened' | 'flat'
  books?: string[]
}

type EvidenceTag = {
  key: 'consensus' | 'established' | 'ignition' | 'marketRescued' | 'singleWindow' | 'contradictory' | 'lineupRisk'
  label: string
  detail: string
}

type WindowEvidence = {
  edgeRank: number
  scoreRank: number
}

const SORT_OPTIONS = [
  { value: 'edge' as const, label: 'Slate Edge Rank', detail: 'Best complete pregame profile', Icon: Zap },
  { value: 'signals' as const, label: 'Signal Strength', detail: 'Strongest multi-signal stack', Icon: Layers3 },
  { value: 'score' as const, label: 'SlipSurge Score', detail: 'Highest composite signal', Icon: Zap },
  { value: 'model' as const, label: 'Model gap', detail: 'Largest model-market split', Icon: BrainCircuit },
  { value: 'movement' as const, label: 'Market movement', detail: 'Largest FHR or HR move', Icon: TrendingUp },
  { value: 'picks' as const, label: 'Public picks', detail: 'Most tracked action', Icon: UsersRound },
  { value: 'pitch' as const, label: 'Pitch fit', detail: 'Strongest matchup fit', Icon: Target },
]

const WINDOWS: Array<{ value: SlateEdgeWindow; short: string; label: string }> = [
  { value: 'l1', short: 'L1', label: 'Last 1' },
  { value: 'l3', short: 'L3', label: 'Last 3' },
  { value: 'l5', short: 'L5', label: 'Last 5' },
  { value: 'l10', short: 'L10', label: 'Last 10' },
]

const odds = (value: number | null) => value == null ? '—' : value > 0 ? `+${value}` : String(value)
const signed = (value: number | null, suffix = '') => value == null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value)}${suffix}`
const pctRaw = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`
const move = (current: number | null, open: number | null) => current != null && open != null ? current - open : null
const range = (entry: SlateEdgeEntry) => {
  const prices = entry.hrBooks.map(offer => offer.price)
  return prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : null
}

const heatStyle = (value: number | null, center = 0, span = 10): CSSProperties | undefined => {
  if (value == null) return undefined
  const strength = Math.min(1, Math.abs(value - center) / Math.max(span, 0.001))
  const positive = value >= center
  return {
    background: positive
      ? `linear-gradient(90deg, rgba(34,197,94,${0.05 + strength * 0.17}), rgba(34,197,94,${0.02 + strength * 0.07}))`
      : `linear-gradient(90deg, rgba(244,63,94,${0.05 + strength * 0.15}), rgba(244,63,94,${0.02 + strength * 0.06}))`,
  }
}

function ScoreMark({ value, compact = false }: { value: number | null; compact?: boolean }) {
  if (value == null) return <span className={styles.scoreMissing} aria-label="SlipSurge Score unavailable">—</span>
  return <MechanicsScoreRing score={value} label="SlipSurge Score" size="small" className={compact ? styles.scoreCompact : undefined} />
}

function SlipSurgeMark({ size = 14, className }: { size?: number; className?: string }) {
  return <Image src="/logo.png" alt="" aria-hidden="true" width={size} height={size} className={className} />
}

function EdgeMark({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = value >= 70 ? '#adff42' : value >= 50 ? '#47d7f7' : value >= 30 ? '#ffca62' : '#fb7893'
  const dialStyle = {
    '--edge-color': tone,
    '--edge-progress': `${Math.max(0, Math.min(100, value))}%`,
  } as CSSProperties
  return <span className={styles.edgeMark} data-compact={compact} style={dialStyle} aria-label={`Slate Edge index ${value}`}>
    <span className={styles.edgeDial}><b>{value}</b></span>
    <small><SlipSurgeMark size={compact ? 9 : 11} />Edge</small>
  </span>
}

function RankMark({ rank, edge, marketScore, marketOverlay }: { rank: number; edge?: number; marketScore?: number; marketOverlay?: number }) {
  return <span className={styles.rankCluster}>
    {marketScore != null && <span className={styles.rankMarketCap}>
      <span>Market</span>
      <strong>{marketScore}</strong>
      {marketOverlay != null && <em data-tone={marketOverlay > 0 ? 'up' : marketOverlay < 0 ? 'down' : 'flat'}>{signed(marketOverlay)}</em>}
    </span>}
    <span className={styles.rankMark}>
      <span className={styles.rankNumber}><small>Rank</small><b>#{String(rank).padStart(2, '0')}</b></span>
      {edge == null ? <span className={styles.scoreMissing}>—</span> : <EdgeMark value={edge} compact />}
    </span>
  </span>
}

function MmMark({ entry, compact = false }: { entry: SlateEdgeEntry; compact?: boolean }) {
  return <span className={styles.mmMark} data-tone={(entry.mm ?? 0) > 0 ? 'model' : (entry.mm ?? 0) < 0 ? 'market' : 'even'} data-compact={compact}>
    <b>MM {signed(entry.mm)}</b>
    {!compact && <small>Model #{entry.modelRank ?? '—'} · Book #{entry.bookRank ?? '—'}</small>}
  </span>
}

function BookPrice({ market, value, delta }: { market: 'FHR' | 'HR'; value: number | null; delta?: number | null }) {
  const open = value != null && delta != null ? value - delta : null
  return <span className={styles.bookPrice}>
    <span className={styles.bookLine}><BookLogo vendor="fanduel" size={14} /><small>FD {market}</small><b>{odds(value)}</b></span>
    {delta != null
      ? <span className={styles.movement} data-direction={delta < 0 ? 'shortened' : delta > 0 ? 'lengthened' : 'flat'}>
          <span className={styles.openPrice}>Opened <strong>{odds(open)}</strong></span>
          <span className={styles.movementBadge}>{delta < 0 ? 'Shortened' : delta > 0 ? 'Lengthened' : 'Held'}{delta === 0 ? '' : ` ${signed(delta)}`}</span>
        </span>
      : <span className={styles.movement}><span className={styles.openPrice}>Opening price unavailable</span></span>}
  </span>
}

function MarketPair({ entry }: { entry: SlateEdgeEntry }) {
  return <span className={styles.marketPair}>
    <BookPrice market="FHR" value={entry.fhr} delta={move(entry.fhr, entry.fhrOpen)} />
    <BookPrice market="HR" value={entry.hr} delta={move(entry.hr, entry.hrOpen)} />
  </span>
}

function Avatar({ entry, size = 34 }: { entry: SlateEdgeEntry; size?: number }) {
  return (
    <PlayerAvatar
      headshot={entry.mlbId ? mlbHeadshot(entry.mlbId) : null}
      teamLogo={getTeamLogoUrl(entry.team)}
      teamAbbr={entry.team}
      name={entry.name}
      size={size}
      showTeam
    />
  )
}

const playerKey = (entry: SlateEdgeEntry) => `${entry.gameKey}:${entry.mlbId != null ? String(entry.mlbId) : entry.name.toLowerCase()}`

function EvidenceTags({ tags }: { tags: EvidenceTag[] }) {
  if (!tags.length) return null
  return <span className={styles.evidenceTags} aria-label="Cross-window evidence">
    {tags.map(tag => <span key={tag.key} className={styles.evidenceTag} data-kind={tag.key} title={tag.detail}>{tag.label}</span>)}
  </span>
}

function BaselineMarket({ market, current, baseline }: { market: 'HR' | 'FHR'; current: number | null; baseline: number | null }) {
  if (current == null || baseline == null) return null
  const difference = Math.round(current - baseline)
  const direction = difference < 0 ? 'shorter' : difference > 0 ? 'longer' : 'flat'
  const movement = direction === 'shorter' ? `▼ ${Math.abs(difference).toLocaleString()}` : direction === 'longer' ? `▲ ${Math.abs(difference).toLocaleString()}` : 'Held'
  const currentPosition = 50 + Math.max(-34, Math.min(34, difference / 12))
  const marketName = market === 'FHR' ? 'First HR' : 'Anytime HR'
  const tileStyle = { '--market-position': `${currentPosition}%` } as CSSProperties
  return <span className={styles.baselineMarket} data-market={market} data-direction={direction} style={tileStyle} title={`${marketName}: ${odds(current)}; ${Math.abs(difference)} points ${direction} than ${odds(baseline)} norm`}>
    <span className={styles.baselineMarketHead}><b>{market}</b><small>{marketName}</small></span>
    <span className={styles.baselineMarketPrice}><strong>{odds(current)}</strong><i>{movement}</i></span>
    <span className={styles.baselineTrack} aria-hidden="true"><span className={styles.baselineNormDot} /><span className={styles.baselineCurrentDot} /></span>
    <span className={styles.baselineMarketFoot}><small>Current</small><span>Norm <b>{odds(baseline)}</b></span></span>
  </span>
}

function BaselineMarketRead({ entry }: { entry: SlateEdgeEntry }) {
  const hasBaseline = (entry.hr != null && entry.hrBaseline != null) || (entry.fhr != null && entry.fhrBaseline != null)
  if (!hasBaseline) return <span className={styles.baselineReadEmpty}>Baseline unavailable</span>
  return <span className={styles.baselineRead} aria-label="Home run prices versus player baseline">
    <BaselineMarket market="HR" current={entry.hr} baseline={entry.hrBaseline} />
    <BaselineMarket market="FHR" current={entry.fhr} baseline={entry.fhrBaseline} />
  </span>
}

function MarketStructureTags({ edge }: { edge: MlbSlateEdgeRank | undefined }) {
  if (!edge) return null
  const badges = edge.marketBadges.filter(label => !label.includes('shorter than own norm') && !label.includes('longer than own norm'))
  if (!badges.length) return null
  return <span className={styles.marketStructureTags} title={edge.marketExplanation ?? undefined} aria-label={edge.marketExplanation ?? 'Market structure'}>
    {badges.slice(0, 2).map(label => <span
      key={label}
    >{label}</span>)}
  </span>
}

function LeaderWindows({ windows }: { windows: SlateEdgeWindow[] }) {
  if (!windows.length) return null
  const everyWindow = windows.length === WINDOWS.length
  const label = everyWindow ? 'Leader · all windows' : 'Leader · ' + windows.map(value => value.toUpperCase()).join(' / ')
  return <span className={styles.leaderWindows} data-all={everyWindow}><Crosshair size={10} />{label}</span>
}

function PlayerIdentity({ entry, size = 40, leaderWindows = [], evidenceTags = [] }: {
  entry: SlateEdgeEntry
  size?: number
  leaderWindows?: SlateEdgeWindow[]
  evidenceTags?: EvidenceTag[]
}) {
  return <span className={styles.playerIdentity}>
    <BatterCharge momentum={entry.momentum} className={styles.batterCharge} />
    <Avatar entry={entry} size={size} />
    <span className={styles.playerCopy}>
      <strong>{entry.name}</strong>
      <span><TeamLogo abbr={entry.team} />{entry.team} · {entry.position}{entry.battingOrder ? ' · Batting #' + entry.battingOrder : ''}</span>
      <LeaderWindows windows={leaderWindows} />
      <EvidenceTags tags={evidenceTags} />
    </span>
  </span>
}

function TeamLogo({ abbr }: { abbr: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={getTeamLogoUrl(abbr)} alt="" aria-hidden="true" />
}

function GameMatchupMark({ away, home }: { away: string; home: string }) {
  return <span className={styles.gameMatchupMark} aria-hidden="true">
    <span><TeamLogo abbr={away} /></span>
    <b>@</b>
    <span><TeamLogo abbr={home} /></span>
  </span>
}

function BarrelGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5c2.8-1 7.2-1 10 0l1 3.5-1 8-1 3.5c-2.6 1-5.4 1-8 0L7 16 6 8l1-3.5Z" /><path d="M6.5 8h11M7 16h10M9 4v16M15 4v16" /></svg>
}

function BookStack({ books = [] }: { books?: string[] }) {
  const visible = [...new Set(books)].slice(0, 4)
  return <span className={styles.bookStack} aria-label={visible.length ? `${visible.join(', ')} disagreement` : 'Sportsbook disagreement'}>
    {(visible.length ? visible : ['fanduel', 'betmgm', 'fanatics']).map(book => <span key={book}><BookLogo vendor={book} size={16} /></span>)}
  </span>
}

function SignalGlyph({ chip }: { chip: SignalChip }) {
  if (chip.kind === 'books') return <BookStack books={chip.books} />
  if (chip.kind === 'picks') return <span className={styles.picksGlyph}><UsersRound size={13} /><Zap size={7} /></span>
  if (chip.kind === 'barrel') return <span className={styles.barrelGlyph}><BarrelGlyph /></span>
  if (chip.kind === 'hardHit') return <Gauge size={13} />
  if (chip.kind === 'model') return <BrainCircuit size={13} />
  if (chip.kind === 'market') return <Radar size={13} />
  if (chip.kind === 'pitch') return <Target size={13} />
  if (chip.kind === 'pullAir') return <Wind size={13} />
  if (chip.kind === 'timing') return <TimerReset size={13} />
  if (chip.kind === 'lineup') return <BarChart3 size={13} />
  if (chip.kind === 'quiet') return <ScanSearch size={13} />
  if (chip.kind === 'retained') return <Radar size={13} />
  if (chip.kind === 'baseline') return <Activity size={13} />
  if (chip.kind === 'structure') return <Layers3 size={13} />
  if (chip.kind === 'fhr') return <Crosshair size={13} />
  if (chip.kind === 'hr') return <Flame size={13} />
  return <Layers3 size={13} />
}

function signalChips(entry: SlateEdgeEntry, pitchBaseline: number | null, edge: MlbSlateEdgeRank | undefined) {
  const chips: SignalChip[] = []
  edge?.marketBadges.slice(0, 2).forEach((label, index) => chips.push({
    label,
    value: 46 - index * 2,
    kind: label.includes('norm') ? 'baseline' : label.includes('Ladder') ? 'structure' : 'retained',
  }))
  if (entry.mm != null && Math.abs(entry.mm) >= 2) chips.push({ label: entry.mm > 0 ? `Model +${entry.mm}` : `Market +${Math.abs(entry.mm)}`, value: Math.abs(entry.mm) * 12, kind: entry.mm > 0 ? 'model' : 'market' })
  if (entry.pitchFit != null && pitchBaseline != null && entry.pitchFit > pitchBaseline + 8) chips.push({ label: `Pitch fit +${Math.round(entry.pitchFit - pitchBaseline)}`, value: entry.pitchFit - pitchBaseline, kind: 'pitch' })
  const recentBarrelDelta = Math.max(entry.barrelL3Delta ?? -Infinity, entry.barrelL5Delta ?? -Infinity, entry.barrelDelta ?? -Infinity)
  if (Number.isFinite(recentBarrelDelta) && Math.abs(recentBarrelDelta) >= 1) chips.push({ label: 'Recent barrel ' + signed(recentBarrelDelta), value: Math.abs(recentBarrelDelta) * 5, kind: 'barrel' })
  if (entry.hardHitDelta != null && Math.abs(entry.hardHitDelta) >= 2) chips.push({ label: `Hard-hit ${signed(entry.hardHitDelta)}`, value: Math.abs(entry.hardHitDelta) * 2, kind: 'hardHit' })
  if (entry.pullAirDelta != null && Math.abs(entry.pullAirDelta) >= .02) chips.push({ label: `Pull-air ${signed(entry.pullAirDelta * 100, 'pp')}`, value: Math.abs(entry.pullAirDelta) * 100, kind: 'pullAir' })
  if (entry.timingDelta != null && Math.abs(entry.timingDelta) >= .02) chips.push({ label: `Timing ${signed(entry.timingDelta * 100, 'pp')}`, value: Math.abs(entry.timingDelta) * 100, kind: 'timing' })
  const hrMove = move(entry.hr, entry.hrOpen)
  const fhrMove = move(entry.fhr, entry.fhrOpen)
  if (hrMove != null && Math.abs(hrMove) >= 20) chips.push({ label: `HR ${signed(hrMove)}`, value: Math.abs(hrMove) / 3, kind: 'hr', direction: hrMove < 0 ? 'shortened' : hrMove > 0 ? 'lengthened' : 'flat' })
  if (fhrMove != null && Math.abs(fhrMove) >= 20) chips.push({ label: `FHR ${signed(fhrMove)}`, value: Math.abs(fhrMove) / 3, kind: 'fhr', direction: fhrMove < 0 ? 'shortened' : fhrMove > 0 ? 'lengthened' : 'flat' })
  const bookGap = range(entry)
  if (bookGap != null && bookGap >= 75) chips.push({ label: `${bookGap} pts`, value: bookGap / 5, kind: 'books', books: entry.hrBooks.map(offer => offer.book) })
  if (entry.lineupsConfirmed && entry.battingOrder != null && entry.battingOrder <= 4) chips.push({ label: 'Batting #' + entry.battingOrder, value: (5 - entry.battingOrder) * 7, kind: 'lineup' })
  if (edge?.marketPosture === 'quiet') chips.push({ label: 'HR markets held flat', value: 28, kind: 'quiet', direction: 'flat' })
  if (entry.publicPicks != null && edge && edge.lowPublicStrength >= 0.6) chips.push({ label: entry.publicPicks.toLocaleString() + ' picks · low public', value: edge.lowPublicStrength * 35, kind: 'picks' })
  return chips.sort((a, b) => b.value - a.value).slice(0, 5)
}

const signalRankValue = (chips: SignalChip[]) =>
  chips.reduce((sum, chip) => sum + Math.min(chip.value, 40), 0) + chips.length * 12

function SortMenu({ value, view, onChange }: { value: Sort; view: View; onChange: (sort: Sort) => void }) {
  const options = view === 'signals' ? SORT_OPTIONS : SORT_OPTIONS.filter(option => option.value !== 'signals')
  const selected = options.find(option => option.value === value) ?? options[0]
  const SelectedIcon = selected.Icon
  return <details
    className={styles.sortMenu}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.removeAttribute('open')
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') event.currentTarget.removeAttribute('open')
    }}
  >
    <summary aria-label={`Sort Slate Edge by ${selected.label}`}>
      <span className={styles.sortGlyph}><SelectedIcon size={15} /></span>
      <span className={styles.sortCopy}><small>Sort board</small><b>{selected.label}</b></span>
      <ChevronDown className={styles.sortChevron} size={15} />
    </summary>
    <div className={styles.sortPopover} role="listbox" aria-label="Sort Slate Edge">
      {options.map(option => {
        const Icon = option.Icon
        return <button
          type="button"
          role="option"
          aria-selected={option.value === value}
          data-active={option.value === value}
          key={option.value}
          onClick={event => {
            onChange(option.value)
            event.currentTarget.closest('details')?.removeAttribute('open')
          }}
        >
          <span><Icon size={15} /></span>
          <span><b>{option.label}</b><small>{option.detail}</small></span>
          {option.value === value ? <i>Active</i> : null}
        </button>
      })}
    </div>
  </details>
}

export function SlateEdgeOverlay({ open, date, entriesByWindow, dataWindow, onWindowChange, onClose, onOpenPlayer }: {
  open: boolean
  date: string
  entriesByWindow: Record<SlateEdgeWindow, SlateEdgeEntry[]>
  dataWindow: SlateEdgeWindow
  onWindowChange: (window: SlateEdgeWindow) => void
  onClose: () => void
  onOpenPlayer: (entry: SlateEdgeEntry) => void
}) {
  const entries = entriesByWindow[dataWindow]
  const [view, setView] = useState<View>('rankings')
  const [query, setQuery] = useState('')
  const [game, setGame] = useState('all')
  const [sort, setSort] = useState<Sort>('edge')
  const gameRailRef = useRef<HTMLDivElement>(null)

  const scrollGames = (direction: -1 | 1) => gameRailRef.current?.scrollBy({ left: direction * Math.max(260, gameRailRef.current.clientWidth * .72), behavior: 'smooth' })
  const wheelGames = (event: WheelEvent<HTMLDivElement>) => {
    if (!gameRailRef.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    gameRailRef.current.scrollLeft += event.deltaY
    event.preventDefault()
  }

  const games = useMemo(() => {
    const map = new Map<string, SlateEdgeEntry>()
    entries.forEach(entry => { if (!map.has(entry.gameKey)) map.set(entry.gameKey, entry) })
    return [...map.values()]
  }, [entries])

  const edgeRanks = useMemo(() => rankMlbSlateEdge(entries), [entries])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = entries.filter(entry =>
      (game === 'all' || entry.gameKey === game) &&
      (!needle || entry.name.toLowerCase().includes(needle) || entry.team.toLowerCase().includes(needle) || entry.gameLabel.toLowerCase().includes(needle)),
    )
    return [...rows].sort((a, b) => {
      if (sort === 'edge') return (edgeRanks.get(b)?.score ?? -1) - (edgeRanks.get(a)?.score ?? -1) || (b.score ?? -1) - (a.score ?? -1)
      if (sort === 'model') return (b.mm ?? -999) - (a.mm ?? -999)
      if (sort === 'movement') return Math.max(Math.abs(move(b.hr, b.hrOpen) ?? 0), Math.abs(move(b.fhr, b.fhrOpen) ?? 0)) - Math.max(Math.abs(move(a.hr, a.hrOpen) ?? 0), Math.abs(move(a.fhr, a.fhrOpen) ?? 0))
      if (sort === 'picks') return (b.publicPicks ?? -1) - (a.publicPicks ?? -1)
      if (sort === 'pitch') return (b.pitchFit ?? -999) - (a.pitchFit ?? -999)
      return (b.score ?? -1) - (a.score ?? -1) || (b.paper ?? -999) - (a.paper ?? -999)
    })
  }, [edgeRanks, entries, game, query, sort])

  const leader = filtered[0] ?? null
  const modelAhead = filtered.filter(entry => (entry.mm ?? 0) >= 3).length
  const movers = filtered.filter(entry => Math.max(Math.abs(move(entry.hr, entry.hrOpen) ?? 0), Math.abs(move(entry.fhr, entry.fhrOpen) ?? 0)) >= 50).length
  const confirmedGames = new Set(filtered.filter(entry => entry.lineupsConfirmed).map(entry => entry.gameKey)).size
  const pitchBaselines = useMemo(() => {
    const totals = new Map<string, { sum: number; count: number }>()
    entries.forEach(entry => {
      if (entry.pitchFit == null) return
      const current = totals.get(entry.gameKey) ?? { sum: 0, count: 0 }
      current.sum += entry.pitchFit
      current.count += 1
      totals.set(entry.gameKey, current)
    })
    return new Map([...totals].map(([key, value]) => [key, value.count ? value.sum / value.count : null]))
  }, [entries])
  const signals = useMemo(() => {
    const rows = filtered
      .map(entry => ({ entry, chips: signalChips(entry, pitchBaselines.get(entry.gameKey) ?? null, edgeRanks.get(entry)) }))
      .filter(item => item.chips.length >= 2)
    if (sort === 'signals') {
      rows.sort((a, b) => signalRankValue(b.chips) - signalRankValue(a.chips))
    }
    return rows
  }, [edgeRanks, filtered, pitchBaselines, sort])
  const windowSignalLeaders = useMemo(() => WINDOWS.flatMap(item => {
    const windowEntries = entriesByWindow[item.value]
    const needle = query.trim().toLowerCase()
    const candidates = windowEntries.filter(entry =>
      (game === 'all' || entry.gameKey === game) &&
      (!needle || entry.name.toLowerCase().includes(needle) || entry.team.toLowerCase().includes(needle) || entry.gameLabel.toLowerCase().includes(needle)),
    )
    const ranks = rankMlbSlateEdge(windowEntries)
    const totals = new Map<string, { sum: number; count: number }>()
    windowEntries.forEach(entry => {
      if (entry.pitchFit == null) return
      const current = totals.get(entry.gameKey) ?? { sum: 0, count: 0 }
      current.sum += entry.pitchFit
      current.count += 1
      totals.set(entry.gameKey, current)
    })
    const baselines = new Map([...totals].map(([key, value]) => [key, value.count ? value.sum / value.count : null]))
    const leader = candidates
      .map(entry => ({ entry, chips: signalChips(entry, baselines.get(entry.gameKey) ?? null, ranks.get(entry)) }))
      .filter(item => item.chips.length >= 2)
      .sort((a, b) => signalRankValue(b.chips) - signalRankValue(a.chips) || (ranks.get(b.entry)?.score ?? -1) - (ranks.get(a.entry)?.score ?? -1))[0]?.entry
    return leader ? [{ window: item.value, entry: leader }] : []
  }), [entriesByWindow, game, query])
  const leaderWindowsByPlayer = useMemo(() => {
    const result = new Map<string, SlateEdgeWindow[]>()
    windowSignalLeaders.forEach(item => result.set(playerKey(item.entry), [...(result.get(playerKey(item.entry)) ?? []), item.window]))
    return result
  }, [windowSignalLeaders])
  const leaderWindowsFor = (entry: SlateEdgeEntry) => leaderWindowsByPlayer.get(playerKey(entry)) ?? []
  const windowEvidenceByPlayer = useMemo(() => {
    const result = new Map<string, Partial<Record<SlateEdgeWindow, WindowEvidence>>>()
    WINDOWS.forEach(item => {
      const windowEntries = entriesByWindow[item.value]
      const ranks = rankMlbSlateEdge(windowEntries)
      const byGame = new Map<string, SlateEdgeEntry[]>()
      windowEntries.forEach(entry => byGame.set(entry.gameKey, [...(byGame.get(entry.gameKey) ?? []), entry]))
      byGame.forEach(gameEntries => {
        const byEdge = [...gameEntries].sort((a, b) => (ranks.get(b)?.score ?? -1) - (ranks.get(a)?.score ?? -1) || (b.score ?? -1) - (a.score ?? -1))
        const byScore = [...gameEntries].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.paper ?? -999) - (a.paper ?? -999))
        byEdge.forEach((entry, edgeIndex) => {
          const scoreIndex = byScore.findIndex(candidate => playerKey(candidate) === playerKey(entry))
          const evidence = result.get(playerKey(entry)) ?? {}
          evidence[item.value] = { edgeRank: edgeIndex + 1, scoreRank: scoreIndex >= 0 ? scoreIndex + 1 : gameEntries.length }
          result.set(playerKey(entry), evidence)
        })
      })
    })
    return result
  }, [entriesByWindow])
  const evidenceTagsFor = (entry: SlateEdgeEntry) => {
    const evidence = windowEvidenceByPlayer.get(playerKey(entry)) ?? {}
    const topThree = WINDOWS.filter(item => (evidence[item.value]?.edgeRank ?? Infinity) <= 3).map(item => item.value)
    const tags: EvidenceTag[] = []
    if (topThree.length >= 3) tags.push({
      key: 'consensus',
      label: `Consensus ${topThree.length}/4`,
      detail: `Top-three Slate Edge profile in ${topThree.map(value => value.toUpperCase()).join(', ')}. This is the most stable cross-window evidence.`,
    })
    if (topThree.length < 3 && (evidence.l5?.edgeRank ?? Infinity) <= 3 && (evidence.l10?.edgeRank ?? Infinity) <= 3) tags.push({
      key: 'established',
      label: 'Established L5 + L10',
      detail: 'Top-three Slate Edge profile in both L5 and L10, indicating sustained rather than one-game form.',
    })
    if (topThree.length < 3 && ((evidence.l1?.edgeRank ?? Infinity) <= 3 || (evidence.l3?.edgeRank ?? Infinity) <= 3) && (evidence.l10?.edgeRank ?? 0) > 5) tags.push({
      key: 'ignition',
      label: 'Short-form ignition',
      detail: 'Top-three in L1 or L3 but outside the L10 top five. Treat as emerging form that still needs confirmation.',
    })
    const rescuedWindows = WINDOWS.filter(item => {
      const point = evidence[item.value]
      return point != null && point.edgeRank <= 3 && point.scoreRank - point.edgeRank >= 5
    })
    if (rescuedWindows.length) tags.push({
      key: 'marketRescued',
      label: 'Market-rescued',
      detail: `Slate Edge elevated this player at least five places above raw SlipSurge Score in ${rescuedWindows.map(item => item.short).join(', ')} using market, lineup, public and book context.`,
    })
    if (topThree.length === 1) tags.push({
      key: 'singleWindow',
      label: `Single-window · ${topThree[0].toUpperCase()}`,
      detail: 'Top-three in only one data window. Useful as a lead, but materially less stable than cross-window agreement.',
    })
    const recentBarrel = Math.max(entry.barrelL3Delta ?? -Infinity, entry.barrelL5Delta ?? -Infinity, entry.barrelDelta ?? -Infinity)
    const directional = [
      Number.isFinite(recentBarrel) ? recentBarrel : null,
      entry.hardHitDelta,
      entry.pullAirDelta != null ? entry.pullAirDelta * 100 : null,
      entry.timingDelta != null ? entry.timingDelta * 100 : null,
      move(entry.hr, entry.hrOpen) != null ? -move(entry.hr, entry.hrOpen)! : null,
      move(entry.fhr, entry.fhrOpen) != null ? -move(entry.fhr, entry.fhrOpen)! : null,
    ].filter((value): value is number => value != null && Math.abs(value) >= 1)
    const favorable = directional.filter(value => value > 0).length
    const adverse = directional.filter(value => value < 0).length
    if (adverse >= 2 && adverse > favorable) tags.push({
      key: 'contradictory',
      label: 'Contradictory',
      detail: 'Multiple displayed signals are moving in an adverse direction. Signal density is high, but direction is not confirming the player.',
    })
    if (!entry.lineupsConfirmed || entry.battingOrder == null) tags.push({
      key: 'lineupRisk',
      label: 'Lineup risk',
      detail: 'The lineup is not confirmed or this player has no confirmed batting position. Recheck availability before acting.',
    })
    return tags.slice(0, 3)
  }
  const activeSort = SORT_OPTIONS.find(option => option.value === sort) ?? SORT_OPTIONS[0]
  const displayLeader = view === 'signals' ? signals[0]?.entry ?? null : leader
  const displayLeaderEdge = displayLeader ? edgeRanks.get(displayLeader) : null
  const modelAheadRows = filtered.filter(entry => (entry.mm ?? 0) > 0).sort((a, b) => (b.mm ?? 0) - (a.mm ?? 0))
  const marketAheadRows = filtered.filter(entry => (entry.mm ?? 0) < 0).sort((a, b) => (a.mm ?? 0) - (b.mm ?? 0))

  const openPlayer = (entry: SlateEdgeEntry) => {
    onOpenPlayer(entry)
    onClose()
  }

  return (
    <ModalSurface open={open} onClose={onClose} labelledBy="slate-edge-title" backdropClassName={styles.backdrop} panelClassName={styles.panel}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.mark}><SlipSurgeMark size={30} /></span>
          <div className={styles.heading}>
            <div className={styles.eyebrow}>Full-slate intelligence</div>
            <h2 className={styles.title} id="slate-edge-title">Slate Edge</h2>
            <div className={styles.subtitle}>{date} · {games.length} games · {entries.length} players · {dataWindow.toUpperCase()}</div>
          </div>
          <div className={styles.headerMeta}>
            <span className={styles.metaPill}>{confirmedGames}/{games.length} confirmed</span>
            <button type="button" data-modal-autofocus className={styles.close} onClick={onClose} aria-label="Close Slate Edge"><X size={17} /></button>
          </div>
        </header>

        <section className={styles.controlDeck} aria-label="Slate Edge controls">
          <div className={styles.viewBar}>
            <nav className={styles.tabs} aria-label="Slate Edge views">
              {([
                ['rankings', 'Slate Rankings', BarChart3],
                ['matchups', 'Matchup Lens', ScanSearch],
                ['market', 'Model vs Market', Activity],
                ['signals', 'Signal Lab', Layers3],
              ] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" className={styles.tab} data-active={view === key} onClick={() => {
                  setView(key)
                  if (key === 'signals') setSort('signals')
                  else if (sort === 'signals') setSort('edge')
                }}><Icon size={13} />{label}</button>
              ))}
            </nav>
            <div className={styles.windowToggle} role="group" aria-label="Slate Edge data window">
              <span>Window</span>
              {WINDOWS.map(item => <button
                type="button"
                key={item.value}
                aria-label={'Show ' + item.label + ' Slate Edge data'}
                aria-pressed={dataWindow === item.value}
                data-active={dataWindow === item.value}
                onClick={() => onWindowChange(item.value)}
              >{item.short}</button>)}
            </div>
          </div>
          <div className={styles.filters}>
            <label className={styles.search}><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search player, team, or game" aria-label="Search Slate Edge" /></label>
            <div className={styles.gameRailShell}>
              <button type="button" className={styles.railArrow} onClick={() => scrollGames(-1)} aria-label="Earlier games"><ChevronLeft size={15} /></button>
              <div ref={gameRailRef} className={styles.gameRail} aria-label="Filter by game" onWheel={wheelGames}>
                <button type="button" className={styles.gameChip} data-slate="true" data-active={game === 'all'} onClick={() => setGame('all')}><SlipSurgeMark size={16} />Full slate</button>
                {games.map(item => <button key={item.gameKey} type="button" className={styles.gameChip} aria-label={item.awayAbbr + ' at ' + item.homeAbbr} data-active={game === item.gameKey} onClick={() => setGame(item.gameKey)}><GameMatchupMark away={item.awayAbbr} home={item.homeAbbr} /></button>)}
              </div>
              <button type="button" className={styles.railArrow} onClick={() => scrollGames(1)} aria-label="Later games"><ChevronRight size={15} /></button>
            </div>
            <SortMenu value={sort} view={view} onChange={setSort} />
          </div>
        </section>

        <main className={styles.content}>
          <section className={styles.summary} aria-label="Slate summary">
            <div className={styles.summaryCard + ' ' + styles.summaryLeader}><small>{view === 'signals' ? 'Signal leader' : 'Board leader'}</small><span className={styles.summaryLeaderRow}>{displayLeader && <BatterCharge momentum={displayLeader.momentum} className={styles.batterCharge} />}{displayLeader && <Avatar entry={displayLeader} size={31} />}<strong>{displayLeader?.name ?? '—'}</strong>{displayLeaderEdge && <EdgeMark value={displayLeaderEdge.score} compact />}</span>{displayLeader && view === 'signals' ? <LeaderWindows windows={leaderWindowsFor(displayLeader)} /> : null}{displayLeader ? <EvidenceTags tags={evidenceTagsFor(displayLeader)} /> : null}<em>#1 by {activeSort.label} · {dataWindow.toUpperCase()}</em></div>
            <div className={styles.summaryCard}><small>Model ahead</small><strong>{modelAhead}</strong><em>MM +3 or more</em></div>
            <div className={styles.summaryCard}><small>Market movers</small><strong>{movers}</strong><em>50+ odds points</em></div>
            <div className={styles.summaryCard}><small>Signal stacks</small><strong>{signals.length}</strong><em>Two or more signals</em></div>
          </section>

          {view === 'rankings' && (filtered.length ? (
            <div className={styles.rankingsViews}>
              <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Rank</th><th>Player</th><th>Price vs norm</th><th>Game</th><th>SlipSurge Score</th><th>MM</th><th>Pitch fit</th><th>Barrel form</th><th>Hard-hit Δ</th><th>Pull-air</th><th>Timing Δ</th><th>FHR market</th><th>HR market</th><th>Book gap</th><th>Picks</th></tr></thead>
                <tbody>{filtered.map((entry, index) => {
                  const fhrMove = move(entry.fhr, entry.fhrOpen)
                  const hrMove = move(entry.hr, entry.hrOpen)
                  const edge = edgeRanks.get(entry)
                  return <tr key={`${entry.gameKey}:${entry.mlbId ?? entry.name}`} onClick={() => openPlayer(entry)}>
                    <td className={styles.rank}><RankMark rank={index + 1} edge={edge?.score} marketScore={edge?.marketStructureScore} marketOverlay={edge?.marketOverlay} /></td>
                    <td><PlayerIdentity entry={entry} leaderWindows={leaderWindowsFor(entry)} evidenceTags={evidenceTagsFor(entry)} /><MarketStructureTags edge={edge} /></td>
                    <td className={styles.baselineReadCell}><BaselineMarketRead entry={entry} /></td>
                    <td><span className={styles.matchup} aria-label={`${entry.awayAbbr} at ${entry.homeAbbr}`}><GameMatchupMark away={entry.awayAbbr} home={entry.homeAbbr} /></span></td>
                    <td><ScoreMark value={entry.score} /></td>
                    <td style={heatStyle(entry.mm, 0, 8)}><MmMark entry={entry} /></td>
                    <td style={heatStyle(entry.pitchFit, 50, 30)} className={styles.factorCell}><b>{entry.pitchFit != null ? Math.round(entry.pitchFit) : '—'}</b><small>Matchup fit</small></td>
                    <td style={heatStyle(entry.barrelDelta, 0, 4)} className={styles.factorCell}><b>{pctRaw(entry.barrelRecent)}</b><small>Δ {signed(entry.barrelDelta)}</small></td>
                    <td style={heatStyle(entry.hardHitDelta, 0, 8)} className={styles.factorCell}><b>{signed(entry.hardHitDelta, 'pp')}</b><small>Recent vs season</small></td>
                    <td style={heatStyle(entry.pullAirDelta, 0, .08)} className={styles.factorCell}><b>{entry.pullAirRecent != null ? pctRaw(entry.pullAirRecent * 100) : '—'}</b><small>Δ {signed(entry.pullAirDelta != null ? entry.pullAirDelta * 100 : null, 'pp')}</small></td>
                    <td style={heatStyle(entry.timingDelta, 0, .08)} className={styles.factorCell}><b>{signed(entry.timingDelta != null ? entry.timingDelta * 100 : null, 'pp')}</b><small>Contact window</small></td>
                    <td><BookPrice market="FHR" value={entry.fhr} delta={fhrMove} /></td>
                    <td><BookPrice market="HR" value={entry.hr} delta={hrMove} /></td>
                    <td className={styles.factorCell}><b>{range(entry) != null ? `${range(entry)} pts` : '—'}</b><small>{entry.hrBooks.length} books</small></td>
                    <td className={styles.pickCount}>{entry.publicPicks?.toLocaleString() ?? '—'}</td>
                  </tr>
                })}</tbody>
              </table>
              </div>
              <div className={styles.mobileRankingList}>
              {filtered.map((entry, index) => {
                const edge = edgeRanks.get(entry)
                return <button type="button" className={styles.mobileRankCard} key={entry.gameKey + ':' + (entry.mlbId ?? entry.name) + ':mobile'} onClick={() => openPlayer(entry)}>
                  <span className={styles.mobileRankHead}>
                    <RankMark rank={index + 1} edge={edge?.score} marketScore={edge?.marketStructureScore} marketOverlay={edge?.marketOverlay} />
                    <PlayerIdentity entry={entry} size={38} leaderWindows={leaderWindowsFor(entry)} evidenceTags={evidenceTagsFor(entry)} />
                    <ScoreMark value={entry.score} compact />
                  </span>
                  <MarketStructureTags edge={edge} />
                  <BaselineMarketRead entry={entry} />
                  <span className={styles.mobileMetricGrid}>
                    <span style={heatStyle(entry.mm, 0, 8)}><small>MM</small><MmMark entry={entry} compact /></span>
                    <span style={heatStyle(entry.pitchFit, 50, 30)}><small>Pitch fit</small><b>{entry.pitchFit != null ? Math.round(entry.pitchFit) : '—'}</b></span>
                    <span><small>Book gap</small><b>{range(entry) != null ? range(entry) + ' pts' : '—'}</b></span>
                    <span><small>Picks</small><b>{entry.publicPicks?.toLocaleString() ?? '—'}</b></span>
                  </span>
                  <MarketPair entry={entry} />
                </button>
              })}
              </div>
            </div>
          ) : <div className={styles.empty}>No players match these filters.</div>)}

          {view === 'matchups' && <div className={styles.gameGrid}>{games.filter(item => game === 'all' || item.gameKey === game).map(gameEntry => {
            const players = filtered.filter(entry => entry.gameKey === gameEntry.gameKey).slice(0, 6)
            return <article className={styles.gameCard} key={gameEntry.gameKey}>
              <header className={styles.gameHead}><TeamLogo abbr={gameEntry.awayAbbr} /><strong>{gameEntry.awayAbbr} at {gameEntry.homeAbbr}</strong><TeamLogo abbr={gameEntry.homeAbbr} /><span>{gameEntry.lineupsConfirmed ? 'Confirmed' : 'Projected'}</span></header>
              <div className={styles.gamePlayers}>{players.map((entry, index) => <button type="button" className={styles.gamePlayer} key={entry.gameKey + ':' + (entry.mlbId ?? entry.name)} onClick={() => openPlayer(entry)}><span className={styles.gamePlayerRank}>{index + 1}</span><BatterCharge momentum={entry.momentum} className={styles.batterCharge} /><Avatar entry={entry} size={36} /><span className={styles.gamePlayerName}><b>{entry.name}</b><small>{entry.position}{entry.battingOrder ? ' · Batting #' + entry.battingOrder : ''}</small><LeaderWindows windows={leaderWindowsFor(entry)} /><EvidenceTags tags={evidenceTagsFor(entry)} /></span>{edgeRanks.get(entry) && <EdgeMark value={edgeRanks.get(entry)!.score} compact />}<ScoreMark value={entry.score} compact /><MmMark entry={entry} compact /><MarketPair entry={entry} /></button>)}</div>
            </article>
          })}</div>}

          {view === 'market' && <div className={styles.split}>
            {[[modelAheadRows, 'Model ahead', 'Paper rank leads book rank'], [marketAheadRows, 'Market ahead', 'Book rank leads paper rank']] .map(([rows, label, note]) => <section className={styles.lane} key={String(label)}>
              <header className={styles.laneHead}><strong>{String(label)}</strong><span>{String(note)}</span></header>
              {(rows as SlateEdgeEntry[]).slice(0, 18).map(entry => <button type="button" className={styles.mismatchRow} key={entry.gameKey + ':' + (entry.mlbId ?? entry.name)} onClick={() => openPlayer(entry)}><BatterCharge momentum={entry.momentum} className={styles.batterCharge} /><Avatar entry={entry} size={38} /><span className={styles.mismatchCopy}><strong>{entry.name}</strong><span className={styles.marketContext} aria-label={`${entry.awayAbbr} at ${entry.homeAbbr}`}><GameMatchupMark away={entry.awayAbbr} home={entry.homeAbbr} /> · {entry.publicPicks?.toLocaleString() ?? 0} picks</span><LeaderWindows windows={leaderWindowsFor(entry)} /><MarketPair entry={entry} /></span><span className={styles.mismatchMetrics}>{edgeRanks.get(entry) && <EdgeMark value={edgeRanks.get(entry)!.score} compact />}<ScoreMark value={entry.score} compact /><MmMark entry={entry} /></span></button>)}
              {(rows as SlateEdgeEntry[]).length === 0 && <div className={styles.empty}>No rank gaps in this view.</div>}
            </section>)}
          </div>}

          {view === 'signals' && (signals.length ? <div className={styles.signalView}>
            <div className={styles.signalOrder}><span><Layers3 size={13} /> Ranked by <b>{activeSort.label}</b></span><small>Read left to right · top to bottom</small></div>
            <div className={styles.windowLeaderRail} aria-label="Signal leaders by data window">
              {WINDOWS.map(item => {
                const windowLeader = windowSignalLeaders.find(leaderItem => leaderItem.window === item.value)?.entry
                return <button type="button" key={item.value} data-active={dataWindow === item.value} onClick={() => onWindowChange(item.value)}>
                  <span>{item.short}</span>
                  {windowLeader ? <><Avatar entry={windowLeader} size={25} /><strong>{windowLeader.name}</strong></> : <strong>—</strong>}
                  {windowLeader && leaderWindowsFor(windowLeader).length === WINDOWS.length ? <em>4/4</em> : null}
                </button>
              })}
            </div>
            <div className={styles.signalGrid}>{signals.map(({ entry, chips }, index) => <article role="button" tabIndex={0} className={styles.signalCard} data-leading={chips[0]?.kind} data-podium={index < 3} key={entry.gameKey + ':' + (entry.mlbId ?? entry.name)} onClick={() => openPlayer(entry)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openPlayer(entry) }}>
              <div className={styles.signalTop}>
                <div className={styles.signalIdentity}>
                  <span className={styles.signalRank} aria-label={`Signal rank ${index + 1}`}>#{index + 1}</span>
                  <BatterCharge momentum={entry.momentum} className={styles.batterCharge} />
                  <Avatar entry={entry} size={42} />
                  <span className={styles.signalCopy}>
                    <strong>{entry.name}</strong>
                    <small aria-label={`${entry.awayAbbr} at ${entry.homeAbbr}; ${entry.team} ${entry.position}`}><GameMatchupMark away={entry.awayAbbr} home={entry.homeAbbr} /> · {entry.team} {entry.position}</small>
                    <LeaderWindows windows={leaderWindowsFor(entry)} />
                    <EvidenceTags tags={evidenceTagsFor(entry)} />
                  </span>
                </div>
                <div className={styles.signalScores}>{edgeRanks.get(entry) && <EdgeMark value={edgeRanks.get(entry)!.score} compact />}<ScoreMark value={entry.score} compact /></div>
              </div>
              <MarketStructureTags edge={edgeRanks.get(entry)} />
              <BaselineMarketRead entry={entry} />
              <MarketPair entry={entry} />
              <div className={styles.signalChips}>{chips.map(chip => <span className={styles.signalChip} data-kind={chip.kind} data-direction={chip.direction} key={chip.label}><SignalGlyph chip={chip} /><span>{chip.label}</span></span>)}</div>
            </article>)}</div>
          </div> : <div className={styles.empty}>No multi-signal players match these filters.</div>)}
        </main>
      </div>
    </ModalSurface>
  )
}
