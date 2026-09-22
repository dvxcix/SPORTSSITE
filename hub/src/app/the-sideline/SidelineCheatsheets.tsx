'use client'

import Image from 'next/image'
import { useMemo, useState, type CSSProperties } from 'react'
import { Activity, ArrowUpDown, Database, Gauge, Route, Search, Shield, Sparkles, Target, UsersRound } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import { normalizeNflPlayerName } from '@/lib/nflPlayerName'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import type { NflMarketOffer, NflOddsPlayer, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineLens, SidelinePlayer, SidelinePlayerGameLine, Team } from './SidelineClient'
import { PlayerIdentity } from './SidelineResearchClient'
import styles from './sidelineCheatsheets.module.css'

type View = 'edge' | 'hits' | 'explosives' | 'gaps' | 'defense'
type LogField = Exclude<keyof SidelinePlayerGameLine, 'gameId'>
type SortDirection = 'asc' | 'desc'
type HitSummary = { hits: number; total: number; rate: number } | null

const PROP_FIELDS: Record<string, LogField> = {
  receptions: 'receptions', receiving_yards: 'receivingYards', rushing_attempts: 'carries', rushing_yards: 'rushingYards',
  passing_attempts: 'passAttempts', completions: 'completions', passing_yards: 'passingYards', passing_tds: 'passingTouchdowns',
  anytime_td: 'scorerTouchdowns', first_td: 'firstTouchdowns',
}
const PROP_LABELS: Record<string, string> = {
  anytime_td: 'Anytime TD', first_td: 'First TD', passing_tds: 'Passing TDs', receptions: 'Receptions',
  receiving_yards: 'Receiving Yards', rushing_attempts: 'Rush Attempts', rushing_yards: 'Rushing Yards',
  passing_attempts: 'Pass Attempts', completions: 'Completions', passing_yards: 'Passing Yards',
}
const PROJECTION_KEYS: Record<string, string> = {
  receiving_yards: 'receiving-yards', rushing_yards: 'rushing-yards', rushing_attempts: 'rush-attempts',
  passing_yards: 'passing-yards', passing_attempts: 'pass-attempts', receptions: 'receptions',
  completions: 'completions', passing_tds: 'touchdown', anytime_td: 'touchdown', first_td: 'touchdown',
}
const VIEW_META = [
  ['edge', 'Market Edge', Gauge], ['hits', 'Exact-Line Hits', Target], ['explosives', 'Explosive Plays', Sparkles],
  ['gaps', 'Run Gaps', Route], ['defense', 'Defense / DvP', Shield],
] as const
const VIEW_COPY: Record<View, { eyebrow: string; title: string }> = {
  edge: { eyebrow: 'Model + market', title: 'Where performance rates disagree with the live price' },
  hits: { eyebrow: 'Exact thresholds', title: 'Every hit, miss, and sample window at the selected line' },
  explosives: { eyebrow: 'Play creation', title: 'Deep targets and chunk-play frequency by player' },
  gaps: { eyebrow: 'Run geometry', title: 'Ball carriers mapped to the lanes each defense allows' },
  defense: { eyebrow: 'Defense by position', title: 'Which positions gain or lose volume versus league average' },
}
const cleanTeam = (value: string) => ({ LA: 'LAR', JAC: 'JAX', OAK: 'LV', WAS: 'WSH' }[value.toUpperCase()] ?? value.toUpperCase())
const playerKey = (name: string, team: string) => `${cleanTeam(team)}:${normalizeNflPlayerName(name)}`
const price = (value: number | null) => value == null ? '—' : value > 0 ? `+${value}` : String(value)
const currentPrice = (offer: NflMarketOffer | undefined) => offer?.current.over ?? offer?.current.odds ?? null
const openingPrice = (offer: NflMarketOffer | undefined) => offer?.opening?.over ?? offer?.opening?.odds ?? null
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase()).replace(/\bTd(s)?\b/g, 'TD$1').replace(/\bQb\b/g, 'QB').replace(/\bWr\b/g, 'WR').replace(/\bRb\b/g, 'RB').replace(/\bTe\b/g, 'TE')

