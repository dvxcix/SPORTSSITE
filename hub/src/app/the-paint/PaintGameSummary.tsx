'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Banknote, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { nbaGameStart, nbaPregameOpen } from '@/lib/nbaOddsMode'
import type { NbaOddsBoardPhaseCheck } from '@/lib/nbaOddsBoardPhase'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'
import { PickCount, PicksMark } from '@/components/research/ResearchMetrics'
import { bookName } from '@/components/BookLogo'
import { nbaOdds, type PaintBoard, type PaintGameOdds } from '@/lib/nbaPaint'
import { nbaGameHeaderClock, type NbaGameOverview } from '@/lib/nbaGameOverview'
import { TeamLogo } from './PaintVisuals'
import { PaintBookSelect } from './PaintEntitySelect'
import { PaintGamePrice } from './PaintPrice'
import styles from './PaintGameSummary.module.css'

const captured = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const percent = (value: number | null | undefined) => value == null ? '—' : `${Math.round(value * 100)}%`

export function PaintGameSummary({ board, teamControl, refreshPrices = false, phaseCheck, initialBook = 'draftkings' }: { board: Pick<PaintBoard, 'game' | 'gameOdds'>; teamControl?: ReactNode; refreshPrices?: boolean; phaseCheck?: NbaOddsBoardPhaseCheck | null; initialBook?: string }) {
  const mode = useNbaOddsMode(), id = useId(), rail = useRef<HTMLDivElement>(null)
  const [book, setBook] = useState(initialBook==='all'?'draftkings':initialBook), [metric, setMetric] = useState<'betShare' | 'moneyShare'>('betShare')
  const [edges, setEdges] = useState({ start: true, end: true }), [retry, setRetry] = useState(0)
  const [state, setState] = useState<{ key: string; overview: NbaGameOverview | null; error: boolean; gameOdds?: PaintGameOdds[]; pricesError?: boolean } | null>(null)
  const clockGame = nbaGameHeaderClock(board.game, mode, phaseCheck), start = clockGame ? nbaGameStart(clockGame) : null
  const key = `${board.game.id}:${mode}:${start}:${refreshPrices}:${phaseCheck?.phase?.signature ?? ''}:${phaseCheck?.accessDenied ?? false}`
  const observed = state?.key === key ? state.overview : null
  const overview = observed && start != null && Date.parse(observed.observedAt) < start ? observed : null, error = state?.key === key && state.error
  const poll = !!clockGame && nbaPregameOpen(clockGame), gameId = board.game.id
  const candidates = refreshPrices ? state?.key === key ? state.gameOdds ?? [] : [] : board.gameOdds ?? []
  // Server readers validate observation time. Here tighten only the phase
  // boundary, so a member's mis-set PC clock cannot rewrite a verified quote.
  const gameOdds = candidates.filter(quote => { const at = Date.parse(quote.updated_at); return start != null && Number.isFinite(at) && (mode === 'pregame' ? at < start : at >= start) })
  const books = [...new Set(gameOdds.map(quote => quote.vendor))]
  const selectedBook = books.includes(book) ? book : books[0], quote = gameOdds.find(item => item.vendor === selectedBook)
  const teams = [board.game.visitor_team, board.game.home_team]

  useEffect(() => {
    if (mode === 'live' && !refreshPrices) return
    const controller = new AbortController()
    let pending = false
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch(nbaModeHref(`/the-paint/game-overview?game=${gameId}${refreshPrices ? '&prices=1' : ''}`, mode), { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) setState({ key, overview: null, error: true, pricesError: refreshPrices })
          return
        }
        if (!response.ok) throw new Error('overview')
        const data = await response.json() as { overview: NbaGameOverview | null; publicUnavailable?: boolean; gameOdds?: PaintGameOdds[]; pricesUnavailable?: boolean }
        if (!controller.signal.aborted) setState(prior => ({ key, overview: data.publicUnavailable ? prior?.key === key ? prior.overview : null : data.overview?.gameId === gameId ? data.overview : null, error: data.publicUnavailable === true, gameOdds: data.gameOdds, pricesError: data.pricesUnavailable }))
      } catch {
        if (!controller.signal.aborted) setState(prior => ({ key, overview: prior?.key === key ? prior.overview : null, error: true, pricesError: refreshPrices }))
      } finally { pending = false }
    }
    void load()
    const stop = poll || mode === 'live' && refreshPrices ? watchNbaRefresh(load) : () => {}
    return () => { controller.abort(); stop() }
  }, [gameId, key, mode, poll, refreshPrices, retry])

  useEffect(() => {
    const element = rail.current
    if (!element) return
    const measure = () => setEdges({ start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 })
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => { element.removeEventListener('scroll', measure); observer?.disconnect() }
  }, [])
  const move = (direction: number) => {
    const element = rail.current
    if (element) element.scrollBy({ left: direction * ((element.firstElementChild?.getBoundingClientRect().width ?? element.clientWidth) + 12), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  return <section className={styles.summary} aria-label="Game markets and public activity">
    <header className={styles.toolbar}>
      <div className={styles.matchup}><TeamLogo abbr={teams[0].abbreviation} size={23}/><strong>{teams[0].abbreviation}<span>at</span>{teams[1].abbreviation}</strong><TeamLogo abbr={teams[1].abbreviation} size={23}/></div>
      <div className={styles.actions}>{selectedBook && <PaintBookSelect label="Header sportsbook" value={selectedBook} onChange={setBook} books={books} allowAll={false}/>}{teamControl}<div className={styles.arrows}><button type="button" aria-label="Previous game market" aria-controls={id} disabled={edges.start} onClick={() => move(-1)}><ChevronLeft size={17}/></button><button type="button" aria-label="Next game market" aria-controls={id} disabled={edges.end} onClick={() => move(1)}><ChevronRight size={17}/></button></div></div>
    </header>
    <div className={styles.rail} ref={rail} id={id} role="region" aria-label="Moneyline, spread and total" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) } }}>
      {(['moneyline', 'spread', 'total'] as const).map(market => {
        const sides = market === 'total' ? ['over', 'under'] as const : ['away', 'home'] as const
        const shares = sides.map(side => overview?.splits.find(row => row.market === market && row.side === side)?.[metric]), complete = shares.every(value => value != null)
        return <article key={market} className={styles.market} aria-label={market === 'total' ? 'Game total' : market === 'moneyline' ? 'Moneyline' : 'Spread'}>
          <h3>{market === 'total' ? 'Total' : market === 'moneyline' ? 'Moneyline' : 'Spread'}</h3>
          <div className={styles.outcomes}>{sides.map((side, index) => {
            const line = !quote || market === 'moneyline' ? null : market === 'spread' ? quote[index ? 'spread_home_value' : 'spread_away_value'] : quote.total_value
            const field = `${market}_${side}` as Parameters<typeof PaintGamePrice>[0]['field']
            return <div key={side} className={styles.outcome}><span className={styles.side}>{market === 'total' ? <b>{side === 'over' ? 'O' : 'U'}</b> : <TeamLogo abbr={teams[index].abbreviation} size={22}/>}<span>{market === 'total' ? side === 'over' ? 'Over' : 'Under' : teams[index].abbreviation}{line != null && <strong>{market === 'spread' && Number(line) > 0 ? '+' : ''}{line}</strong>}</span></span>{quote?.opening?.[field] ? <PaintGamePrice quote={quote} field={field} compact/> : <b className={styles.price}>{nbaOdds(quote?.[`${field}_odds`])}</b>}</div>
          })}</div>
          {overview && <div className={styles.split} aria-label={`${market} public ${metric === 'betShare' ? 'pick' : 'wager'} share`}><div className={styles.shareLabels}>{sides.map((side, index) => <span key={side}><small>{market === 'total' ? side === 'over' ? 'Over' : 'Under' : teams[index].abbreviation}</small><b>{percent(shares[index])}</b></span>)}</div><div className={styles.shareTrack} aria-hidden="true" data-unavailable={!complete}>{complete && <i style={{ width: `${shares[0]! * 100}%` }}/>}</div></div>}
        </article>
      })}
    </div>
    <footer className={styles.footer}>
      {refreshPrices && state?.key === key && state.pricesError && <button className={styles.retry} type="button" onClick={() => setRetry(value => value + 1)}>Game prices unavailable · Retry</button>}
      {overview ? <><div className={styles.publicMeta}><span title="Recorded community activity for this game; exact side counts are unavailable"><PickCount value={overview.totalBets}/></span>{overview.totalHandleDollars != null && <span className={styles.handle} title={`Total recorded wagers: ${overview.totalHandleDollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`}><Banknote size={16}/>{dollars.format(overview.totalHandleDollars)}</span>}<time dateTime={overview.observedAt}>Pregame public · {captured.format(new Date(overview.observedAt))} ET</time></div><div className={styles.shareSwitch} role="group" aria-label="Public share metric"><button type="button" aria-label="Show public pick share" title="Pick share" aria-pressed={metric === 'betShare'} onClick={() => setMetric('betShare')}><PicksMark/>%</button><button type="button" aria-label="Show public wager share" title="Wager share" aria-pressed={metric === 'moneyShare'} onClick={() => setMetric('moneyShare')}><Banknote size={16}/>%</button></div></> : <span className={styles.status} role="status">{mode === 'live' ? 'Live public splits unavailable' : error ? 'Public activity could not refresh' : state?.key !== key ? 'Loading public activity…' : 'Public splits not captured'}{error && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>}</span>}
      {error && overview && <button type="button" className={styles.retry} onClick={() => setRetry(value => value + 1)}>Last loaded · Retry</button>}
      <details className={styles.guide}><summary aria-label="About game markets and public activity"><Info size={16}/></summary><div><p>Prices: {quote ? bookName(quote.vendor) : 'unavailable'}{quote ? ` · ${captured.format(new Date(quote.updated_at))} ET` : ''}. Open and movement compare captured prices for this book.</p><p>Public shares and game activity are separate community observations. They are not this book’s wagers or exact side counts. A dash means unavailable.</p></div></details>
    </footer>
  </section>
}
