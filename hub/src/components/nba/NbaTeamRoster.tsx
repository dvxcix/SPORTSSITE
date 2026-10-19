'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import type { NbaSearchPlayer } from '@/lib/nbaEntities'
import entity from '@/components/product/EntityPage.module.css'
import styles from './nbaEntity.module.css'

export function NbaTeamRoster({ players }: { players: NbaSearchPlayer[] }) {
  const [query, setQuery] = useState(''), [sort, setSort] = useState<'name' | 'position'>('name'), [ascending, setAscending] = useState(true)
  const rows = useMemo(() => players.filter(player => `${player.name} ${player.position}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (ascending ? 1 : -1) * a[sort].localeCompare(b[sort]) || a.name.localeCompare(b.name)), [players, query, sort, ascending])
  const header = (label: string, key: typeof sort) => <th aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}><button onClick={() => { if (sort === key) setAscending(!ascending); else { setSort(key); setAscending(true) } }}>{label}<ArrowDown size={11}/></button></th>
  return <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Roster</h2><input aria-label="Find NBA roster player" placeholder="Find a player" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <div className={entity.tableWrap}><table className={`${entity.dataTable} ${styles.sortable} ${styles.roster}`}><thead><tr>{header('Player', 'name')}{header('Position', 'position')}<th><span className={styles.srOnly}>Player profile</span></th></tr></thead><tbody>{rows.map(player => <tr key={player.id}><td><Link href={`/nba/players/${player.id}`} className={styles.rosterPlayer}><PlayerAvatar name={player.name} headshot={player.headshot} size={42} showTeam={false}/><strong>{player.name}</strong></Link></td><td>{player.position || '—'}</td><td><Link href={`/nba/players/${player.id}`} aria-label={`Open ${player.name} profile`}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>{!rows.length && <p className={styles.empty}>No matching players.</p>}
  </section>
}