function matchingOffer(player: NflOddsPlayer, prop: string, vendor: string) {
  const market = nflPrimaryMarket(player, prop, vendor)
  return { market, offer: market?.offers.find(item => item.vendor === vendor && !item.isOpeningOnly) }
}
function pickCount(player: NflOddsPlayer, prop: string, line: number | null) {
  const rows = (player.publicPicks ?? []).filter(row => row.propType === prop && (line == null || row.line == null || row.line === line))
  return rows.length ? Math.max(...rows.map(row => row.picks)) : null
}

function isHit(value: number, line: number, milestone: boolean) {
  return milestone ? value >= line : value > line
}

function hitSummary(log: SidelinePlayerGameLine[], field: LogField, line: number, count: number | null, milestone: boolean): HitSummary {
  const sample = (count == null ? log : log.slice(0, count)).filter(row => row[field] != null && Number.isFinite(row[field]))
  if (!sample.length) return null
  const hits = sample.filter(row => isHit(Number(row[field]), line, milestone)).length
  return { hits, total: sample.length, rate: hits / sample.length * 100 }
}

function projectedValue(stats: SidelinePlayer, prop: string) {
  const field = PROP_FIELDS[prop]
  const projection = stats.projections.find(item => item.key === PROJECTION_KEYS[prop])
  if (!field || !stats.gameLog.length) return null
  const milestone = prop.includes('td')
  const season = milestone
    ? stats.gameLog.filter(row => Number(row[field]) >= 1).length / stats.gameLog.length * 100
    : average(stats.gameLog.map(row => Number(row[field])))
  const recent3 = milestone
    ? stats.gameLog.slice(0, 3).filter(row => Number(row[field]) >= 1).length / Math.min(3, stats.gameLog.length) * 100
    : average(stats.gameLog.slice(0, 3).map(row => Number(row[field])))
  const recent5 = milestone
    ? stats.gameLog.slice(0, 5).filter(row => Number(row[field]) >= 1).length / Math.min(5, stats.gameLog.length) * 100
    : average(stats.gameLog.slice(0, 5).map(row => Number(row[field])))
  if (season == null || recent3 == null || recent5 == null) return null
  const adjustment = clamp(((projection?.matchup ?? 0) + (projection?.pace ?? 0)) / 100, -.25, .25)
  return Math.max(0, (season * .5 + recent3 * .3 + recent5 * .2) * (1 + adjustment))
}

function modelProbability(stats: SidelinePlayer, prop: string, line: number, milestone: boolean) {
  const field = PROP_FIELDS[prop]
  if (!field || !stats.gameLog.length) return null
  const season = hitSummary(stats.gameLog, field, line, null, milestone)?.rate
  const l3 = hitSummary(stats.gameLog, field, line, 3, milestone)?.rate
  const l5 = hitSummary(stats.gameLog, field, line, 5, milestone)?.rate
  if (season == null || l3 == null || l5 == null) return null
  const projection = stats.projections.find(item => item.key === PROJECTION_KEYS[prop])
  const adjustment = clamp(((projection?.matchup ?? 0) + (projection?.pace ?? 0)) * .2, -5, 5)
  return clamp(season * .5 + l3 * .3 + l5 * .2 + adjustment, 0, 100)
}

function tone(value: number | null) {
  if (value == null || Math.abs(value) < 5) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function formatProjection(value: number | null, prop: string) {
  if (value == null) return '—'
  if (prop.includes('td')) return `${value.toFixed(1)}%`
  const unit = prop.includes('yards') ? ' yd' : ''
  return `${value < 10 ? value.toFixed(1) : value.toFixed(0)}${unit}`
}

function HitCell({ value }: { value: HitSummary }) {
  if (!value) return <span className={styles.missing}>—</span>
  return <span className={styles.hitCell} style={{ '--heat': value.rate / 100 } as CSSProperties}><b>{value.hits}/{value.total}</b><small>{value.rate.toFixed(1)}%</small></span>
}

function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: SortDirection; onClick: () => void }) {
  return <button type="button" className={styles.sortButton} data-active={active} onClick={onClick}>{label}<ArrowUpDown size={12} aria-hidden />{active && <span>{direction === 'desc' ? '↓' : '↑'}</span>}</button>
}

