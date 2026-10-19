import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, Layers } from 'lucide-react'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getNbaTeamEntity } from '@/lib/nbaDirectory'
import { nbaEntityId, nbaResearchHref } from '@/lib/nbaEntities'
import { nbaSeason, type PaintGame } from '@/lib/nbaPaint'
import { TeamLogo } from '@/app/the-paint/PaintVisuals'
import { NbaTeamRoster } from '@/components/nba/NbaTeamRoster'
import { FavoriteEntityButton } from '@/components/profile/FavoriteEntityButton'
import entity from '@/components/product/EntityPage.module.css'
import styles from '@/components/nba/nbaEntity.module.css'

export const metadata: Metadata = { title: 'NBA Team • SlipSurge', robots: { index: false, follow: false } }
function GameRow({ game, final = false }: { game: PaintGame; final?: boolean }) { return <Link className={styles.game} href={nbaResearchHref(game)}><span className={styles.gameDate}>{new Date(`${game.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}{!final && game.datetime && <small className="mt-1 block">{new Date(game.datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</small>}</span><span className={styles.gameTeams}><span><TeamLogo abbr={game.visitor_team.abbreviation} size={27}/>{game.visitor_team.name}{final && <b>{game.visitor_team_score}</b>}</span><small>{final ? 'Final' : 'at'}</small><span><TeamLogo abbr={game.home_team.abbreviation} size={27}/>{game.home_team.name}{final && <b>{game.home_team_score}</b>}</span></span><ArrowUpRight size={17}/></Link> }
export default async function NbaTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePaintAccess(); if (gate.error) notFound()
  const id = nbaEntityId((await params).id); if (!id) notFound()
  const data = await getNbaTeamEntity(id); if (!data) notFound()
  const { team, games, recent, roster, season, record } = data
  return <div className={entity.page}>
    <header className={entity.hero}><TeamLogo abbr={team.abbreviation} size={88}/><div className={entity.identity}><p className={entity.eyebrow}>NBA team</p><h1 className={entity.title}>{team.full_name}</h1><div className={entity.meta}>{team.conference} · {team.division}</div></div></header>
    <div className={styles.actions}><Link href={nbaResearchHref(games[0] ?? null)}><Layers size={16}/>ThePaint<ArrowUpRight size={15}/></Link>{games[0] && <Link href={nbaResearchHref(games[0], undefined, undefined, 'dvp')}>Defense × position<ArrowUpRight size={15}/></Link>}<FavoriteEntityButton key={id} team={`NBA:${id}`} label={team.full_name}/></div>
    {season != null && <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>{nbaSeason(season)}</h2><span>{record.games} completed games · regular season</span></div><div className={entity.metricRail}>{[{ label: 'Record', value: `${record.wins}–${record.losses}` }, { label: 'Points / game', value: record.points?.toFixed(1) ?? '—' }, { label: 'Allowed / game', value: record.allowed?.toFixed(1) ?? '—' }, { label: 'Point differential', value: record.points != null && record.allowed != null ? `${record.points >= record.allowed ? '+' : ''}${(record.points - record.allowed).toFixed(1)}` : '—' }].map(stat => <div key={stat.label} className={entity.metricCard}><div className={entity.metricLabel}>{stat.label}</div><div className={entity.metricValue}>{stat.value}</div></div>)}</div></section>}
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Upcoming games</h2></div><div className={styles.gameList}>{games.slice(0, 6).map(game => <GameRow key={game.id} game={game}/>)}</div>{!games.length && <p className={styles.empty}>No upcoming games in the current schedule.</p>}</section>
    <NbaTeamRoster key={team.id} players={roster}/>
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Recent results</h2></div><div className={styles.gameList}>{recent.map(game => <GameRow key={game.id} game={game} final/>)}</div>{!recent.length && <p className={styles.empty}>No completed games available.</p>}</section>
  </div>
}
