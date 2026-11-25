import { NextResponse } from 'next/server'
import { getGameStatus, getGameSummary, getTeams, type ESPNGame, type ESPNSummary, type SportKey } from '@slipsurge/core/espn-api'
import { getMLBGameFeed, mlbTeamLogo } from '@slipsurge/core/mlb-api'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { getNflGameCenter } from '@/lib/nflGameCenterServer'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const missing = () => respond({ error: 'Matchup unavailable' }, 404)
const leagues = ['mlb', 'nfl', 'nba', 'nhl', 'soccer'] as const
const easternDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })

function scheduledGame(game: ESPNGame, sport: SportKey) {
  const { away, home } = getTeams(game)
  const date = Date.parse(game.date)
  if (!away || !home || !Number.isFinite(date)) return missing()
  const status = getGameStatus(game)
  const card = ({ team, score, records }: typeof away) => ({
    id: team.id, name: team.displayName, abbreviation: team.abbreviation, logo: team.logo,
    color: team.color || null, secondary: team.alternateColor || null,
    score: status.state === 'pre' ? null : score, record: records?.[0]?.summary ?? null,
  })
  return respond({ date: easternDate.format(date), game: {
    id: game.id, sport, start: game.date, state: status.state, status: status.state === 'pre' ? null : status.label,
    venue: game.competitions[0]?.venue?.fullName ?? null, away: card(away), home: card(home),
  } })
}

function summaryGame(summary: ESPNSummary, id: string, sport: SportKey) {
  type Competitor = ESPNSummary['header']['competitions'][number]['competitors'][number]
  type HeaderMatch = ESPNSummary['header']['competitions'][number] & { date?: string }
  const match: HeaderMatch | undefined = summary.header.competitions[0]
  if (!match || summary.header.id !== id || !match.date || !Number.isFinite(Date.parse(match.date))) return missing()
  const away = match.competitors.find(team => team.homeAway === 'away')
  const home = match.competitors.find(team => team.homeAway === 'home')
  if (!away || !home) return missing()
  const state = match.status.type.state
  const team = (entry: Competitor) => {
    const identity: Competitor['team'] & { id?: string } = entry.team
    return {
      id: String(identity.id ?? identity.abbreviation), name: identity.displayName, abbreviation: identity.abbreviation,
      logo: identity.logo, color: identity.color || null, secondary: identity.alternateColor || null,
      score: state !== 'pre' ? entry.score : null, record: entry.records?.[0]?.summary ?? null,
    }
  }
  return respond({ date: easternDate.format(Date.parse(match.date)), game: {
    id, sport, start: match.date, state, status: state === 'pre' ? null : match.status.type.shortDetail,
    venue: match.venue?.fullName ?? null, away: team(away), home: team(home),
  } })
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const sport = leagues.find(league => league === params.get('sport')), id = params.get('id') ?? ''
  if (!sport || params.getAll('sport').length !== 1 || params.getAll('id').length !== 1 ||
    !(/^[0-9]{1,14}$/.test(id) || sport === 'nfl' && /^[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(id))) {
    return respond({ error: 'Invalid game' }, 400)
  }
  try {
    if (sport === 'mlb') {
      if (MLB_HIBERNATING) return missing()
      const feed = await getMLBGameFeed(id)
      if (!feed || String(feed.gamePk) !== id) return missing()
      const { datetime, teams, status, venue } = feed.gameData
      const score = feed.liveData.linescore.teams
      const state = status.abstractGameState === 'Live' ? 'in' : status.abstractGameState === 'Final' ? 'post' : 'pre'
      const card = (team: typeof teams.away, runs: number | undefined) => ({
        id: String(team.id), name: team.name, abbreviation: team.abbreviation ?? team.teamName ?? team.name,
        logo: mlbTeamLogo(team.id), color: null, secondary: null, score: runs == null ? null : String(runs),
        record: team.record ? `${team.record.wins}–${team.record.losses}` : null,
      })
      return respond({ date: datetime.officialDate, game: {
        id, sport, start: datetime.dateTime, state, status: status.detailedState, venue: venue.name,
        away: card(teams.away, state === 'pre' ? undefined : score.away?.runs),
        home: card(teams.home, state === 'pre' ? undefined : score.home?.runs),
      } })
    }
    if (sport === 'nfl' && id.includes('_')) {
      const stored = await getNflGameCenter(id)
      return stored?.game.id === id ? scheduledGame(stored.game, sport) : missing()
    }
    const summary = await getGameSummary(sport, id)
    return summary ? summaryGame(summary, id, sport) : missing()
  } catch {
    return respond({ error: 'Game is temporarily unavailable' }, 503)
  }
}
