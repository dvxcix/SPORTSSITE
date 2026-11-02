import { BrowserbaseAdmissionError } from './browserbaseAdmissionError'
import { reserveBrowserbaseSharedAdmission } from './browserbaseSharedAdmission'
import { NbaBrowserBudgetError, nbaBrowserAtomicConfiguration, parseNbaBrowserBudgetReservation, type NbaBrowserBudgetReservation } from './nbaBrowserBudget'

type NbaScope = { workflow: 'public' | 'direct'; gameIds?: readonly number[] }
export type BrowserbaseAtomicRequest = {
  projectId: string; periodId: string; id: string; timeoutSeconds: number
  browserMinutes: number; proxyBytes: number; observedAt: string
  nba: null | { config: ReturnType<typeof nbaBrowserAtomicConfiguration>; scope: NbaScope }
}
type AtomicInput = {
  projectId: string; periodId: string; timeoutSeconds: number
  readUsage: () => Promise<{ browserMinutes: number; proxyBytes: number }>
  reserveAtomic: (input: BrowserbaseAtomicRequest) => Promise<unknown>
  nba?: NbaScope
}
export type BrowserbaseCheckRequest = BrowserbaseAtomicRequest & { sessionId: string }

/** This error means an already-open session must be closed. It must never be
 * mistaken for a verified pre-create admission denial. */
export class BrowserbaseBudgetMonitorError extends Error {
  constructor() { super('Cloud browser usage could not be verified'); this.name = 'BrowserbaseBudgetMonitorError' }
}

/** Pre-create only. The callback must call one atomic database operation that
 * reserves the shared ledger and, for NBA, the existing NBA ledger. */
async function reserveAtomicBeforeCreate(input: AtomicInput): Promise<{
  id: string; reservedCents: number; nba?: NbaBrowserBudgetReservation
}> {
  let nbaConfig: BrowserbaseAtomicRequest['nba'] = null
  if (input.nba) {
    try {
      const config = nbaBrowserAtomicConfiguration({ ...input.nba, projectId: input.projectId,
        timeoutSeconds: input.timeoutSeconds, readUsage: input.readUsage })
      nbaConfig = { config, scope: input.nba }
    } catch {
      throw new BrowserbaseAdmissionError('configuration')
    }
  }
  let nba: NbaBrowserBudgetReservation | undefined
  const shared = await reserveBrowserbaseSharedAdmission({
    ...input,
    reserve: async request => {
      const raw = await input.reserveAtomic({ ...request, nba: nbaConfig })
      const row = raw as { allowed?: unknown; reason?: unknown; id?: unknown; global?: unknown; nba?: unknown } | null
      if (!row || row.allowed !== true) return row
      if (row.reason !== 'reserved' || row.id !== request.id) return null
      if (input.nba) nba = parseNbaBrowserBudgetReservation(row.nba, request.id, input.timeoutSeconds, input.nba)
      else if (row.nba !== null && row.nba !== undefined) return null
      return row.global
    },
  })
  return { ...shared, ...(nba ? { nba } : {}) }
}

/** NBA public capture uses this exact typed pre-create error to release its
 * context lease. Never translate active monitoring or uncertain creates. */
export async function reserveBrowserbaseAtomicAdmission(input: AtomicInput): Promise<{
  id: string; reservedCents: number; nba?: NbaBrowserBudgetReservation
}> {
  try { return await reserveAtomicBeforeCreate(input) }
  catch (error) {
    if (input.nba && error instanceof BrowserbaseAdmissionError) throw new NbaBrowserBudgetError(error.code)
    throw error
  }
}

/** Live session check. Caller must request and verify remote release whenever
 * this rejects; a polling interval is not an exact proxy-byte cutoff. */
export async function checkBrowserbaseAtomicUsage(input: Omit<AtomicInput, 'reserveAtomic'> & {
  reservationId: string
  sessionId: string
  checkAtomic: (input: BrowserbaseCheckRequest) => Promise<unknown>
}): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.projectId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.periodId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.reservationId)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(input.sessionId)) throw new Error('configuration')
    const nba = input.nba ? { config: nbaBrowserAtomicConfiguration({ ...input.nba, projectId: input.projectId,
      timeoutSeconds: input.timeoutSeconds, readUsage: input.readUsage }), scope: input.nba } : null
    for (let attempt = 0; attempt < 2; attempt++) {
      const observedAt = new Date().toISOString()
      const usage = await Promise.race([
        Promise.resolve().then(input.readUsage),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000) }),
      ])
      if (timer) clearTimeout(timer)
      timer = undefined
      if (!usage || !Number.isFinite(usage.browserMinutes) || usage.browserMinutes < 0 || usage.browserMinutes > 1_000_000_000
        || !Number.isSafeInteger(usage.proxyBytes) || usage.proxyBytes < 0 || usage.proxyBytes > 1_000_000_000_000_000) throw new Error('usage')
      const raw = await Promise.race([
        Promise.resolve().then(() => input.checkAtomic({ projectId: input.projectId, periodId: input.periodId,
          id: input.reservationId, sessionId: input.sessionId,
          timeoutSeconds: input.timeoutSeconds,
          browserMinutes: usage.browserMinutes, proxyBytes: usage.proxyBytes, observedAt, nba })),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000) }),
      ])
      if (timer) clearTimeout(timer)
      timer = undefined
      const row = raw as { allowed?: unknown; reason?: unknown; global?: { allowed?: unknown; reason?: unknown }; nba?: { allowed?: unknown; reason?: unknown } | null } | null
      if (row?.allowed === false && row.reason === 'usage-reordered' && attempt === 0) continue
      if (!row || row.allowed !== true || row.reason !== 'checked' || row.global?.allowed !== true || row.global.reason !== 'checked'
        || (input.nba ? row.nba?.allowed !== true || row.nba.reason !== 'checked' : row.nba != null)) throw new Error('result')
      return
    }
    throw new Error('reordered')
  } catch {
    throw new BrowserbaseBudgetMonitorError()
  } finally { if (timer) clearTimeout(timer) }
}
