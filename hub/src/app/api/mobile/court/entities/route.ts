import { NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getNbaPlayerEntity, getNbaTeamEntity } from '@/lib/nbaDirectory'
import { nbaEntityId, nbaPlayerName, type NbaDirectoryTeam } from '@/lib/nbaEntities'
import { nbaTeamLogo, type PaintGame } from '@/lib/nbaPaint'
import { getPaintGame } from '@/lib/nbaPaintData'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

const teamIdentity = (team: PaintGame['home_team'] & Partial<NbaDirectoryTeam>) => ({
  id: team.id, name: team.full_name, abbreviation: team.abbreviation, logo: nbaTeamLogo(team.abbreviation),
  conference: team.conference ?? null, division: team.division ?? null,
})

function matchup(game: PaintGame) {
  const final = game.status_state === 'final' || game.status === 'Final'
  const live = game.status_state === 'in_progress'
  const labeledScore = final || live
  return {
    id: game.id, date: game.date.slice(0, 10), at: game.datetime,
    state: final ? 'final' : live ? 'live' : 'scheduled',
    home: teamIdentity(game.home_team), away: teamIdentity(game.visitor_team),
    homeScore: labeledScore ? game.home_team_score : null,
    awayScore: labeledScore ? game.visitor_team_score : null,
  }
}

export async function GET(request: Request) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const params = new URL(request.url).searchParams
  const kind = params.get('kind'), id = nbaEntityId(params.get('id') ?? ''), rawGame = params.get('game')
  if ((kind !== 'player' && kind !== 'team') || !id || params.getAll('game').length > 1) {
    return respond({ error: 'Invalid NBA entity' }, 400)
  }
  try {
    if (rawGame !== null) {
      const game = nbaEntityId(rawGame)
      if (!game) return respond({ error: 'Invalid matchup' }, 400)
      const row = await getPaintGame(game)
      if (row.id !== game) return respond({ error: 'Matchup unavailable' }, 404)
      if (kind === 'team' && row.home_team.id !== id && row.visitor_team.id !== id) {
        return respond({ error: 'Team not found in this matchup' }, 404)
      }
      return respond({ matchup: matchup(row) })
    }
    if (kind === 'team') {
      const data = await getNbaTeamEntity(id)
      if (!data) return respond({ error: 'Team not found' }, 404)
      return respond({ team: teamIdentity(data.team), upcoming: data.games.slice(0, 6).map(matchup),
        recent: data.recent.map(matchup), roster: data.roster, season: data.season, record: data.record })
    }
    const data = await getNbaPlayerEntity(id)
    if (!data) return respond({ error: 'Player not found' }, 404)
    const { player } = data
    return respond({
      player: {
        id, name: nbaPlayerName(player), position: player.position, headshot: data.image, jersey: player.jersey_number,
        height: player.height, weight: player.weight, college: player.college, draftYear: player.draft_year, draftPick: player.draft_number,
        team: teamIdentity(player.team),
      },
      seasons: data.seasons,
      upcoming: data.games.slice(0, 6).map(matchup),
      logs: data.logs.map(log => ({
        id: log.id, gameId: log.game.id, date: log.game.date.slice(0, 10), season: log.game.season ?? null,
        teamId: log.team.id, opponentId: log.game.home_team_id === log.team.id ? log.game.visitor_team_id : log.game.home_team_id,
        home: log.game.home_team_id === log.team.id,
        minutes: log.min, pts: log.pts, reb: log.reb, ast: log.ast, fg3m: log.fg3m, steals: log.stl, blocks: log.blk,
      })),
      teams: data.teams.map(teamIdentity),
    })
  } catch {
    return respond({ error: 'NBA directory is temporarily unavailable' }, 503)
  }
}
