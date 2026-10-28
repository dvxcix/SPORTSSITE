import type { PaintGame } from './nbaPaint'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'
import type { NbaFirstBook } from './nbaBookFirstData'
import { MGM_MILESTONE_PANELS } from './scrapers/nbaBookPropQuotes'

const MINUTE = 60_000, HOUR = 60 * MINUTE
export const NBA_BOOK_FAMILIES = [...new Set(Object.values(MGM_MILESTONE_PANELS))]
export type NbaBookAttemptStatus = 'attempting' | 'captured' | 'unavailable' | 'failed' | 'deferred'
export type NbaBookFamilyState = { attemptedAt: number; successAt: number | null; retryAt: number; failures: number; status: NbaBookAttemptStatus }
export type NbaBookScheduleState = { version: 1; gameId: number; tipoff: number; markets: Record<string, NbaBookFamilyState> }
export type NbaBookCircuit = { version: 1; failures: number; retryAt: number }
export type NbaBookCapturePlan = { game: PaintGame; first: boolean; regularMarkets: string[]; families: string[] }
export type NbaBookOutcome = { family: string; status: 'captured' | 'unavailable' | 'failed' | 'budget-deferred'; observedAt?: string }
export const nbaBookScheduleKey = (book: NbaFirstBook, game: PaintGame) => `book-cadence:v1:${book}:${game.id}:${nbaGameStart(game)}`
export const nbaBookCircuitKey = (book: NbaFirstBook) => `book-circuit:v1:${book}`
export const nbaBookFamilies = (book: NbaFirstBook) => book === 'draftkings' ? ['first'] : ['first', ...NBA_BOOK_FAMILIES]
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Scheduling metadata is never a quote observation or a success receipt. */
export function nbaValidBookSchedule(value: unknown, book: NbaFirstBook, game: PaintGame): value is NbaBookScheduleState {
  if (!object(value) || value.version !== 1 || value.gameId !== game.id || value.tipoff !== nbaGameStart(game) || !object(value.markets)) return false
  return Object.entries(value.markets).every(([family, state]) => nbaBookFamilies(book).includes(family) && object(state)
    && ['attempting', 'captured', 'unavailable', 'failed', 'deferred'].includes(String(state.status))
    && Number.isSafeInteger(state.attemptedAt) && Number(state.attemptedAt) > 0
    && (state.successAt === null || Number.isSafeInteger(state.successAt) && Number(state.successAt) > 0 && Number(state.successAt) <= Number(state.attemptedAt))
    && Number.isSafeInteger(state.retryAt) && Number(state.retryAt) >= Number(state.attemptedAt)
    && Number.isInteger(state.failures) && Number(state.failures) >= 0 && Number(state.failures) <= 8)
}
export function nbaValidBookCircuit(value: unknown): value is NbaBookCircuit {
  return object(value) && value.version === 1 && Number.isInteger(value.failures) && Number(value.failures) >= 0 && Number(value.failures) <= 8
    && Number.isSafeInteger(value.retryAt) && Number(value.retryAt) >= 0
}
export function nbaBookCadence(game: PaintGame, now: number) {
  const until = (nbaGameStart(game) ?? now) - now
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  if (game.date > today) return 3 * HOUR
  return until <= 90 * MINUTE ? 30 * MINUTE : until <= 6 * HOUR ? 2 * HOUR : 4 * HOUR
}
export function nbaBookFailureBackoff(failures: number) { return Math.min(6 * HOUR, 30 * MINUTE * 2 ** Math.max(0, Math.min(4, failures - 1))) }

export function planNbaBookCapture(game: PaintGame, book: NbaFirstBook, state?: NbaBookScheduleState, circuit?: NbaBookCircuit, now = Date.now()): NbaBookCapturePlan {
  const families = !nbaPregameOpen(game, now) || (circuit?.retryAt ?? 0) > now ? [] : nbaBookFamilies(book).filter(family => {
    const prior = state?.markets[family]
    if (!prior) return true
    if (prior.retryAt > now) return false
    // As tip approaches the ordinary cadence tightens, but failure cooldowns
    // above are absolute and cannot be bypassed by entering another time band.
    return now - prior.attemptedAt >= nbaBookCadence(game, now)
  })
  return { game, first: families.includes('first'), regularMarkets: families.filter(family => family !== 'first'), families }
}
export function reserveNbaBookCapture(plan: NbaBookCapturePlan, prior: NbaBookScheduleState | undefined, now: number): NbaBookScheduleState {
  const markets = { ...prior?.markets }
  for (const family of plan.families) markets[family] = { attemptedAt: now, successAt: markets[family]?.successAt ?? null, retryAt: now + 30 * MINUTE, failures: markets[family]?.failures ?? 0, status: 'attempting' }
  return { version: 1, gameId: plan.game.id, tipoff: nbaGameStart(plan.game)!, markets }
}
export function finishNbaBookCapture(plan: NbaBookCapturePlan, reserved: NbaBookScheduleState, outcomes: NbaBookOutcome[], now: number): NbaBookScheduleState {
  const markets = { ...reserved.markets }
  for (const family of plan.families) {
    const prior = markets[family], matches = outcomes.filter(outcome => outcome.family === family), outcome = matches.length === 1 ? matches[0] : undefined
    const observed = Date.parse(outcome?.observedAt ?? '')
    if (outcome?.status === 'captured' && Number.isFinite(observed) && observed >= prior.attemptedAt && observed <= now && observed < reserved.tipoff) {
      markets[family] = { attemptedAt: now, successAt: observed, retryAt: now, failures: 0, status: 'captured' }
    } else if (outcome?.status === 'unavailable') {
      markets[family] = { ...prior, attemptedAt: now, retryAt: now, failures: 0, status: 'unavailable' }
    } else if (outcome?.status === 'budget-deferred') {
      // Admission denial is not evidence that this market failed or vanished.
      markets[family] = { ...prior, attemptedAt: now, retryAt: now + 30 * MINUTE, status: 'deferred' }
    } else {
      const failures = Math.min(8, prior.failures + 1)
      markets[family] = { ...prior, attemptedAt: now, retryAt: now + nbaBookFailureBackoff(failures), failures, status: 'failed' }
    }
  }
  return { ...reserved, markets }
}
