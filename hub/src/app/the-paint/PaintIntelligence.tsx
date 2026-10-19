'use client'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUpRight, RefreshCw } from 'lucide-react'
import { nbaOdds, nbaReference, nbaSeason, PAINT_MARKETS, type PaintBoard, type PaintMarket } from '@/lib/nbaPaint'
import { nbaGamePace, nbaPosition, nbaSlipSurgeScore, type NbaDvp } from '@/lib/nbaIntelligence'
import { BookLogo } from '@/components/BookLogo'
import { PlayerAvatar, number } from './PaintVisuals'
import { PaintPickActions } from './PaintPickActions'
import styles from './paint.module.css'

type Context = { season: number; ready: boolean; profiles: NbaDvp[]; games: number; rows: number; fetchedAt: string | null; stale: boolean }
export function PaintIntelligence({ board, market, book, side, mode, open, onMarketChange, onBookChange, onSideChange }: { board: PaintBoard; market: PaintMarket; book: string; side: 'over' | 'under'; mode: 'score' | 'dvp'; open: (id: number, market?: PaintMarket) => void; onMarketChange:(market:PaintMarket)=>void; onBookChange:(book:string)=>void; onSideChange:(side:'over'|'under')=>void }) {
  const [context, setContext] = useState<Context | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [query, setQuery] = useState(''), [position, setPosition] = useState('all'), [ascending, setAscending] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  useEffect(() => {
    const controller = new AbortController(); let pending = false
    const update = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch(`/the-paint/intelligence?game=${board.game.id}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]) })
        if (!response.ok) throw new Error('unavailable')
        const result = await response.json()
        if (!controller.signal.aborted) { setContext(result); setError('') }
      } catch { if (!controller.signal.aborted) setError('Defense research could not load.') }
      finally { pending = false }
    }
    void update()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void update() }, 60000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [board.game.id, retry])
  const rows = useMemo(() => board.players.map(player => {
    const opponent = player.team.id === board.game.home_team.id ? board.game.visitor_team : board.game.home_team
    const matchup = context?.profiles.find(profile => profile.teamId === opponent.id && profile.position === nbaPosition(player.position) && profile.market === market)
    return { player, opponent, matchup, signal: nbaSlipSurgeScore(player, market, board.game.date, matchup, nbaGamePace(board)), offer: nbaReference(player.props, market, book, side) }
  }).filter(row => `${row.player.first_name} ${row.player.last_name}`.toLowerCase().includes(query.toLowerCase()) && (position === 'all' || nbaPosition(row.player.position) === position)).sort((a, b) => {
    const av = mode === 'score' ? a.signal.score : a.matchup?.allowance, bv = mode === 'score' ? b.signal.score : b.matchup?.allowance
    if (av == null || bv == null) return av == null ? bv == null ? a.player.id - b.player.id : 1 : -1
    return (av - bv) * (ascending ? 1 : -1)
  }), [board, market, book, side, mode, context, query, position, ascending])
  return <section className={styles.researchTool}>
    <header className={styles.toolHeading}><div><span className={styles.eyebrow}>{nbaSeason(board.sampleSeason)} · REGULAR SEASON</span><h3>{mode === 'score' ? 'SlipSurge Score' : 'Defense × position'}</h3></div><button className={styles.iconButton} aria-label="Refresh NBA defense research" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16}/></button></header>
    <div className={styles.toolControls}><select aria-label="Score stat market" value={market} onChange={event=>onMarketChange(event.target.value as PaintMarket)}>{PAINT_MARKETS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select><select aria-label="Score sportsbook" value={book} onChange={event=>onBookChange(event.target.value)}><option value="all">All books</option>{[...new Set(board.players.flatMap(player=>player.props.map(offer=>offer.vendor)))].sort().map(vendor=><option key={vendor} value={vendor}>{vendor}</option>)}</select><select aria-label="Score market side" value={side} onChange={event=>onSideChange(event.target.value as 'over'|'under')}><option value="over">Over</option><option value="under">Under</option></select><label className={styles.search}><input aria-label="Search NBA score players" placeholder="Find a player" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Research position" value={position} onChange={event => setPosition(event.target.value)}><option value="all">All positions</option><option value="G">Guards</option><option value="F">Forwards</option><option value="C">Centers</option></select><button onClick={() => setAscending(value => !value)}><ArrowDown size={14} style={{ transform: ascending ? 'rotate(180deg)' : undefined }}/>{mode === 'score' ? 'Score' : 'Allowance'}</button></div>
    {error && <p role="status">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    <p className={styles.toolNote}>{mode === 'score' ? 'Production support · 0–100 · tap a score for its ingredients.' : 'Latest 20 defensive games · production per 48 position-minutes.'}</p>
    {!context ? <p className={styles.toolNote}>Loading position context…</p> : !context.ready ? <p className={styles.toolNote}>Historical import in progress · {context.rows.toLocaleString()} stored stat rows. Position allowances appear after verified season coverage.</p> : <p className={styles.toolNote}>{nbaSeason(context.season)} · {context.games} games · {context.rows.toLocaleString()} appearances · {context.stale ? 'Last captured context' : 'Shared defensive sample'}</p>}
    <details className={styles.movementHelp}><summary>{mode==='score'?'Score methodology':'Position methodology'}</summary><p className={styles.toolNote}>The score combines market-specific opportunity, minutes, recent form, role stability and available position allowance. At least five known market observations are required; sparse samples shrink toward neutral. It is a support index, not a calibrated pick probability. Position groups use the first listed roster role; hybrids stay in that group. Allowances shrink toward league rates and require five games with known results.</p></details><div className={styles.researchScroll}><table className={styles.researchTable}><caption className={styles.srOnly}>{mode === 'score' ? 'NBA production support scores' : 'NBA defense by position'}</caption><thead><tr><th>Player</th><th>Score</th><th>L10 min</th><th>L10</th><th>Position / 48</th><th>Allowance</th><th>Line / odds</th><th><span className={styles.srOnly}>Save pick</span></th></tr></thead><tbody>{rows.map(({ player, signal, matchup, offer, opponent }) => <tr key={player.id}><td><button className={styles.playerButton} onClick={() => open(player.id, market)}><PlayerAvatar player={player}/><span><strong>{player.first_name} {player.last_name}</strong><small>{player.team.full_name}{signal.newTeam && <em>New team</em>}</small></span><ArrowUpRight size={14}/></button>{expanded === player.id && <div className={styles.scoreParts}>{signal.parts.map(part => <span key={part.key}><small>{part.label} · {Math.round(part.weight * 100)}%</small><b>{number(part.value, 0)}</b></span>)}<small>{signal.games} appearances · {Math.round(signal.coverage * 100)}% feature coverage</small></div>}</td><td><button className={styles.scoreButton} aria-label={`Show ${player.first_name} ${player.last_name} score ingredients`} aria-expanded={expanded === player.id} onClick={() => setExpanded(expanded === player.id ? null : player.id)}>{signal.score ?? '—'}</button></td><td>{number(signal.minutes)}</td><td>{number(signal.production)}</td><td><b>{number(matchup?.per48)}</b><small className={styles.blockMuted}>{opponent.full_name} · {matchup?.games ?? '—'} games</small></td><td className={matchup?.allowance == null ? styles.muted : matchup.allowance > 0 ? styles.hit : styles.miss}>{matchup?.allowance == null ? '—' : `${matchup.allowance > 0 ? '+' : ''}${(matchup.allowance * 100).toFixed(1)}%`}</td><td>{offer ? <button className={styles.lineButton} onClick={() => open(player.id, market)}><strong>{offer.line_value}</strong><span><BookLogo vendor={offer.vendor} size={14}/>{nbaOdds(side === 'over' ? offer.market.over_odds : offer.market.under_odds)}</span></button> : '—'}</td><td>{offer && <PaintPickActions player={player} offer={offer} side={side} game={board.game}/>}</td></tr>)}</tbody></table></div>
  </section>
}
