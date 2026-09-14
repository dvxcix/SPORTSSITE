'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react'
import {
  Activity, BarChart3, BrainCircuit, ChevronDown, ChevronLeft, ChevronRight,
  Crosshair, Gauge, Layers3, Radar, ScanSearch, Search, Target, TrendingUp,
  UsersRound, Wind, X, Zap,
} from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import { ModalSurface } from '@/components/ui/ModalSurface'
import {
  NFL_SLATE_EDGE_MARKETS,
  type NflSlateEdgeEntry,
  type NflSlateEdgeMarket,
  type NflSlateEdgeMarketKey,
  type NflSlateEdgePayload,
} from '@/lib/nflSlateEdge'
import styles from '@/components/dugout/SlateEdgeOverlay.module.css'

type View = 'rankings' | 'matchups' | 'market' | 'signals'
type Sort = 'signals' | 'score' | 'model' | 'movement' | 'picks' | 'dvp'
type Chip = { label: string; value: number; kind: string; positive?: boolean; books?: string[] }

const SORTS = [
  { value: 'signals' as const, label: 'Signal Strength', detail: 'Strongest multi-signal stack', Icon: Layers3 },
  { value: 'score' as const, label: 'SlipSurge Score', detail: 'Highest contextual NFL score', Icon: Zap },
  { value: 'model' as const, label: 'Model Gap', detail: 'Largest model-market split', Icon: BrainCircuit },
  { value: 'movement' as const, label: 'Market Movement', detail: 'Largest opening-to-current move', Icon: TrendingUp },
  { value: 'picks' as const, label: 'Public Picks', detail: 'Most tracked action', Icon: UsersRound },
  { value: 'dvp' as const, label: 'Opponent DvP', detail: 'Largest matchup allowance', Icon: Target },
]

