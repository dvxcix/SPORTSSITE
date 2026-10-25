'use client'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'
import type { NbaMarketSelection } from '@/lib/nbaMarketSelection'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { nbaBinary, nbaPrice, nbaTarget, PAINT_MARKETS, type PaintMarket } from '@/lib/nbaPaint'
import type { NbaSlateViewRow } from '@/lib/nbaSlate'
import { PlayerAvatar, marketNumber, number } from './PaintVisuals'
import { PaintPickActions } from './PaintPickActions'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { PaintPrice } from './PaintPrice'
import { PaintSortHeader } from './PaintSortHeader'
import { PaintMarketSupport } from './PaintMarketSupport'
import { compareResearch, PaintHitCell, PaintMatchupIcons, PaintMmCell, PaintScoreCell } from './PaintResearchCells'
import { PaintBookSelect,PaintTeamSelect } from './PaintEntitySelect'
import { PaintHeatCell } from './PaintHeatCell'
import { nbaCenteredHeat } from './paintHeat'
import styles from './paint.module.css'
import polish from './research-polish.module.css'
import dials from './research-dials.module.css'

type Slate = { date: string; games: number; loaded: number; complete: boolean; defenseUnavailable?: number; frozenMmUnavailable?: number[]; failed: number[]; rows: NbaSlateViewRow[]; fetchedAt: string; stale: boolean }
export function PaintSlate({ selection, date, market, book, side, onMarketChange, onSideChange, onBookChange, books }: { selection?: NbaMarketSelection; date: string; market: PaintMarket; book: string; side: 'over' | 'under'; onMarketChange: (market: PaintMarket) => void; onSideChange: (side: 'over' | 'under') => void; onBookChange: (book: string) => void; books: string[] }) {
  const oddsMode = useNbaOddsMode()
  const [state, setState] = useState<{ key: string; data: Slate } | null>(null), [errorKey, setErrorKey] = useState<string | null>(null), [retry, setRetry] = useState(0), [query, setQuery] = useState(''), [focus, setFocus] = useState('all'), [sort, setSort] = useState('score'), [ascending, setAscending] = useState(false), [limit, setLimit] = useState(50)
  const contract=selection?.type??'',target=selection?.line==null?'':String(selection.line)
  const [team,setTeam]=useState('all'),[gameFilter,setGameFilter]=useState('all')
  const key = `${oddsMode}:${date}:${market}:${book}:${side}:${contract}:${target}`
  useEffect(() => {
    const controller = new AbortController(); let pending = false
    const update = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch(nbaModeHref(`/the-paint/slate?${new URLSearchParams({ date, market, book, side, contract, target })}`, oddsMode), { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(115000)]) })
        if (!response.ok) throw new Error('unavailable')
        const data = await response.json()
        if (!controller.signal.aborted) { setState({ key, data }); setErrorKey(null) }
      } catch { if (!controller.signal.aborted) setErrorKey(key) }
      finally { pending = false }
    }
    void update(); const stop = watchNbaRefresh(update)
    return () => { controller.abort(); stop() }
  }, [oddsMode, date, market, book, side, key, retry, contract, target])
  const slate = state?.key === key ? state.data : null
  const error = errorKey === key
  const refresh = () => { setErrorKey(null); setRetry(value => value + 1) }
  const sortBy = (column: string) => { if (sort === column) setAscending(value => !value); else { setSort(column); setAscending(column === 'name') } }
  const rows = useMemo(() => (slate?.rows ?? []).filter(row => (team==='all'||String(row.player.team.id)===team)&&(gameFilter==='all'||String(row.game.id)===gameFilter)&& `${row.player.first_name} ${row.player.last_name} ${row.player.team.full_name}`.toLowerCase().includes(query.toLowerCase()) && (focus === 'all' || focus === 'positive' && (row.mm ?? 0) > 0 || focus === 'negative' && (row.mm ?? 0) < 0 || focus === 'plus' && (nbaPrice(row.offer, side) ?? 0) > 0 || focus === 'signals' && row.marketSignals?.status === 'confirmed')).sort((a, b) => {
    const value = (row: typeof a) => sort === 'name' ? `${row.player.first_name} ${row.player.last_name}` : sort === 'mm' ? row.mm : sort === 'gap' ? row.gap : sort === 'hit' ? row.hit.rate : sort === 'average' ? row.average : sort === 'estimate' ? row.estimate : sort === 'line' ? Number(row.offer.line_value) : sort === 'odds' ? nbaPrice(row.offer, side) : sort === 'market' ? row.marketSignals?.signal ? row.marketSignals.signal.relatedPicks - row.marketSignals.signal.targetPicks : null : row.score
    return compareResearch(value(a), value(b), ascending) || a.player.id - b.player.id
  }), [slate, query, focus, sort, side, ascending,team,gameFilter])
  const averagePool = slate?.rows.map(row => row.average) ?? []
  const estimatePool = slate?.rows.map(row => row.estimate) ?? []
  const gapPool = slate?.rows.map(row => row.gap) ?? []
  const href = (row: NonNullable<typeof slate>['rows'][number], nextMarket = market) => nbaModeHref(`/the-paint?${new URLSearchParams({ date: row.game.date, game: String(row.game.id), player: String(row.player.id), market: nextMarket, book: row.offer.vendor, side, view: 'research' })}`, oddsMode)
  const header = (label: string, column: string) => <PaintSortHeader key={column} label={label} column={column} active={sort} ascending={ascending} onSort={sortBy}/>
  return <section className={`${styles.researchTool} ${dials.surface}`}>
    <header className={styles.toolHeading}><div><h3>Slate Edge</h3></div></header>
    <div className={styles.toolControls}><PaintTeamSelect label="Slate edge team" value={team} onChange={setTeam} teams={[...new Map((slate?.rows??[]).map(row=>[row.player.team.id,row.player.team])).values()]}/><select aria-label="Slate edge game" value={gameFilter} onChange={e=>setGameFilter(e.target.value)}><option value="all">All games</option>{[...new Map((slate?.rows??[]).map(row=>[row.game.id,row.game])).values()].map(game=><option key={game.id} value={game.id}>{game.visitor_team.abbreviation} @ {game.home_team.abbreviation}</option>)}</select><select aria-label="Sort slate edge" value={sort+':'+(ascending?'asc':'desc')} onChange={e=>{const [column,direction]=e.target.value.split(':');setSort(column);setAscending(direction==='asc')}}>{[['score:desc','Highest score'],['score:asc','Lowest score'],['mm:desc','Highest MM'],['mm:asc','Lowest MM'],['odds:desc','Highest odds'],['odds:asc','Lowest odds'],['hit:desc','Highest hit rate'],['hit:asc','Lowest hit rate'],['gap:desc','Largest form gap'],['name:asc','Player A–Z'],['gap:asc','Lowest form gap'],['average:desc','Highest average'],['average:asc','Lowest average'],['estimate:desc','Highest estimate'],['estimate:asc','Lowest estimate'],['line:desc','Highest target'],['line:asc','Lowest target'],['market:desc','Highest market signal'],['market:asc','Lowest market signal'],['name:desc','Highest player name']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <PaintBookSelect label="Slate edge sportsbook" value={book} onChange={onBookChange} books={books}/>
      <select aria-label="Slate edge market" value={market} onChange={event => onMarketChange(event.target.value as PaintMarket)}>{PAINT_MARKETS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
      <select aria-label="Slate edge side" value={side} onChange={event => onSideChange(event.target.value as 'over' | 'under')}><option value="over">Over</option><option value="under">Under</option></select>
      <label className={styles.search}><input aria-label="Search NBA slate players or teams" value={query} onChange={event => setQuery(event.target.value)} placeholder="Player or team"/></label>
      <select aria-label="Slate edge focus" value={focus} onChange={event => { setFocus(event.target.value); if (event.target.value === 'positive' || event.target.value === 'negative') { setSort('mm'); setAscending(event.target.value === 'negative') } }}><option value="all">All signals</option><option value="positive">+MM</option><option value="negative">−MM</option><option value="plus">Plus money</option><option value="signals">Opposing market moves</option></select>
    </div>
    {error && <p role="status" className={polish.status}>{slate ? 'The slate could not refresh. Last loaded prices are shown.' : 'The slate could not load.'} <button onClick={refresh}>Retry</button></p>}
    {!slate ? !error && <div className={polish.empty} role="status">Loading the slate…</div> : <>
      <div className={polish.status}><strong>{slate.loaded}/{slate.games} matchups</strong><span>{rows.length} players</span><time dateTime={slate.fetchedAt}>{new Date(slate.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</time>{slate.stale && <span>Last available prices</span>}{!slate.complete && <span>Partial slate · some MM unavailable</span>}{!!slate.frozenMmUnavailable?.length && <span>Pregame slate MM was not captured for {slate.frozenMmUnavailable.length} matchups</span>}{!!slate.defenseUnavailable && <span>Some matchup data unavailable</span>}{side === 'under' ? <span>Under-side public counts unavailable</span> : !!slate.rows.length && slate.rows.every(row => row.marketSignals?.status === 'unavailable') && <span>Market context unavailable</span>}</div>
      <div className={styles.researchScroll} role="region" aria-label="NBA slate edge table" tabIndex={0}><table className={`${styles.researchTable} ${polish.table} ${dials.table}`}><caption className={styles.srOnly}>NBA slate players, scores, odds and market signals</caption><thead><tr>{header('Player', 'name')}{header('Score', 'score')}{header('Slate MM', 'mm')}{header('Market signals', 'market')}{header('L10', 'average')}{header(nbaBinary(market) ? 'Frequency' : 'Projection', 'estimate')}{header('Form vs line', 'gap')}{header('L10 hit rate', 'hit')}{header('Target', 'line')}{header('Odds', 'odds')}<th><span className={styles.srOnly}>Save pick</span></th></tr></thead><tbody>{rows.slice(0, limit).map(row => <tr key={`${row.game.id}:${row.player.id}`}>
        <td><a className={styles.playerButton} href={href(row)}><PlayerAvatar player={row.player}/><span><strong>{row.player.first_name} {row.player.last_name}</strong><span className={polish.playerMeta}><PaintMatchupIcons game={row.game}/></span>{row.researchObservedAt&&<time dateTime={row.researchObservedAt} className={polish.playerMeta}>Pregame saved {new Date(row.researchObservedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</time>}</span><ArrowUpRight size={14}/></a></td>
        <td><PaintScoreCell score={row.score}/></td><td><PaintMmCell mm={row.mm}/></td><td><PaintMarketSupport support={row.marketSignals} href={(next, actualBook, quote) => nbaModeHref(`/the-paint?${new URLSearchParams({ date: row.game.date, game: String(row.game.id), player: String(row.player.id), market: next, book: actualBook, side: 'over', view: 'research', panel: 'ladder', line: String(quote.line), type: quote.type })}`, oddsMode)}/></td>
        <td><PaintHeatCell value={row.average} pool={averagePool} heat={row.frozenHeat?.average} label="Last 10 production">{marketNumber(row.average, market)}</PaintHeatCell></td><td><PaintHeatCell value={row.estimate} pool={estimatePool} heat={row.frozenHeat?.estimate} label={nbaBinary(market) ? 'Frequency' : 'Projection'}>{marketNumber(row.estimate, market)}</PaintHeatCell></td>
        <td><PaintHeatCell value={row.gap} heat={row.frozenHeat?row.frozenHeat.gap:nbaCenteredHeat(row.gap, gapPool)} tone="performance" label="Form versus line">{row.gap == null ? '—' : `${row.gap > 0 ? '+' : ''}${number(row.gap)}${nbaBinary(market) ? ' pp' : ''}`}</PaintHeatCell></td><td><PaintHitCell {...row.hit}/></td>
        <td><a className={styles.lineButton} href={href(row)}><strong>{nbaTarget(row.offer, side)}</strong></a></td><td><a className={styles.lineButton} href={href(row)}><span><BookLogo vendor={row.offer.vendor} size={15}/><PaintPrice offer={row.offer} side={side} compact/></span></a></td><td><PaintPickActions player={row.player} offer={row.offer} side={side} game={row.game}/></td>
      </tr>)}</tbody></table></div>
      {rows.length > limit && <button className={styles.filterToggle} onClick={() => setLimit(value => value + 50)}>Show 50 more</button>}{!rows.length && <div className={polish.empty}>No offers match these filters.</div>}
    </>}
  </section>
}
