'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'
import controls from '@/components/product/ResearchControls.module.css'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import { BookLogo } from '@/components/BookLogo'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import type { NflOddsPlayer, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineTeam } from './types'
import styles from './sidelineResearch.module.css'
import { gradeNflPublicProp, type NflPublicResult } from '@/lib/nflPublicResults'

const price = (value: number) => value > 0 ? `+${value}` : String(value)
const stamp = (value: string | null | undefined) => value ? value.replace('T', ' ').slice(0, 19) + ' UTC' : 'Time unavailable'

export function PlayerIdentity({ player, team }: { player: NflOddsPlayer; team?: SidelineTeam }) {
  const [failed, setFailed] = useState<string[]>([])
  const sources = [...new Set([player.headshot, ...(player.headshotFallbacks ?? [])].filter((src): src is string => Boolean(src)))]
  const source = sources.find(src => !failed.includes(src))
  const body = <><span className={styles.portrait}>{source ? <Image unoptimized src={source} alt={`${player.name} headshot`} width={56} height={56} onError={() => setFailed(values => [...values, source])} /> : <span className={styles.initials} aria-label="Portrait unavailable">{player.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span>}<span className={styles.teamBadge}><NflTeamLogo abbr={player.team} logoUrl={team?.logo} size={22} /></span></span><span className={styles.playerName}><strong>{player.name}</strong><small>{player.team} · {player.position}{player.jersey != null ? ` · #${player.jersey}` : ''}</small></span></>
  return player.gsisId ? <Link prefetch={false} className={styles.identity} aria-label={`View ${player.name} NFL profile`} href={`/nfl/players/${encodeURIComponent(player.gsisId)}`}>{body}<span className={styles.profileArrow}>↗</span></Link> : <div className={styles.identity}>{body}</div>
}
const toneFor = (key: string) => /td|touchdown/.test(key) ? 'lime' : /rec/.test(key) ? 'cyan' : /rush/.test(key) ? 'amber' : 'violet'
const marketLabel = (key: string) => key.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()).replace(/\bTds?\b/g, word => word.toUpperCase())

