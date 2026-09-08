import { createAdminClient } from '@/lib/supabase/admin'

export type NflPikkitScheduleGame = {
  gameId: string
  season: number
  week: number
  gameType: string
  gameDate: string
  gameTime: string | null
  awayAbbr: string
  homeAbbr: string
  awayName: string
  homeName: string
}

function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function isPregame(game: NflPikkitScheduleGame, today: string, nowTime: string) {
  if (game.gameDate > today) return true
  if (game.gameDate < today) return false
  return !game.gameTime || game.gameTime > nowTime
}

export async function getUpcomingNflPikkitGames(days = 7) {
  const admin = createAdminClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const nowTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
  const { data: schedule, error } = await admin
    .from('nfl_schedule')
    .select('game_id,season,week,game_type,gameday,gametime,away_team,home_team')
    .gte('gameday', today)
    .lte('gameday', dateOffset(today, days))
    .order('gameday')
    .order('gametime')
    .limit(40)
  if (error) throw new Error(`NFL schedule unavailable: ${error.message}`)
  if (!schedule?.length) return []

  const abbreviations = Array.from(new Set(schedule.flatMap(game => [game.away_team, game.home_team])))
  const { data: teams, error: teamsError } = await admin.from('nfl_teams').select('team_abbr,team_name').in('team_abbr', abbreviations)
  if (teamsError) throw new Error(`NFL teams unavailable: ${teamsError.message}`)
  const names = new Map((teams ?? []).map(team => [team.team_abbr, team.team_name]))

  return schedule.map(game => ({
    gameId: game.game_id,
    season: game.season,
    week: game.week,
    gameType: game.game_type,
    gameDate: game.gameday,
    gameTime: game.gametime,
    awayAbbr: game.away_team,
    homeAbbr: game.home_team,
    awayName: names.get(game.away_team) ?? game.away_team,
    homeName: names.get(game.home_team) ?? game.home_team,
  } satisfies NflPikkitScheduleGame)).filter(game => isPregame(game, today, nowTime))
}
