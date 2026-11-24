'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { Banknote, ChevronLeft, ChevronRight, Info, Table2 } from 'lucide-react'
import { publicWorkspaceFetch as fetch } from '@/lib/publicWorkspaceClient'
import { startNflPolling } from '@/lib/nflPolling'
import type { NflGameOverview, NflGameMarket } from '@/lib/nflGameOverview'
import type { NflGameLineBook, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { BookLogo, bookName } from '@/components/BookLogo'
import { PickCount, PicksMark } from '@/components/research/ResearchMetrics'
import { ResearchBookFilter, useResearchBooks } from '@/components/research/ResearchBookFilter'
import { nflKickoffAt } from './kickoff'
import type { SidelineGame } from './types'
import styles from './NflGameSummary.module.css'

const captured = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const markets = ['moneyline', 'spread', 'total'] as const
const marketName = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total' }
const odds = (value: number | null | undefined) => value == null || !Number.isFinite(value) || value === 0 ? '—' : value > 0 ? `+${value}` : String(value)
const percent = (value: number | null | undefined) => value == null ? '—' : `${Math.round(value * 100)}%`

function price(line: Omit<NflGameLineBook, 'vendor' | 'opening' | 'updatedAt'> | null | undefined, market: NflGameMarket, first: boolean) {
  const value = market === 'moneyline' ? first ? line?.moneylineAway : line?.moneylineHome : market === 'spread' ? first ? line?.spreadAwayOdds : line?.spreadHomeOdds : first ? line?.totalOverOdds : line?.totalUnderOdds
  const threshold = market === 'spread' ? first ? line?.spreadAway : line?.spreadHome : market === 'total' ? line?.total : null
  return { odds: odds(value), threshold: threshold == null ? '—' : market === 'spread' && threshold > 0 ? `+${threshold}` : String(threshold) }
}

export function NflGameSummary({ game, board, preferredBooks = [], at = null, loadingPrices = false }: { game: SidelineGame; board: SidelineOddsBoard; preferredBooks?: string[]; at?: string | null; loadingPrices?: boolean }) {
  const id = useId(), rail = useRef<HTMLDivElement>(null)
  const [book, setBook] = useState(preferredBooks[0] ?? 'fanduel'), [compare, setCompare] = useState(false)
  const [edges, setEdges] = useState({ start: true, end: true }), [retry, setRetry] = useState(0)
  const [state, setState] = useState<{ key: string; overview: NflGameOverview | null; error: boolean } | null>(null)
  const key = `${game.id}:${at ?? 'latest'}`, kickoff = nflKickoffAt(game)?.getTime()
  const lines = loadingPrices ? [] : board.gameLines.filter(line => !line.isOpeningOnly)
  const books = lines.map(line => line.vendor), selectedBook = books.includes(book) ? book : books.find(vendor => preferredBooks.includes(vendor)) ?? books[0]
  const quote = lines.find(line => line.vendor === selectedBook), selection = useResearchBooks(books, preferredBooks)
  const overview = state?.key === key ? state.overview : null, error = state?.key === key && state.error

  useEffect(() => {
    const controller = new AbortController()
    const load = async (signal: AbortSignal) => {
      try {
        const query = new URLSearchParams({ game: game.id })
        if (at) query.set('at', at)
        const response = await fetch('/the-sideline/game-overview?' + query, { cache: 'no-store', signal: AbortSignal.any([controller.signal, signal]) })
        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) setState({ key, overview: null, error: true })
          return
        }
        if (!response.ok) throw new Error('overview')
        const data = await response.json() as { overview: NflGameOverview | null }
        if (!controller.signal.aborted) setState({ key, overview: data.overview?.gameId === game.id ? data.overview : null, error: false })
      } catch {
        if (!controller.signal.aborted) setState(prior => ({ key, overview: prior?.key === key ? prior.overview : null, error: true }))
      }
    }
    let stop = () => {}
    if (at == null && kickoff != null && Date.now() < kickoff) stop = startNflPolling(async signal => {
      await load(signal)
      if (Date.now() >= kickoff) stop()
    }, { immediate: true })
    else void load(AbortSignal.timeout(20000))
    return () => { controller.abort(); stop() }
  }, [game.id, at, key, kickoff, retry])

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
    element?.scrollBy({ left: direction * ((element.firstElementChild?.getBoundingClientRect().width ?? element.clientWidth) + 12), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  return <section className={styles.summary} aria-label="Game markets and public activity">
    <header className={styles.toolbar}>
      <div className={styles.matchup}>{game.away.logo && <Image src={game.away.logo} alt={`${game.away.name} logo`} width={25} height={25} unoptimized/>}<strong>{game.away.abbr}<span>at</span>{game.home.abbr}</strong>{game.home.logo && <Image src={game.home.logo} alt={`${game.home.name} logo`} width={25} height={25} unoptimized/>}</div>
      <div className={styles.actions}>
        {selectedBook && <label className={styles.book}><BookLogo vendor={selectedBook} size={22}/><select aria-label="Game market sportsbook" value={selectedBook} onChange={event => setBook(event.target.value)}>{books.map(vendor => <option value={vendor} key={vendor}>{bookName(vendor)}</option>)}</select></label>}
        <button type="button" aria-expanded={compare} aria-controls={id + '-books'} onClick={() => setCompare(value => !value)}><Table2 size={16}/><span>Compare books</span></button>
        <div className={styles.arrows}><button type="button" aria-label="Previous game market" aria-controls={id} disabled={edges.start} onClick={() => move(-1)}><ChevronLeft size={17}/></button><button type="button" aria-label="Next game market" aria-controls={id} disabled={edges.end} onClick={() => move(1)}><ChevronRight size={17}/></button></div>
      </div>
    </header>
    <div className={styles.rail} id={id} ref={rail} role="region" aria-label="Moneyline, spread and total" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) } }}>
      {markets.map(market => {
        const sides = market === 'total' ? ['over', 'under'] as const : ['away', 'home'] as const
        return <article className={styles.market} key={market} aria-label={marketName[market]}>
          <h3>{marketName[market]}</h3>
          <div className={styles.outcomes}>{sides.map((side, index) => {
            const team = index === 0 ? game.away : game.home, current = price(quote, market, index === 0), opening = price(quote?.opening, market, index === 0)
            return <div className={styles.outcome} key={side}>
              <span className={styles.side}>{market !== 'total' && team.logo ? <Image src={team.logo} alt="" width={22} height={22} unoptimized/> : null}{market === 'total' ? index === 0 ? 'Over' : 'Under' : team.abbr}</span>
              <strong>{market === 'moneyline' ? current.odds : current.threshold}</strong>
              {market !== 'moneyline' && <b>{current.odds}</b>}
              <small>Open {market === 'moneyline' ? opening.odds : `${opening.threshold} ${opening.odds}`}</small>
            </div>
          })}</div>
          {overview && <div className={styles.splitStack}>{([{ metric: 'betShare', label: 'Bets', Icon: PicksMark }, { metric: 'moneyShare', label: 'Money', Icon: Banknote }] as const).map(({ metric, label, Icon }) => {
            const values = sides.map(side => overview.splits.find(row => row.market === market && row.side === side)?.[metric] ?? null), complete = values.every(value => value != null)
            return <div key={metric} className={styles.split} aria-label={`${marketName[market]} ${label.toLowerCase()}: ${market === 'total' ? 'Over' : game.away.abbr} ${percent(values[0])}, ${market === 'total' ? 'Under' : game.home.abbr} ${percent(values[1])}`}>
              <div className={styles.shareLabels}><span className={styles.metricLabel}><Icon size={14}/>{label}</span>{values.map((value, index) => <span key={index}><small>{market === 'total' ? index === 0 ? 'Over' : 'Under' : index === 0 ? game.away.abbr : game.home.abbr}</small><b>{percent(value)}</b></span>)}</div>
              <div className={styles.shareTrack} data-unavailable={!complete}>{complete && values.map((value, index) => {
                const team = index === 0 ? game.away : game.home, color = market === 'total' ? index === 0 ? 'var(--accent)' : 'var(--red)' : team.color
                return <i key={index} aria-hidden="true" style={{ width: `${value! * 100}%`, '--segment-from': color, '--segment-to': market === 'total' ? color : team.color2 ?? color } as CSSProperties}/>
              })}</div>
            </div>
          })}</div>}
        </article>
      })}
    </div>
    <footer className={styles.footer}>
      <div className={styles.publicMeta}>{overview ? <><PickCount value={overview.totalBets}/>{overview.totalHandleDollars != null && <span title="Total recorded public wagers"><Banknote size={15}/>{dollars.format(overview.totalHandleDollars)}</span>}<time dateTime={overview.observedAt}>Pregame public · {captured.format(new Date(overview.observedAt))} ET</time></> : <span role="status">{error ? 'Public activity could not refresh' : state?.key !== key ? 'Loading public activity…' : 'Public splits not captured'}</span>}
      {error && <button type="button" onClick={() => setRetry(value => value + 1)}>{overview ? 'Last loaded · Retry' : 'Retry'}</button>}
      {!quote && <span>{loadingPrices ? 'Loading captured prices…' : 'Game prices unavailable'}</span>}</div>
      <details className={styles.guide}><summary aria-label="About game markets and public activity"><Info size={16}/></summary><div><p>Prices: {quote ? bookName(quote.vendor) : 'unavailable'}{quote?.updatedAt ? ` · ${captured.format(new Date(quote.updatedAt))} ET` : ''}. Opening prices belong to the same sportsbook.</p><p>Bets and money are separate public observations, not this book’s own wagers. Shares are saved before kickoff. A dash means unavailable.</p></div></details>
    </footer>
    {compare && <section className={styles.comparison} id={id + '-books'} aria-label="All sportsbook game lines">
      <header><strong>Sportsbook comparison</strong><span>{selection.books.length} of {books.length} books</span><ResearchBookFilter available={books} selected={selection.books} onChange={selection.setBooks}/></header>
      <div className={styles.tableScroll} role="region" aria-label="Sportsbook game line comparison" tabIndex={0}><table><thead><tr><th>Sportsbook</th>{markets.map(market => <th key={market}>{marketName[market]}</th>)}</tr></thead><tbody>{lines.filter(line => selection.books.includes(line.vendor)).map(line => <tr key={line.vendor}><th scope="row"><BookLogo vendor={line.vendor} size={22}/>{bookName(line.vendor)}</th>{markets.map(market => <td key={market}>{[true, false].map(first => {
        const current = price(line, market, first), opening = price(line.opening, market, first)
        return <div key={String(first)}><span>{market === 'total' ? first ? 'Over' : 'Under' : first ? game.away.abbr : game.home.abbr}</span><b>{market === 'moneyline' ? current.odds : `${current.threshold} ${current.odds}`}</b><small>Open {market === 'moneyline' ? opening.odds : `${opening.threshold} ${opening.odds}`}</small></div>
      })}</td>)}</tr>)}</tbody></table></div>
    </section>}
  </section>
}
