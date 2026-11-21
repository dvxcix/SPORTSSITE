import type { FirstBasketRow } from './nbaFirstBasketOdds'
import { nbaGameFinal, nbaGameStart, nbaLiveOpen, nbaPregameOpen, nbaQuoteInMode, type NbaOddsMode } from './nbaOddsMode'

export const NBA_FIRST_QUOTE_MAX_AGE = 300_000
/** Advance the server clock with monotonic elapsed time. A wrong device clock
 * cannot revive an expired quote. Request elapsed time is conservative. */
export function nbaFirstQuoteClock(fetchedAt: string, requestStarted: number, monotonicNow: number) {
  const server = Date.parse(fetchedAt), elapsed = monotonicNow - requestStarted
  return Number.isFinite(server) && Number.isFinite(elapsed) && elapsed >= 0 ? server + elapsed : NaN
}
export function nbaFirstQuoteVisible(row: FirstBasketRow, mode: NbaOddsMode, now: number, frozenGameIds: readonly number[] = []) {
  if (!Number.isFinite(now) || !nbaQuoteInMode(row.offer, row.game, mode, now)) return false
  const start = nbaGameStart(row.game)
  // Crossing tip in the browser is not proof of an archived frame. Wait for
  // the server's durable snapshot before showing the pregame close again.
  if (frozenGameIds.includes(row.game.id)) return start != null && (mode === 'pregame' ? now >= start : nbaGameFinal(row.game))
  if (!(mode === 'pregame' ? nbaPregameOpen(row.game, now) : nbaLiveOpen(row.game, now))) return false
  return now - Date.parse(row.offer.updated_at) <= NBA_FIRST_QUOTE_MAX_AGE
}
