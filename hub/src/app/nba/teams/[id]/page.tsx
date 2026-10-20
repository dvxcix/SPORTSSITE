import { nbaOddsMode, type NbaOddsMode } from '@/lib/nbaOddsMode'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { NbaOddsModeProvider } from '@/components/nba/NbaOddsModeContext'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, CircleDot, Layers, Scale, Shield, Trophy } from 'lucide-react'
import { requirePaintAccess } from '@/lib/paintAccess'
import { NbaAccessFallback } from '@/components/nba/NbaAccessFallback'
import { getNbaTeamEntity } from '@/lib/nbaDirectory'
import { nbaEntityId, nbaResearchHref } from '@/lib/nbaEntities'
import { nbaSeason, type PaintGame } from '@/lib/nbaPaint'
import { TeamLogo } from '@/app/the-paint/PaintVisuals'
import { NbaTeamRoster } from '@/components/nba/NbaTeamRoster'
import { FavoriteEntityButton } from '@/components/profile/FavoriteEntityButton'
import entity from '@/components/product/EntityPage.module.css'
import styles from '@/components/nba/nbaEntity.module.css'
import metrics from '@/components/nba/nbaEntityMetrics.module.css'

export const metadata: Metadata = { title: 'NBA Team • SlipSurge', robots: { index: false, follow: false } }
function GameRow({ game, final = false, oddsMode }: { game: PaintGame; final?: boolean; oddsMode: NbaOddsMode }) {
  const live = game.status_state === 'in_progress', completed = final || game.status_state === 'final', hasScore = live || completed
  const tip = Date.parse(game.datetime ?? game.status)
  const status = completed ? 'Final' : live ? 'Live' : Number.isFinite(tip) ? `${new Date(tip).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : 'Time TBD'
  return <Link className={metrics.game} href={nbaModeHref(nbaResearchHref(game), oddsMode)} aria-label={`${game.visitor_team.full_name} at ${game.home_team.full_name}, ${game.date}, ${status}${hasScore ? `, ${game.visitor_team_score} to ${game.home_team_score}` : ''}`}><time className={metrics.gameTime} dateTime={game.date}>{new Date(`${game.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}<small data-live={live}>{status}</small></time><span className={metrics.matchup} aria-hidden="true"><span><TeamLogo abbr={game.visitor_team.abbreviation} size={34}/>{hasScore && <b>{game.visitor_team_score}</b>}</span><i>{hasScore ? '–' : 'at'}</i><span>{hasScore && <b>{game.home_team_score}</b>}<TeamLogo abbr={game.home_team.abbreviation} size={34}/></span></span><ArrowUpRight size={17} aria-hidden="true"/></Link>
}
export default async function NbaTeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string,string|string[]|undefined>> }) {
  const oddsMode = nbaOddsMode((await searchParams)?.mode)
  const gate = await requirePaintAccess(); if (gate.error) return <NbaAccessFallback status={gate.error.status} />
  const id = nbaEntityId((await params).id); if (!id) notFound()
  const data = await getNbaTeamEntity(id); if (!data) notFound()
  const { team, games, recent, roster, season, record } = data
  const differential = record.points != null && record.allowed != null ? record.points - record.allowed : null
  return <NbaOddsModeProvider mode={oddsMode}><div className={entity.page}>
    <header className={entity.hero}><TeamLogo abbr={team.abbreviation} size={88}/><div className={entity.identity}><p className={entity.eyebrow}>NBA team</p><h1 className={entity.title}>{team.full_name}</h1><div className={entity.meta}>{team.conference} · {team.division}</div></div></header>
    <div className={`${styles.actions} ${metrics.actions}`}><Link href={nbaModeHref(nbaResearchHref(games[0] ?? null), oddsMode)}><Layers size={16}/>The Court<ArrowUpRight size={15}/></Link>{games[0] && <Link href={nbaModeHref(nbaResearchHref(games[0], undefined, undefined, 'dvp'), oddsMode)}>Defense × position<ArrowUpRight size={15}/></Link>}<FavoriteEntityButton key={id} team={`NBA:${id}`} label={team.full_name}/></div>
    {season != null && <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>{nbaSeason(season)}</h2><span>{record.games} completed games · regular season</span></div><div className={metrics.metrics} data-columns="4">{[{ label: 'Record', value: `${record.wins}–${record.losses}`, icon: Trophy }, { label: 'Points / game', value: record.points?.toFixed(1) ?? '—', icon: CircleDot }, { label: 'Allowed / game', value: record.allowed?.toFixed(1) ?? '—', icon: Shield }, { label: 'Point differential', value: differential == null ? '—' : `${differential >= 0 ? '+' : ''}${differential.toFixed(1)}`, icon: Scale, direction: differential == null || differential === 0 ? undefined : differential > 0 ? 'positive' : 'negative' }].map(stat => <div key={stat.label} className={metrics.metric} data-direction={stat.direction} data-missing={stat.value === '—' || undefined}><span><stat.icon size={18} aria-hidden="true"/>{stat.label}</span><strong>{stat.value}</strong></div>)}</div></section>}
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Upcoming games</h2></div><div className={styles.gameList}>{games.slice(0, 6).map(game => <GameRow key={game.id} game={game} oddsMode={oddsMode}/>)}</div>{!games.length && <p className={styles.empty}>No upcoming games in the current schedule.</p>}</section>
    <NbaTeamRoster key={team.id} players={roster}/>
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>Recent results</h2></div><div className={styles.gameList}>{recent.map(game => <GameRow key={game.id} game={game} oddsMode={oddsMode} final/>)}</div>{!recent.length && <p className={styles.empty}>No completed games available.</p>}</section>
  </div></NbaOddsModeProvider>
}
