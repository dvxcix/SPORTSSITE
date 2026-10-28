import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { pregameDvp } from './nflPregameHistory'

async function loadNflPregameWeekly(season: number, beforeWeek: number, phase: string) {
  const admin = createAdminClient()
  const rows: Record<string, unknown>[] = []
  const deadline = Date.now() + 40_000
  for (let offset = 0; offset < 30000; offset += 1000) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('NFL pregame weekly history timed out')
    const { data, error } = await admin.from('nfl_player_stats').select('player_id,player_display_name,position,recent_team,opponent_team,week,game_id,completions,attempts,passing_yards,passing_tds,interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,special_teams_tds,receiving_air_yards')
      .eq('season', season).eq('season_type', phase).gt('week', 0).lt('week', beforeWeek)
      .order('week').order('player_id').range(offset, offset + 999)
      .abortSignal(AbortSignal.timeout(Math.min(10000, remaining)))
    if (error || !Array.isArray(data)) throw new Error('NFL pregame weekly history unavailable')
    if (Date.now() >= deadline) throw new Error('NFL pregame weekly history timed out')
    rows.push(...data)
    if (data.length < 1000) return rows
  }
  throw new Error('NFL weekly history exceeded paging bound')
}

export async function getNflPregameWeekly(season: number, beforeWeek: number, phase = 'REG') {
  if (!Number.isSafeInteger(season) || season < 1900 || season > 2200 || !Number.isSafeInteger(beforeWeek) || beforeWeek < 0 || beforeWeek > 100 || !['PRE', 'REG', 'POST'].includes(phase)) {
    throw new Error('Invalid NFL pregame history scope')
  }
  // Next bypasses nested unstable_cache reads when one matchup cache calls
  // another. A service-only shared lease coalesces league-wide history across
  // games and server instances. Failures never replace a complete observation;
  // the five-minute stale allowance retains the original fetched_at.
  const key = `nfl:pregame-weekly:v2:${season}:${phase}:${beforeWeek}`
  return (await nbaSharedCache(key, 300, 300, () => loadNflPregameWeekly(season, beforeWeek, phase))).value
}

export async function getNflPregameDvp(season: number, beforeWeek: number, phase = 'REG') {
  return { data: pregameDvp(await getNflPregameWeekly(season, beforeWeek, phase)) }
}
