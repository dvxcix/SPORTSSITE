import { randomUUID } from 'node:crypto'
import { BrowserbaseAdmissionError } from './browserbaseAdmissionError'

type Usage = { browserMinutes: number; proxyBytes: number }
type Reservation = {
  projectId: string
  periodId: string
  id: string
  timeoutSeconds: number
  browserMinutes: number
  proxyBytes: number
  observedAt: string
}
type AdmissionInput = {
  projectId: string
  /** A period ID is accepted only after independently provisioning its baseline. */
  periodId: string
  timeoutSeconds: number
  reservationId?: string
  readUsage: () => Promise<Usage>
  reserve: (input: Reservation) => Promise<unknown>
}

/** Pre-create admission only. Its estimated reservation is not a provider
 * proxy-byte cap and cannot guarantee an exact invoice under usage lag.
 * All failures here precede the browser-create call; ambiguous database
 * responses are denied and their reservation is never refunded or retried. */
export async function reserveBrowserbaseSharedAdmission(input: AdmissionInput): Promise<{ id: string; reservedCents: number }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.projectId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.periodId)
    || !Number.isInteger(input.timeoutSeconds) || input.timeoutSeconds < 60 || input.timeoutSeconds > 450) {
    throw new BrowserbaseAdmissionError('configuration')
  }
  const id = input.reservationId ?? randomUUID()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new BrowserbaseAdmissionError('configuration')
  }
  const expectedCents = 50 + Math.ceil(input.timeoutSeconds / 360)
  // Only a positively confirmed no-debit reorder may be retried. The ID stays
  // fixed, and no session-create or ambiguous database response is retried.
  for (let attempt = 0; attempt < 2; attempt++) {
    const observedAt = new Date().toISOString()
    let usage: Usage
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      usage = await Promise.race([
        Promise.resolve().then(input.readUsage),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000) }),
      ])
    } catch {
      throw new BrowserbaseAdmissionError('usage-unavailable')
    } finally { if (timer) clearTimeout(timer) }
    if (!usage || !Number.isFinite(usage.browserMinutes) || usage.browserMinutes < 0 || usage.browserMinutes > 1_000_000_000
      || !Number.isSafeInteger(usage.proxyBytes) || usage.proxyBytes < 0 || usage.proxyBytes > 1_000_000_000_000_000) {
      throw new BrowserbaseAdmissionError('usage-unavailable')
    }
    let result: unknown
    let reserveTimer: ReturnType<typeof setTimeout> | undefined
    try {
      result = await Promise.race([
        Promise.resolve().then(() => input.reserve({ projectId: input.projectId, periodId: input.periodId, id, timeoutSeconds: input.timeoutSeconds,
          browserMinutes: usage.browserMinutes, proxyBytes: usage.proxyBytes, observedAt })),
        new Promise<never>((_, reject) => { reserveTimer = setTimeout(() => reject(new Error('timeout')), 5000) }),
      ])
    } catch {
      throw new BrowserbaseAdmissionError('reservation-unavailable')
    } finally { if (reserveTimer) clearTimeout(reserveTimer) }
    const row = result as { allowed?: unknown; reason?: unknown; id?: unknown; reservedCents?: unknown } | null
    if (row?.allowed === false && row.reason === 'usage-reordered' && attempt === 0) continue
    if (row?.allowed === false && row.reason === 'spend-limit') throw new BrowserbaseAdmissionError('spend-limit')
    if (row?.allowed === false && row.reason === 'session-unverified') throw new BrowserbaseAdmissionError('session-busy')
    if (row?.allowed !== true || row.reason !== 'reserved' || row.id !== id || row.reservedCents !== expectedCents) {
      throw new BrowserbaseAdmissionError('reservation-unavailable')
    }
    return { id, reservedCents: expectedCents }
  }
  throw new BrowserbaseAdmissionError('reservation-unavailable')
}
