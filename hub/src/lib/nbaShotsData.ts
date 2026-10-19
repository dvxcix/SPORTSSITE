import 'server-only'
import { bdlHeaders } from './balldontlie'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import type { NbaPlay } from './nbaShots'
export async function getNbaPlays(game: number, season: number) {
  if (season < 2025) throw new Error('Shot locations start in the 2025 season')
  return nbaSharedCache(`plays:v1:${game}`, 604800, 604800, async () => {
    const response = await fetch(`https://api.balldontlie.io/v1/plays?game_id=${game}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('NBA play feed unavailable')
    const body = await response.json() as { data: NbaPlay[]; meta?: { next_cursor?: number | null } }
    if (!Array.isArray(body.data) || body.meta?.next_cursor != null || body.data.some(play => play.game_id !== game || !Number.isSafeInteger(play.order) || play.order < 0 || !Array.isArray(play.participants))) throw new Error('NBA play identity or coverage invalid')
    const unique = [...new Map(body.data.map(play => [play.order, play])).values()]
    if (unique.length) {
      const { error } = await createAdminClient().from('nba_game_plays').upsert(unique.map(play => ({ game_id: game, play_order: play.order, season, payload: play, fetched_at: new Date().toISOString() })), { onConflict: 'game_id,play_order' })
      if (error) throw new Error('NBA play archive unavailable')
    }
    return unique
  })
}
