'use client'
import type { NbaMarketSelection } from '@/lib/nbaMarketSelection'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { nbaPrice, nbaTarget, nbaSeason, PAINT_MARKETS, type PaintTeam, type PaintBoard, type PaintMarket, type PaintProp } from '@/lib/nbaPaint'
import { nbaPosition } from '@/lib/nbaPosition'
import type { NbaDvp } from '@/lib/nbaIntelligence'
import type { NbaMarketSupportView } from '@/lib/nbaMarketSignal'
import { BookLogo } from '@/components/BookLogo'
import { TeamLogo, PlayerAvatar, marketNumber, number } from './PaintVisuals'
import { PaintPickActions } from './PaintPickActions'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { PaintPrice } from './PaintPrice'
import { PaintSortHeader } from './PaintSortHeader'
import { PaintMarketSupport } from './PaintMarketSupport'
import { compareResearch, PaintMmCell, PaintScoreCell } from './PaintResearchCells'
import { PaintBookSelect,PaintTeamSelect } from './PaintEntitySelect'
import { PaintHeatCell, PaintHeatLegend } from './PaintHeatCell'
import { nbaCenteredHeat } from './paintHeat'
import styles from './paint.module.css'
import polish from './research-polish.module.css'
import dials from './research-dials.module.css'

