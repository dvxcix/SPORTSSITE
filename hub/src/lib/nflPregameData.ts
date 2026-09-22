import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { pregameDvp } from './nflPregameHistory'

export const getNflPregameWeekly = unstable_cache(async (season: number, beforeWeek: number, phase = 'REG') => {
  const admin = createAdminClient()
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; offset < 30000; offset += 1000) {
    const { data, error } = await admin.from('nfl_player_stats').select('player_id,player_display_name,position,recent_team,opponent_team,week,game_id,completions,attempts,passing_yards,passing_tds,interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,special_teams_tds,receiving_air_yards')
      .eq('season', season).eq('season_type', phase).gt('week', 0).lt('week', beforeWeek)
      .order('week').order('player_id').range(offset, offset + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
  throw new Error('NFL weekly history exceeded paging bound')
}, ['nfl-pregame-weekly-v1'], { revalidate: 300, tags: ['sideline:nfl-data'] })

export async function getNflPregameDvp(season: number, beforeWeek: number, phase = 'REG') {
  return { data: pregameDvp(await getNflPregameWeekly(season, beforeWeek, phase)) }
}
