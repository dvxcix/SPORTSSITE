'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { nbaAppeared, nbaMinutes, nbaSeason, type PaintPlayer, type PaintStat } from '@/lib/nbaPaint'
import { nbaResearchHref, type NbaDirectoryTeam, type NbaSeasonSummary } from '@/lib/nbaEntities'
import { TeamLogo } from '@/app/the-paint/PaintVisuals'
import { PaintShotChart } from '@/app/the-paint/PaintShotChart'
import { PaintHeatCell, PaintHeatLegend } from '@/app/the-paint/PaintHeatCell'
import heatmap from '@/app/the-paint/heatmap.module.css'
import entity from '@/components/product/EntityPage.module.css'
import styles from './nbaEntity.module.css'

const fields = [{ key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'fg3m', label: '3PM' }, { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }] as const
const number = (value: number | null | undefined, places = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(places)

export function NbaEntityHistory({ player, teams, seasons }: { player: PaintPlayer; teams: NbaDirectoryTeam[]; seasons: NbaSeasonSummary[] }) {
  const [season, setSeason] = useState(seasons[0]?.season ?? 0)
  const [sort, setSort] = useState('date'), [ascending, setAscending] = useState(false), [view, setView] = useState<'games' | 'shots'>('games')
  const games = useMemo(() => {
    const value = (row: PaintStat): number | null => sort === 'date' ? Date.parse(row.game.date) : sort === 'min' ? nbaMinutes(row.min) : row[sort as typeof fields[number]['key']]
    return player.logs.filter(row => row.game.season === season && row.game.postseason !== true && (row.game.status === 'Final' || row.game.status_state === 'final') && nbaAppeared(row)).sort((a, b) => {
      const left = value(a), right = value(b)
      if (left == null || right == null) return left === right ? 0 : left == null ? 1 : -1
      return (ascending ? 1 : -1) * (left - right) || b.game.id - a.game.id
    })
  }, [player.logs, season, sort, ascending])
  const seasonPools = useMemo(() => {
    const pools: Record<string, (number | null)[]> = { games: seasons.map(row => row.games), min: seasons.map(row => row.min), fgPct: seasons.map(row => row.fgPct), threePct: seasons.map(row => row.threePct) }
    for (const field of fields) pools[field.key] = seasons.map(row => row[field.key])
    return pools
  }, [seasons])
  const gamePools = useMemo(() => {
    const pools: Record<string, (number | null)[]> = { min: games.map(row => nbaMinutes(row.min)) }
    for (const field of fields) pools[field.key] = games.map(row => row[field.key])
    return pools
  }, [games])
  const header = (label: string, key: string) => <th key={key} aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}><button onClick={() => { if (sort === key) setAscending(!ascending); else { setSort(key); setAscending(false) } }}>{label}<ArrowDown size={11} aria-hidden="true"/></button></th>
  return <>
    <section className={`${entity.panel} ${entity.panelPad}`} aria-label="NBA season history">
      <div className={styles.sectionHeading}><h2>Season history</h2><span>Regular season · per game</span></div><div className={heatmap.legendRow}><PaintHeatLegend low="Lower stat" high="Higher stat"/></div>
      <div className={`${entity.tableWrap} ${styles.scrollRegion}`} role="region" aria-label="NBA season history table" tabIndex={0}><table className={`${entity.dataTable} ${heatmap.table}`}><thead><tr><th>Season</th><th>Teams</th><th>G</th><th>MIN</th>{fields.map(field => <th key={field.key}>{field.label}</th>)}<th>FG%</th><th>3P%</th></tr></thead><tbody>{seasons.map(row => <tr key={row.season}>
        <td><button className={styles.seasonButton} aria-pressed={season === row.season} onClick={() => { setSeason(row.season); setView('games') }}>{nbaSeason(row.season)}</button></td>
        <td><span className={styles.teamRail}>{row.teamIds.map(id => { const team = teams.find(candidate => candidate.id === id); return team ? <Link key={id} href={`/nba/teams/${id}`} aria-label={team.full_name}><TeamLogo abbr={team.abbreviation} size={24}/></Link> : null })}</span></td>
        <td><PaintHeatCell value={row.games} pool={seasonPools.games} label={`Games: ${row.games}`}>{row.games}</PaintHeatCell></td><td><PaintHeatCell value={row.min} pool={seasonPools.min} label={`Season minutes: ${number(row.min)}`}>{number(row.min)}</PaintHeatCell></td>{fields.map(field => <td key={field.key}><PaintHeatCell value={row[field.key]} pool={seasonPools[field.key]} label={`Season ${field.label}: ${number(row[field.key])}`}>{number(row[field.key])}</PaintHeatCell></td>)}<td><PaintHeatCell value={row.fgPct} pool={seasonPools.fgPct} tone="performance" label={`Field goal percentage: ${number(row.fgPct==null?null:row.fgPct*100)}`}>{row.fgPct == null ? '—' : `${number(row.fgPct * 100)}%`}</PaintHeatCell></td><td><PaintHeatCell value={row.threePct} pool={seasonPools.threePct} tone="performance" label={`Three point percentage: ${number(row.threePct==null?null:row.threePct*100)}`}>{row.threePct == null ? '—' : `${number(row.threePct * 100)}%`}</PaintHeatCell></td>
      </tr>)}</tbody></table></div>{!seasons.length && <p className={styles.empty}>No completed regular-season appearances yet.</p>}
    </section>
    <section className={`${entity.panel} ${entity.panelPad}`}>
      <div className={styles.sectionHeading}><div className={styles.tabs}><button aria-pressed={view === 'games'} onClick={() => setView('games')}>Game log</button><button aria-pressed={view === 'shots'} onClick={() => setView('shots')}>Shot chart</button></div>{view === 'games' && <select aria-label="NBA player history season" value={season} onChange={event => setSeason(Number(event.target.value))}>{seasons.map(row => <option key={row.season} value={row.season}>{nbaSeason(row.season)}</option>)}</select>}</div>
      {view === 'shots' ? <PaintShotChart player={player}/> : <><div className={`${entity.tableWrap} ${styles.scrollRegion}`} role="region" aria-label="NBA player game log table" tabIndex={0}><table className={`${entity.dataTable} ${styles.sortable} ${heatmap.table}`}><thead><tr>{header('Date', 'date')}<th>Opponent</th>{header('MIN', 'min')}{fields.map(field => header(field.label, field.key))}<th><span className={styles.srOnly}>Research matchup</span></th></tr></thead><tbody>{games.map(game => {
        const home = game.team.id === game.game.home_team_id, opponent = teams.find(team => team.id === (home ? game.game.visitor_team_id : game.game.home_team_id))
        return <tr key={game.id}><td>{new Date(`${game.game.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</td><td>{opponent ? <Link className={styles.opponent} href={`/nba/teams/${opponent.id}`}><TeamLogo abbr={opponent.abbreviation} size={24}/><span>{opponent.name}<small>{home ? 'Home' : 'Away'}</small></span></Link> : '—'}</td><td><PaintHeatCell value={nbaMinutes(game.min)} pool={gamePools.min} label={`Game minutes: ${number(nbaMinutes(game.min))}`}>{number(nbaMinutes(game.min))}</PaintHeatCell></td>{fields.map(field => <td key={field.key}><PaintHeatCell value={game[field.key]} pool={gamePools[field.key]} label={`Game ${field.label}: ${number(game[field.key],0)}`}>{number(game[field.key], 0)}</PaintHeatCell></td>)}<td><Link className={styles.iconLink} href={nbaResearchHref(game.game, player.id)} aria-label={`Research ${game.game.date.slice(0, 10)} matchup`}><ArrowUpRight size={17}/></Link></td></tr>
      })}</tbody></table></div>{!games.length && <p className={styles.empty}>No completed appearances in this season.</p>}</>}
    </section>
  </>
}