type ScoreView = { playerId: number; score: number | null; mm: number | null; offer: PaintProp | null; minutes: number | null; production: number | null; newTeam: boolean; marketSignals: NbaMarketSupportView }
type Context = { teams?: PaintTeam[]; season: number; ready: boolean; profiles: NbaDvp[]; games: number; fetchedAt: string | null; stale: boolean; scores: ScoreView[] }
export function PaintIntelligence({ selection, board, market, book, side, mode, open, onMarketChange, onBookChange, onSideChange }: { selection?: NbaMarketSelection; board: PaintBoard; market: PaintMarket; book: string; side: 'over' | 'under'; mode: 'score' | 'dvp'; open: (id: number, market?: PaintMarket, book?: string, panel?: 'trends' | 'ladder' | 'movement' | 'tracking' | 'court' | 'markets', quote?: { line: number; type: 'over_under' | 'milestone' }, side?: 'over' | 'under') => void; onMarketChange: (market: PaintMarket) => void; onBookChange: (book: string) => void; onSideChange: (side: 'over' | 'under') => void }) {
  const [contextState, setContext] = useState<{ key: string; data: Context } | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [query, setQuery] = useState(''), [position, setPosition] = useState('all'), [ascending, setAscending] = useState(false), [sort, setSort] = useState('score')
  const [team,setTeam]=useState('all')
  const [scope, setScope] = useState<'league' | 'matchup'>('league')
  const contract=selection?.type??'',target=selection?.line==null?'':String(selection.line)
  const contextKey = `${board.game.id}:${market}:${book}:${side}:${contract}:${target}`
  const context = contextState?.key === contextKey ? contextState.data : null
  useEffect(() => {
    const controller = new AbortController(); let pending = false
    const update = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch(`/the-paint/intelligence?${new URLSearchParams({ game: String(board.game.id), market, book, side, contract, target })}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(115000)]) })
        if (!response.ok) throw new Error('unavailable')
        const result = await response.json()
        if (!controller.signal.aborted) { setContext({ key: contextKey, data: result }); setError('') }
      } catch { if (!controller.signal.aborted) setError('Matchup context could not refresh.') }
      finally { pending = false }
    }
    void update(); const stop = watchNbaRefresh(update)
    return () => { controller.abort(); stop() }
  }, [board.game.id, board.fetchedAt, market, book, side, contextKey, retry, contract, target])
  const sortBy = (column: string) => {
    const active = mode === 'dvp' && scope === 'league' && !['name', 'position', 'games', 'defense', 'league', 'allowance'].includes(sort) ? 'allowance' : sort
    setSort(column); setAscending(value => active === column ? !value : column === 'name')
  }
  const rows = useMemo(() => board.players.map(player => {
    const opponent = player.team.id === board.game.home_team.id ? board.game.visitor_team : board.game.home_team
    const matchup = context?.profiles.find(profile => profile.teamId === opponent.id && profile.position === nbaPosition(player.position) && profile.market === market)
    const signal = context?.scores?.find(row => row.playerId === player.id) ?? { score: null, mm: null, offer: null, minutes: null, production: null, newTeam: false, marketSignals: null }
    return { player, opponent, matchup, signal, offer: signal.offer, mm: signal.mm }
  }).filter(row => (team==='all'||String(row.player.team.id)===team)&&`${row.player.first_name} ${row.player.last_name} ${row.player.team.full_name}`.toLowerCase().includes(query.toLowerCase()) && (position === 'all' || nbaPosition(row.player.position) === position)).sort((a, b) => {
    const value = (row: typeof a) => sort === 'name' ? `${row.player.first_name} ${row.player.last_name}` : sort === 'mm' ? row.mm : sort === 'minutes' ? row.signal.minutes : sort === 'production' ? row.signal.production : sort === 'defense' ? row.matchup?.per48 : sort === 'allowance' ? row.matchup?.allowance : sort === 'line' ? row.offer ? Number(row.offer.line_value) : null : sort === 'odds' ? row.offer ? nbaPrice(row.offer, side) : null : sort === 'market' ? row.signal.marketSignals?.signal ? row.signal.marketSignals.signal.relatedPicks - row.signal.marketSignals.signal.targetPicks : null : row.signal.score
    return compareResearch(value(a), value(b), ascending) || a.player.id - b.player.id
  }), [board, market, side, context, query, position, ascending, sort,team])
  const leagueSort = ['name', 'position', 'games', 'defense', 'league', 'allowance'].includes(sort) ? sort : 'allowance'
  // Keep color domains stable when a user searches or filters positions.
  const defensePools = useMemo(() => {
    const pools = new Map<string, { per48: (number | null)[]; allowance: (number | null)[] }>()
    for (const profile of context?.profiles ?? []) {
      if (profile.market !== market) continue
      const pool = pools.get(profile.position) ?? { per48: [], allowance: [] }
      pool.per48.push(profile.per48); pool.allowance.push(profile.allowance)
      pools.set(profile.position, pool)
    }
    return pools
  }, [context, market])
  const minutesPool = context?.scores.map(row => row.minutes) ?? []
  const productionPool = context?.scores.map(row => row.production) ?? []
  const leagueRows = (context?.profiles ?? []).filter(profile => profile.market === market && (position === 'all' || profile.position === position)).map(profile => ({ ...profile, team: (context?.teams ?? board.teams)?.find(team => team.id === profile.teamId) })).filter(profile => profile.team && profile.team.full_name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    const value = (row: typeof a) => leagueSort === 'name' ? row.team?.full_name : leagueSort === 'position' ? row.position : leagueSort === 'games' ? row.games : leagueSort === 'defense' ? row.per48 : leagueSort === 'league' ? row.leaguePer48 : row.allowance
    return compareResearch(value(a), value(b), ascending) || a.teamId - b.teamId
  })
  const header = (label: string, column: string, active = sort) => <PaintSortHeader key={column} label={label} column={column} active={active} ascending={ascending} onSort={sortBy}/>
  return <section className={`${styles.researchTool} ${dials.surface}`}>
    <header className={styles.toolHeading}><div><h3>{mode === 'score' ? 'SlipSurge Score' : 'Defense × position'}</h3></div></header>
    <div className={styles.toolControls}>{(mode==='score'||scope==='matchup')&&<><PaintTeamSelect label="Score team" value={team} onChange={setTeam} teams={[board.game.visitor_team,board.game.home_team]}/><select aria-label="Sort NBA score" value={sort+':'+(ascending?'asc':'desc')} onChange={e=>{const [column,direction]=e.target.value.split(':');setSort(column);setAscending(direction==='asc')}}>{[['score:desc','Highest score'],['score:asc','Lowest score'],['mm:desc','Highest MM'],['mm:asc','Lowest MM'],['odds:desc','Highest odds'],['odds:asc','Lowest odds'],['line:desc','Highest target'],['line:asc','Lowest target'],['production:desc','Highest production'],['minutes:desc','Most minutes'],['name:asc','Player A–Z'],['production:asc','Lowest production'],['minutes:asc','Lowest minutes'],['defense:desc','Highest defense per 48'],['defense:asc','Lowest defense per 48'],['allowance:desc','Highest defensive allowance'],['allowance:asc','Lowest defensive allowance'],['market:desc','Highest market signal'],['market:asc','Lowest market signal'],['name:desc','Highest player name']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></>}
      <select aria-label="Score stat market" value={market} onChange={event => onMarketChange(event.target.value as PaintMarket)}>{PAINT_MARKETS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
      {(mode === 'score' || scope === 'matchup') && <><PaintBookSelect label="Score sportsbook" value={book} onChange={onBookChange} books={board.players.flatMap(player => player.props.map(offer => offer.vendor))}/>
      <select aria-label="Score market side" value={side} onChange={event => onSideChange(event.target.value as 'over' | 'under')}><option value="over">Over</option><option value="under">Under</option></select></>}
      <label className={styles.search}><input aria-label="Search NBA players or defenses" placeholder={mode === 'dvp' && scope === 'league' ? 'Find a defense' : 'Find a player'} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <select aria-label="Research position" value={position} onChange={event => setPosition(event.target.value)}><option value="all">All positions</option><option value="G">Guards</option><option value="F">Forwards</option><option value="C">Centers</option></select>
    </div>
    {error && <p role="status" className={polish.status}>{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    <div className={polish.status}><span>{nbaSeason(context?.season ?? board.sampleSeason)}</span>{context?.stale && <span>Last available matchup data</span>}{context && !context.ready && <span>Position sample incomplete</span>}{!context && !error && <span>Loading matchup context…</span>}{mode === 'score' && (side === 'under' ? <span>Under-side public counts unavailable</span> : !!context?.scores?.length && context.scores.every(row => row.marketSignals.status === 'unavailable') && <span>Market context unavailable</span>)}</div>
    {mode === 'dvp' && <div className={styles.segment}><button aria-pressed={scope === 'league'} onClick={() => setScope('league')}>League defenses</button><button aria-pressed={scope === 'matchup'} onClick={() => setScope('matchup')}>Matchup players</button></div>}
    {mode === 'dvp' && <div className={dials.legendRow}><PaintHeatLegend tone="performance" low={scope === 'matchup' && side === 'under' ? 'More allowed' : 'Less allowed'} high={scope === 'matchup' && side === 'under' ? 'Less allowed' : 'More allowed'}/></div>}
    {mode === 'dvp' && scope === 'league' ? <div className={styles.researchScroll} role="region" aria-label="NBA defense by position" tabIndex={0}><table className={`${styles.researchTable} ${polish.table} ${dials.dvpTable}`}><caption className={styles.srOnly}>NBA defense by position</caption><thead><tr>{header('Defense', 'name', leagueSort)}{header('Position', 'position', leagueSort)}{header('Games', 'games', leagueSort)}{header('Allowed / 48', 'defense', leagueSort)}{header('League / 48', 'league', leagueSort)}{header('Allowance', 'allowance', leagueSort)}</tr></thead><tbody>{leagueRows.map(row => <tr key={`${row.teamId}:${row.position}`}><th scope="row"><span className={styles.playerButton}><TeamLogo abbr={row.team!.abbreviation} size={34}/><strong>{row.team!.full_name}</strong></span></th><td><span className={dials.position} aria-label={row.position === 'G' ? 'Guards' : row.position === 'F' ? 'Forwards' : 'Centers'}>{row.position}</span></td><td><span className={dials.sample}>{row.games}</span></td><td><PaintHeatCell value={row.per48} pool={defensePools.get(row.position)?.per48} label="Allowed per 48 position-minutes">{number(row.per48)}</PaintHeatCell></td><td>{number(row.leaguePer48)}</td><td><PaintHeatCell value={row.allowance} heat={nbaCenteredHeat(row.allowance, defensePools.get(row.position)?.allowance ?? [])} tone="performance" label="Allowance versus league">{row.allowance == null ? '—' : `${row.allowance > 0 ? '+' : ''}${(row.allowance * 100).toFixed(1)}%`}</PaintHeatCell></td></tr>)}</tbody></table>{context && !leagueRows.length && <div className={polish.empty}>No position sample for this selection.</div>}</div>
      : <div className={styles.researchScroll} role="region" aria-label="NBA player scores and market signals" tabIndex={0}><table className={`${styles.researchTable} ${polish.table} ${dials.table}`}><caption className={styles.srOnly}>NBA player scores and market signals</caption><thead><tr>{header('Player', 'name')}{header('Score', 'score')}{header('MM', 'mm')}{header('Market signals', 'market')}{header('L10 min', 'minutes')}{header('L10', 'production')}{header('Allowed / 48', 'defense')}{header('Allowance', 'allowance')}{header('Target', 'line')}{header('Odds', 'odds')}<th><span className={styles.srOnly}>Save pick</span></th></tr></thead><tbody>{rows.map(({ player, signal, matchup, offer, opponent, mm }) => <tr key={player.id}>
        <td><button className={styles.playerButton} onClick={() => open(player.id, market)}><PlayerAvatar player={player}/><span><strong>{player.first_name} {player.last_name}</strong><small>{player.position}{signal.newTeam && <em>New team</em>}</small></span><ArrowUpRight size={14}/></button></td>
        <td><PaintScoreCell score={signal.score}/>{context && signal.score == null && <small className={polish.subtle}>Limited history</small>}</td><td><PaintMmCell mm={mm}/></td>
        <td><PaintMarketSupport support={context ? signal.marketSignals : null} onOpen={(next, actualBook, quote) => open(player.id, next, actualBook, 'ladder', quote)}/></td>
        <td><PaintHeatCell value={signal.minutes} pool={minutesPool} label="Last 10 minutes">{number(signal.minutes)}</PaintHeatCell></td><td><PaintHeatCell value={signal.production} pool={productionPool} label="Last 10 production">{marketNumber(signal.production, market)}</PaintHeatCell></td>
        <td><PaintHeatCell value={matchup?.per48} pool={defensePools.get(nbaPosition(player.position) ?? '')?.per48} label="Opponent allowed per 48 position-minutes">{number(matchup?.per48)}</PaintHeatCell><span className={dials.defenseMeta} aria-label={opponent.full_name}><TeamLogo abbr={opponent.abbreviation} size={19}/><small>{matchup?.games ?? '—'} games</small></span></td>
        <td><PaintHeatCell value={matchup?.allowance} heat={nbaCenteredHeat(matchup?.allowance, defensePools.get(nbaPosition(player.position) ?? '')?.allowance ?? [], { invert: side === 'under' })} tone="performance" label={`${side === 'under' ? 'Under' : 'Over'} matchup allowance`}>{matchup?.allowance == null ? '—' : `${matchup.allowance > 0 ? '+' : ''}${(matchup.allowance * 100).toFixed(1)}%`}</PaintHeatCell></td>
        <td>{offer ? <button className={styles.lineButton} aria-label={`Analyze ${player.first_name} ${player.last_name}, ${nbaTarget(offer, side)}, ${offer.vendor}`} onClick={() => open(player.id, market, offer.vendor, 'ladder', { line: Number(offer.line_value), type: offer.market.type }, side)}><strong>{nbaTarget(offer, side)}</strong></button> : '—'}</td><td>{offer ? <button className={styles.lineButton} aria-label={`Analyze ${player.first_name} ${player.last_name}, ${nbaTarget(offer, side)}, ${offer.vendor}`} onClick={() => open(player.id, market, offer.vendor, 'ladder', { line: Number(offer.line_value), type: offer.market.type }, side)}><span><BookLogo vendor={offer.vendor} size={14}/><PaintPrice offer={offer} side={side} compact/></span></button> : '—'}</td><td>{offer && <PaintPickActions player={player} offer={offer} side={side} game={board.game}/>}</td>
      </tr>)}</tbody></table>{!rows.length && <div className={polish.empty}>No players match these filters.</div>}</div>}
  </section>
}
