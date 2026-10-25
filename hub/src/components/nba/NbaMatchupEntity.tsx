import Link from 'next/link'
import { NbaOddsModeProvider } from './NbaOddsModeContext'
import { NbaEntityHistory } from './NbaEntityHistory'
import { NbaTeamRoster } from './NbaTeamRoster'
import { TeamLogo, PlayerAvatar } from '@/app/the-paint/PaintVisuals'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { nbaEntityGameHref, nbaPlayerName, nbaPlayerSeasons, nbaResearchHref } from '@/lib/nbaEntities'
import { nbaSeason, nbaTeamLogo, type PaintBoard } from '@/lib/nbaPaint'
import type { NbaOddsMode } from '@/lib/nbaOddsMode'
import entity from '@/components/product/EntityPage.module.css'
import styles from './nbaEntity.module.css'
import metrics from './nbaEntityMetrics.module.css'

function Baseline({ board, mode }: { board: PaintBoard; mode: NbaOddsMode }) {
  const at = board.researchSnapshot?.observedAt ?? board.fetchedAt
  return <p role="status" className={styles.empty}>{mode === 'live' ? 'Live matchup research' : board.researchSnapshot?.frozen ? 'Frozen pregame baseline' : 'Pregame baseline'} · {board.game.visitor_team.abbreviation} at {board.game.home_team.abbreviation} · {board.game.date} · saved <time dateTime={at}>{new Date(at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</time>.</p>
}

export function NbaMatchupUnavailable({ game, mode }: { game: number; mode: NbaOddsMode }) {
  return <section className={`${entity.panel} ${entity.panelPad}`}><h1>Matchup research unavailable</h1><p>The saved inputs for this game could not load. Current profile statistics have not been substituted.</p><Link href={nbaModeHref(`/the-paint?game=${game}`, mode)}>Return to matchup</Link></section>
}

/** Linked entity pages use the same captured board; they never read today's
 * directory, current rosters or results when a parent matchup is selected. */
export function NbaMatchupPlayer({ board, playerId, mode }: { board: PaintBoard; playerId: number; mode: NbaOddsMode }) {
  const player = board.players.find(row => row.id === playerId)
  if (!player) return <NbaMatchupUnavailable game={board.game.id} mode={mode}/>
  const logs = player.logs.filter(row => row.game.date.slice(0, 10) < board.game.date)
  const teams = (board.teams ?? [board.game.home_team, board.game.visitor_team]).map(team => ({ ...team, conference: '' }))
  const name = nbaPlayerName(player)
  return <NbaOddsModeProvider mode={mode}><div className={entity.page}>
    <header className={entity.hero}><PlayerAvatar player={player} large/><div className={entity.identity}><p className={entity.eyebrow}>NBA player · selected matchup</p><h1 className={entity.title}>{name}</h1><Link className={entity.metaPill} href={nbaModeHref(nbaEntityGameHref(`/nba/teams/${player.team.id}`, board.game.id), mode)}><TeamLogo abbr={player.team.abbreviation} size={22}/>{player.team.full_name}</Link></div></header>
    <Baseline board={board} mode={mode}/>
    <div className={styles.actions}><Link href={nbaModeHref(nbaResearchHref(board.game, playerId), mode)}>Return to matchup</Link><Link href={nbaModeHref(nbaResearchHref(board.game, playerId, 'ladder'), mode)}>Alt lines</Link><Link href={nbaModeHref(nbaResearchHref(board.game, playerId, 'movement'), mode)}>Market Story</Link></div>
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>{nbaSeason(player.averageSeason ?? board.sampleSeason)} baseline</h2><span>Per game · saved for this matchup</span></div><div className={metrics.metrics} data-columns="5">{[['Points', 'pts'], ['Rebounds', 'reb'], ['Assists', 'ast'], ['Threes', 'fg3m'], ['Minutes', 'min']].map(([label, key]) => <div className={metrics.metric} key={key}><span>{label}</span><strong>{player.average[key]?.toFixed(1) ?? '—'}</strong></div>)}</div></section>
    {player.injury && <section className={`${entity.panel} ${entity.panelPad}`}><h2>Saved injury report · {player.injury.status}</h2><p>{player.injury.description}</p></section>}
    <NbaEntityHistory key={`${mode}:${board.game.id}:${playerId}`} player={{ ...player, logs }} seasons={nbaPlayerSeasons(logs)} teams={teams} researchGame={board.game.id}/>
  </div></NbaOddsModeProvider>
}

export function NbaMatchupTeam({ board, teamId, mode }: { board: PaintBoard; teamId: number; mode: NbaOddsMode }) {
  if (![board.game.home_team.id, board.game.visitor_team.id].includes(teamId)) return <NbaMatchupUnavailable game={board.game.id} mode={mode}/>
  const team = (board.teams ?? [board.game.home_team, board.game.visitor_team]).find(row => row.id === teamId)
  if (!team) return <NbaMatchupUnavailable game={board.game.id} mode={mode}/>
  const stats = board.teamStats?.find(row => row.team.id === teamId)?.stats
  const roster = board.players.filter(player => player.team.id === teamId).map(player => ({ id: player.id, name: nbaPlayerName(player), position: player.position, teamId, teamName: team.full_name, teamAbbr: team.abbreviation, headshot: player.headshot, teamLogo: nbaTeamLogo(team.abbreviation) }))
  return <NbaOddsModeProvider mode={mode}><div className={entity.page}>
    <header className={entity.hero}><TeamLogo abbr={team.abbreviation} size={88}/><div className={entity.identity}><p className={entity.eyebrow}>NBA team · selected matchup</p><h1 className={entity.title}>{team.full_name}</h1></div></header>
    <Baseline board={board} mode={mode}/>
    <div className={styles.actions}><Link href={nbaModeHref(nbaResearchHref(board.game), mode)}>Return to matchup</Link><Link href={nbaModeHref(nbaResearchHref(board.game, undefined, undefined, 'dvp'), mode)}>Defense × position</Link></div>
    <section className={`${entity.panel} ${entity.panelPad}`}><div className={styles.sectionHeading}><h2>{nbaSeason(board.teamStatsSeason ?? board.sampleSeason)} baseline</h2><span>Saved for this matchup</span></div><div className={metrics.metrics} data-columns="3">{[['Pace', 'pace'], ['Offensive rating', 'off_rating'], ['Defensive rating', 'def_rating']].map(([label, key]) => <div key={key} className={metrics.metric}><span>{label}</span><strong>{stats?.[key]?.toFixed(1) ?? '—'}</strong></div>)}</div>{!stats && <p className={styles.empty}>Team metrics were not saved for this matchup.</p>}</section>
    <NbaTeamRoster players={roster} researchGame={board.game.id}/>
    <p className={styles.empty}>This view retains the matchup roster and research inputs. Current season records and later results are outside this saved baseline.</p>
  </div></NbaOddsModeProvider>
}
