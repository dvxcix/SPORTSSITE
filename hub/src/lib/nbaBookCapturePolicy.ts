import type { PaintGame } from './nbaPaint'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'
import type { NbaFirstBook } from './nbaBookFirstData'
import { MGM_MILESTONE_PANELS } from './scrapers/nbaBookPropQuotes'

const MINUTE = 60_000, HOUR = 60 * MINUTE
/** Day-before opening and two pregame checks. */
export const NBA_BOOK_CHECKPOINT_HOURS = [24, 4, 1] as const
// Previously saved 12-hour receipts remain valid when the schedule changes.
const NBA_BOOK_ACCEPTED_CHECKPOINT_HOURS = [24, 12, 4, 1] as const
export const NBA_BOOK_FAMILIES = [...new Set(Object.values(MGM_MILESTONE_PANELS))]
export type NbaBookAttemptStatus = 'attempting' | 'captured' | 'unavailable' | 'failed' | 'deferred'
export type NbaBookFamilyState = { attemptedAt: number; successAt: number | null; retryAt: number; failures: number; status: NbaBookAttemptStatus; checkpointAt?: number; checkpointAttempts?: number }
export type NbaBookScheduleState = { version: 1; gameId: number; tipoff: number; markets: Record<string, NbaBookFamilyState> }
export type NbaBookCircuit = { version: 1; failures: number; retryAt: number }
export type NbaBookCapturePlan = { game: PaintGame; first: boolean; regularMarkets: string[]; families: string[] }
export type NbaBookOutcome = { family: string; status: 'captured' | 'unavailable' | 'failed' | 'budget-deferred' | 'work-deferred'; observedAt?: string; budgetReason?: string }
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
    && Number.isInteger(state.failures) && Number(state.failures) >= 0 && Number(state.failures) <= 8
    && (state.checkpointAt === undefined && state.checkpointAttempts === undefined
      || Number.isSafeInteger(state.checkpointAt) && NBA_BOOK_ACCEPTED_CHECKPOINT_HOURS.some(hours => state.checkpointAt === Number(value.tipoff) - hours * HOUR)
        && Number(state.checkpointAt) <= Number(state.attemptedAt)
        && Number.isInteger(state.checkpointAttempts) && Number(state.checkpointAttempts) >= 0 && Number(state.checkpointAttempts) <= 2))
}
export function nbaValidBookCircuit(value: unknown): value is NbaBookCircuit {
  return object(value) && value.version === 1 && Number.isInteger(value.failures) && Number(value.failures) >= 0 && Number(value.failures) <= 8
    && Number.isSafeInteger(value.retryAt) && Number(value.retryAt) >= 0
}
export function nbaBookCheckpoint(game: PaintGame, now: number): number | null {
  const tip = nbaGameStart(game)
  if (tip === null || !nbaPregameOpen(game, now)) return null
  return NBA_BOOK_CHECKPOINT_HOURS.map(hours => tip - hours * HOUR).filter(at => at <= now).at(-1) ?? null
}
export function nbaBookFailureBackoff(failures: number) { return Math.min(6 * HOUR, 30 * MINUTE * 2 ** Math.max(0, Math.min(4, failures - 1))) }

