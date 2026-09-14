'use client'

import { useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react'
import { Activity, BarChart3, ChevronLeft, ChevronRight, Crosshair, ScanSearch, Search, X } from 'lucide-react'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import styles from './SlateEdgeOverlay.module.css'

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
  hardHitDelta: number | null
  pullAirRecent: number | null
  pullAirDelta: number | null
  timingDelta: number | null
  fhr: number | null
  fhrOpen: number | null
  hr: number | null
  hrOpen: number | null
  hrBooks: Array<{ book: string; price: number }>
  publicPicks: number | null
}

type View = 'rankings' | 'matchups' | 'market' | 'signals'
type Sort = 'score' | 'model' | 'movement' | 'picks' | 'pitch'

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
      ? <span className={`${styles.movement} ${movementClass(delta)}`}><span>Open {odds(open)}</span><b>{delta < 0 ? 'Shortened ' : delta > 0 ? 'Lengthened ' : 'Unchanged '}{delta === 0 ? '' : signed(delta)}</b></span>
      : <span className={`${styles.movement} ${styles.muted}`}>Open unavailable</span>}
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

function TeamLogo({ abbr }: { abbr: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={getTeamLogoUrl(abbr)} alt="" aria-hidden="true" />
}

function movementClass(value: number | null) {
  if (value == null || value === 0) return styles.muted
  return value < 0 ? styles.shortened : styles.lengthened
}

function signalChips(entry: SlateEdgeEntry, pitchBaseline: number | null) {
  const chips: Array<{ label: string; value: number }> = []
  if (entry.mm != null && Math.abs(entry.mm) >= 2) chips.push({ label: entry.mm > 0 ? `Model +${entry.mm}` : `Market +${Math.abs(entry.mm)}`, value: Math.abs(entry.mm) * 12 })
  if (entry.pitchFit != null && pitchBaseline != null && entry.pitchFit > pitchBaseline + 8) chips.push({ label: `Pitch fit +${Math.round(entry.pitchFit - pitchBaseline)}`, value: entry.pitchFit - pitchBaseline })
  if (entry.barrelDelta != null && Math.abs(entry.barrelDelta) >= 1) chips.push({ label: `Barrel ${signed(entry.barrelDelta)}`, value: Math.abs(entry.barrelDelta) * 5 })
  if (entry.hardHitDelta != null && Math.abs(entry.hardHitDelta) >= 2) chips.push({ label: `Hard-hit ${signed(entry.hardHitDelta)}`, value: Math.abs(entry.hardHitDelta) * 2 })
  if (entry.pullAirDelta != null && Math.abs(entry.pullAirDelta) >= .02) chips.push({ label: `Pull-air ${signed(entry.pullAirDelta * 100, 'pp')}`, value: Math.abs(entry.pullAirDelta) * 100 })
  if (entry.timingDelta != null && Math.abs(entry.timingDelta) >= .02) chips.push({ label: `Timing ${signed(entry.timingDelta * 100, 'pp')}`, value: Math.abs(entry.timingDelta) * 100 })
  const hrMove = move(entry.hr, entry.hrOpen)
  const fhrMove = move(entry.fhr, entry.fhrOpen)
  if (hrMove != null && Math.abs(hrMove) >= 20) chips.push({ label: `HR ${signed(hrMove)}`, value: Math.abs(hrMove) / 3 })
  if (fhrMove != null && Math.abs(fhrMove) >= 20) chips.push({ label: `FHR ${signed(fhrMove)}`, value: Math.abs(fhrMove) / 3 })
  const bookGap = range(entry)
  if (bookGap != null && bookGap >= 75) chips.push({ label: `Books ${bookGap} pts`, value: bookGap / 5 })
  if (entry.publicPicks != null && entry.publicPicks > 0) chips.push({ label: `${entry.publicPicks.toLocaleString()} picks`, value: Math.log10(entry.publicPicks + 1) * 10 })
  return chips.sort((a, b) => b.value - a.value).slice(0, 5)
}

export function SlateEdgeOverlay({ open, date, entries, onClose, onOpenPlayer }: {
  open: boolean
  date: string
  entries: SlateEdgeEntry[]
  onClose: () => void
  onOpenPlayer: (entry: SlateEdgeEntry) => void
}) {
  const [view, setView] = useState<View>('rankings')
  const [query, setQuery] = useState('')
  const [game, setGame] = useState('all')
  const [sort, setSort] = useState<Sort>('score')
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = entries.filter(entry =>
      (game === 'all' || entry.gameKey === game) &&
      (!needle || entry.name.toLowerCase().includes(needle) || entry.team.toLowerCase().includes(needle) || entry.gameLabel.toLowerCase().includes(needle)),
    )
    return [...rows].sort((a, b) => {
      if (sort === 'model') return (b.mm ?? -999) - (a.mm ?? -999)
      if (sort === 'movement') return Math.max(Math.abs(move(b.hr, b.hrOpen) ?? 0), Math.abs(move(b.fhr, b.fhrOpen) ?? 0)) - Math.max(Math.abs(move(a.hr, a.hrOpen) ?? 0), Math.abs(move(a.fhr, a.fhrOpen) ?? 0))
      if (sort === 'picks') return (b.publicPicks ?? -1) - (a.publicPicks ?? -1)
      if (sort === 'pitch') return (b.pitchFit ?? -999) - (a.pitchFit ?? -999)
      return (b.score ?? -1) - (a.score ?? -1) || (b.paper ?? -999) - (a.paper ?? -999)
    })
  }, [entries, game, query, sort])

  const leader = filtered.reduce<SlateEdgeEntry | null>((best, entry) => !best || (entry.score ?? -1) > (best.score ?? -1) ? entry : best, null)
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
  const signals = useMemo(() => filtered.map(entry => ({ entry, chips: signalChips(entry, pitchBaselines.get(entry.gameKey) ?? null) })).filter(item => item.chips.length >= 2).sort((a, b) => b.chips.reduce((sum, chip) => sum + chip.value, 0) - a.chips.reduce((sum, chip) => sum + chip.value, 0)), [filtered, pitchBaselines])
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
          <span className={styles.mark}><Crosshair size={21} aria-hidden="true" /></span>
          <div className={styles.heading}>
            <div className={styles.eyebrow}>Full-slate intelligence</div>
            <h2 className={styles.title} id="slate-edge-title">Slate Edge</h2>
            <div className={styles.subtitle}>{date} · {games.length} games · {entries.length} players</div>
          </div>
          <div className={styles.headerMeta}>
            <span className={styles.metaPill}>{confirmedGames}/{games.length} confirmed</span>
            <button type="button" data-modal-autofocus className={styles.close} onClick={onClose} aria-label="Close Slate Edge"><X size={17} /></button>
          </div>
        </header>

        <section className={styles.controlDeck} aria-label="Slate Edge controls">
          <nav className={styles.tabs} aria-label="Slate Edge views">
            {([
              ['rankings', 'Slate Rankings', BarChart3],
              ['matchups', 'Matchup Lens', ScanSearch],
              ['market', 'Model vs Market', Activity],
              ['signals', 'Signal Lab', Crosshair],
            ] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" className={styles.tab} data-active={view === key} onClick={() => setView(key)}><Icon size={13} />{label}</button>
            ))}
          </nav>
          <div className={styles.filters}>
            <label className={styles.search}><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search player, team, or game" aria-label="Search Slate Edge" /></label>
            <div className={styles.gameRailShell}>
              <button type="button" className={styles.railArrow} onClick={() => scrollGames(-1)} aria-label="Earlier games"><ChevronLeft size={15} /></button>
              <div ref={gameRailRef} className={styles.gameRail} aria-label="Filter by game" onWheel={wheelGames}>
                <button type="button" className={styles.gameChip} data-active={game === 'all'} onClick={() => setGame('all')}>Full slate</button>
                {games.map(item => <button key={item.gameKey} type="button" className={styles.gameChip} data-active={game === item.gameKey} onClick={() => setGame(item.gameKey)}><TeamLogo abbr={item.awayAbbr} /><span className={styles.gameTeam}>{item.awayAbbr}</span><span className={styles.at}>at</span><TeamLogo abbr={item.homeAbbr} /><span className={styles.gameTeam}>{item.homeAbbr}</span></button>)}
              </div>
              <button type="button" className={styles.railArrow} onClick={() => scrollGames(1)} aria-label="Later games"><ChevronRight size={15} /></button>
            </div>
            <select className={styles.sortSelect} value={sort} onChange={event => setSort(event.target.value as Sort)} aria-label="Sort Slate Edge">
              <option value="score">SlipSurge Score</option>
              <option value="model">Model gap</option>
              <option value="movement">Market movement</option>
              <option value="picks">Public picks</option>
              <option value="pitch">Pitch fit</option>
            </select>
          </div>
        </section>

        <main className={styles.content}>
          <section className={styles.summary} aria-label="Slate summary">
            <div className={`${styles.summaryCard} ${styles.summaryLeader}`}><small>Board leader</small><span className={styles.summaryLeaderRow}>{leader && <Avatar entry={leader} size={31} />}<strong>{leader?.name ?? '—'}</strong>{leader && <ScoreMark value={leader.score} compact />}</span><em>Highest SlipSurge Score in view</em></div>
            <div className={styles.summaryCard}><small>Model ahead</small><strong>{modelAhead}</strong><em>MM +3 or more</em></div>
            <div className={styles.summaryCard}><small>Market movers</small><strong>{movers}</strong><em>50+ odds points</em></div>
            <div className={styles.summaryCard}><small>Signal stacks</small><strong>{signals.length}</strong><em>Two or more signals</em></div>
          </section>

          {view === 'rankings' && (filtered.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Rank</th><th>Player</th><th>Game</th><th>SlipSurge Score</th><th>MM</th><th>Pitch fit</th><th>Barrel form</th><th>Hard-hit Δ</th><th>Pull-air</th><th>Timing Δ</th><th>FHR market</th><th>HR market</th><th>Book gap</th><th>Picks</th></tr></thead>
                <tbody>{filtered.map((entry, index) => {
                  const fhrMove = move(entry.fhr, entry.fhrOpen)
                  const hrMove = move(entry.hr, entry.hrOpen)
                  return <tr key={`${entry.gameKey}:${entry.mlbId ?? entry.name}`} onClick={() => openPlayer(entry)}>
                    <td className={styles.rank}>{String(index + 1).padStart(2, '0')}</td>
                    <td><div className={styles.player}><Avatar entry={entry} size={40} /><span className={styles.playerCopy}><strong>{entry.name}</strong><span><TeamLogo abbr={entry.team} />{entry.team} · {entry.position}{entry.battingOrder ? ` · Batting #${entry.battingOrder}` : ''}</span></span></div></td>
                    <td><span className={styles.matchup}><TeamLogo abbr={entry.awayAbbr} />{entry.awayAbbr} at <TeamLogo abbr={entry.homeAbbr} />{entry.homeAbbr}</span></td>
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
          ) : <div className={styles.empty}>No players match these filters.</div>)}

          {view === 'matchups' && <div className={styles.gameGrid}>{games.filter(item => game === 'all' || item.gameKey === game).map(gameEntry => {
            const players = filtered.filter(entry => entry.gameKey === gameEntry.gameKey).slice(0, 6)
            return <article className={styles.gameCard} key={gameEntry.gameKey}>
              <header className={styles.gameHead}><TeamLogo abbr={gameEntry.awayAbbr} /><strong>{gameEntry.awayAbbr} at {gameEntry.homeAbbr}</strong><TeamLogo abbr={gameEntry.homeAbbr} /><span>{gameEntry.lineupsConfirmed ? 'Confirmed' : 'Projected'}</span></header>
              <div className={styles.gamePlayers}>{players.map((entry, index) => <button type="button" className={styles.gamePlayer} key={`${entry.gameKey}:${entry.mlbId ?? entry.name}`} onClick={() => openPlayer(entry)}><span className={styles.gamePlayerRank}>{index + 1}</span><Avatar entry={entry} size={36} /><span className={styles.gamePlayerName}><b>{entry.name}</b><small>{entry.position}{entry.battingOrder ? ` · Batting #${entry.battingOrder}` : ''}</small></span><ScoreMark value={entry.score} compact /><MmMark entry={entry} compact /><MarketPair entry={entry} /></button>)}</div>
            </article>
          })}</div>}

          {view === 'market' && <div className={styles.split}>
            {[[modelAheadRows, 'Model ahead', 'Paper rank leads book rank'], [marketAheadRows, 'Market ahead', 'Book rank leads paper rank']] .map(([rows, label, note]) => <section className={styles.lane} key={String(label)}>
              <header className={styles.laneHead}><strong>{String(label)}</strong><span>{String(note)}</span></header>
              {(rows as SlateEdgeEntry[]).slice(0, 18).map(entry => <button type="button" className={styles.mismatchRow} key={`${entry.gameKey}:${entry.mlbId ?? entry.name}`} onClick={() => openPlayer(entry)}><Avatar entry={entry} size={38} /><span className={styles.mismatchCopy}><strong>{entry.name}</strong><span>{entry.gameLabel} · {entry.publicPicks?.toLocaleString() ?? 0} picks</span><MarketPair entry={entry} /></span><span className={styles.mismatchMetrics}><ScoreMark value={entry.score} compact /><MmMark entry={entry} /></span></button>)}
              {(rows as SlateEdgeEntry[]).length === 0 && <div className={styles.empty}>No rank gaps in this view.</div>}
            </section>)}
          </div>}

          {view === 'signals' && (signals.length ? <div className={styles.signalGrid}>{signals.map(({ entry, chips }) => <article role="button" tabIndex={0} className={styles.signalCard} key={`${entry.gameKey}:${entry.mlbId ?? entry.name}`} onClick={() => openPlayer(entry)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openPlayer(entry) }}>
            <div className={styles.signalTop}><Avatar entry={entry} size={42} /><span><strong>{entry.name}</strong><small>{entry.gameLabel} · {entry.team} {entry.position}</small></span><ScoreMark value={entry.score} compact /></div>
            <MarketPair entry={entry} />
            <div className={styles.signalChips}>{chips.map(chip => <span className={styles.signalChip} key={chip.label}>{chip.label}</span>)}</div>
          </article>)}</div> : <div className={styles.empty}>No multi-signal players match these filters.</div>)}
        </main>
      </div>
    </ModalSurface>
  )
}
