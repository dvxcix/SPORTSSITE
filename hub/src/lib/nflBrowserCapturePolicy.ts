/** Bounded automatic NFL browser checkpoints. Direct admin/cron requests are
 * outside this dispatcher-only policy. Times are real observed times. */
const HOUR = 3_600_000
// Open early enough to drain large simultaneous Sunday slates two games at a
// time; the resulting late captures are normally around 3h to 1h before tip.
export const NFL_LATE_CAPTURE_HOURS = 3
export type NflBrowserSource = 'public' | 'fanduel'
export type NflBrowserSlot = 'day-before' | 'two-hours'
export type NflBrowserAttempt = { attempt: 0 | 1; at: number }
export type NflBrowserDecision = { due: boolean; slot: NflBrowserSlot | null; attempt: 0 | 1 | null; reason: string }

/** Only these private collector responses prove no create request was sent.
 * Generic 423/425s, timeouts and partial responses remain uncertain. */
export function nflVerifiedNoCreateDenial(status: number, body: unknown, source: NflBrowserSource): boolean {
  if (!body || typeof body !== 'object') return false
  const candidate = body as { error?: unknown; budgetCode?: unknown; reason?: unknown; browserSessions?: unknown }
  if (candidate.error !== 'NFL browser capture deferred' || candidate.browserSessions !== 0) return false
  if (status === 423) return source === 'public' && candidate.reason === 'context-busy'
  return status === 425
    && typeof candidate.budgetCode === 'string' && ['paused','spend-limit','usage-unavailable','reservation-unavailable','configuration','quota-limit','session-busy'].includes(candidate.budgetCode)
}

export function nflBrowserReservationKey(source: NflBrowserSource, gameId: string, slot: NflBrowserSlot, attempt: 0 | 1) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(gameId)) throw new Error('Invalid NFL capture game')
  if (!['public', 'fanduel'].includes(source) || !['day-before', 'two-hours'].includes(slot) || ![0, 1].includes(attempt)) throw new Error('Invalid NFL capture reservation')
  return `nfl:browser:v1:${source}:${gameId}:${slot}:${attempt}`
}

/** At most one initial and one delayed retry for each game/checkpoint/source.
 * Uncertain dispatches consume the attempt while retained. A late observation never
 * satisfies a checkpoint, and missed earlier slots are never replayed. */
export function nflBrowserDecision(kickoff: number, observed: number | null, attempts: readonly NflBrowserAttempt[], now: number): NflBrowserDecision {
  const no = (reason: string, slot: NflBrowserSlot | null = null): NflBrowserDecision => ({ due:false, slot, attempt:null, reason })
  if (!Number.isFinite(kickoff) || !Number.isFinite(now) || now >= kickoff) return no('started-or-invalid')
  if (observed !== null && (!Number.isFinite(observed) || observed > now || observed >= kickoff)) return no('invalid-observation')
  if (attempts.length > 2 || attempts.some(row => ![0,1].includes(row.attempt) || !Number.isFinite(row.at) || row.at > now)
    || new Set(attempts.map(row => row.attempt)).size !== attempts.length || attempts.some(row => row.attempt === 1) && !attempts.some(row => row.attempt === 0)) return no('invalid-attempts')
  const until = kickoff - now
  if (until > 24 * HOUR) return no('before-day-before')
  const slot: NflBrowserSlot = until <= NFL_LATE_CAPTURE_HOURS * HOUR ? 'two-hours' : 'day-before'
  const checkpoint = kickoff - (slot === 'two-hours' ? NFL_LATE_CAPTURE_HOURS : 24) * HOUR
  if (observed !== null && observed >= checkpoint) return no('checkpoint-complete', slot)
  const first = attempts.find(row => row.attempt === 0)
  if (!first) return { due:true, slot, attempt:0, reason:'initial' }
  if (attempts.some(row => row.attempt === 1)) return no('attempt-limit', slot)
  if (now - first.at < 90 * 60_000) return no('retry-cooldown', slot)
  return { due:true, slot, attempt:1, reason:'bounded-retry' }
}