export function SidelineResearchClient({ board, boardHref, title, mode, teams, gameId, initialResults = null }: {
  board: SidelineOddsBoard; boardHref: string; title: string; mode: 'public' | 'markets'; teams: SidelineTeam[]
  gameId?: string; initialResults?: NflPublicResult | null
}) {
  const [results, setResults] = useState(initialResults)
  const [refreshFailed, setRefreshFailed] = useState(false)
  useEffect(() => {
    if (mode !== 'public' || !gameId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        if (document.visibilityState !== 'hidden') {
          const response = await fetch(`/the-sideline/results?game=${encodeURIComponent(gameId)}`, { signal: controller.signal, cache: 'no-store' })
          if (!response.ok) throw new Error('Result refresh failed')
          const next: NflPublicResult = await response.json()
          if (!controller.signal.aborted) { setResults(next); setRefreshFailed(false) }
        }
      } catch { if (!controller.signal.aborted) setRefreshFailed(true) }
      finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 30000) }
    }
    timer = setTimeout(refresh, 30000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [gameId, mode])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(0)
  const [teamFilter, setTeamFilter] = useState('all')
  const playersById = useMemo(() => new Map(board.players.map(player => [player.id, player])), [board.players])
  const picks = useMemo(() => board.players.flatMap(player => (player.publicPicks ?? []).map(pick => ({
    player: player.name, team: player.team, playerId: player.id, ...pick,
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
      id: `${player.id}:${market.key}:${key}`, player: player.name, playerId: player.id, team: player.team,
      label: market.label, category: market.category, lineSide: key.replace('|odds', '').replace('|', ' '),
      offers: offers.sort((a, b) => americanImpliedProbability(a.odds)! - americanImpliedProbability(b.odds)!),
    }))
  })), [board.players])
  const options = mode === 'public' ? [...new Set(picks.map(row => row.propType))] : [...new Set(markets.map(row => row.category))]
  const matches = (player: string, team: string, label: string) => (teamFilter === 'all' || team === teamFilter) && `${player} ${team} ${label}`.toLowerCase().includes(search.toLowerCase())
  const filteredPicks = picks.filter(row => matches(row.player, row.team, row.label) && (category === 'all' || category === row.propType))
  const filteredMarkets = markets.filter(row => matches(row.player, row.team, row.label) && (category === 'all' || category === row.category))
  const count = mode === 'public' ? filteredPicks.length : filteredMarkets.length
  const totalPicks = filteredPicks.reduce((sum, row) => sum + row.picks, 0)
  const pageSize = 24
  const theme = (team: string) => ({ '--team-color': teams.find(item => item.abbr === team)?.color ?? '#203d50' }) as CSSProperties
  return <div className={styles.root}>
    <header><Link href={boardHref}>← The Sideline</Link><p>{title}</p><h1>{mode === 'public' ? 'The Public · NFL' : 'NFL sportsbook comparison'}</h1>
      <small>Captured: {stamp(mode === 'public' ? board.picksCapturedAt : board.capturedAt)}</small>
      {mode === 'public' ? <p className={styles.resultSummary} role="status">{results?.status === 'final' ? 'Final results' : results?.status === 'in_progress' ? 'Live results · refresh every 30s' : 'Game results'}{results ? ` · Updated ${stamp(results.updatedAt)}` : ' · Awaiting feed'}{refreshFailed ? ' · Refresh delayed; showing last update' : ''}</p> : null}
    </header>
    <section className={styles.controls} aria-label="Research filters">
      <label>Search<input value={search} placeholder="Player, team or market" onChange={event => { setSearch(event.target.value); setPage(0) }} /></label>
      <label>Team<select value={teamFilter} onChange={event => { setTeamFilter(event.target.value); setPage(0) }}><option value="all">Both teams</option>{teams.map(team => <option key={team.abbr} value={team.abbr}>{team.name}</option>)}</select></label>
      <span>{count} rows{mode === 'public' ? ` · ${totalPicks.toLocaleString()} tracked picks` : ''}</span>
    </section>
    <div className={controls.scrollRail} aria-label="Choose a market">{['all', ...options].map(option => <button type="button" key={option} aria-pressed={category === option} className={`${controls.pill} ${category === option ? controls.pillActive : ''}`} onClick={() => { setCategory(option); setPage(0) }}>{option === 'all' ? 'All markets' : marketLabel(option)}</button>)}</div>
    {count === 0 ? <p className={styles.empty}>No captured data matches this view.</p> : <div className={styles.cards}>
      {mode === 'public' ? filteredPicks.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => {
        const player = playersById.get(row.playerId)!
        const market = row.line == null ? nflPrimaryMarket(player, row.propType) : player.markets.find(item => item.propType === row.propType && item.offers.some(offer => (offer.line ?? item.line) === row.line && (!row.kind || row.kind === offer.type)))
        const oddsFor = (offer: NonNullable<typeof market>['offers'][number]) => row.side === 'under' ? offer.current.under : offer.current.odds ?? offer.current.over
        const offers = market?.offers.filter(offer => !offer.isOpeningOnly && (row.line == null || (offer.line ?? market.line) === row.line) && americanImpliedProbability(oddsFor(offer)) != null) ?? []
        const outcome = gradeNflPublicProp(results, player, row)
        const ladder = [...new Map(player.markets.filter(item => item.propType === row.propType).flatMap(item => item.offers.filter(offer => !offer.isOpeningOnly).flatMap(offer => {
          const line = offer.line ?? item.line ?? (item.propType === 'anytime_td' || item.propType === 'first_td' ? 1 : null)
          return line == null ? [] : [[`${line}:${offer.type}`, { line, kind: offer.type }] as const]
        }))).values()].sort((a, b) => a.line - b.line)
        const share = totalPicks ? row.picks / totalPicks * 100 : 0
        return <article className={styles.card} data-tone={toneFor(row.propType)} style={theme(row.team)} key={`${row.playerId}:${row.propType}:${index}`}>
          <div className={styles.cardHead}><span className={styles.rank}>{page * pageSize + index + 1}</span><PlayerIdentity player={player} team={teams.find(team => team.abbr === row.team)} /><span className={styles.pickBadge}><b>{row.picks.toLocaleString()}</b><small>PICKS</small></span></div>
          <div className={styles.marketHeading}><strong>{row.label}</strong><span>{share.toFixed(1)}% of filtered picks</span></div>
          <div className={styles.outcome} data-state={outcome.state}><strong>{outcome.label}</strong>{outcome.actual != null ? <span>{outcome.actual}{row.line != null ? ` / ${row.line}` : ''} actual</span> : null}</div>
          {ladder.length ? <details className={styles.resultLadders}><summary>Captured ladder results · {ladder.length} lines</summary><div>{ladder.map(rung => { const grade = gradeNflPublicProp(results, player, { propType: row.propType, ...rung, side: row.side }); return <span key={`${rung.line}:${rung.kind}`} data-state={grade.state}><b>{row.side === 'under' ? 'Under ' : rung.kind === 'over_under' ? 'Over ' : ''}{rung.line}{rung.kind === 'milestone' ? '+' : ''}</b><small>{grade.label}</small></span> })}</div></details> : null}
          <div className={styles.shareTrack} role="meter" aria-label={`${row.player} filtered pick share`} aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${share}%` }} /></div>
          {offers.length ? <div className={styles.reference}><small>{row.line == null ? 'CATEGORY REFERENCE' : 'MATCHING LINE'}{market?.line != null ? ` · LINE ${market.line}` : ''}</small><div className={styles.oddsChips}>{offers.map(offer => <span key={`${offer.vendor}:${offer.line}`} aria-label={`${offer.vendor} ${price(oddsFor(offer)!)} captured ${stamp(offer.updatedAt)}`}><BookLogo vendor={offer.vendor} size={16} /><b>{row.side === 'under' ? 'U ' : offer.current.over != null ? 'O ' : ''}{price(oddsFor(offer)!)}</b></span>)}</div></div> : <small className={styles.missing}>No matching reference price captured</small>}
          <footer className={styles.cardFooter}><small>{stamp(row.capturedAt)}</small>{player.gsisId ? <Link prefetch={false} href={`/nfl/players/${encodeURIComponent(player.gsisId)}`}>Player profile ↗</Link> : <small>Profile not linked yet</small>}</footer>
        </article>
      }) : filteredMarkets.slice(page * pageSize, (page + 1) * pageSize).map(row => <article className={styles.card} data-tone={toneFor(row.category)} style={theme(row.team)} key={row.id}>
        <div className={styles.cardHead}><PlayerIdentity player={playersById.get(row.playerId)!} team={teams.find(team => team.abbr === row.team)} /><span className={styles.bookCount}>{row.offers.length} books</span></div>
        <div className={styles.marketHeading}><strong>{row.label}</strong><span>{row.lineSide}</span></div>
        <div className={styles.bookGrid}>{row.offers.map((offer, index) => <div className={styles.bookOffer} data-best={index === 0 && row.offers.length > 1} key={`${offer.vendor}:${index}`}><span><BookLogo vendor={offer.vendor} size={20} />{offer.vendor}</span><b>{price(offer.odds)}</b><small>{stamp(offer.time)}</small>{index === 0 && row.offers.length > 1 ? <em>BEST PAYOUT</em> : null}</div>)}</div>
      </article>)}
    </div>}
    <footer className={styles.controls}><button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(count / pageSize))}</span><button disabled={(page + 1) * pageSize >= count} onClick={() => setPage(value => value + 1)}>Next</button></footer>
  </div>
}
