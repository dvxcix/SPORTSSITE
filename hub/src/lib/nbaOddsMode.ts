import type { PaintGame } from './nbaPaint'

export type NbaOddsMode = 'pregame' | 'live'
export const nbaOddsMode = (value: unknown): NbaOddsMode => value === 'live' ? 'live' : 'pregame'
export type NbaQuoteTimeReason = 'invalid-clock' | 'future' | 'wrong-phase' | 'expired'
type GameClock = Pick<PaintGame, 'datetime' | 'status'> & Partial<Pick<PaintGame, 'status_state' | 'period'>>

export function nbaGameStart(game: GameClock): number | null {
  const start = Date.parse(game.datetime ?? game.status)
  return Number.isFinite(start) ? start : null
}
export function nbaGameFinal(game: GameClock) {
  return game.status_state === 'final' || /^final\b/i.test(game.status)
}
export function nbaPregameOpen(game: GameClock, now = Date.now()) {
  const start = nbaGameStart(game)
  return start != null && now < start && !nbaGameFinal(game) && game.status_state !== 'in_progress' && !(Number(game.period) > 0)
}
export function nbaLiveOpen(game: GameClock, now = Date.now()) {
  const start = nbaGameStart(game)
  return start != null && now >= start && !nbaGameFinal(game) && (game.status_state === 'in_progress' || Number(game.period) > 0)
}
/** A provider response can straddle tipoff. Check each quote as well as the
 * request's game clock; an unchanged pregame quote is never a live observation. */
export function nbaQuoteInMode(quote: { updated_at: string }, game: GameClock, mode: NbaOddsMode, now = Date.now()) {
  const start = nbaGameStart(game), updated = Date.parse(quote.updated_at)
  return start != null && Number.isFinite(updated) && updated <= now && (mode === 'pregame' ? updated < start : updated >= start)
}

/** Private rejection evidence only. This formats a caller's existing decision;
 * it never accepts a quote, changes its timestamp or applies clock tolerance. */
export function nbaQuoteTimeEvidence(updatedAt: string, game: GameClock, reason: NbaQuoteTimeReason, checkedAt = Date.now()) {
  const time = Date.parse(updatedAt), tip = nbaGameStart(game)
  return { reason, quoteAt: Number.isFinite(time) ? new Date(time).toISOString() : null, checkedAt: new Date(checkedAt).toISOString(), tipoff: tip == null ? null : new Date(tip).toISOString(), ageMs: Number.isFinite(time) ? Math.max(-86_400_000, Math.min(86_400_000, checkedAt - time)) : null }
}
