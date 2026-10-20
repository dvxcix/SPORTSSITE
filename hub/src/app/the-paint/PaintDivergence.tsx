'use client'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, RefreshCw, UsersRound } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { PaintBookSelect } from './PaintEntitySelect'
import { PAINT_MARKETS, type PaintBoard, type PaintMarket } from '@/lib/nbaPaint'
import type { nbaDivergences } from '@/lib/nbaDivergence'
import { PlayerAvatar } from './PaintVisuals'
import { PaintPriceValue } from './PaintPrice'
import { compareResearch } from './PaintResearchCells'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import styles from './paint.module.css'
import polish from './research-polish.module.css'

type Snapshot = { rows: ReturnType<typeof nbaDivergences>; captures: number; publicCapturedAt: string | null; latestAt: string | null; stale: boolean }
const label = (market: PaintMarket) => PAINT_MARKETS.find(item => item.key === market)?.label ?? market
const delta = (value: number | null) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`
export function PaintDivergence({ board, open }: { board: PaintBoard; open: (id: number, market?: PaintMarket) => void }) {
  const [state, setState] = useState<{ game: number; data: Snapshot } | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [book, setBook] = useState('all'), [focus, setFocus] = useState(false), [query, setQuery] = useState(''), [sort, setSort] = useState('public')
  useEffect(() => {
    const controller = new AbortController(); let pending = false
    const update = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch(`/the-paint/divergence?game=${board.game.id}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) })
        if (!response.ok) throw new Error('unavailable')
        const data = await response.json()
        if (!controller.signal.aborted) { setState({ game: board.game.id, data }); setError('') }
      } catch { if (!controller.signal.aborted) setError('Signals could not refresh. Last available moves are shown.') }
      finally { pending = false }
    }
    void update(); const stop = watchNbaRefresh(update)
    return () => { controller.abort(); stop() }
  }, [board.game.id, retry])
  const snapshot = state?.game === board.game.id ? state.data : null
  const refresh = () => { setError(''); setRetry(value => value + 1) }
  const players = useMemo(() => new Map(board.players.map(player => [player.id, player])), [board.players])
  const rows = useMemo(() => (snapshot?.rows ?? []).filter(row => {
    const player = players.get(row.playerId)
    return player && (book === 'all' || row.book === book) && (!focus || row.publicHeavierElsewhere === true) && `${player.first_name} ${player.last_name}`.toLowerCase().includes(query.toLowerCase())
  }).sort((a, b) => {
    const value = (row: typeof a) => sort === 'name' ? `${players.get(row.playerId)?.first_name} ${players.get(row.playerId)?.last_name}` : sort === 'price' ? row.kind === 'price' ? Math.abs(row.primaryMovement.priceChange ?? 0) : null : sort === 'line' ? row.kind === 'line' ? Math.abs(row.primaryMovement.lineChange ?? 0) : null : row.primaryPicks != null && row.otherPicks != null ? row.otherPicks - row.primaryPicks : null
    return compareResearch(value(a), value(b), sort === 'name') || a.playerId - b.playerId
  }), [snapshot, players, book, focus, query, sort])
  return <section className={styles.researchTool}>
    <header className={styles.toolHeading}><div><h3>Cross-market signals</h3></div><button className={styles.iconButton} aria-label="Refresh cross-market signals" onClick={refresh}><RefreshCw size={16}/></button></header>
    <div className={styles.toolControls}><PaintBookSelect label="Cross-market sportsbook" value={book} onChange={setBook} books={[...new Set(snapshot?.rows.map(row => row.book) ?? [])].sort()}/><label className={styles.search}><input aria-label="Search cross-market players" placeholder="Find a player" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Sort cross-market signals" value={sort} onChange={event => setSort(event.target.value)}><option value="public">Public pick difference</option><option value="price">Largest price move</option><option value="line">Largest line move</option><option value="name">Player name</option></select><button aria-pressed={focus} onClick={() => setFocus(value => !value)}><UsersRound size={14}/> More picks in related market</button></div>
    {error && <p role="status" className={polish.status}>{snapshot ? error : 'Market signals could not load.'} <button onClick={refresh}>Retry</button></p>}
    {!snapshot ? !error && <div className={polish.empty} role="status">Loading market signals…</div> : !rows.length ? <div className={polish.empty}>{snapshot.captures < 2 ? 'Waiting for the next price move.' : 'No opposing moves match these filters.'}</div> : <>
      <div className={polish.status}><strong>{rows.length} market pairs</strong>{snapshot.stale && <span>Last available signals</span>}</div>
      <div className={polish.cards}>{rows.map(row => {
        const player = players.get(row.playerId)!
        return <article className={polish.card} key={`${row.playerId}:${row.book}:${row.primary}:${row.other}`}>
          <header><button className={styles.playerButton} onClick={() => open(player.id, row.primary)}><PlayerAvatar player={player}/><span><strong>{player.first_name} {player.last_name}</strong></span></button><BookLogo vendor={row.book} size={24}/></header>
          <div className={polish.signalPair}>{[{ market: row.primary, movement: row.primaryMovement, picks: row.primaryPicks }, { market: row.other, movement: row.otherMovement, picks: row.otherPicks }].map(item => {
            const change = row.kind === 'price' ? item.movement.priceChange : item.movement.lineChange
            const rising = row.kind === 'price' ? (change ?? 0) < 0 : (change ?? 0) > 0
            const quote = item.movement.latest
            const href = `/the-paint?${new URLSearchParams({ date: board.game.date, game: String(board.game.id), player: String(player.id), market: item.market, book: row.book, side: 'over', view: 'research', panel: 'ladder', ...(quote ? { line: String(quote.line), type: quote.type } : {}) })}`
            return <a className={polish.signalQuote} key={item.market} href={href}><strong>{label(item.market)}{row.kind === 'price' && quote ? ` · ${quote.type === 'milestone' ? `${quote.line}+` : `O ${quote.line}`}` : ''}</strong><span className={polish.signalDirection} data-direction={row.kind === 'price' ? rising ? 'longer' : 'shorter' : rising ? 'shorter' : 'longer'}>{rising ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {row.kind === 'price' ? rising ? 'Lengthening' : 'Shortening' : rising ? 'Line rising' : 'Line falling'}</span>{row.kind === 'price' ? <PaintPriceValue opening={item.movement.priceFirstOdds} current={item.movement.priceLatestOdds} at={item.movement.priceFirstAt ?? undefined} openingLabel={item.movement.priceOpeningKnown ? 'OPEN' : 'FIRST'} compact/> : <><strong>{item.movement.first?.line} → {item.movement.latest?.line}</strong><small>Δ {delta(item.movement.lineChange)}</small></>}<small>{item.picks == null ? 'Public count unavailable' : `${item.picks.toLocaleString()} category picks`}</small></a>
          })}</div>
          <footer><time dateTime={row.latestAt}>{new Date(row.latestAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</time>{row.publicHeavierElsewhere && row.primaryPicks != null && row.otherPicks != null && <span className={polish.badge}><UsersRound size={12}/>{(row.otherPicks - row.primaryPicks).toLocaleString()} more related picks</span>}</footer>
        </article>
      })}</div>
    </>}
  </section>
}
