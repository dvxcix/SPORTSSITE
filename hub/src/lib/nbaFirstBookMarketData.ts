import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaGameStart, nbaPregameOpen, nbaLiveOpen, nbaQuoteInMode, type NbaOddsMode } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'
import type { NbaFirstApiFrame } from './nbaFirstBookMarkets'

export async function saveNbaFirstApiFrames(game: PaintGame, mode: NbaOddsMode, frames: NbaFirstApiFrame[]) {
  const now = Date.now(), start = nbaGameStart(game)
  if (start == null || !(mode === 'pregame' ? nbaPregameOpen(game, now) : nbaLiveOpen(game, now)) || frames.length > 32
    || frames.some(frame => !nbaQuoteInMode({ updated_at: frame.observedAt }, game, mode, now) || now - Date.parse(frame.observedAt) > 300_000
      || frame.props.some(quote => quote.game_id !== game.id || quote.vendor !== frame.book || quote.prop_type !== frame.market || Date.parse(quote.updated_at) !== Date.parse(frame.observedAt)))) throw new Error('First Basket book observation unavailable')
  if (!frames.length) return { captured: 0, unchanged: 0, skipped: 0 }
  const { data, error } = await createAdminClient().rpc('record_nba_first_api_frames', { p_game_id: game.id, p_game_date: game.date, p_mode: mode, p_tipoff: new Date(start).toISOString(), p_frames: frames }).abortSignal(AbortSignal.timeout(12_000))
  if (error || !data || !['captured', 'unchanged', 'skipped'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0)
    || data.captured + data.unchanged + data.skipped !== frames.length) throw new Error('First Basket book observations could not be saved')
  return data as { captured: number; unchanged: number; skipped: number }
}
