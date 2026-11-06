import { createHash } from 'node:crypto'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
export const NBA_PUBLIC_CHECKPOINT_HOURS = [24, 12, 4, 1] as const
/** A bounded admin selection still passes every normal due/lease/budget gate. */
export function nbaPublicCaptureSelection(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12
    || value.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 9_999_999_999)
    || new Set(value).size !== value.length) return null
  return value as number[]
}
export type NbaPublicOutcome = 'running' | 'captured' | 'partial' | 'unavailable' | 'failed' | 'auth' | 'ready'
export type NbaPublicControl = {
  version: 1; outcome: NbaPublicOutcome; attemptedAt: string; nextAttemptAt: string
  failures: number; successAt: string | null; checkpointAt?: number; checkpointAttempts?: number
}
type Game = Pick<PaintGame, 'id' | 'datetime' | 'status'> & Partial<Pick<PaintGame, 'status_state' | 'period' | 'date'>>
export const nbaPublicGameControlKey = (game: Game, parser: string) => `public-control:v1:${parser}:${game.id}:${nbaGameStart(game)}`
// The persisted browser identity is never written into receipt keys or payloads.
export const nbaPublicContextControlKey = (context: string) => `public-context-control:v1:${createHash('sha256').update(context).digest('hex')}`

export function nbaValidPublicControl(value: unknown): value is NbaPublicControl {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as NbaPublicControl
  const at = Date.parse(row.attemptedAt), next = Date.parse(row.nextAttemptAt)
  return row.version === 1 && ['running', 'captured', 'partial', 'unavailable', 'failed', 'auth', 'ready'].includes(row.outcome)
    && Number.isSafeInteger(row.failures) && row.failures >= 0 && row.failures <= 20
    && typeof row.attemptedAt === 'string' && Number.isFinite(at)
    && typeof row.nextAttemptAt === 'string' && Number.isFinite(next) && next >= at && next <= at + 4 * HOUR
    && (row.successAt === null || typeof row.successAt === 'string' && Number.isFinite(Date.parse(row.successAt)) && Date.parse(row.successAt) <= at + MINUTE)
    && (row.checkpointAt === undefined && row.checkpointAttempts === undefined
      || Number.isSafeInteger(row.checkpointAt) && Number(row.checkpointAt) > 0 && Number(row.checkpointAt) <= at
        && at - Number(row.checkpointAt) <= 24 * HOUR
        && Number.isInteger(row.checkpointAttempts) && Number(row.checkpointAttempts) >= 1 && Number(row.checkpointAttempts) <= 2)
}

export function nbaPublicCaptureDecision(game: Game, previousSuccess: string | null, control: NbaPublicControl | undefined, now = Date.now()) {
  const start = nbaGameStart(game)
  if (start == null || !nbaPregameOpen(game, now)) return { due: false, reason: 'started-or-invalid', targetAt: null, slotHours: null }
  if (control && Date.parse(control.nextAttemptAt) > now) return { due: false, reason: 'cooldown', targetAt: control.nextAttemptAt, slotHours: null }
  const success = Date.parse(control?.successAt ?? previousSuccess ?? '')
  // A late first capture satisfies every earlier checkpoint. Never replay missed
  // slots or rewrite their historical observation times.
  const slot = NBA_PUBLIC_CHECKPOINT_HOURS.map(slotHours => ({ slotHours, at: start - slotHours * HOUR }))
    .filter(slot => now >= slot.at).at(-1)
  if (!slot) return { due: false, reason: 'before-first-checkpoint', targetAt: new Date(start - 24 * HOUR).toISOString(), slotHours: null }
  if (Number.isFinite(success) && success >= slot.at && success < start && success <= now + MINUTE) {
    return { due: false, reason: 'fresh-for-current-slot', targetAt: new Date(slot.at).toISOString(), slotHours: slot.slotHours }
  }
  // A newly introduced or long-overdue intermediate checkpoint should not
  // launch another browser just before the existing four-hour capture. Do not
  // delay a missing baseline or a retry that has already started this slot.
  const attemptedThisSlot = control?.checkpointAt !== undefined ? control.checkpointAt >= slot.at
    : !!control && Date.parse(control.attemptedAt) >= slot.at
  if (slot.slotHours === 12 && now >= start - 5 * HOUR && Number.isFinite(success)
    && success < slot.at && success < start && success <= now + MINUTE && !attemptedThisSlot) {
    return { due: false, reason: 'next-checkpoint-near', targetAt: new Date(start - 4 * HOUR).toISOString(), slotHours: 4 }
  }
  // Persisted repeated failures should not spend a browser on every scheduler
  // tick. A new canonical checkpoint is still eligible; partial observations
  // remain failures and never acquire a fabricated success timestamp.
  const attempts = control?.checkpointAt !== undefined && control.checkpointAt >= slot.at ? control.checkpointAttempts ?? 0
    : control?.checkpointAt !== undefined ? 0
      : control && Date.parse(control.attemptedAt) >= slot.at ? Math.min(2, control.failures || 1) : 0
  if (control && attempts >= 2 && ['running', 'partial', 'unavailable', 'failed', 'auth'].includes(control.outcome)) {
    return { due: false, reason: 'checkpoint-attempt-limit', targetAt: new Date(slot.at).toISOString(), slotHours: slot.slotHours }
  }
  return { due: true, reason: `t-${slot.slotHours}h`, targetAt: new Date(slot.at).toISOString(), slotHours: slot.slotHours }
}

