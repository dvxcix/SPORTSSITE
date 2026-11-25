import { getMLBGameFeed, mlbHeadshot, mlbTeamLogo, type MLBBoxPlayer, type MLBBoxTeam, type MLBGameFeed, type MLBPlay } from '@slipsurge/core/mlb-api'
import type { ESPNPlay, ESPNSummary } from '@slipsurge/core/espn-api'
import { MLB_HIBERNATING } from './mlbOffseason'

const baseballStats = {
  batting: [
    ['AB', 'atBats'], ['R', 'runs'], ['H', 'hits'], ['HR', 'homeRuns'], ['RBI', 'rbi'], ['BB', 'baseOnBalls'], ['SO', 'strikeOuts'],
  ],
  pitching: [
    ['IP', 'inningsPitched'], ['H', 'hits'], ['R', 'runs'], ['ER', 'earnedRuns'], ['BB', 'baseOnBalls'], ['SO', 'strikeOuts'], ['Pitches', 'pitchesThrown'],
  ],
} as const

function teamArt(team: MLBGameFeed['gameData']['teams']['away']) {
  return {
    id: String(team.id), displayName: team.name, abbreviation: team.abbreviation ?? team.teamName ?? team.name,
    logo: mlbTeamLogo(team.id), color: '', alternateColor: '',
  }
}

function playerRows(team: MLBBoxTeam, kind: keyof typeof baseballStats) {
  const relevant = kind === 'batting' ? team.batters : team.pitchers
  const players = new Map(Object.values(team.players).map(player => [player.person.id, player]))
  return (relevant ?? []).flatMap(id => {
    const player = players.get(id)
    if (!player) return []
    const stats: MLBBoxPlayer['stats'][typeof kind] = player.stats[kind]
    const values = stats as Record<string, string | number | undefined> | undefined
    return [{
      athlete: {
        displayName: player.person.fullName, position: player.position,
        headshot: { href: mlbHeadshot(player.person.id) },
      },
      stats: baseballStats[kind].map(([, field]) => values?.[field] == null ? '—' : String(values[field])),
    }]
  })
}

function atBat(play: MLBPlay, awayId: number, homeId: number): ESPNPlay | null {
  if (!Number.isInteger(play.about.atBatIndex) || !Number.isInteger(play.about.inning)) return null
  return {
    id: String(play.about.atBatIndex), sequenceNumber: String(play.about.atBatIndex),
    type: { id: play.result.eventType ?? '', text: play.result.event ?? 'At bat' },
    text: play.result.description ?? '', awayScore: play.result.awayScore, homeScore: play.result.homeScore,
    scoringPlay: play.about.isScoringPlay || play.result.isScoringPlay === true,
    period: { number: play.about.inning, displayValue: `Inning ${play.about.inning}` },
    clock: { displayValue: play.about.isTopInning ? 'Top' : 'Bottom' },
    team: { id: String(play.about.isTopInning ? awayId : homeId) },
    athletes: [play.matchup.batter, play.matchup.pitcher].flatMap(person => person?.id && person.fullName ? [{
      athlete: { id: String(person.id), displayName: person.fullName, headshot: { href: mlbHeadshot(person.id) } },
    }] : []),
  }
}

export function projectNativeMlbGame(feed: MLBGameFeed) {
  const { status, teams, venue } = feed.gameData
  const { linescore, plays, boxscore } = feed.liveData
  const state = status.abstractGameState === 'Live' ? 'in' : status.abstractGameState === 'Final' ? 'post' : 'pre'
  const sides = ['away', 'home'] as const
  const summary: ESPNSummary = {
    header: {
      id: String(feed.gamePk),
      competitions: [{
        competitors: sides.map(side => ({
          homeAway: side, team: teamArt(teams[side]),
          score: String(linescore.teams[side]?.runs ?? ''),
          records: teams[side].record ? [{ summary: `${teams[side].record.wins}–${teams[side].record.losses}` }] : [],
        })),
        status: { clock: 0, displayClock: '', period: linescore.currentInning ?? 0,
          type: { state, shortDetail: status.detailedState, completed: state === 'post' } },
        venue: { fullName: venue.name },
      }],
    },
    plays: plays.allPlays.flatMap(play => atBat(play, teams.away.id, teams.home.id) ?? []),
    boxscore: {
      teams: sides.map(side => ({
        team: teamArt(teams[side]),
        statistics: [['Runs', linescore.teams[side]?.runs], ['Hits', linescore.teams[side]?.hits], ['Errors', linescore.teams[side]?.errors]]
          .flatMap(([name, value]) => typeof name === 'string' && value != null ? [{ name, label: name, displayValue: String(value) }] : []),
      })),
      players: sides.map(side => ({
        team: teamArt(teams[side]),
        statistics: (['batting', 'pitching'] as const).map(kind => ({
          name: kind === 'batting' ? 'Batting' : 'Pitching',
          keys: baseballStats[kind].map(([, key]) => key),
          labels: baseballStats[kind].map(([label]) => label),
          athletes: playerRows(boxscore.teams[side], kind),
        })),
      })),
    },
  }
  const quarters = sides.map(side => ({
    team: teamArt(teams[side]).abbreviation, logo: mlbTeamLogo(teams[side].id),
    periods: linescore.innings.map(inning => inning[side].runs ?? null),
    total: String(linescore.teams[side]?.runs ?? '—'),
  }))
  const pitches = new Map(plays.allPlays.map(play => [String(play.about.atBatIndex), play.playEvents
    .filter(event => event.type === 'pitch' && Number.isInteger(event.index)).map(event => ({
      id: event.index, number: event.pitchNumber ?? null,
      kind: event.details.type?.description ?? null, call: event.details.call?.description ?? event.details.description ?? '',
      strike: event.details.isStrike === true, speed: event.pitchData?.startSpeed ?? null, spin: event.pitchData?.spinRate ?? null,
      x: event.pitchData?.coordinates?.pX ?? null, z: event.pitchData?.coordinates?.pZ ?? null,
      zoneTop: event.pitchData?.strikeZoneTop ?? null, zoneBottom: event.pitchData?.strikeZoneBottom ?? null,
      exitVelocity: event.hitData?.launchSpeed ?? null, launchAngle: event.hitData?.launchAngle ?? null,
      distance: event.hitData?.totalDistance ?? null,
    }))]))
  return { summary, quarters, pitches, updatedAt: null, complete: state === 'post' }
}

export async function loadNativeMlbGame(id: string, date: string) {
  if (MLB_HIBERNATING || !/^[0-9]{1,14}$/.test(id)) return null
  const feed = await getMLBGameFeed(id)
  if (!feed || String(feed.gamePk) !== id || feed.gameData.datetime.officialDate !== date) return null
  return projectNativeMlbGame(feed)
}