export function planNbaBookCapture(game: PaintGame, book: NbaFirstBook, state?: NbaBookScheduleState, circuit?: NbaBookCircuit, now = Date.now()): NbaBookCapturePlan {
  const checkpoint = nbaBookCheckpoint(game, now)
  const families = checkpoint === null || (circuit?.retryAt ?? 0) > now ? [] : nbaBookFamilies(book).filter(family => {
    const prior = state?.markets[family]
    if (!prior) return true
    if (prior.retryAt > now) return false
    // A real quote read after this boundary already covers it. A run reserved
    // in an earlier slot that merely finishes after the boundary does not.
    if (prior.status === 'captured') return prior.successAt === null || prior.successAt < checkpoint
    if (prior.checkpointAt !== undefined ? prior.checkpointAt < checkpoint : prior.attemptedAt < checkpoint) return true
    // A successful or verified unavailable attempt satisfies this checkpoint.
    // Failures get at most one bounded retry; an admission denial was not a
    // browser launch and is not charged against the per-checkpoint attempt cap.
    if (prior.status === 'unavailable') return false
    const attempts = prior.checkpointAt !== undefined && prior.checkpointAt >= checkpoint ? prior.checkpointAttempts ?? 0 : 1
    return prior.status === 'deferred' || attempts < 2
  })
  return { game, first: families.includes('first'), regularMarkets: families.filter(family => family !== 'first'), families }
}
export function reserveNbaBookCapture(plan: NbaBookCapturePlan, prior: NbaBookScheduleState | undefined, now: number): NbaBookScheduleState {
  const markets = { ...prior?.markets }
  const checkpoint = nbaBookCheckpoint(plan.game, now)
  if (checkpoint === null) throw new Error('NBA book checkpoint is unavailable')
  for (const family of plan.families) {
    const before = markets[family]
    const attempts = before?.checkpointAt !== undefined && before.checkpointAt >= checkpoint ? before.checkpointAttempts ?? 0
      : before?.checkpointAt !== undefined ? 0
        : before?.status === 'captured' && (before.successAt === null || before.successAt < checkpoint) ? 0
          : before && before.attemptedAt >= checkpoint ? 1 : 0
    markets[family] = { attemptedAt: now, successAt: before?.successAt ?? null, retryAt: now + 30 * MINUTE, failures: before?.failures ?? 0, status: 'attempting', checkpointAt: checkpoint, checkpointAttempts: Math.min(2, attempts + 1) }
  }
  return { version: 1, gameId: plan.game.id, tipoff: nbaGameStart(plan.game)!, markets }
}
export function finishNbaBookCapture(plan: NbaBookCapturePlan, reserved: NbaBookScheduleState, outcomes: NbaBookOutcome[], now: number): NbaBookScheduleState {
  const markets = { ...reserved.markets }
  for (const family of plan.families) {
    const prior = markets[family], matches = outcomes.filter(outcome => outcome.family === family), outcome = matches.length === 1 ? matches[0] : undefined
    const observed = Date.parse(outcome?.observedAt ?? '')
    if (outcome?.status === 'captured' && Number.isFinite(observed) && observed >= prior.attemptedAt && observed <= now && observed < reserved.tipoff) {
      markets[family] = { ...prior, attemptedAt: now, successAt: observed, retryAt: now, failures: 0, status: 'captured' }
    } else if (outcome?.status === 'unavailable') {
      markets[family] = { ...prior, attemptedAt: now, retryAt: now, failures: 0, status: 'unavailable' }
    } else if (outcome?.status === 'work-deferred') {
      // No source inspection was performed in this lane; keep it eligible.
      markets[family] = { ...prior, attemptedAt: now, retryAt: now, status: 'deferred', checkpointAttempts: Math.max(0, (prior.checkpointAttempts ?? 1) - 1) }
    } else if (outcome?.status === 'budget-deferred') {
      // Admission denial is not evidence that this market failed or vanished.
      // A verified busy lane did not start a browser; the next scheduler check
      // may try it again. Exhausted or unverifiable budgets retain backoff.
      markets[family] = { ...prior, attemptedAt: now, retryAt: outcome.budgetReason === 'session-busy' ? now : now + 30 * MINUTE, status: 'deferred', checkpointAttempts: Math.max(0, (prior.checkpointAttempts ?? 1) - 1) }
    } else {
      const failures = Math.min(8, prior.failures + 1)
      markets[family] = { ...prior, attemptedAt: now, retryAt: now + nbaBookFailureBackoff(failures), failures, status: 'failed' }
    }
  }
  return { ...reserved, markets }
}
