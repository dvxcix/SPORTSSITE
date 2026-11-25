import { NextResponse } from 'next/server'
import { getGameStatus, getScoreboard, getTeams, type ESPNGame, type SportKey } from '@slipsurge/core/espn-api'
import { getMLBScheduleResult, mlbGameIsLive, mlbGameIsFinal, mlbGameLabel, mlbTeamLogo, type MLBGame } from '@slipsurge/core/mlb-api'
import { getStoredNflScoreboard } from '@/lib/nflScoreboard'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { isSeasonActive, NON_MLB_SPORTS } from '@/lib/scoresSeason'

const HEADERS = { 'Cache-Control': 'private, no-store' }
export const maxDuration = 30

function espnCard(game: ESPNGame, sport: SportKey) {
  const { away, home } = getTeams(game)
  if (!away || !home) return null
  const status = getGameStatus(game), competition = game.competitions[0]
  const team = ({ team, score, records }: typeof away) => ({
    id: team.id, name: team.displayName, abbreviation: team.abbreviation, logo: team.logo,
    color: team.color || null, secondary: team.alternateColor || null,
    record: records?.find(record => record.name === 'overall')?.summary ?? records?.[0]?.summary ?? null,
    score: status.state === 'pre' ? null : score ?? null,
  })
  return {
    id: game.id, sport, start: game.date, state: status.state,
    status: status.state === 'pre' ? null : status.label,
    venue: competition?.venue?.fullName ?? null,
    away: team(away), home: team(home),
  }
}

function mlbCard(game: MLBGame) {
  const state = mlbGameIsLive(game) ? 'in' : mlbGameIsFinal(game) ? 'post' : 'pre'
  const team = ({ team, score, leagueRecord }: MLBGame['teams']['away']) => ({
    id: String(team.id), name: team.name, abbreviation: team.abbreviation ?? team.teamName ?? team.name,
    logo: mlbTeamLogo(team.id), color: null, secondary: null, record: `${leagueRecord.wins}-${leagueRecord.losses}`,
    score: state !== 'pre' && score != null ? String(score) : null,
  })
  return {
    id: String(game.gamePk), sport: 'mlb' as const, start: game.gameDate, state,
    status: state === 'post' ? 'Final' : game.status.startTimeTBD || state === 'in' ? mlbGameLabel(game) : null,
    venue: game.venue?.name ?? null, away: team(game.teams.away), home: team(game.teams.home),
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const date = query.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: 'Choose a valid date' }, { status: 400, headers: HEADERS })
  }

  const day = new Date(date + 'T12:00:00Z')
  const freshness = query.get('freshness') === 'live' && Math.abs(Date.now() - day.getTime()) < 32 * 3600 * 1000 ? 'live' : 'standard'
  const leagues = NON_MLB_SPORTS.filter(({ key }) => isSeasonActive(key, day))
  const nflAndEspn = leagues.map(async ({key}) => {
    const games = key === 'nfl' ? await getStoredNflScoreboard(date) : await getScoreboard(key, date, freshness)
    return { id: key, available: true, games: games.flatMap(game => {
      const mapped = espnCard(game, key)
      return mapped ? [mapped] : []
    }) }
  })
  const mlb = MLB_HIBERNATING || !isSeasonActive('mlb', day) ? [] : [(async () => {
    const result = await getMLBScheduleResult(date)
    return { id: 'mlb', available: result.available, games: result.games.map(mlbCard) }
  })()]
  const result = await Promise.allSettled([...mlb, ...nflAndEspn])
  const ids = [...(mlb.length ? ['mlb'] : []), ...leagues.map(league => league.key)]
  return NextResponse.json({ date, leagues: result.map((league, index) => league.status === 'fulfilled' ? league.value
    : { id: ids[index], available: false, games: [] }) }, { headers: HEADERS })
}
