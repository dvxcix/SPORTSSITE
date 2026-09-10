'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { BookLogo } from '@/components/BookLogo'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import { normalizeNflPlayerName } from '@/lib/nflPlayerName'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import type { NflMarketOffer, NflOddsPlayer, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineLens, SidelinePlayerGameLine } from './SidelineClient'
import { PlayerIdentity } from './SidelineResearchClient'
import styles from './sidelineCheatsheets.module.css'

type View = 'edge' | 'hits' | 'explosives' | 'gaps' | 'defense'
type LogField = Exclude<keyof SidelinePlayerGameLine, 'gameId'>

const PROP_FIELDS: Record<string, LogField> = {
  receptions: 'receptions', receiving_yards: 'receivingYards', rushing_attempts: 'carries', rushing_yards: 'rushingYards',
  passing_attempts: 'passAttempts', completions: 'completions', passing_yards: 'passingYards', anytime_td: 'touchdowns', first_td: 'firstTouchdowns',
}
const PROP_LABELS: Record<string, string> = {
  anytime_td: 'Anytime TD', first_td: 'First TD', receptions: 'Receptions', receiving_yards: 'Receiving yards', rushing_attempts: 'Rush attempts', rushing_yards: 'Rushing yards', passing_attempts: 'Pass attempts', completions: 'Completions', passing_yards: 'Passing yards',
}
const cleanTeam = (value: string) => ({ LA: 'LAR', JAC: 'JAX', OAK: 'LV', WAS: 'WSH' }[value.toUpperCase()] ?? value.toUpperCase())
const price = (value: number | null) => value == null ? '—' : value > 0 ? `+${value}` : String(value)
const percent = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`
const currentPrice = (offer: NflMarketOffer | undefined) => offer?.current.over ?? offer?.current.odds ?? null
const openingPrice = (offer: NflMarketOffer | undefined) => offer?.opening?.over ?? offer?.opening?.odds ?? null
const playerKey = (name: string, team: string) => `${cleanTeam(team)}:${normalizeNflPlayerName(name)}`

function matchingOffer(player: NflOddsPlayer, prop: string, vendor: string) {
  const market = nflPrimaryMarket(player, prop, vendor)
  return { market, offer: market?.offers.find(item => item.vendor === vendor && !item.isOpeningOnly) }
}

function picks(player: NflOddsPlayer, prop: string, line: number | null) {
  const rows = (player.publicPicks ?? []).filter(row => row.propType === prop && (line == null || row.line == null || row.line === line))
  return rows.length ? Math.max(...rows.map(row => row.picks)) : null
}

function hitRate(log: SidelinePlayerGameLine[], field: LogField, line: number, count: number, milestone: boolean) {
  const sample = log.slice(0, count)
  if (!sample.length) return null
  const hits = sample.filter(row => milestone ? row[field] >= line : row[field] > line).length
  return hits / sample.length * 100
}

function tone(value: number | null) {
  if (value == null) return 'neutral'
  if (value >= 12) return 'strong'
  if (value <= -12) return 'weak'
  return 'neutral'
}

export function SidelineCheatsheets({ lens, board }: { lens: SidelineLens; board: SidelineOddsBoard }) {
  const [view, setView] = useState<View>('edge')
  const [prop, setProp] = useState('anytime_td')
  const [vendor, setVendor] = useState('fanduel')
  const [team, setTeam] = useState('all')
  const teams = lens.teams.map(item => item.team)
  const statsById = useMemo(() => new Map(lens.players.map(player => [player.id, player])), [lens.players])
  const statsByName = useMemo(() => new Map(lens.players.map(player => [playerKey(player.name, player.team), player])), [lens.players])
  const paired = useMemo(() => board.players
    .filter(market => team === 'all' || market.team === team)
    .map(market => ({ market, stats: (market.gsisId ? statsById.get(market.gsisId) : undefined) ?? statsByName.get(playerKey(market.name, market.team)) })), [board.players, statsById, statsByName, team])
  const props = useMemo(() => Array.from(new Set(board.players.flatMap(player => player.markets.map(market => market.propType)).filter(key => PROP_FIELDS[key]))).sort((a, b) => (PROP_LABELS[a] ?? a).localeCompare(PROP_LABELS[b] ?? b)), [board.players])
  const vendors = useMemo(() => Array.from(new Set(board.players.flatMap(player => player.markets.flatMap(market => market.offers.map(offer => offer.vendor))))).sort(), [board.players])

  const marketRows = useMemo(() => paired.flatMap(({ stats, market }) => {
    const found = matchingOffer(market, prop, vendor)
    if (!found.market || !found.offer) return []
    const now = currentPrice(found.offer)
    const open = openingPrice(found.offer)
    const nowProbability = americanImpliedProbability(now)
    const openProbability = americanImpliedProbability(open)
    const field = PROP_FIELDS[prop]
    const line = found.offer.line ?? found.market.line ?? (prop.includes('td') ? 1 : null)
    const observed = stats && field && line != null ? hitRate(stats.gameLog, field, line, stats.gameLog.length, found.offer.type === 'milestone' || prop.includes('td')) : null
    const gap = observed != null && nowProbability != null ? observed - nowProbability * 100 : null
    const move = nowProbability != null && openProbability != null ? (nowProbability - openProbability) * 100 : null
    const own = stats?.projections.find(item => item.key === ({ receiving_yards: 'receiving-yards', rushing_yards: 'rushing-yards', rushing_attempts: 'rush-attempts', passing_yards: 'passing-yards', passing_attempts: 'pass-attempts', receptions: 'receptions', completions: 'completions', anytime_td: 'touchdown', first_td: 'touchdown' } as Record<string, string>)[prop])
    return [{ stats, market, offer: found.offer, line, now, open, observed, gap, move, pickCount: picks(market, prop, line), projection: own?.mean ?? null }]
  }).sort((a, b) => Math.abs(b.gap ?? -1) - Math.abs(a.gap ?? -1) || (b.pickCount ?? -1) - (a.pickCount ?? -1)), [paired, prop, vendor])

  return <main className={styles.root}>
    <header className={styles.hero}><div><span>NFL INTELLIGENCE DESK</span><h1>Sideline Cheatsheets</h1><p>{teams.map(item => item.abbr).join(' vs ')} · {lens.season} sample · {lens.plays.toLocaleString()} charted plays</p></div><div className={styles.pulse}>{lens.status === 'calculated' ? 'LIVE DATA READY' : 'SYNC PENDING'}</div></header>
    <nav className={styles.views} aria-label="Cheatsheet views">{([['edge', 'Market Edge'], ['hits', 'Exact-Line Hits'], ['explosives', 'Explosive Plays'], ['gaps', 'Run Gaps'], ['defense', 'Defense / DvP']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</nav>
    <section className={styles.controls} aria-label="Cheatsheet controls"><label>Team<select value={team} onChange={event => setTeam(event.target.value)}><option value="all">Both teams</option>{teams.map(item => <option key={item.abbr} value={item.abbr}>{item.name}</option>)}</select></label>{(view === 'edge' || view === 'hits') && <><label>Market<select value={prop} onChange={event => setProp(event.target.value)}>{props.map(key => <option value={key} key={key}>{PROP_LABELS[key] ?? key.replaceAll('_', ' ')}</option>)}</select></label><label>Book<select value={vendor} onChange={event => setVendor(event.target.value)}>{vendors.map(value => <option key={value} value={value}>{value}</option>)}</select></label></>}<strong>{view === 'edge' || view === 'hits' ? `${marketRows.length} exact contracts` : `${paired.filter(row => row.stats).length} players`}</strong></section>

    {(view === 'edge' || view === 'hits') && <div className={styles.tableWrap}><table><thead><tr><th>Player</th><th>Line</th><th>Current</th><th>Open</th><th>Move</th><th>Public</th><th>Projection</th><th>Season</th>{view === 'hits' && <><th>L10</th><th>L5</th><th>L3</th></>}<th>Model − market</th></tr></thead><tbody>{marketRows.map(row => <tr key={`${row.market.id}:${prop}`} data-tone={tone(row.gap)}><td><PlayerIdentity player={row.market} team={teams.find(item => item.abbr === row.market.team)} /></td><td><b>{row.line ?? '—'}</b><small>{PROP_LABELS[prop] ?? prop}</small></td><td className={styles.price}><BookLogo vendor={vendor} size={18} />{price(row.now)}</td><td>{price(row.open)}</td><td className={(row.move ?? 0) > 0 ? styles.up : (row.move ?? 0) < 0 ? styles.down : ''}>{row.move == null ? '—' : `${row.move > 0 ? '+' : ''}${row.move.toFixed(1)}pp`}</td><td>{row.pickCount?.toLocaleString() ?? '—'}</td><td>{row.projection ?? '—'}</td><td>{percent(row.observed)}</td>{view === 'hits' && <><td>{row.line == null || !row.stats ? '—' : percent(hitRate(row.stats.gameLog, PROP_FIELDS[prop], row.line, 10, row.offer.type === 'milestone' || prop.includes('td')))}</td><td>{row.line == null || !row.stats ? '—' : percent(hitRate(row.stats.gameLog, PROP_FIELDS[prop], row.line, 5, row.offer.type === 'milestone' || prop.includes('td')))}</td><td>{row.line == null || !row.stats ? '—' : percent(hitRate(row.stats.gameLog, PROP_FIELDS[prop], row.line, 3, row.offer.type === 'milestone' || prop.includes('td')))}</td></>}<td className={styles.gap}>{row.gap == null ? '—' : `${row.gap > 0 ? '+' : ''}${row.gap.toFixed(1)}pp`}</td></tr>)}</tbody></table>{!marketRows.length && <p className={styles.empty}>No exact {vendor} contracts are captured for this market.</p>}</div>}

    {view === 'explosives' && <div className={styles.tableWrap}><table><thead><tr><th>Player</th><th>Games</th><th>Deep targets</th><th>REC 20+</th><th>REC 30+</th><th>REC 40+</th><th>RUSH 10+</th><th>RUSH 20+</th><th>RUSH 30+</th><th>RUSH 40+</th></tr></thead><tbody>{paired.filter((row): row is typeof row & { stats: NonNullable<typeof row.stats> } => Boolean(row.stats)).sort((a, b) => (b.stats.receiving20 + b.stats.rushing10) - (a.stats.receiving20 + a.stats.rushing10)).map(({ stats, market }) => <tr key={stats.id}><td><PlayerIdentity player={market} team={teams.find(item => item.abbr === stats.team)} /></td><td>{stats.games}</td><td>{stats.deepTargets}</td><td>{stats.receiving20}</td><td>{stats.receiving30}</td><td>{stats.receiving40}</td><td>{stats.rushing10}</td><td>{stats.rushing20}</td><td>{stats.rushing30}</td><td>{stats.rushing40}</td></tr>)}</tbody></table></div>}

    {view === 'gaps' && <div className={styles.cards}>{lens.runGaps.filter(row => team === 'all' || row.team === team).map(row => <article key={`${row.team}:${row.gap}`} style={{ '--team': teams.find(item => item.abbr === row.team)?.color ?? '#61dafb' } as CSSProperties}><span>{row.team} → {row.gap.toUpperCase()}</span><strong>{row.edge > 0 ? '+' : ''}{row.edge.toFixed(1)} EDGE</strong><div><b>{row.yardsPerCarry}</b><small>offense YPC</small><b>{row.defenseYardsPerCarry || '—'}</b><small>{row.opponent} allowed YPC</small><b>{row.successRate}%</b><small>success</small><b>{row.explosiveRate}%</b><small>explosive</small></div><footer>{row.attempts} offense rushes · {row.defenseAttempts || 0} defense rushes faced</footer></article>)}</div>}

    {view === 'defense' && <><section className={styles.teamStrip}>{lens.teams.filter(row => team === 'all' || row.team.abbr === team).map(row => <article key={row.team.abbr} style={{ '--team': row.team.color } as CSSProperties}><b>{row.team.abbr}</b><span>{row.defenseSuccessAllowed.toFixed(1)}% success allowed</span><span>{row.defenseExplosiveAllowed.toFixed(1)}% explosive allowed</span><span>{row.redZoneTdRate.toFixed(1)}% offense RZ TD</span></article>)}</section><div className={styles.tableWrap}><table><thead><tr><th>Defense</th><th>Position</th><th>Stat</th><th>Vs league</th><th>Games</th></tr></thead><tbody>{lens.dvp.filter(row => team === 'all' || row.defense === team).sort((a, b) => b.pctDiff - a.pctDiff).map(row => <tr key={`${row.defense}:${row.position}:${row.stat}`} data-tone={tone(row.pctDiff)}><td><b>{row.defense}</b></td><td>{row.position}</td><td>{row.stat.replaceAll('_', ' ')}</td><td className={styles.gap}>{row.pctDiff > 0 ? '+' : ''}{row.pctDiff.toFixed(1)}%</td><td>{row.games}</td></tr>)}</tbody></table></div></>}
  </main>
}
