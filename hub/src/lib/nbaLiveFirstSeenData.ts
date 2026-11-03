import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaGameStart } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

/** A first Live observation is only comparable while the resolved boundary
 * still agrees with durable storage and no pregame capture is known to fall
 * after it. A revised earlier tip can make the first Live record incomplete.
 * Results are shared per game/cutoff; no subscriber starts a collector. */
export async function nbaLiveFirstSeenConfident(game: PaintGame): Promise<boolean> {
  const start = nbaGameStart(game)
  if (start == null) throw new Error('NBA live boundary unavailable')
  const tipoff = new Date(start).toISOString()
  return (await nbaSharedCache(`live-first-confidence:v1:${game.id}:${tipoff}`, 60, 0, async () => {
    const admin = createAdminClient()
    const { data: cutoff, error } = await admin.rpc('nba_phase_cutoff', { p_game_id: game.id, p_tipoff: tipoff }).abortSignal(AbortSignal.timeout(10_000))
    const canonical = typeof cutoff === 'string' ? Date.parse(cutoff) : NaN
    if (error || !Number.isFinite(canonical) || canonical > start) throw new Error('NBA live boundary unavailable')
    if (canonical < start) return false
    const checks = await Promise.all([
      admin.from('nba_odds_phase_captures').select('id').eq('game_id', game.id).eq('mode', 'pregame').eq('feed', 'props').gte('captured_at', tipoff).limit(1).abortSignal(AbortSignal.timeout(10_000)),
      admin.from('nba_market_captures').select('id').eq('game_id', game.id).gte('captured_at', tipoff).limit(1).abortSignal(AbortSignal.timeout(10_000)),
      admin.from('nba_book_quote_captures').select('id').eq('game_id', game.id).eq('mode', 'pregame').eq('feed', 'props').gte('observed_at', tipoff).limit(1).abortSignal(AbortSignal.timeout(10_000)),
    ])
    if (checks.some(result => result.error || !Array.isArray(result.data))) throw new Error('NBA live boundary unavailable')
    return checks.every(result => result.data!.length === 0)
  }, 25)).value
}
