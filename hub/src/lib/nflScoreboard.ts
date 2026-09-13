import 'server-only'

import { unstable_cache } from 'next/cache'
import type { ESPNGame } from '@slipsurge/core/espn-api'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNflBdlGames, matchNflBdlGame, type ApiGame } from '@/lib/nflOdds'

type ScheduleRow = {
  game_id: string
  season: number
  week: number
  game_type: string
  gameday: string
  gametime: string | null
  away_team: string
  away_score: number | null
  home_team: string
  home_score: number | null
  stadium: string | null
}

type TeamRow = {
  team_abbr: string
  team_name: string | null
  team_color: string | null
  team_color2: string | null
  team_logo_espn: string | null
}

const loadStoredSlate = unstable_cache(async (date: string) => {
  const admin = createAdminClient()
  const { data: schedule, error } = await admin.from('nfl_schedule')
    .select('game_id,season,week,game_type,gameday,gametime,away_team,away_score,home_team,home_score,stadium')
    .eq('gameday', date)
    .order('gametime')
    .limit(24)
    .abortSignal(AbortSignal.timeout(10_000))
  if (error) throw new Error(`NFL score schedule unavailable: ${error.message}`)
  const rows = (schedule ?? []) as ScheduleRow[]
  if (!rows.length) return { rows, teams: [] as TeamRow[] }
  const abbreviations = Array.from(new Set(rows.flatMap(row => [row.away_team, row.home_team])))
  const { data: teams, error: teamError } = await admin.from('nfl_teams')
    .select('team_abbr,team_name,team_color,team_color2,team_logo_espn')
    .in('team_abbr', abbreviations)
    .abortSignal(AbortSignal.timeout(10_000))
  if (teamError) throw new Error(`NFL score teams unavailable: ${teamError.message}`)
  return { rows, teams: (teams ?? []) as TeamRow[] }
}, ['nfl-live-scoreboard-slate-v1'], { revalidate: 300, tags: ['sideline:nfl-schedule'] })

function canonical(value: string) {
  return ({ LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' } as Record<string, string>)[value] ?? value
}

function liveState(game: ApiGame | null) {
  if (game?.status_state === 'in_progress') return { state: 'in', completed: false }
  if (game?.status_state === 'final') return { state: 'post', completed: true }
  return { state: 'pre', completed: false }
}

function teamPayload(abbr: string, row: TeamRow | undefined, id: string) {
  const name = row?.team_name ?? abbr
  return {
    id,
    uid: `slipsurge:nfl:team:${abbr}`,
    location: name,
    name,
    abbreviation: abbr,
    displayName: name,
    shortDisplayName: name,
    color: row?.team_color?.replace('#', '') ?? '1b2430',
    alternateColor: row?.team_color2?.replace('#', '') ?? 'b6ff3b',
    logo: row?.team_logo_espn ?? '',
  }
}

function mapStoredGame(row: ScheduleRow, teams: Map<string, TeamRow>, live: ApiGame | null): ESPNGame {
  const kickoff = nflKickoffAt(row)
  const status = liveState(live)
  const awayAbbr = canonical(row.away_team)
  const homeAbbr = canonical(row.home_team)
  const away = teamPayload(awayAbbr, teams.get(awayAbbr), String(live?.visitor_team.id ?? `away-${row.game_id}`))
  const home = teamPayload(homeAbbr, teams.get(homeAbbr), String(live?.home_team.id ?? `home-${row.game_id}`))
  const awayScore = live?.visitor_team_score ?? row.away_score
  const homeScore = live?.home_team_score ?? row.home_score
  const detail = live?.summary ?? live?.status ?? (status.state === 'post' ? 'Final' : 'Scheduled')
  return {
    id: row.game_id,
    appHref: `/the-sideline?date=${row.gameday}&game=${encodeURIComponent(row.game_id)}`,
    uid: `slipsurge:nfl:game:${row.game_id}`,
    date: kickoff?.toISOString() ?? `${row.gameday}T12:00:00.000Z`,
    name: `${away.displayName} at ${home.displayName}`,
    shortName: `${awayAbbr} @ ${homeAbbr}`,
    status: {
      clock: 0,
      displayClock: '',
      period: 0,
      type: {
        id: live?.status_state ?? 'scheduled',
        name: detail,
        state: status.state,
        completed: status.completed,
        description: detail,
        detail,
        shortDetail: detail,
      },
    },
    competitions: [{
      id: String(live?.id ?? row.game_id),
      competitors: [
        { id: away.id, uid: away.uid, type: 'team', order: 0, homeAway: 'away', team: away, score: String(awayScore ?? 0) },
        { id: home.id, uid: home.uid, type: 'team', order: 1, homeAway: 'home', team: home, score: String(homeScore ?? 0) },
      ],
      venue: row.stadium ? { fullName: row.stadium, address: { city: '', state: '' } } : undefined,
    }],
  }
}

/**
 * Server-owned fallback for Live Scores. ESPN is useful when available, but
 * an upstream denial must never remove an NFL slate already stored by us.
 */
export async function getStoredNflScoreboard(date: string): Promise<ESPNGame[]> {
  const { rows, teams } = await loadStoredSlate(date)
  if (!rows.length) return []
  const teamMap = new Map(teams.map(team => [canonical(team.team_abbr), team]))
  const pools = new Map<string, ApiGame[]>()
  await Promise.all(Array.from(new Set(rows.map(row => `${row.season}:${row.week}`))).map(async key => {
    const [season, week] = key.split(':').map(Number)
    try {
      pools.set(key, await getNflBdlGames(season, week, 'live'))
    } catch (error) {
      console.error('[nfl-scoreboard] live scores unavailable; using stored schedule', key, error)
      pools.set(key, [])
    }
  }))
  return rows.map(row => {
    const game = matchNflBdlGame(pools.get(`${row.season}:${row.week}`) ?? [], {
      id: row.game_id,
      season: row.season,
      week: row.week,
      gameType: row.game_type,
      gameday: row.gameday,
      away: { abbr: row.away_team },
      home: { abbr: row.home_team },
    })
    return mapStoredGame(row, teamMap, game)
  })
}