function TeamBadge({ team }: { team: Team | undefined }) {
  if (!team) return null
  return <span className={styles.teamBadge}>{team.logo ? <Image src={team.logo} alt="" width={28} height={28} unoptimized /> : <i style={{ background: team.color }}>{team.abbr.slice(0, 2)}</i>}<b>{team.abbr}</b></span>
}

function PlayerChips({ players }: { players: NflOddsPlayer[] }) {
  if (!players.length) return <span className={styles.missing}>No matched active role</span>
  return <div className={styles.playerChips}>{players.slice(0, 4).map(player => <a href={player.gsisId ? `/nfl/players/${player.gsisId}` : '#'} key={player.id}>{player.headshot ? <Image src={player.headshot} alt="" width={26} height={26} unoptimized /> : <i>{player.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</i>}<span><b>{player.name}</b><small>{player.position}{player.jersey ? ` · #${player.jersey}` : ''}</small></span></a>)}</div>
}

export function SidelineCheatsheets({ lens, board, isAdmin = false }: { lens: SidelineLens; board: SidelineOddsBoard; isAdmin?: boolean }) {
  const [view, setView] = useState<View>('edge')
  const [prop, setProp] = useState('anytime_td')
  const [vendor, setVendor] = useState('fanduel')
  const [team, setTeam] = useState('all')
  const [sort, setSort] = useState('edge')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [search, setSearch] = useState('')
  const teams = lens.teams.map(item => item.team)
  const statsById = useMemo(() => new Map(lens.players.map(player => [player.id, player])), [lens.players])
  const statsByName = useMemo(() => new Map(lens.players.map(player => [playerKey(player.name, player.team), player])), [lens.players])
  const statsByLooseName = useMemo(() => new Map(lens.players.map(player => [normalizeNflPlayerName(player.name), player])), [lens.players])
  const paired = useMemo(() => board.players
    .filter(market => (team === 'all' || market.team === team) && (!search.trim() || (market.name + ' ' + market.team + ' ' + market.position).toLowerCase().includes(search.trim().toLowerCase())))
    .map(market => ({ market, stats: (market.gsisId ? statsById.get(market.gsisId) : undefined) ?? statsByName.get(playerKey(market.name, market.team)) ?? statsByLooseName.get(normalizeNflPlayerName(market.name)) })),
  [board.players, search, statsById, statsByLooseName, statsByName, team])
  const props = useMemo(() => Array.from(new Set(board.players.flatMap(player => player.markets.map(market => market.propType)).filter(key => PROP_FIELDS[key]))).sort((a, b) => (PROP_LABELS[a] ?? a).localeCompare(PROP_LABELS[b] ?? b)), [board.players])
  const vendors = useMemo(() => Array.from(new Set(board.players.flatMap(player => player.markets.flatMap(market => market.offers.map(offer => offer.vendor))))).sort(), [board.players])
  const changeSort = (key: string) => {
    if (sort === key) setDirection(current => current === 'desc' ? 'asc' : 'desc')
    else { setSort(key); setDirection('desc') }
  }

  const marketRows = useMemo(() => {
    const rows = paired.flatMap(({ stats, market }) => {
      const found = matchingOffer(market, prop, vendor)
      if (!found.market || !found.offer) return []
      const now = currentPrice(found.offer)
      const open = openingPrice(found.offer)
      const nowProbability = americanImpliedProbability(now)
      const openProbability = americanImpliedProbability(open)
      const field = PROP_FIELDS[prop]
      const line = found.offer.line ?? found.market.line ?? (prop.includes('td') ? 1 : null)
      const milestone = found.offer.type === 'milestone' || prop.includes('td')
      const season = stats && field && line != null ? hitSummary(stats.gameLog, field, line, null, milestone) : null
      const modeled = stats && line != null ? modelProbability(stats, prop, line, milestone) : null
      const edge = modeled != null && nowProbability != null ? modeled - nowProbability * 100 : null
      const move = nowProbability != null && openProbability != null ? (nowProbability - openProbability) * 100 : null
      return [{ stats, market, offer: found.offer, line, now, open, move, season, modeled, edge, pickCount: pickCount(market, prop, line), projection: stats ? projectedValue(stats, prop) : null }]
    })
    const value = (row: typeof rows[number], key: string) => key === 'player' ? row.market.name : key === 'line' ? row.line : key === 'current' ? row.now : key === 'open' ? row.open : key === 'move' ? row.move : key === 'public' ? row.pickCount : key === 'projection' ? row.projection : key === 'season' ? row.season?.rate : row.edge
    return rows.sort((a, b) => {
      const left = value(a, sort), right = value(b, sort)
      const result = typeof left === 'string' || typeof right === 'string' ? String(left ?? '').localeCompare(String(right ?? '')) : (Number(left ?? -Infinity) - Number(right ?? -Infinity))
      return direction === 'asc' ? result : -result
    })
  }, [direction, paired, prop, sort, vendor])

  const marketSummary = useMemo(() => {
    const withEdge = marketRows.filter(row => row.edge != null)
    const withMove = marketRows.filter(row => row.move != null)
    const withHits = marketRows.filter(row => row.season != null)
    return {
      leader: [...withEdge].sort((a, b) => Number(b.edge) - Number(a.edge))[0] ?? null,
      mover: [...withMove].sort((a, b) => Math.abs(Number(b.move)) - Math.abs(Number(a.move)))[0] ?? null,
      hitter: [...withHits].sort((a, b) => Number(b.season?.rate) - Number(a.season?.rate))[0] ?? null,
    }
  }, [marketRows])

  const coverageLabel = lens.coverage.advanced === 'complete' ? 'NGS matched' : lens.coverage.advanced === 'partial' ? 'NGS partial · PBP fallback active' : 'PBP fallback active'
  const explosiveRows = useMemo(() => {
    const rows = paired.filter((row): row is typeof row & { stats: NonNullable<typeof row.stats> } => Boolean(row.stats))
    const explosiveValue = (stats: SidelinePlayer, key: string) => ({
      'x-games': stats.games, 'x-deep': stats.deepTargets, 'x-rec20': stats.receiving20, 'x-rec30': stats.receiving30,
      'x-rec40': stats.receiving40, 'x-rush10': stats.rushing10, 'x-rush20': stats.rushing20,
      'x-rush30': stats.rushing30, 'x-rush40': stats.rushing40,
    } as Record<string, number>)[key] ?? (stats.receiving20 + stats.rushing10)
    return rows.sort((a, b) => {
      const result = explosiveValue(a.stats, sort) - explosiveValue(b.stats, sort)
      return direction === 'asc' ? result : -result
    })
  }, [direction, paired, sort])
  const explosiveMax = useMemo(() => Math.max(1, ...explosiveRows.flatMap(({ stats }) => [stats.deepTargets, stats.receiving20, stats.receiving30, stats.receiving40, stats.rushing10, stats.rushing20, stats.rushing30, stats.rushing40].map(value => value / Math.max(1, stats.games)))), [explosiveRows])
  const rosterByTeam = useMemo(() => new Map(teams.map(current => [current.abbr, board.players.filter(player => player.team === current.abbr)])), [board.players, teams])
  const rushRoles = (abbr: string) => (rosterByTeam.get(abbr) ?? []).filter(player => ['RB', 'FB', 'QB'].includes(player.position) && player.availability?.didNotPlay !== true).sort((a, b) => {
    const left = statsByLooseName.get(normalizeNflPlayerName(a.name))?.carryShare ?? 0
    const right = statsByLooseName.get(normalizeNflPlayerName(b.name))?.carryShare ?? 0
    return right - left
  })
  const offenseForDefense = (defense: string) => teams.find(item => item.abbr !== defense)?.abbr ?? ''
  const affectedPlayers = (defense: string, position: string) => (rosterByTeam.get(offenseForDefense(defense)) ?? []).filter(player => player.position === position && player.availability?.didNotPlay !== true)
  const gapRows = useMemo(() => {
    const rows = lens.runGaps.filter(row => row.gap !== 'unspecified' && (team === 'all' || row.team === team))
    const metric = (row: typeof rows[number]) => sort === 'g-success' ? row.successRate : sort === 'g-explosive' ? row.explosiveRate : sort === 'g-volume' ? row.attempts : row.edge
    return [...rows].sort((a, b) => direction === 'asc' ? metric(a) - metric(b) : metric(b) - metric(a))
  }, [direction, lens.runGaps, sort, team])
  const dvpRows = useMemo(() => {
    const rows = lens.dvp.filter(row => team === 'all' || row.defense === team)
    const value = (row: typeof rows[number]) => sort === 'd-defense' ? row.defense : sort === 'd-position' ? row.position : sort === 'd-stat' ? row.stat : sort === 'd-games' ? row.games : row.pctDiff
    return rows.sort((a, b) => {
      const left = value(a), right = value(b)
      const result = typeof left === 'string' || typeof right === 'string' ? String(left).localeCompare(String(right)) : Number(left) - Number(right)
      return direction === 'asc' ? result : -result
    })
  }, [direction, lens.dvp, sort, team])

  return <div className={styles.root}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><span>NFL INTELLIGENCE DESK</span><h1>Sideline Cheatsheets</h1><p>{teams.map(item => item.abbr).join(' vs ')} · {lens.season} regular-season reference</p></div>
      <div className={styles.heroTeams}>{teams.map(item => <TeamBadge team={item} key={item.abbr} />)}</div>
    </header>
    {isAdmin ? <section className={styles.coverageRail} aria-label="Data coverage">
      <article data-state="ready"><Database size={16} /><span><small>PLAY-BY-PLAY</small><b>{lens.coverage.pbpPlays.toLocaleString()} charted plays</b></span></article>
      <article data-state={lens.coverage.advanced}><Activity size={16} /><span><small>ADVANCED TRACKING</small><b>{coverageLabel}</b></span></article>
      <article data-state="ready"><UsersRound size={16} /><span><small>PLAYER IDENTITY</small><b>{lens.coverage.rosterPlayers} roster matches</b></span></article>
      <article data-state="reference"><Shield size={16} /><span><small>REFERENCE WINDOW</small><b>{lens.season} · {lens.players.length} qualified players</b></span></article>
    </section> : null}
    <nav className={styles.views} aria-label="Cheatsheet views">{VIEW_META.map(([key, label, Icon]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); setDirection('desc'); setSort(key === 'explosives' ? 'x-total' : key === 'defense' ? 'd-edge' : key === 'gaps' ? 'g-edge' : 'edge') }}><Icon size={15} />{label}</button>)}</nav>
    <section className={styles.sectionIntro}><div><small>{VIEW_COPY[view].eyebrow}</small><h2>{VIEW_COPY[view].title}</h2></div><span>{view === 'edge' || view === 'hits' ? marketRows.length + ' live contracts' : paired.filter(row => row.stats).length + ' matched players'}</span></section>
    <section className={styles.controls} aria-label="Cheatsheet controls">
      <label className={styles.searchControl}><span>Find player</span><div className={styles.searchBox}><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search player, team, role" /></div></label>
      <label><span>Team</span><select value={team} onChange={event => setTeam(event.target.value)}><option value="all">Both Teams</option>{teams.map(item => <option key={item.abbr} value={item.abbr}>{item.name}</option>)}</select></label>
      {(view === 'edge' || view === 'hits') && <><label><span>Market</span><select value={prop} onChange={event => { setProp(event.target.value); setSort('edge') }}>{props.map(key => <option value={key} key={key}>{PROP_LABELS[key] ?? titleCase(key)}</option>)}</select></label><label><span>Sportsbook</span><div className={styles.bookSelect}><BookLogo vendor={vendor} size={20} /><select value={vendor} onChange={event => setVendor(event.target.value)}>{vendors.map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></div></label></>}
    </section>
    {(view === 'edge' || view === 'hits') && <section className={styles.summaryGrid}>
      <article data-tone="positive"><Target size={17} /><span><small>TOP PRICE EDGE</small><b>{marketSummary.leader?.market.name ?? 'Awaiting match'}</b><em>{marketSummary.leader?.edge == null ? '—' : (marketSummary.leader.edge > 0 ? '+' : '') + marketSummary.leader.edge.toFixed(1) + 'pp'}</em></span></article>
      <article><ArrowUpDown size={17} /><span><small>LARGEST MARKET MOVE</small><b>{marketSummary.mover?.market.name ?? 'No movement'}</b><em>{marketSummary.mover?.move == null ? '—' : Math.abs(marketSummary.mover.move).toFixed(1) + 'pp'}</em></span></article>
      <article><Gauge size={17} /><span><small>BEST EXACT-LINE RATE</small><b>{marketSummary.hitter?.market.name ?? 'No sample'}</b><em>{marketSummary.hitter?.season == null ? '—' : marketSummary.hitter.season.hits + '/' + marketSummary.hitter.season.total}</em></span></article>
    </section>}
    {(view === 'edge' || view === 'hits') && <div className={styles.tableWrap}><table><thead><tr>
      {['player', 'line', 'current', 'open', 'move', 'public', 'projection'].map(key => <th key={key}><SortButton label={({ player: 'Player', line: 'Line', current: 'Current', open: 'Open', move: 'Open → Now', public: 'Public Picks', projection: 'Projection' } as Record<string, string>)[key]} active={sort === key} direction={direction} onClick={() => changeSort(key)} /></th>)}
      <th><SortButton label="Season" active={sort === 'season'} direction={direction} onClick={() => changeSort('season')} /></th>
      {view === 'hits' && <><th>Last 10</th><th>Last 5</th><th>Last 3</th><th>Last 1</th></>}
      <th><SortButton label="Hit Rate − Price" active={sort === 'edge'} direction={direction} onClick={() => changeSort('edge')} /></th>
    </tr></thead><tbody>{marketRows.map((row, index) => <tr key={`${row.market.id}:${prop}`} data-tone={tone(row.edge)}>
      <td><div className={styles.rowIdentity}><span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span><PlayerIdentity player={row.market} team={teams.find(item => item.abbr === row.market.team)} /></div></td>
      <td><b>{row.line ?? '—'}</b><small>{PROP_LABELS[prop] ?? titleCase(prop)}</small></td>
      <td className={styles.price}><BookLogo vendor={vendor} size={18} />{price(row.now)}</td><td>{price(row.open)}</td>
      <td><span className={styles.movement} data-state={row.move == null || row.move === 0 ? 'flat' : row.move > 0 ? 'shortened' : 'lengthened'}>{row.move == null ? <b>—</b> : <><b>{row.move > 0 ? '+' : ''}{row.move.toFixed(1)}pp</b><small>{row.move > 0 ? 'Shortened' : row.move < 0 ? 'Lengthened' : 'Unchanged'}</small></>}</span></td>
      <td><b>{row.pickCount?.toLocaleString() ?? '—'}</b></td><td><b>{formatProjection(row.projection, prop)}</b></td><td><HitCell value={row.season} /></td>
      {view === 'hits' && <>{[10, 5, 3, 1].map(count => <td key={count}><HitCell value={row.line == null || !row.stats ? null : hitSummary(row.stats.gameLog, PROP_FIELDS[prop], row.line, count, row.offer.type === 'milestone' || prop.includes('td'))} /></td>)}</>}
      <td className={row.edge == null ? '' : row.edge >= 0 ? styles.up : styles.down}><b>{row.edge == null ? '—' : `${row.edge > 0 ? '+' : ''}${row.edge.toFixed(1)}pp`}</b><small>{row.modeled == null ? '' : `${row.modeled.toFixed(1)}% modeled`}</small></td>
    </tr>)}</tbody></table>{!marketRows.length && <p className={styles.empty}>No captured {titleCase(vendor)} contracts match this market and game.</p>}</div>}

    {view === 'explosives' && <div className={styles.tableWrap}><table><thead><tr><th>Player</th>{[['x-games', 'Games'], ['x-deep', 'Deep Targets'], ['x-rec20', 'REC 20+'], ['x-rec30', 'REC 30+'], ['x-rec40', 'REC 40+'], ['x-rush10', 'RUSH 10+'], ['x-rush20', 'RUSH 20+'], ['x-rush30', 'RUSH 30+'], ['x-rush40', 'RUSH 40+']].map(([key, label]) => <th key={key}><SortButton label={label} active={sort === key} direction={direction} onClick={() => changeSort(key)} /></th>)}</tr></thead><tbody>{explosiveRows.map(({ stats, market }, index) => {
      const values = [stats.deepTargets, stats.receiving20, stats.receiving30, stats.receiving40, stats.rushing10, stats.rushing20, stats.rushing30, stats.rushing40]
      return <tr key={stats.id}><td><div className={styles.rowIdentity}><span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span><PlayerIdentity player={market} team={teams.find(item => item.abbr === stats.team)} /></div></td><td><b>{stats.games}</b></td>{values.map((value, index) => { const perGame = value / Math.max(1, stats.games); return <td key={index}><span className={styles.explosiveCell} style={{ '--heat': perGame / explosiveMax } as CSSProperties}><b>{value}</b><small>{perGame.toFixed(2)}/G</small></span></td> })}</tr>
    })}</tbody></table></div>}

    {view === 'gaps' && <><div className={styles.metricToggle} aria-label="Run gap sorting">{[['g-edge', 'Matchup Edge'], ['g-success', 'Success Rate'], ['g-explosive', 'Explosive Rate'], ['g-volume', 'Attempts']].map(([key, label]) => <button type="button" key={key} aria-pressed={sort === key} onClick={() => changeSort(key)}>{label}{sort === key ? direction === 'desc' ? ' ↓' : ' ↑' : ''}</button>)}</div><div className={styles.cards}>{gapRows.map((row, index) => {
      const currentTeam = teams.find(item => item.abbr === row.team)
      return <article key={`${row.team}:${row.gap}`} data-edge={tone(row.edge)} style={{ '--team': currentTeam?.color ?? '#61dafb' } as CSSProperties}>
        <header><span className={styles.cardRank}>{String(index + 1).padStart(2, '0')}</span><TeamBadge team={currentTeam} /><div><span>{titleCase(row.gap)} Runs</span><strong>{row.edge > 0 ? '+' : ''}{row.edge.toFixed(1)} Edge</strong></div></header>
        <div className={styles.roleBlock}><small>Today’s Ball Carriers</small><PlayerChips players={rushRoles(row.team)} /></div>
        <div className={styles.gapMetrics}><span><b>{row.yardsPerCarry.toFixed(1)}</b><small>{row.team} YPC</small></span><span><b>{row.defenseAttempts ? row.defenseYardsPerCarry.toFixed(1) : '—'}</b><small>{row.opponent} Allowed YPC</small></span><span><b>{row.successRate.toFixed(1)}%</b><small>Success</small></span><span><b>{row.explosiveRate.toFixed(1)}%</b><small>Explosive</small></span></div>
        <footer>{row.attempts} offense attempts · {row.defenseAttempts} opponent-defense attempts in the {lens.season} sample</footer>
      </article>
    })}</div></>}

    {view === 'defense' && <><section className={styles.teamStrip}>{lens.teams.filter(row => team === 'all' || row.team.abbr === team).map(row => <article key={row.team.abbr} style={{ '--team': row.team.color } as CSSProperties}><TeamBadge team={row.team} /><span><b>{row.defenseSuccessAllowed.toFixed(1)}%</b>Success Allowed</span><span><b>{row.defenseExplosiveAllowed.toFixed(1)}%</b>Explosive Allowed</span><span><b>{row.redZoneTdRate.toFixed(1)}%</b>Offense Red-Zone TD</span></article>)}</section>
      <div className={styles.tableWrap}><table><thead><tr>{[['d-defense', 'Defense'], ['d-position', 'Position'], ['d-stat', 'Stat']].map(([key, label]) => <th key={key}><SortButton label={label} active={sort === key} direction={direction} onClick={() => changeSort(key)} /></th>)}<th>Affected Players Today</th><th><SortButton label="Vs. League" active={sort === 'd-edge'} direction={direction} onClick={() => changeSort('d-edge')} /></th><th><SortButton label="Games" active={sort === 'd-games'} direction={direction} onClick={() => changeSort('d-games')} /></th></tr></thead><tbody>{dvpRows.map(row => <tr key={`${row.defense}:${row.position}:${row.stat}`} data-tone={tone(row.pctDiff)}><td><TeamBadge team={teams.find(item => item.abbr === row.defense)} /></td><td><b>{row.position}</b></td><td><b>{titleCase(row.stat)}</b></td><td><PlayerChips players={affectedPlayers(row.defense, row.position)} /></td><td className={row.pctDiff >= 0 ? styles.up : styles.down}><b>{row.pctDiff > 0 ? '+' : ''}{row.pctDiff.toFixed(1)}%</b><small>{row.pctDiff >= 0 ? 'Allows more than NFL average' : 'Allows less than NFL average'}</small></td><td>{row.games}</td></tr>)}</tbody></table></div></>}
  </div>
}
