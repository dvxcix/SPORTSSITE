import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, ChartNoAxesCombined, Layers, UserRound } from 'lucide-react'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getNbaPlayerEntity } from '@/lib/nbaDirectory'
import { nbaEntityId, nbaPlayerName, nbaResearchHref } from '@/lib/nbaEntities'
import { nbaSeason, nbaTeamLogo, type PaintPlayer } from '@/lib/nbaPaint'
import { SafeImage } from '@/components/ui/SafeImage'
import { TeamLogo } from '@/app/the-paint/PaintVisuals'
import { NbaEntityHistory } from '@/components/nba/NbaEntityHistory'
import { FavoriteEntityButton } from '@/components/profile/FavoriteEntityButton'
import entity from '@/components/product/EntityPage.module.css'
import styles from '@/components/nba/nbaEntity.module.css'

export const metadata: Metadata = { title: 'NBA Player • SlipSurge', robots: { index: false, follow: false } }
export default async function NbaPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePaintAccess(); if (gate.error) notFound()
  const id = nbaEntityId((await params).id); if (!id) notFound()
  const data = await getNbaPlayerEntity(id); if (!data) notFound()
  const { player, seasons, logs, teams, image, games } = data
  const latest = seasons[0], next = games[0] ?? null, name = nbaPlayerName(player)
  const researchPlayer: PaintPlayer = { ...player, headshot: image, injury: null, average: {}, logs, props: [] }
  const favorite = { sport: 'nba' as const, player_id: String(id), name, team: player.team.abbreviation, headshot: image, team_logo: nbaTeamLogo(player.team.abbreviation) }
  return <div className={entity.page}>
    <header className={entity.hero}><div className={entity.avatar}><SafeImage src={image} alt="" loading="eager" fallback={<UserRound className="h-full w-full p-4 text-zinc-500"/>}/></div><div className={entity.identity}><p className={entity.eyebrow}>NBA player</p><h1 className={entity.title}>{name}</h1><div className={entity.meta}><span>{player.position}{player.jersey_number ? ` · #${player.jersey_number}` : ''}</span><Link className={entity.metaPill} href={`/nba/teams/${player.team.id}`}><TeamLogo abbr={player.team.abbreviation} size={22}/>{player.team.full_name}</Link></div></div></header>
    <div className={styles.actions}><Link href={nbaResearchHref(next, next ? id : undefined)}><Layers size={16}/>ThePaint<ArrowUpRight size={15}/></Link>{next && <><Link href={nbaResearchHref(next, id, 'ladder')}>Alt lines<ArrowUpRight size={15}/></Link><Link href={nbaResearchHref(next, id, 'movement')}><ChartNoAxesCombined size={16}/>Market Story</Link></>}<FavoriteEntityButton player={favorite} label={name}/></div>
    {latest && <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>{nbaSeason(latest.season)}</h2><span>{latest.games} appearances · regular season</span></div><div className={entity.metricRail}>{[{ label: 'Points', value: latest.pts }, { label: 'Rebounds', value: latest.reb }, { label: 'Assists', value: latest.ast }, { label: 'Threes', value: latest.fg3m }, { label: 'Minutes', value: latest.min }].map(stat => <div className={entity.metricCard} key={stat.label}><div className={entity.metricLabel}>{stat.label}</div><div className={entity.metricValue}>{stat.value?.toFixed(1) ?? '—'}</div></div>)}</div></section>}
    {next && <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Next matchup</h2><span>{new Date(`${next.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></div><Link className={styles.game} href={nbaResearchHref(next, id)}><span className={styles.gameTeams}><span><TeamLogo abbr={next.visitor_team.abbreviation} size={30}/>{next.visitor_team.name}</span><small>at</small><span><TeamLogo abbr={next.home_team.abbreviation} size={30}/>{next.home_team.name}</span></span><ArrowUpRight size={18}/></Link></section>}
    <NbaEntityHistory key={player.id} player={researchPlayer} seasons={seasons} teams={teams}/>
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Player profile</h2></div><div className={styles.bio}>{player.height && <span>Height <b>{player.height}</b></span>}{player.weight && <span>Weight <b>{player.weight} lb</b></span>}{player.college && <span>College <b>{player.college}</b></span>}{player.draft_year && <span>Draft <b>{player.draft_year}{player.draft_number ? ` · #${player.draft_number}` : ''}</b></span>}</div></section>
  </div>
}