/** Group only first T−12h attempts with a verified earlier success. This is
 * bounded to one hour/six games and never holds retries or urgent work. */
export function nbaPublicIntermediateCohortHold<T extends Game>(due: readonly T[], schedule: readonly T[], controls: ReadonlyMap<string, NbaPublicControl>, parser: string, previous: (id: number) => string | null, now: number): number | null {
  if (!due.length || !Number.isFinite(now)) return null
  const firstAttempt = (game: T, at: number) => {
    const start = nbaGameStart(game), state = controls.get(nbaPublicGameControlKey(game, parser))
    if (start === null || !state || state.outcome !== 'captured' || !state.successAt) return false
    const checkpoint = start - 12 * HOUR, success = Date.parse(state.successAt), attempted = Date.parse(state.attemptedAt)
    const decision = nbaPublicCaptureDecision(game, previous(game.id), state, at)
    return Number.isFinite(success) && success < checkpoint && Number.isFinite(attempted) && attempted < checkpoint
      && decision.slotHours === 12 && decision.due
  }
  if (!due.every(game => firstAttempt(game, now))) return null
  const first = Math.min(...due.map(game => nbaGameStart(game)! - 12 * HOUR)), deadline = first + HOUR
  if (now >= deadline) return null
  const joins = schedule.filter(game => {
    const start = nbaGameStart(game)
    if (start === null || !['scheduled', 'unknown', undefined].includes(game.status_state) || !nbaPregameOpen(game, now)) return false
    const target = start - 12 * HOUR
    return target > now && target <= deadline && firstAttempt(game, target)
  })
  if (!joins.length || due.length + joins.length > 6) return null
  const release = Math.max(...joins.map(game => nbaGameStart(game)! - 12 * HOUR))
  // Account for the next cron tick and bounded browser run; keep this well
  // before the unchanged T−4h and T−1h checkpoints.
  if (due.some(game => nbaGameStart(game)! - (release + 35 * MINUTE) < 6 * HOUR)) return null
  return release
}

/** Delay only unattempted day-before work when another game will become due
 * shortly. The scheduler still rechecks each game's normal capture decision. */
export function nbaPublicCohortHold<T extends Game>(due: readonly T[], schedule: readonly T[], controls: ReadonlyMap<string, NbaPublicControl>, parser: string, previous: (id: number) => string | null, now: number): number | null {
  if (!due.length || !Number.isFinite(now)) return null
  const targets: number[] = []
  for (const game of due) {
    const decision = nbaPublicCaptureDecision(game, previous(game.id), controls.get(nbaPublicGameControlKey(game, parser)), now)
    if (!decision.due || decision.slotHours !== 24 || controls.has(nbaPublicGameControlKey(game, parser)) || previous(game.id)) return null
    const start = nbaGameStart(game)
    if (start == null || !game.date || !/^\d{4}-\d{2}-\d{2}$/.test(game.date)) return null
    targets.push(start - 24 * HOUR)
  }
  const first = Math.min(...targets), deadline = first + 30 * MINUTE
  if (now >= deadline) return null
  const joins = schedule.filter(game => {
    const start = nbaGameStart(game)
    return start != null && ['scheduled', 'unknown', undefined].includes(game.status_state) && nbaPregameOpen(game, now)
      && start - 24 * HOUR > now && start - 24 * HOUR <= deadline
  }).map(game => nbaGameStart(game)! - 24 * HOUR)
  if (!joins.length) return null
  const release = Math.max(...joins)
  // Allow for the next 30-minute cron tick and the existing 250-second run.
  // Never deliberately hold into the game day, including DST changes.
  const eastern = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
  for (const game of due) {
    const dayBefore = new Date(`${game.date}T12:00:00Z`)
    if (!Number.isFinite(dayBefore.getTime()) || dayBefore.toISOString().slice(0, 10) !== game.date) return null
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
    if (eastern.format(new Date(release + 35 * MINUTE)) !== dayBefore.toISOString().slice(0, 10)) return null
  }
  return release
}

/** Group only first T-4h attempts which already have a successful earlier
 * capture. Never hold a retry, a first-ever capture or the T-1h checkpoint. */