const odds = (value: number | null) => value == null ? '—' : value > 0 ? `+${value}` : String(value)
const signed = (value: number | null, suffix = '') => value == null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10}${suffix}`
const movement = (market: NflSlateEdgeMarket) => market.odds != null && market.openingOdds != null ? market.odds - market.openingOdds : null
const lineMove = (market: NflSlateEdgeMarket) => market.line != null && market.openingLine != null ? market.line - market.openingLine : null

function dvpValue(entry: NflSlateEdgeEntry, market: NflSlateEdgeMarketKey) {
  if (market === 'receptions') return entry.dvp.receptions ?? null
  if (market === 'receiving_yards') return entry.dvp.receiving_yards ?? null
  if (market === 'rushing_yards') return entry.dvp.rushing_yards ?? null
  if (market === 'passing_yards') return entry.dvp.passing_yards ?? null
  if (entry.position === 'QB') return entry.dvp.passing_tds ?? null
  if (entry.position === 'RB' || entry.position === 'FB') return entry.dvp.rushing_tds ?? null
  return entry.dvp.receiving_tds ?? null
}

function heat(value: number | null, center = 0, span = 20): CSSProperties | undefined {
  if (value == null) return undefined
  const strength = Math.min(1, Math.abs(value - center) / Math.max(span, 0.01))
  const rgb = value >= center ? '34,197,94' : '244,63,94'
  return { background: `linear-gradient(90deg,rgba(${rgb},${0.04 + strength * 0.16}),rgba(${rgb},${0.01 + strength * 0.05}))` }
}

function Score({ value, compact = false }: { value: number | null; compact?: boolean }) {
  return value == null
    ? <span className={styles.scoreMissing}>—</span>
    : <MechanicsScoreRing score={value} label="SlipSurge Score" size="small" className={compact ? styles.scoreCompact : undefined} />
}

function MarketPrice({ market }: { market: NflSlateEdgeMarket }) {
  const delta = movement(market)
  const deltaLine = lineMove(market)
  return <span className={styles.bookPrice}>
    <span className={styles.bookLine}>{market.vendor ? <BookLogo vendor={market.vendor} size={14} /> : null}<small>{market.line == null ? 'PRICE' : `O ${market.line}`}</small><b>{odds(market.odds)}</b></span>
    <span className={`${styles.movement} ${delta == null || delta === 0 ? styles.muted : delta < 0 ? styles.shortened : styles.lengthened}`}>
      <span>{market.openingLine == null ? 'Open' : `Open ${market.openingLine}`} {odds(market.openingOdds)}</span>
      {deltaLine ? <b>Line {signed(deltaLine)}</b> : delta != null ? <b>{delta < 0 ? 'Shortened ' : delta > 0 ? 'Lengthened ' : 'Unchanged'}{delta ? signed(delta) : ''}</b> : null}
    </span>
  </span>
}

function Avatar({ entry, size = 40 }: { entry: NflSlateEdgeEntry; size?: number }) {
  return <PlayerAvatar headshot={entry.headshot} teamLogo={entry.teamLogo} teamAbbr={entry.team} name={entry.name} size={size} />
}

function GameLogo({ src, name }: { src: string | null; name: string }) {
  return <TeamLogo logo={src} name={name} size={20} />
}

function chips(entry: NflSlateEdgeEntry, focus: NflSlateEdgeMarketKey): Chip[] {
  const output: Chip[] = []
  const market = entry.markets[focus]
  const score = entry.score[focus]
  const mm = entry.mm[focus]
  const move = movement(market)
  const line = lineMove(market)
  const dvp = dvpValue(entry, focus)
  if (score != null && score >= 55) output.push({ label: `Score ${score}`, value: score / 2, kind: 'score', positive: true })
  if (mm != null && Math.abs(mm) >= 2) output.push({ label: mm > 0 ? `Model +${mm}` : `Market +${Math.abs(mm)}`, value: Math.abs(mm) * 8, kind: mm > 0 ? 'model' : 'market', positive: mm > 0 })
  if (move != null && Math.abs(move) >= 15) output.push({ label: `${move < 0 ? 'Shortened' : 'Lengthened'} ${signed(move)}`, value: Math.min(45, Math.abs(move) / 3), kind: 'movement', positive: move < 0 })
  if (line != null && line !== 0) output.push({ label: `Line ${signed(line)}`, value: Math.min(35, Math.abs(line) * 7), kind: 'line', positive: line > 0 })
  if (dvp != null && Math.abs(dvp) >= 5) output.push({ label: `DvP ${signed(dvp, '%')}`, value: Math.min(40, Math.abs(dvp)), kind: 'dvp', positive: dvp > 0 })
  if (entry.redZone != null && entry.redZone >= 55) output.push({ label: `Red zone ${Math.round(entry.redZone)}`, value: entry.redZone / 3, kind: 'redzone', positive: true })
  if (entry.roleShare != null && entry.roleShare >= 12) output.push({ label: `Role share ${entry.roleShare.toFixed(1)}%`, value: entry.roleShare, kind: 'usage', positive: true })
  if (entry.breakaway != null && entry.breakaway >= 55) output.push({ label: `Explosive ${Math.round(entry.breakaway)}`, value: entry.breakaway / 3, kind: 'explosive', positive: true })
  if (market.bookGap != null && market.bookGap >= 50) output.push({ label: `${market.bookGap} pts`, value: Math.min(40, market.bookGap / 5), kind: 'books', books: market.books })
  if (market.picks != null && market.picks > 0) output.push({ label: `${market.picks.toLocaleString()} picks`, value: Math.log10(market.picks + 1) * 10, kind: 'picks' })
  return output.sort((a, b) => b.value - a.value).slice(0, 6)
}

function signalStrength(entry: NflSlateEdgeEntry, focus: NflSlateEdgeMarketKey) {
  const values = chips(entry, focus)
  return values.reduce((sum, chip) => sum + Math.min(chip.value, 40), 0) + values.length * 12
}

function SortMenu({ value, view, onChange }: { value: Sort; view: View; onChange: (value: Sort) => void }) {
  const options = view === 'signals' ? SORTS : SORTS.filter(item => item.value !== 'signals')
  const selected = options.find(item => item.value === value) ?? options[0]
  const Icon = selected.Icon
  return <details className={styles.sortMenu} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.removeAttribute('open')
  }}>
    <summary><span className={styles.sortGlyph}><Icon size={15} /></span><span className={styles.sortCopy}><small>Sort NFL board</small><b>{selected.label}</b></span><ChevronDown className={styles.sortChevron} size={15} /></summary>
    <div className={styles.sortPopover}>
      {options.map(option => {
        const OptionIcon = option.Icon
        return <button type="button" data-active={option.value === value} key={option.value} onClick={event => {
          onChange(option.value)
          event.currentTarget.closest('details')?.removeAttribute('open')
        }}><span><OptionIcon size={15} /></span><span><b>{option.label}</b><small>{option.detail}</small></span>{option.value === value ? <i>Active</i> : null}</button>
      })}
    </div>
  </details>
}

export function NflSlateEdgeOverlay({ open, date, sample, onClose }: { open: boolean; date: string; sample: string; onClose: () => void }) {
  const [payload, setPayload] = useState<NflSlateEdgePayload | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('rankings')
  const [focus, setFocus] = useState<NflSlateEdgeMarketKey>('anytime_td')
  const [sort, setSort] = useState<Sort>('score')
  const [query, setQuery] = useState('')
  const [game, setGame] = useState('all')
  const gameRailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    fetch(`/api/the-sideline/slate-edge?date=${encodeURIComponent(date)}&sample=${encodeURIComponent(sample)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('NFL Slate Edge is unavailable.')
        return response.json() as Promise<NflSlateEdgePayload>
      })
      .then(data => {
        setError('')
        setPayload(data)
      })
      .catch(reason => { if (reason instanceof Error && reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [date, open, sample])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = (payload?.entries ?? []).filter(entry =>
      (game === 'all' || entry.gameId === game)
      && (!needle || entry.name.toLowerCase().includes(needle) || entry.team.toLowerCase().includes(needle) || entry.gameLabel.toLowerCase().includes(needle)),
    )
    return [...rows].sort((a, b) => {
      if (sort === 'signals') return signalStrength(b, focus) - signalStrength(a, focus)
      if (sort === 'model') return (b.mm[focus] ?? -999) - (a.mm[focus] ?? -999)
      if (sort === 'movement') return Math.abs(movement(b.markets[focus]) ?? 0) + Math.abs(lineMove(b.markets[focus]) ?? 0) * 100 - Math.abs(movement(a.markets[focus]) ?? 0) - Math.abs(lineMove(a.markets[focus]) ?? 0) * 100
      if (sort === 'picks') return (b.markets[focus].picks ?? -1) - (a.markets[focus].picks ?? -1)
      if (sort === 'dvp') return (dvpValue(b, focus) ?? -999) - (dvpValue(a, focus) ?? -999)
      return (b.score[focus] ?? -1) - (a.score[focus] ?? -1)
    })
  }, [focus, game, payload, query, sort])

  const signalRows = useMemo(() => filtered.map(entry => ({ entry, chips: chips(entry, focus) })).filter(item => item.chips.length >= 2), [filtered, focus])
  const activeSort = SORTS.find(item => item.value === sort) ?? SORTS[1]
  const leader = view === 'signals' ? signalRows[0]?.entry : filtered[0]
  const modelAhead = filtered.filter(entry => (entry.mm[focus] ?? 0) >= 3).length
  const movers = filtered.filter(entry => Math.abs(movement(entry.markets[focus]) ?? 0) >= 50 || Math.abs(lineMove(entry.markets[focus]) ?? 0) > 0).length
  const wheelGames = (event: WheelEvent<HTMLDivElement>) => {
    if (!gameRailRef.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    gameRailRef.current.scrollLeft += event.deltaY
    event.preventDefault()
  }

  return <ModalSurface open={open} onClose={onClose} labelledBy="nfl-slate-edge-title" backdropClassName={styles.backdrop} panelClassName={styles.panel}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.mark}><Crosshair size={21} /></span>
        <div className={styles.heading}><div className={styles.eyebrow}>Full-slate NFL intelligence</div><h2 className={styles.title} id="nfl-slate-edge-title">Sideline Edge</h2><div className={styles.subtitle}>{date} · {payload?.games.length ?? 0} games · {payload?.entries.length ?? 0} players · {payload?.sampleLabel ?? 'Loading sample'}</div></div>
        <div className={styles.headerMeta}><span className={styles.metaPill}>{NFL_SLATE_EDGE_MARKETS.find(item => item.key === focus)?.label}</span><button type="button" data-modal-autofocus className={styles.close} onClick={onClose}><X size={17} /></button></div>
      </header>
      <section className={styles.controlDeck}>
        <nav className={styles.tabs}>{([
          ['rankings', 'Slate Rankings', BarChart3], ['matchups', 'Matchup Lens', ScanSearch],
          ['market', 'Model vs Market', Activity], ['signals', 'Signal Lab', Crosshair],
        ] as const).map(([key, label, Icon]) => <button key={key} type="button" className={styles.tab} data-active={view === key} onClick={() => {
          setView(key)
          if (key === 'signals') setSort('signals')
          else if (sort === 'signals') setSort('score')
        }}><Icon size={13} />{label}</button>)}</nav>
        <nav className={styles.nflMarketRail} aria-label="NFL market focus">{NFL_SLATE_EDGE_MARKETS.map(item => <button type="button" key={item.key} data-active={focus === item.key} onClick={() => setFocus(item.key)}>{item.short}<small>{item.label}</small></button>)}</nav>
        <div className={styles.filters}>
          <label className={styles.search}><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search player, team, or game" /></label>
          <div className={styles.gameRailShell}>
            <button type="button" className={styles.railArrow} onClick={() => gameRailRef.current?.scrollBy({ left: -500, behavior: 'smooth' })}><ChevronLeft size={15} /></button>
            <div ref={gameRailRef} className={styles.gameRail} onWheel={wheelGames}><button type="button" className={styles.gameChip} data-active={game === 'all'} onClick={() => setGame('all')}>Full slate</button>{payload?.games.map(item => <button type="button" className={styles.gameChip} data-active={game === item.id} key={item.id} onClick={() => setGame(item.id)}><GameLogo src={item.awayLogo} name={item.awayAbbr} /><span>{item.awayAbbr}</span><span className={styles.at}>at</span><GameLogo src={item.homeLogo} name={item.homeAbbr} /><span>{item.homeAbbr}</span></button>)}</div>
            <button type="button" className={styles.railArrow} onClick={() => gameRailRef.current?.scrollBy({ left: 500, behavior: 'smooth' })}><ChevronRight size={15} /></button>
          </div>
          <SortMenu value={sort} view={view} onChange={setSort} />
        </div>
      </section>
      <main className={styles.content}>
        {!payload && !error ? <div className={styles.empty}>Building the NFL slate…</div> : error ? <div className={styles.empty}>{error}</div> : <>
          <section className={styles.summary}>
            <div className={`${styles.summaryCard} ${styles.summaryLeader}`}><small>{view === 'signals' ? 'Signal leader' : 'Board leader'}</small><span className={styles.summaryLeaderRow}>{leader ? <Avatar entry={leader} size={31} /> : null}<strong>{leader?.name ?? '—'}</strong>{leader ? <Score value={leader.score[focus]} compact /> : null}</span><em>#1 by {activeSort.label}</em></div>
            <div className={styles.summaryCard}><small>Model ahead</small><strong>{modelAhead}</strong><em>MM +3 or more</em></div>
            <div className={styles.summaryCard}><small>Market movers</small><strong>{movers}</strong><em>Line or 50+ odds points</em></div>
            <div className={styles.summaryCard}><small>Signal stacks</small><strong>{signalRows.length}</strong><em>Two or more signals</em></div>
          </section>
          {view === 'rankings' ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Rank</th><th>Player</th><th>Game</th><th>SlipSurge Score</th><th>MM</th><th>Market</th><th>Move</th><th>Picks</th><th>Role Share</th><th>Opponent DvP</th><th>Red Zone</th><th>RZ Looks</th><th>Explosive</th><th>Book Gap</th></tr></thead><tbody>{filtered.map((entry, index) => {
            const market = entry.markets[focus]
            const move = movement(market)
            const dvp = dvpValue(entry, focus)
            return <tr key={entry.gameId + entry.id}><td className={styles.rank}>{String(index + 1).padStart(2, '0')}</td><td><div className={styles.player}><Avatar entry={entry} /><span className={styles.playerCopy}><strong>{entry.name}</strong><span><GameLogo src={entry.teamLogo} name={entry.team} />{entry.team} · {entry.position} · {entry.games}G</span></span></div></td><td><span className={styles.matchup}><GameLogo src={entry.awayLogo} name={entry.awayAbbr} />{entry.awayAbbr} at <GameLogo src={entry.homeLogo} name={entry.homeAbbr} />{entry.homeAbbr}</span></td><td><Score value={entry.score[focus]} /></td><td style={heat(entry.mm[focus], 0, 8)}><span className={styles.mmMark} data-tone={(entry.mm[focus] ?? 0) > 0 ? 'model' : (entry.mm[focus] ?? 0) < 0 ? 'market' : 'even'}><b>MM {signed(entry.mm[focus])}</b></span></td><td><MarketPrice market={market} /></td><td className={move == null ? styles.muted : move < 0 ? styles.shortened : styles.lengthened}>{signed(move)}</td><td className={styles.pickCount}>{market.picks?.toLocaleString() ?? '—'}</td><td style={heat(entry.roleShare, 18, 20)}>{entry.roleShare == null ? '—' : `${entry.roleShare.toFixed(1)}%`}</td><td style={heat(dvp, 0, 20)}>{signed(dvp, '%')}</td><td style={heat(entry.redZone, 50, 35)}>{entry.redZone == null ? '—' : Math.round(entry.redZone)}</td><td>{entry.redZoneLooks ?? '—'}</td><td style={heat(entry.breakaway, 50, 35)}>{entry.breakaway == null ? '—' : Math.round(entry.breakaway)}</td><td>{market.bookGap == null ? '—' : `${market.bookGap} pts`}</td></tr>
          })}</tbody></table></div> : null}
          {view === 'matchups' ? <div className={styles.gameGrid}>{payload?.games.filter(item => game === 'all' || item.id === game).map(item => <article className={styles.gameCard} key={item.id}><header className={styles.gameHead}><GameLogo src={item.awayLogo} name={item.awayAbbr} /><strong>{item.label}</strong><GameLogo src={item.homeLogo} name={item.homeAbbr} /><span>{focus.replaceAll('_', ' ')}</span></header><div className={styles.gamePlayers}>{filtered.filter(entry => entry.gameId === item.id).slice(0, 8).map((entry, index) => <div className={styles.gamePlayer} key={entry.id}><span className={styles.gamePlayerRank}>{index + 1}</span><Avatar entry={entry} size={36} /><span className={styles.gamePlayerName}><b>{entry.name}</b><small>{entry.position} · DvP {signed(dvpValue(entry, focus), '%')}</small></span><Score value={entry.score[focus]} compact /><span className={styles.mmMark} data-compact="true"><b>MM {signed(entry.mm[focus])}</b></span><MarketPrice market={entry.markets[focus]} /></div>)}</div></article>)}</div> : null}
          {view === 'market' ? <div className={styles.split}>{[
            { label: 'Model ahead', rows: filtered.filter(entry => (entry.mm[focus] ?? 0) > 0).sort((a, b) => (b.mm[focus] ?? 0) - (a.mm[focus] ?? 0)) },
            { label: 'Market ahead', rows: filtered.filter(entry => (entry.mm[focus] ?? 0) < 0).sort((a, b) => (a.mm[focus] ?? 0) - (b.mm[focus] ?? 0)) },
          ].map(lane => <section className={styles.lane} key={lane.label}><header className={styles.laneHead}><strong>{lane.label}</strong><span>{focus.replaceAll('_', ' ')}</span></header>{lane.rows.slice(0, 20).map(entry => <div className={styles.mismatchRow} key={entry.gameId + entry.id}><Avatar entry={entry} size={38} /><span className={styles.mismatchCopy}><strong>{entry.name}</strong><span>{entry.gameLabel} · {entry.markets[focus].picks?.toLocaleString() ?? 0} picks</span><MarketPrice market={entry.markets[focus]} /></span><span className={styles.mismatchMetrics}><Score value={entry.score[focus]} compact /><span className={styles.mmMark}><b>MM {signed(entry.mm[focus])}</b></span></span></div>)}</section>)}</div> : null}
          {view === 'signals' ? <div className={styles.signalView}><div className={styles.signalOrder}><span><Layers3 size={13} /> Ranked by <b>{activeSort.label}</b></span><small>Read left to right · top to bottom</small></div><div className={styles.signalGrid}>{signalRows.map(({ entry, chips: playerChips }, index) => <article className={styles.signalCard} data-leading={playerChips[0]?.kind} data-podium={index < 3} key={entry.gameId + entry.id}><div className={styles.signalTop}><span className={styles.signalRank}>#{index + 1}</span><Avatar entry={entry} size={42} /><span><strong>{entry.name}</strong><small>{entry.gameLabel} · {entry.team} {entry.position}</small></span><Score value={entry.score[focus]} compact /></div><MarketPrice market={entry.markets[focus]} /><div className={styles.signalChips}>{playerChips.map(chip => <span className={styles.signalChip} data-kind={chip.kind} data-direction={chip.positive === false ? 'lengthened' : undefined} key={chip.kind + chip.label}>{chip.kind === 'books' ? <span className={styles.bookStack}>{chip.books?.slice(0, 4).map(book => <span key={book}><BookLogo vendor={book} size={16} /></span>)}</span> : chip.kind === 'picks' ? <span className={styles.picksGlyph}><UsersRound size={13} /><Zap size={7} /></span> : chip.kind === 'dvp' ? <Target size={13} /> : chip.kind === 'redzone' ? <Crosshair size={13} /> : chip.kind === 'usage' ? <Gauge size={13} /> : chip.kind === 'explosive' ? <Wind size={13} /> : chip.kind === 'movement' || chip.kind === 'line' ? <TrendingUp size={13} /> : chip.kind === 'model' ? <BrainCircuit size={13} /> : <Radar size={13} />}<span>{chip.label}</span></span>)}</div></article>)}</div></div> : null}
        </>}
      </main>
    </div>
  </ModalSurface>
}
