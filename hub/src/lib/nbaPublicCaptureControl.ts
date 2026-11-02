import { createHash } from 'node:crypto'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
export const NBA_PUBLIC_CHECKPOINT_HOURS = [24, 4, 1] as const
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
type Game = Pick<PaintGame, 'id' | 'datetime' | 'status'> & Partial<Pick<PaintGame, 'status_state' | 'period'>>
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