export function nbaPublicFourHourCohortHold<T extends Game>(due: readonly T[], schedule: readonly T[], controls: ReadonlyMap<string, NbaPublicControl>, parser: string, previous: (id: number) => string | null, now: number): number | null {
  if (!due.length || !Number.isFinite(now)) return null
  const firstAttempt = (game: T, at: number) => {
    const start = nbaGameStart(game), state = controls.get(nbaPublicGameControlKey(game, parser))
    if (start === null || !state || state.outcome !== 'captured' || !state.successAt) return false
    const checkpoint = start - 4 * HOUR, success = Date.parse(state.successAt), attempted = Date.parse(state.attemptedAt)
    return Number.isFinite(success) && success < checkpoint && Number.isFinite(attempted) && attempted < checkpoint
      && nbaPublicCaptureDecision(game, previous(game.id), state, at).slotHours === 4
      && nbaPublicCaptureDecision(game, previous(game.id), state, at).due
  }
  if (!due.every(game => firstAttempt(game, now))) return null
  const first = Math.min(...due.map(game => nbaGameStart(game)! - 4 * HOUR)), deadline = first + 30 * MINUTE
  if (now >= deadline) return null
  const joins = schedule.filter(game => {
    const start = nbaGameStart(game)
    if (start === null || !['scheduled', 'unknown', undefined].includes(game.status_state) || !nbaPregameOpen(game, now)) return false
    const target = start - 4 * HOUR
    return target > now && target <= deadline && firstAttempt(game, target)
  })
  // Bound the extra cohort size; a slow or failed game still uses the existing
  // individual retry and deadline gates.
  if (!joins.length || due.length + joins.length > 6) return null
  const release = Math.max(...joins.map(game => nbaGameStart(game)! - 4 * HOUR))
  // Include the next 30-minute tick plus the bounded browser run and leave at
  // least two hours before every currently due game's canonical start.
  if (due.some(game => nbaGameStart(game)! - (release + 35 * MINUTE) < 2 * HOUR)) return null
  return release
}

/** Visit games with the nearest canonical tip first. Within a tip time,
 * rotate least-recently attempted games so one failure cannot monopolize
 * a bounded browser session. Existing cooldown and checkpoint rules apply. */
export function nbaPublicPrioritize<T extends Game>(
  games: readonly T[], controls: ReadonlyMap<string, NbaPublicControl>, parser: string,
  attempted: (id: number) => string,
): T[] {
  return [...games].sort((a,b) => {
    const aControl=controls.get(nbaPublicGameControlKey(a,parser)),bControl=controls.get(nbaPublicGameControlKey(b,parser))
    return (nbaGameStart(a)??Infinity)-(nbaGameStart(b)??Infinity)
      || Date.parse(aControl?.attemptedAt??attempted(a.id))-Date.parse(bControl?.attemptedAt??attempted(b.id))
      || a.id-b.id
  })
}

export function nbaNextPublicControl(prior: NbaPublicControl | undefined, outcome: NbaPublicOutcome, now: number, tipoff?: number, successAt?: string, attemptStartedAt = now): NbaPublicControl {
  if (!Number.isFinite(now)) throw new Error('Invalid public capture clock')
  if (!Number.isFinite(attemptStartedAt) || attemptStartedAt > now) throw new Error('Invalid public attempt clock')
  const success = outcome === 'captured' ? successAt : prior?.successAt ?? null
  if (outcome === 'captured' && (!success || !Number.isFinite(Date.parse(success)) || Date.parse(success) > now + MINUTE || tipoff == null || Date.parse(success) >= tipoff)) throw new Error('Invalid public success observation')
  const failures = outcome === 'captured' || outcome === 'ready' ? 0 : Math.min(20, (prior?.failures ?? 0) + 1)
  const step = 2 ** Math.min(2, Math.max(0, failures - 1))
  const delay = outcome === 'captured' || outcome === 'ready' ? 0
    : outcome === 'auth' ? 2 * HOUR
      : outcome === 'running' ? 30 * MINUTE
        : outcome === 'unavailable' && tipoff != null && tipoff - now > 4 * HOUR ? Math.min(4 * HOUR, HOUR * step)
          : Math.min(2 * HOUR, 30 * MINUTE * step)
  const checkpoint = tipoff == null ? undefined : NBA_PUBLIC_CHECKPOINT_HOURS.map(hours => tipoff - hours * HOUR).filter(at => at <= attemptStartedAt).at(-1)
  const priorAt = Date.parse(prior?.attemptedAt ?? '')
  const previousAttempts = checkpoint === undefined ? 0 : prior?.checkpointAt !== undefined && prior.checkpointAt >= checkpoint ? prior.checkpointAttempts ?? 0
    : prior?.checkpointAt !== undefined ? 0 : Number.isFinite(priorAt) && priorAt >= checkpoint ? Math.min(2, prior?.failures || 1) : 0
  return { version: 1, outcome, attemptedAt: new Date(now).toISOString(), nextAttemptAt: new Date(now + delay).toISOString(), failures, successAt: success ?? null,
    ...(checkpoint === undefined ? {} : { checkpointAt: checkpoint, checkpointAttempts: Math.min(2, previousAttempts + 1) }) }
}
