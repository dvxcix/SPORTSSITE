import type { SupabaseClient } from '@supabase/supabase-js'

type ScheduleGame = {
  gamePk: number
  officialDate?: string
  gameType?: string
  status: { abstractGameState: string }
}

// Schedule responses can include rescheduled games with a different official
// date. The pitch importer keys by officialDate, not the response bucket.
export function finalPitchGamesForDate(games: ScheduleGame[], date: string): number[] {
  return [...new Set(games.filter(game =>
    game.status.abstractGameState === 'Final'
    && game.officialDate === date
    && (!game.gameType || game.gameType === 'R')
  ).map(game => game.gamePk))]
}

// A failed read is NOT an empty table. Retry transient reads, then surface the
// error to pipeline telemetry without sending a fabricated missing-data alert.
export async function latestPitchLogDate(admin: SupabaseClient, season: number): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin.from('player_pitch_log')
      .select('game_date').eq('season', season)
      .order('game_date', { ascending: false }).limit(1)
    if (!error) return data?.[0]?.game_date ?? null
    if (attempt === 2 || !['57014', 'PGRST000', 'PGRST001', 'PGRST002'].includes(error.code)) throw error
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
  }
  throw new Error('Pitch freshness query exhausted retries')
}
