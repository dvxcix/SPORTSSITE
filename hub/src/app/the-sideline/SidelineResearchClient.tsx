'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BookLogo } from '@/components/BookLogo'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import styles from './sidelineResearch.module.css'

const price = (value: number) => value > 0 ? `+${value}` : String(value)
const stamp = (value: string | null | undefined) => value ? value.replace('T', ' ').slice(0, 19) + ' UTC' : 'Time unavailable'

export function SidelineResearchClient({ board, boardHref, title, mode }: {
  board: SidelineOddsBoard; boardHref: string; title: string; mode: 'public' | 'markets'
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(0)
  const picks = useMemo(() => board.players.flatMap(player => (player.publicPicks ?? []).map(pick => ({
    player: player.name, team: player.team, ...pick,
  }))).sort((a, b) => b.picks - a.picks), [board.players])
  const markets = useMemo(() => board.players.flatMap(player => player.markets.flatMap(market => {
    // Lines and sides are separate contracts. Never compare an over with an under
    // or a 40+ yard offer with a 50+ yard offer.
    const groups = new Map<string, { vendor: string; odds: number; time: string | null }[]>()
    for (const offer of market.offers) {
      if (offer.isOpeningOnly) continue
      for (const side of ['odds', 'over', 'under'] as const) {
        const odds = offer.current[side]
        if (odds == null || americanImpliedProbability(odds) == null) continue
        const key = `${offer.line ?? market.line ?? 'unlisted'}|${side}`
        const values = groups.get(key) ?? []
        values.push({ vendor: offer.vendor, odds, time: offer.updatedAt })
        groups.set(key, values)
      }
    }
    return [...groups].map(([key, offers]) => ({
      id: `${player.id}:${market.key}:${key}`, player: player.name, team: player.team,
      label: market.label, category: market.category, lineSide: key.replace('|odds', '').replace('|', ' '),
      offers: offers.sort((a, b) => americanImpliedProbability(a.odds)! - americanImpliedProbability(b.odds)!),
    }))
  })), [board.players])
  const options = mode === 'public' ? [...new Set(picks.map(row => row.propType))] : [...new Set(markets.map(row => row.category))]
  const matches = (player: string, team: string, label: string) => `${player} ${team} ${label}`.toLowerCase().includes(search.toLowerCase())
  const filteredPicks = picks.filter(row => matches(row.player, row.team, row.label) && (category === 'all' || category === row.propType))
  const filteredMarkets = markets.filter(row => matches(row.player, row.team, row.label) && (category === 'all' || category === row.category))
  const count = mode === 'public' ? filteredPicks.length : filteredMarkets.length
  const totalPicks = filteredPicks.reduce((sum, row) => sum + row.picks, 0)
  const pageSize = 40
  return <main className={styles.root}>
    <header><Link href={boardHref}>← The Sideline</Link><p>{title}</p><h1>{mode === 'public' ? 'The Public · NFL' : 'NFL sportsbook comparison'}</h1>
      <nav><Link href={`${boardHref}&mode=public`}>The Public</Link><Link href={`${boardHref}&mode=markets`}>Sportsbooks</Link></nav>
      <p>{mode === 'public' ? 'Tracked picks, not dollars wagered or a census of all bettors. Share uses only the filtered rows below.' : 'Like-for-like captured player markets. Best payout is not a prediction. Check each book’s timestamp; captures are not necessarily simultaneous.'}</p>
      <small>Captured: {stamp(mode === 'public' ? board.picksCapturedAt : board.capturedAt)} · Refresh the page for the latest stored capture.</small>
    </header>
    <section className={styles.controls} aria-label="Research filters">
      <label>Search<input value={search} placeholder="Player, team or market" onChange={event => { setSearch(event.target.value); setPage(0) }} /></label>
      <label>Market<select value={category} onChange={event => { setCategory(event.target.value); setPage(0) }}><option value="all">All markets</option>{options.map(option => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select></label>
      <span>{count} rows{mode === 'public' ? ` · ${totalPicks.toLocaleString()} tracked picks` : ''}</span>
    </section>
    {count === 0 ? <p className={styles.empty}>No captured data matches this view. Missing data is not zero activity.</p> : <div className={styles.tableScroll}><table><thead><tr>{(mode === 'public' ? ['Player', 'Market', 'Picks', 'Filtered share', 'Captured'] : ['Player', 'Market / line / side', 'Book prices · best payout first']).map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {mode === 'public' ? filteredPicks.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => <tr key={`${row.player}:${row.propType}:${index}`}><th>{row.player}<small>{row.team}</small></th><td>{row.label}</td><td>{row.picks.toLocaleString()}</td><td><meter min={0} max={totalPicks || 1} value={row.picks} /> {totalPicks ? (row.picks / totalPicks * 100).toFixed(1) : '0.0'}%</td><td>{stamp(row.capturedAt)}</td></tr>) : filteredMarkets.slice(page * pageSize, (page + 1) * pageSize).map(row => <tr key={row.id}><th>{row.player}<small>{row.team}</small></th><td>{row.label}<small>{row.lineSide}</small></td><td><div className={styles.offers}>{row.offers.map((offer, index) => <span key={`${offer.vendor}:${index}`}><BookLogo vendor={offer.vendor} size={18} /><b>{price(offer.odds)}</b><small>{offer.vendor} · {stamp(offer.time)}</small></span>)}</div></td></tr>)}
    </tbody></table></div>}
    <footer className={styles.controls}><button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(count / pageSize))}</span><button disabled={(page + 1) * pageSize >= count} onClick={() => setPage(value => value + 1)}>Next</button></footer>
  </main>
}
