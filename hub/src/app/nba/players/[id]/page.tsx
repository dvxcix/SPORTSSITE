import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, ChartNoAxesCombined, CircleDot, Clock3, Crosshair, Layers, UserRound, Waypoints } from 'lucide-react'
import { requirePaintAccess } from '@/lib/paintAccess'
import { NbaAccessFallback } from '@/components/nba/NbaAccessFallback'
import { getNbaPlayerEntity } from '@/lib/nbaDirectory'
import { nbaEntityId, nbaPlayerName, nbaResearchHref } from '@/lib/nbaEntities'
import { nbaSeason, nbaTeamLogo, type PaintPlayer } from '@/lib/nbaPaint'
import { SafeImage } from '@/components/ui/SafeImage'
import { nbaTeamGradient } from '@/lib/nbaTeamColors'
import { TeamLogo } from '@/app/the-paint/PaintVisuals'
import { NbaEntityHistory } from '@/components/nba/NbaEntityHistory'
import { FavoriteEntityButton } from '@/components/profile/FavoriteEntityButton'
import entity from '@/components/product/EntityPage.module.css'
import styles from '@/components/nba/nbaEntity.module.css'
import metrics from '@/components/nba/nbaEntityMetrics.module.css'

export const metadata: Metadata = { title: 'NBA Player • SlipSurge', robots: { index: false, follow: false } }
export default async function NbaPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePaintAccess(); if (gate.error) return <NbaAccessFallback status={gate.error.status} />
  const id = nbaEntityId((await params).id); if (!id) notFound()
  const data = await getNbaPlayerEntity(id); if (!data) notFound()
  const { player, seasons, logs, teams, image, games } = data
  const latest = seasons[0], next = games[0] ?? null, name = nbaPlayerName(player)
  const nextTip = next ? Date.parse(next.datetime ?? next.status) : NaN
  const nextStatus = next?.status_state === 'in_progress' ? 'Live' : Number.isFinite(nextTip) ? `${new Date(nextTip).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : 'Time TBD'
  const researchPlayer: PaintPlayer = { ...player, headshot: image, injury: null, average: {}, logs, props: [] }
  const favorite = { sport: 'nba' as const, player_id: String(id), name, team: player.team.abbreviation, headshot: image, team_logo: nbaTeamLogo(player.team.abbreviation) }
  return <div className={entity.page}>
    <header className={entity.hero}><div className={entity.avatar} style={{ background: nbaTeamGradient(player.team.abbreviation) }}><SafeImage src={image} alt="" loading="eager" fallback={<UserRound className="h-full w-full p-4 text-zinc-500"/>}/></div><div className={entity.identity}><p className={entity.eyebrow}>NBA player</p><h1 className={entity.title}>{name}</h1><div className={entity.meta}><span>{player.position}{player.jersey_number ? ` · #${player.jersey_number}` : ''}</span><Link className={entity.metaPill} href={`/nba/teams/${player.team.id}`}><TeamLogo abbr={player.team.abbreviation} size={22}/>{player.team.full_name}</Link></div></div></header>
    <div className={`${styles.actions} ${metrics.actions}`}><Link href={nbaResearchHref(next, next ? id : undefined)}><Layers size={16}/>The Court<ArrowUpRight size={15}/></Link>{next && <><Link href={nbaResearchHref(next, id, 'ladder')}>Alt lines<ArrowUpRight size={15}/></Link><Link href={nbaResearchHref(next, id, 'movement')}><ChartNoAxesCombined size={16}/>Market Story</Link></>}<FavoriteEntityButton key={id} player={favorite} label={name}/></div>
    {latest && <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>{nbaSeason(latest.season)}</h2><span>{latest.games} appearances · regular season · per game</span></div><div className={metrics.metrics} data-columns="5">{[{ label: 'Points', value: latest.pts, icon: CircleDot }, { label: 'Rebounds', value: latest.reb, icon: Layers }, { label: 'Assists', value: latest.ast, icon: Waypoints }, { label: 'Threes', value: latest.fg3m, icon: Crosshair }, { label: 'Minutes', value: latest.min, icon: Clock3 }].map(stat => <div className={metrics.metric} data-missing={stat.value == null || undefined} key={stat.label}><span><stat.icon size={18} aria-hidden="true"/>{stat.label}</span><strong>{stat.value?.toFixed(1) ?? '—'}</strong></div>)}</div></section>}
    {next && <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Next matchup</h2></div><Link className={metrics.game} href={nbaResearchHref(next, id)} aria-label={`${next.visitor_team.full_name} at ${next.home_team.full_name}, ${next.date}, ${nextStatus}`}><time className={metrics.gameTime} dateTime={next.date}>{new Date(`${next.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}<small data-live={next.status_state === 'in_progress'}>{nextStatus}</small></time><span className={metrics.matchup} aria-hidden="true"><TeamLogo abbr={next.visitor_team.abbreviation} size={36}/><i>at</i><TeamLogo abbr={next.home_team.abbreviation} size={36}/></span><ArrowUpRight size={18} aria-hidden="true"/></Link></section>}
    <NbaEntityHistory key={player.id} player={researchPlayer} seasons={seasons} teams={teams}/>
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Player profile</h2></div><div className={metrics.profile}>{player.height && <span>Height <b>{player.height}</b></span>}{player.weight && <span>Weight <b>{player.weight} lb</b></span>}{player.college && <span>College <b>{player.college}</b></span>}{player.draft_year && <span>Draft <b>{player.draft_year}{player.draft_number ? ` · #${player.draft_number}` : ''}</b></span>}</div></section>
  </div>
}
