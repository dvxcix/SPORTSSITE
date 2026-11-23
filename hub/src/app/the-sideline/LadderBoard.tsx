'use client'
import { useMemo, useState } from 'react'
import { PickCount, PicksMark, MarketMovement } from '@/components/research/ResearchMetrics'
import { SidelinePlayerAvatar } from './SidelinePlayerAvatar'
import type { SidelineTeam } from './types'
import { BookLogo, normalizeVendor } from '@/components/BookLogo'
import { NflScorerBadges } from '@/components/sideline/NflScorerBadges'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { ladderOffers, ladderPrice, estimateLadderPicks, observedPropPicks, contractPicks, type LadderSide } from '@/lib/nflLadders'
import { americanImpliedProbability, impliedProbabilityRatio } from '@/lib/nflMarketMath'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import { nflAvailability } from '@/lib/nflAvailability'
import styles from './ladderBoard.module.css'
import { buildBoardHeat } from './boardHeat'
import { NflPropActions } from '@/components/sideline/NflPropActions'
import { compareLadderValues, ladderHeatBackground, type LadderSort, type LadderSortKey } from './ladderPresentation'
import type { NflPublicResult } from '@/lib/nflPublicResults'
import { SidelineFinalLine } from './SidelineFinalLine'
import { SidelineDesignation } from './SidelineDesignation'
const price = (n: number | null) => (n == null ? '—' : n > 0 ? '+' + n : String(n))
const marketLabel = (key: string) => ({ anytime_td: 'Anytime Touchdown', first_td: 'First Touchdown', passing_tds: 'Passing Touchdowns', passing_completions: 'Pass Completions' }[key] ?? key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bTds?\b/g, 'Touchdowns'))
const bookLabel = (key: string) => ({ fanduel: 'FanDuel', draftkings: 'DraftKings', betmgm: 'BetMGM', caesars: 'Caesars', betrivers: 'BetRivers', fanatics: 'Fanatics', espnbet: 'ESPN BET', hardrockbet: 'Hard Rock Bet' }[normalizeVendor(key)] ?? marketLabel(key))
const marketGroup = (key: string) => key.startsWith('passing') || key === 'completions' ? 'Passing' : key.includes('rushing_receiving') || key.includes('scrimmage') ? 'Combined' : key.includes('receiv') || key.includes('reception') ? 'Receiving' : key.includes('rush') ? 'Rushing' : key.includes('td') || key.includes('touchdown') ? 'Touchdowns' : 'Other Markets'
type ContextScore = { score: number; mm: number | null; label: string }
export function LadderBoard({ board, onPlayer, prop, onProp, vendor, onVendor, scores, game, teams, matrixMatches, initialPreview, finalResults=null, finished=false }: { board: SidelineOddsBoard; onPlayer: (id: number) => void; prop: string; onProp: (prop: string) => void; vendor: string; onVendor: (vendor: string) => void; scores: Map<number, ContextScore>; game?: { id: string; gameday: string; season?:number }; teams?: SidelineTeam[]; matrixMatches?: Map<number, Array<{ id: string; name: string; color: string }>>; initialPreview?: { player?: number; line?: number } | null; finalResults?:NflPublicResult|null; finished?:boolean }) {
  const statusFor = (player: SidelineOddsBoard['players'][number]) => nflAvailability(player, game?.gameday)
  const [side, setSide] = useState<LadderSide>('over'),
    [kind, setKind] = useState<'milestone' | 'over_under'>('milestone')
  const [offset, setOffset] = useState<number | null>(null),
    [mode, setMode] = useState<'odds' | 'move' | 'ratio' | 'picks'>('odds')
  const [sort, setSort] = useState<LadderSort>({ key: 'player', direction: 'asc' })
  const props = useMemo(() => Array.from(new Set([prop, ...board.players.flatMap(p => p.markets.map(m => m.propType))])).sort(), [board, prop])
  const books = useMemo(() => Array.from(new Set([vendor, ...board.players.flatMap(p => p.markets.flatMap(m => m.offers.map(o => o.vendor)))])).sort(), [board, vendor])
  const rows = useMemo(
    () =>
      board.players
        .map(player => ({
          player,
          entries: ladderOffers(player, prop, vendor, side).filter(e => e.offer.type === kind),
          estimated: estimateLadderPicks(player, prop, vendor),
        }))
        .filter(r => r.entries.length),
    [board, prop, vendor, side, kind],
  )
  const thresholds = [...new Set(rows.flatMap(r => r.entries.map(e => e.line).filter((v): v is number => v != null)))].sort((a, b) => a - b)
  const previewLine = initialPreview?.line == null ? -1 : thresholds.indexOf(initialPreview.line)
  const firstPage = Math.floor(Math.max(0, previewLine) / 6) * 6
  const start = Math.min(offset ?? firstPage, Math.max(0, Math.ceil(thresholds.length / 6) - 1) * 6),
    visible = thresholds.slice(start, start + 6)
  const entryValue = (row: (typeof rows)[number], line: number) => {
    const e = row.entries.find(e => e.line === line)
    if (!e) return null
    const now = e.offer.isOpeningOnly ? null : ladderPrice(e.offer, side),
      open = ladderPrice(e.offer, side, true)
    if (mode === 'odds') return americanImpliedProbability(now)
    if (mode === 'picks') return contractPicks(row.player, prop, line, side, kind) ?? (side === 'over' ? (row.estimated.get(e.market.key) ?? null) : null)
    if (mode === 'ratio') {
      const td = nflPrimaryMarket(row.player, 'anytime_td', vendor)?.offers.find(o => o.vendor === vendor)
      return impliedProbabilityRatio(td ? ladderPrice(td, 'over') : null, now)
    }
    const a = americanImpliedProbability(now),
      b = americanImpliedProbability(open)
    return a != null && b != null && e.offer.line === e.offer.openingLine ? Math.round((a - b) * 10000) / 100 : null
  }
  const ranges = new Map(
    visible.map(line => {
      const v = rows.map(r => entryValue(r, line)).filter((n): n is number => n != null)
      return [line, { min: Math.min(...v), max: Math.max(...v) }]
    }),
  )
  const activeSort: LadderSort = typeof sort.key === 'number' && !visible.includes(sort.key) ? { key: 'player', direction: 'asc' } : sort
  const sortValue = (row: (typeof rows)[number]) => {
    if (typeof activeSort.key === 'number') return entryValue(row, activeSort.key)
    if (activeSort.key === 'player') return row.player.name
    if (activeSort.key === 'picks') return observedPropPicks(row.player, prop)
    return scores.get(row.player.id)?.[activeSort.key] ?? null
  }
  const ordered = [...rows].sort((a, b) => Number(b.player.id === initialPreview?.player) - Number(a.player.id === initialPreview?.player) || Number(statusFor(b.player).eligible) - Number(statusFor(a.player).eligible) || compareLadderValues(sortValue(a), sortValue(b), activeSort.direction) || a.player.name.localeCompare(b.player.name) || a.player.id - b.player.id)
  const metricHeat = buildBoardHeat(
    [
      { id: 'score', heat: 'high' as const, value: (row: { score: number | null }) => row.score },
      { id: 'mm', heat: 'high' as const, value: (row: { mm: number | null }) => row.mm },
      { id: 'picks', heat: 'high' as const, value: (row: { picks: number | null }) => row.picks },
    ],
    rows.map(row => ({ id: String(row.player.id), position: row.player.position, score: scores.get(row.player.id)?.score ?? null, mm: scores.get(row.player.id)?.mm ?? null, picks: observedPropPicks(row.player, prop) })),
  )
  const changeSort = (key: LadderSortKey) => setSort({ key, direction: activeSort.key === key ? activeSort.direction === 'asc' ? 'desc' : 'asc' : key === 'player' ? 'asc' : 'desc' })
  const sortHeader = (key: LadderSortKey, label: string) => (
    <th key={key} scope="col" aria-sort={activeSort.key === key ? activeSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
      <button type="button" aria-label={label} className={styles.sortButton} onClick={() => changeSort(key)}>
        {key==='picks'?<PicksMark/>:label}<span aria-hidden="true">{activeSort.key === key ? activeSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
      </button>
    </th>
  )
  return (
    <section className={styles.panel} aria-label="NFL full market ladders">
      <header>
        <div>
          <h2>Player props</h2>
          <small>
            {board.capturedAt
              ? new Date(board.capturedAt).toLocaleString('en-US', {
                  timeZone: 'America/New_York',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }) + ' ET'
              : 'Awaiting capture'}
          </small>
        </div>
      </header>
      <div className={styles.controls}>
        <label>
          Market
          <select
            aria-label="Market"
            value={prop}
            onChange={e => {
              onProp(e.target.value)
              setOffset(0)
              setSort({ key: 'player', direction: 'asc' })
            }}
          >
            {['Receiving', 'Rushing', 'Passing', 'Combined', 'Touchdowns', 'Other Markets'].map(group => {
              const markets = props.filter(p => marketGroup(p) === group)
              return markets.length ? <optgroup key={group} label={group}>{markets.map(p => <option key={p} value={p}>{marketLabel(p)}</option>)}</optgroup> : null
            })}
          </select>
        </label>
        <label>
          Sportsbook
          <span className={styles.bookSelect}>
          <BookLogo key={vendor} vendor={vendor} size={22} />
          <select
            aria-label="Sportsbook"
            value={vendor}
            onChange={e => {
              onVendor(e.target.value)
              setOffset(0)
              setSort({ key: 'player', direction: 'asc' })
            }}
          >
            {books.map(b => (
              <option key={b} value={b}>{bookLabel(b)}</option>
            ))}
          </select>
          </span>
        </label>
      </div>
      <details className={styles.options}>
        <summary>Display options</summary>
      <div className={styles.controls}>
        <label>
          Starting Line
          <select aria-label="Starting Line" value={visible[0] ?? ''} onChange={e => setOffset(Math.floor(thresholds.indexOf(Number(e.target.value)) / 6) * 6)}>
            {thresholds
              .filter((_, i) => i % 6 === 0)
              .map(line => (
                <option key={line} value={line}>
                  {line}
                  {kind === 'milestone' ? '+' : ''}
                </option>
              ))}
          </select>
        </label>
        <label>
          Line Type
          <select
            aria-label="Line Type"
            value={kind}
            onChange={e => {
              setKind(e.target.value as typeof kind)
              setOffset(0)
              setSort({ key: 'player', direction: 'asc' })
              if (e.target.value === 'milestone') setSide('over')
            }}
          >
            <option value="milestone">Milestones (+)</option>
            <option value="over_under">Over / Under</option>
          </select>
        </label>
        {kind === 'over_under' && <label>
          Side
          <select aria-label="Side" value={side} onChange={e => setSide(e.target.value as LadderSide)}>
            <option value="over">Over</option>
            {kind === 'over_under' ? <option value="under">Under</option> : null}
          </select>
        </label>}
        <label>
          Compare
          <select aria-label="Compare" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
            <option value="odds">Odds</option>
            <option value="move">Probability Change (pp)</option>
            <option value="ratio">Anytime TD / Prop Ratio</option>
            <option value="picks">Picks (Includes Estimates)</option>
          </select>
        </label>
      </div>
      </details>
      <div className={styles.scroll} role="region" aria-label={`${marketLabel(prop)} comparison table`} tabIndex={0}>
        <table>
          <thead>
            <tr>
              {sortHeader('player', 'Player')}
              {sortHeader('score', 'Score')}
              {sortHeader('mm', 'MM')}
              {sortHeader('picks', 'Picks')}
              {visible.map(line => sortHeader(line, String(line) + (kind === 'milestone' ? '+' : '')))}
            </tr>
          </thead>
          <tbody>
            {ordered.map(row => (
              <tr key={row.player.id} data-preview-player={row.player.id === initialPreview?.player ? 'true' : undefined} className={!statusFor(row.player).eligible ? styles.unavailableRow : undefined}>
                <td>
                  <button className={styles.player} onClick={() => onPlayer(row.player.id)}>
                    <SidelinePlayerAvatar player={row.player} rookie={game?.season!=null&&row.player.rookieSeason===game.season} team={teams?.find(team=>team.abbr===row.player.team)??{abbr:row.player.team,name:row.player.team,color:'var(--surface-3)',color2:'var(--surface-2)',logo:''}}/>
                    <span>
                      <b>{row.player.name}<NflScorerBadges player={row.player} /></b>
                      <small>
                        {row.player.team} · {row.player.position}
                        {' '}<SidelineDesignation label={statusFor(row.player).label} injury={row.player.availability?.injury}/>
                      </small>
                      <SidelineFinalLine player={row.player} result={finalResults} finished={finished} market={prop}/>
                    </span>
                  </button>
                  {matrixMatches?.get(row.player.id)?.map(matrix => <small key={matrix.id} style={{ color: matrix.color, borderLeft: `3px solid ${matrix.color}`, paddingLeft: 6 }}>{matrix.name}</small>)}
                </td>
                <td style={ladderHeatBackground(metricHeat.get(`${row.player.id}:score`))}>
                  <b>{statusFor(row.player).eligible ? scores.get(row.player.id)?.score ?? '—' : '—'}</b>
                  <small>{scores.get(row.player.id)?.label ?? marketLabel(prop)}</small>
                </td>
                <td style={ladderHeatBackground(metricHeat.get(`${row.player.id}:mm`))}>
                  <b>{scores.get(row.player.id)?.mm == null ? '—' : `${(scores.get(row.player.id)?.mm ?? 0) > 0 ? '+' : ''}${scores.get(row.player.id)?.mm}`}</b>
                </td>
                <td style={ladderHeatBackground(metricHeat.get(`${row.player.id}:picks`))}>
                  <PickCount value={observedPropPicks(row.player, prop)} observed/>
                </td>
                {visible.map(line => {
                  const e = row.entries.find(e => e.line === line)
                  if (!e) return <td key={line}>—</td>
                  const openingOnly = e.offer.isOpeningOnly === true
                  const now = openingOnly ? null : ladderPrice(e.offer, side),
                    open = openingOnly ? (ladderPrice(e.offer, side) ?? ladderPrice(e.offer, side, true)) : ladderPrice(e.offer, side, true),
                    v = entryValue(row, line),
                    range = ranges.get(line)!
                  const strength = v != null && range.max > range.min ? (v - range.min) / (range.max - range.min) : null
                  const exact = contractPicks(row.player, prop, line, side, kind),
                    est = side === 'over' ? row.estimated.get(e.market.key) : null
                  return (
                    <td
                      key={line}
                      style={ladderHeatBackground(strength)}
                    >
                      {mode==='picks'?<PickCount value={v} estimated={exact==null}/>:mode==='move'?<MarketMovement value={v} precision={2}/>:<b>{mode==='odds'?price(now):v==null?'—':v.toFixed(2)}</b>}
                      <small>{openingOnly ? 'Open only ' + price(open) : mode === 'odds' ? 'Open ' + price(open) : 'Odds ' + price(now)}</small>
                      {e.offer.openingLine != null && e.offer.openingLine !== e.offer.line ? <small>Opening line {e.offer.openingLine ?? '—'}</small> : null}
                      {mode!=='picks'?<small><PickCount value={exact??est} estimated={exact==null&&est!=null}/></small>:null}
                      {game && now != null ? <NflPropActions player={row.player} market={e.market} offer={e.offer} side={side} game={game} /> : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <p role="status">No {marketLabel(prop).toLowerCase()} lines available for {bookLabel(vendor)} with these filters. Try another sportsbook or change the Line Type in Display Options.</p> : null}
      <footer>
        <button disabled={start === 0} onClick={() => setOffset(Math.max(0, start - 6))}>
          ← Lower
        </button>
        <span>{thresholds.length ? start + 1 + '–' + Math.min(start + 6, thresholds.length) + ' of ' + thresholds.length : '0 thresholds'}</span>
        <button disabled={start + 6 >= thresholds.length} onClick={() => setOffset(start + 6)}>
          Higher →
        </button>
      </footer>
    </section>
  )
}
