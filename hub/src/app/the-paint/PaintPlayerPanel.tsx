'use client'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown, Columns3, X } from 'lucide-react'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { BookLogo } from '@/components/BookLogo'
import { nbaAverage, nbaHitRate, nbaMinutes, nbaOdds, nbaReference, nbaSample, nbaSeason, nbaValue, PAINT_MARKETS, type PaintBoard, type PaintMarket, type PaintPlayer } from '@/lib/nbaPaint'
import { number, PlayerAvatar, ShotCourt, TeamLogo, TrendBars } from './PaintVisuals'
import { PaintPickActions } from './PaintPickActions'
import { nbaMarketRanks } from '@/lib/nbaMarketMetrics'
import styles from './paint.module.css'

type Profile = { shooting: Record<string, number | null> | null; advanced: Record<string, number | null> | null }
export function PaintPlayerPanel({ player, board, market: initialMarket, side: initialSide, close, compare, compared, compareDisabled }: { player: PaintPlayer; board: PaintBoard; market: PaintMarket; side: 'over' | 'under'; close: () => void; compare: () => void; compared: boolean; compareDisabled: boolean }) {
  const [tab, setTab] = useState<'trends' | 'court' | 'markets'>('trends'); const [market, setMarket] = useState(initialMarket); const [side, setSide] = useState(initialSide); const [window, setWindow] = useState(10); const [split, setSplit] = useState<'all' | 'home' | 'away' | 'h2h'>('all'); const [alternate, setAlternate] = useState(false); const [profile, setProfile] = useState<Profile | null>(null); const [profileError, setProfileError] = useState(false)
  const reference = nbaReference(player.props, market, 'all', side); const line = reference ? Number(reference.line_value) : null
  const opponent = board.game.home_team.id === player.team.id ? board.game.visitor_team : board.game.home_team
  const logs = useMemo(() => nbaSample(split === 'h2h' ? player.logs.filter(l => l.game.home_team_id === opponent.id || l.game.visitor_team_id === opponent.id) : player.logs, window, split === 'h2h' ? 'all' : split), [player.logs, window, split, opponent.id])
  const average = nbaAverage(logs, market); const hits = line != null ? nbaHitRate(logs, market, line, side) : null
  const rank = nbaMarketRanks(board.players, market).get(player.id)
  const definition = PAINT_MARKETS.find(m => m.key === market)!
  const offers = player.props.filter(p => p.prop_type === market && (alternate ? p.market.type === 'milestone' : p.market.type === 'over_under')).sort((a, b) => Number(a.line_value) - Number(b.line_value) || a.vendor.localeCompare(b.vendor))
  useEffect(() => {
    if (tab !== 'court' || board.historical) return
    const controller = new AbortController()
    fetch(`/the-paint/profile?player=${player.id}&season=${board.sampleSeason}`, { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error('profile'); return await r.json() as Profile }).then(value => { setProfile(value); setProfileError(false) }).catch(() => { if (!controller.signal.aborted) setProfileError(true) })
    return () => controller.abort()
  }, [player.id, board.sampleSeason, tab, board.historical])
  return <ModalSurface open onClose={close} label={`${player.first_name} ${player.last_name} research`} backdropClassName={styles.drawerBackdrop} backdropStyle={{ justifyContent: 'flex-end', alignItems: 'stretch' }} panelClassName={styles.drawer}>
    <header className={styles.drawerTop}><span><TeamLogo abbr={player.team.abbreviation} size={23}/>{player.team.full_name}</span><button className={styles.iconButton} onClick={close} aria-label="Close player details"><X size={20}/></button></header>
    <div className={styles.playerHero}><div><span className={styles.playerPosition}>#{player.jersey_number || '—'} · {player.position} · {player.height || '—'}</span><h2>{player.first_name}<strong>{player.last_name}</strong></h2><span className={styles.playerOpponent}><TeamLogo abbr={opponent.abbreviation} size={20}/>vs {opponent.name}</span></div><PlayerAvatar player={player} large/></div>
    <div className={styles.playerStrip}>{[{ label: 'PTS', value: player.average.pts }, { label: 'REB', value: player.average.reb }, { label: 'AST', value: player.average.ast }, { label: 'MIN', value: player.average.min }].map(s => <span key={s.label}><b>{number(s.value)}</b><small>{s.label}</small></span>)}</div>
    <div className={styles.playerSample}><span>{nbaSeason(board.sampleSeason)} · {board.historical ? 'Pregame sample' : 'Season averages'}{board.sampleSeason !== board.game.season ? ' · Prior season' : ''}</span><button onClick={compare} disabled={compareDisabled} aria-pressed={compared}><Columns3 size={14}/>{compared ? 'Comparing' : 'Compare'}</button></div>
    {player.injury && <details className={styles.injury}><summary>{player.injury.status}<span>Injury report<ChevronDown size={13}/></span></summary><p>{player.injury.description}</p>{player.injury.return_date && <small>Expected return: {player.injury.return_date}</small>}</details>}
    <div className={styles.panelTabs} role="group" aria-label="Player research view">{(['trends', 'court', 'markets'] as const).map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'court' ? 'Shot profile' : t === 'markets' ? 'Sportsbooks' : 'Trends'}</button>)}</div>
    <div className={styles.panelBody}>
      {tab === 'court' ? <>
        <div className={styles.sectionHeading}><h3>Where the points come from</h3><span>{nbaSeason(board.sampleSeason)}</span></div>
        {board.historical ? <div className={styles.panelEmpty}>Season-end shot profiles are hidden for historical matchups to avoid showing future results.</div> : profileError ? <div className={styles.panelEmpty} role="status">Shot profile unavailable.</div> : !profile ? <div className={styles.panelEmpty} role="status">Loading shooting zones…</div> : <>{profile.shooting ? <ShotCourt stats={profile.shooting}/> : <div className={styles.panelEmpty}>No shooting-zone sample returned.</div>}{profile.advanced && <div className={styles.advancedGrid}>{[{ label: 'Usage', key: 'usg_pct', percentage: true }, { label: 'True shooting', key: 'ts_pct', percentage: true }, { label: 'Assist share', key: 'ast_pct', percentage: true }, { label: 'Rebound share', key: 'reb_pct', percentage: true }, { label: 'Off. rating', key: 'off_rating' }, { label: 'Def. rating', key: 'def_rating' }].map(m => <span key={m.key}><small>{m.label}</small><b>{profile.advanced?.[m.key] == null ? '—' : m.percentage ? `${number(profile.advanced[m.key]! * 100)}%` : number(profile.advanced[m.key])}</b></span>)}</div>}<p className={styles.finePrint}>Zone percentages and attempts per game. Full-season provider sample; not shot locations or a matchup prediction.</p></>}
      </> : <>
        <div className={styles.mobileMm}><span>MM <b className={(rank?.mm ?? 0) > 0 ? styles.hit : (rank?.mm ?? 0) < 0 ? styles.miss : styles.muted}>{rank ? `${rank.mm > 0 ? '+' : ''}${rank.mm}` : '—'}</b></span>{rank && <small>Book #{rank.marketRank} · Stats #{rank.statRank}</small>}</div><div className={styles.panelMarket}><select aria-label="Player detail market" value={market} onChange={e => setMarket(e.target.value as PaintMarket)}>{PAINT_MARKETS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select><div className={styles.segment}>{(['over', 'under'] as const).map(s => <button key={s} aria-pressed={s === side} onClick={() => setSide(s)}>{s === 'over' ? 'Over' : 'Under'}</button>)}</div></div>
        {tab === 'trends' ? <>
          <div className={styles.trendSummary}><div><span>{window}-game average</span><strong>{number(average)}<small>{definition.short}</small></strong></div><div><span>Market line</span><strong>{line ?? '—'}</strong></div><div className={styles.summaryHit}><span>Hit rate · {side}</span><strong>{hits?.rate == null ? '—' : `${Math.round(hits.rate)}%`}</strong><small>{hits ? `${hits.wins}/${hits.games} · ${hits.pushes} pushes` : 'No current line'}</small></div></div>
          <div className={styles.chartFilters}><div className={styles.segment}>{[5, 10, 20].map(n => <button key={n} aria-pressed={window === n} onClick={() => setWindow(n)}>L{n}</button>)}</div><select aria-label="Player game-log split" value={split} onChange={e => setSplit(e.target.value as typeof split)}><option value="all">All games</option><option value="home">Home</option><option value="away">Away</option><option value="h2h">vs {opponent.name}</option></select></div>
          <TrendBars logs={logs} market={market} line={line} side={side} tall/>
          <div className={styles.chartCaption}><span>Oldest → newest</span><span>{logs.length} appearances · {nbaSeason(board.sampleSeason)}</span></div>
          <p className={styles.finePrint}>Historical results against today’s reference line. DNP excluded; pushes excluded from hit rate.</p>
          <div className={styles.sectionHeading}><h3>Game log</h3><span>{definition.short}</span></div>
          <table className={styles.logTable}><thead><tr><th>Date</th><th>Venue</th><th>MIN</th><th>{definition.short}</th><th>Result</th></tr></thead><tbody>{logs.map(log => { const value = nbaValue(log, market); const hit = value != null && line != null ? side === 'over' ? value > line : value < line : null; const push = value != null && value === line; return <tr key={log.id}><td>{new Date(`${log.game.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</td><td>{log.team.id === log.game.home_team_id ? 'Home' : 'Away'}</td><td>{number(nbaMinutes(log.min), 0)}</td><td>{value ?? '—'}</td><td><span className={push || hit == null ? styles.muted : hit ? styles.hit : styles.miss}>{push ? 'Push' : hit == null ? '—' : hit ? <><ArrowUpRight size={13}/>Hit</> : <><ArrowDownRight size={13}/>Miss</>}</span></td></tr> })}</tbody></table>
          {!logs.length && <div className={styles.panelEmpty}>No appearances in this sample.</div>}
        </> : <>
          <div className={styles.chartFilters}><div className={styles.segment}><button aria-pressed={!alternate} onClick={() => setAlternate(false)}>Main lines</button><button aria-pressed={alternate} onClick={() => setAlternate(true)}>Ladders</button></div><span className={styles.muted}>{offers.length} offers</span></div>
          <div className={styles.offerList}>{offers.map(offer => <div className={styles.offer} key={offer.id}><span><BookLogo vendor={offer.vendor} size={23}/><strong>{offer.vendor}</strong><small>{new Date(offer.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</small></span><span><small>{alternate ? 'MILESTONE' : side.toUpperCase()}</small><b>{offer.line_value}{alternate ? '+' : ''}</b></span><strong className={styles.offerOdds}>{nbaOdds(alternate ? offer.market.odds : side === 'over' ? offer.market.over_odds : offer.market.under_odds)}</strong><PaintPickActions player={player} offer={offer} side={side} game={board.game}/></div>)}</div>
          {!offers.length && <div className={styles.panelEmpty}>No {alternate ? 'ladder' : 'main-line'} prices posted for this market.</div>}
          <p className={styles.finePrint}>Prices are timestamped provider quotes. Posting rechecks the exact line and price before tipoff.</p>
        </>}
      </>}
    </div>
    {tab !== 'markets' && reference && <footer className={styles.drawerFooter}><BookLogo vendor={reference.vendor} size={22}/><span><strong>{side === 'over' ? 'Over' : 'Under'} {reference.line_value} {definition.short}</strong><small>{reference.vendor} · {nbaOdds(side === 'over' ? reference.market.over_odds : reference.market.under_odds)}</small></span><PaintPickActions player={player} offer={reference} side={side} game={board.game}/><button onClick={() => setTab('markets')}>All books<ArrowUpRight size={15}/></button></footer>}
  </ModalSurface>
}
