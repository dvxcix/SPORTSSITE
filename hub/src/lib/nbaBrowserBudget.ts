import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from './supabase/admin'

export type NbaBrowserBudgetCode = 'paused' | 'configuration' | 'project-limit' | 'spend-limit' | 'usage-unavailable' | 'quota-limit' | 'reservation-unavailable'
const messages: Record<NbaBrowserBudgetCode, string> = {
  paused: 'NBA browser captures are paused',
  configuration: 'NBA browser budget is not configured safely',
  'project-limit': 'NBA browser project usage limit reached',
  'spend-limit': 'NBA browser additional spending limit reached',
  'usage-unavailable': 'NBA browser usage could not be verified',
  'quota-limit': 'NBA browser launch or runtime quota reached',
  'reservation-unavailable': 'NBA browser budget reservation could not be verified',
}
export class NbaBrowserBudgetError extends Error {
  readonly code: NbaBrowserBudgetCode
  constructor(code: NbaBrowserBudgetCode) {
    super(messages[code])
    this.name = 'NbaBrowserBudgetError'
    this.code = code
  }
}

export type NbaBrowserUsage = { browserMinutes: number; proxyBytes: number }
type UsageInput = { projectId: string; workflow: 'public' | 'direct'; gameIds?: readonly number[]; readUsage: () => Promise<NbaBrowserUsage> }
export type NbaBrowserBudgetReservation = { id: string; day: string; periodStart: string; reservedMinutes: number; reservedCents: number; allowanceKey?: string; allowanceExpiresAt?: string }

function positiveInteger(name: string, max: number, fallback?: number): number {
  const raw = process.env[name]
  if (raw === undefined && fallback !== undefined) return fallback
  // Empty values, whitespace, exponent notation and partially numeric strings
  // are configuration errors, never permission to use an unlimited/default cap.
  if (!raw || !/^[1-9]\d*$/.test(raw)) throw new NbaBrowserBudgetError('configuration')
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value > max) throw new NbaBrowserBudgetError('configuration')
  return value
}

function configuration(projectId: string, workflow: UsageInput['workflow']) {
  if (process.env.NBA_BROWSER_CAPTURE_ENABLED !== 'true') throw new NbaBrowserBudgetError('paused')
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) throw new NbaBrowserBudgetError('configuration')
  if (workflow !== 'public' && workflow !== 'direct') throw new NbaBrowserBudgetError('configuration')
  return {
    dailySessions: positiveInteger('NBA_BROWSER_DAILY_SESSION_LIMIT', 1000),
    monthlySessions: positiveInteger('NBA_BROWSER_MONTHLY_SESSION_LIMIT', 10_000),
    dailyMinutes: positiveInteger('NBA_BROWSER_DAILY_MINUTE_LIMIT', 30_000),
    monthlyMinutes: positiveInteger('NBA_BROWSER_MONTHLY_MINUTE_LIMIT', 30_000),
    // Required, UTC. Use18 only when explicitly configured for an18th-to18th
    // period. Day1 is a calendar month; no provider billing-cycle inference.
    resetDay: positiveInteger('NBA_BROWSER_BUDGET_RESET_DAY', 28),
    // Owner-approved ADDITIONAL spending, never the already-incurred bill.
    // Missing/malformed or above-approved configuration remains disabled.
    dailyCents: positiveInteger('NBA_BROWSER_DAILY_CENT_LIMIT', 300),
    periodCents: positiveInteger('NBA_BROWSER_PERIOD_CENT_LIMIT', 5000),
  }
}

function scopedGameIds(value: UsageInput['gameIds']): number[] | null {
  if (value === undefined) return null
  if (!Array.isArray(value) || !value.length || value.length > 100
    || value.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(value).size !== value.length) throw new NbaBrowserBudgetError('configuration')
  return [...value].sort((a, b) => a - b)
}

async function verifiedUsage(input: UsageInput): Promise<NbaBrowserUsage & { observedAt: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const observedAt = new Date().toISOString()
  try {
    const usage = await Promise.race([
      Promise.resolve().then(input.readUsage),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new NbaBrowserBudgetError('usage-unavailable')), 5000) }),
    ])
    if (!usage || !Number.isFinite(usage.browserMinutes) || usage.browserMinutes < 0 || usage.browserMinutes > 1_000_000_000
      || !Number.isSafeInteger(usage.proxyBytes) || usage.proxyBytes < 0 || usage.proxyBytes > 1_000_000_000_000_000) throw new NbaBrowserBudgetError('usage-unavailable')
    return { browserMinutes: usage.browserMinutes, proxyBytes: usage.proxyBytes, observedAt }
  } catch (error) {
    if (error instanceof NbaBrowserBudgetError) throw error
    // SDK errors can contain credentials/URLs. Never propagate provider text.
    throw new NbaBrowserBudgetError('usage-unavailable')
  } finally { if (timer) clearTimeout(timer) }
}

type Configuration = ReturnType<typeof configuration>
async function applyBudget(input: UsageInput, config: Configuration, usage: Awaited<ReturnType<typeof verifiedUsage>>, id: string | null, timeoutSeconds: number | null) {
  try {
    const { data, error } = await createAdminClient().rpc('apply_nba_browser_spend_budget', {
      p_id: id, p_project_id: input.projectId, p_timeout_seconds: timeoutSeconds,
      p_daily_sessions: config.dailySessions, p_period_sessions: config.monthlySessions,
      p_daily_minutes: config.dailyMinutes, p_period_minutes: config.monthlyMinutes, p_reset_day: config.resetDay,
      p_browser_minutes: usage.browserMinutes, p_proxy_bytes: usage.proxyBytes, p_observed_at: usage.observedAt,
      p_daily_cents: config.dailyCents, p_period_cents: config.periodCents,
      p_workflow: input.workflow,
      p_game_ids: scopedGameIds(input.gameIds),
    }).abortSignal(AbortSignal.timeout(5000))
    if (error || !data || typeof data !== 'object') throw new NbaBrowserBudgetError('reservation-unavailable')
    if (data.allowed === false) {
      if (['daily-session-limit', 'period-session-limit', 'daily-minute-limit', 'period-minute-limit', 'public-share-reserved'].includes(data.reason)) throw new NbaBrowserBudgetError('quota-limit')
      if (['daily-spend-limit', 'period-spend-limit'].includes(data.reason)) throw new NbaBrowserBudgetError('spend-limit')
      if (['usage-stale', 'usage-reordered', 'usage-decreased'].includes(data.reason)) throw new NbaBrowserBudgetError('usage-unavailable')
    }
    return data
  } catch (error) {
    if (error instanceof NbaBrowserBudgetError) throw error
    throw new NbaBrowserBudgetError('reservation-unavailable')
  }
}

/** Fresh active circuit breaker. Persists monotonic usage/floor metadata only;
 * never admits a session, resets a baseline, refunds, or caches success. */
export async function checkNbaBrowserBudgetUsage(input: UsageInput): Promise<NbaBrowserUsage> {
  const config = configuration(input.projectId, input.workflow)
  scopedGameIds(input.gameIds)
  const usage = await verifiedUsage(input)
  const data = await applyBudget(input, config, usage, null, null)
  if (data.allowed !== true || data.reason !== 'checked') throw new NbaBrowserBudgetError('reservation-unavailable')
  return { browserMinutes: usage.browserMinutes, proxyBytes: usage.proxyBytes }
}

/** One permanent debit per attempted create. There is deliberately no refund API.
 * The database serializes day+period quotas across all serverless instances.
 * Provider telemetry cannot guarantee an exact proxy-byte or invoice ceiling. */
export async function reserveNbaBrowserBudget(input: UsageInput & { timeoutSeconds: number }): Promise<NbaBrowserBudgetReservation> {
  const config = configuration(input.projectId, input.workflow)
  scopedGameIds(input.gameIds)
  if (!Number.isInteger(input.timeoutSeconds) || input.timeoutSeconds < 60 || input.timeoutSeconds > 300) throw new NbaBrowserBudgetError('configuration')
  const usage = await verifiedUsage(input)
  const id = randomUUID(), reservedMinutes = Math.ceil(input.timeoutSeconds / 60)
  const reservedCents = Math.ceil(50 + reservedMinutes / 6)
  try {
    const data = await applyBudget(input, config, usage, id, input.timeoutSeconds)
    // Repeated/ambiguous reservation tokens must never authorize another create.
    if (data.allowed !== true || data.reason !== 'reserved' || data.id !== id || data.reservedMinutes !== reservedMinutes || data.reservedCents !== reservedCents
      || typeof data.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.day)
      || typeof data.periodStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.periodStart)
      || !Number.isFinite(Date.parse(data.day)) || !Number.isFinite(Date.parse(data.periodStart))
      || data.periodStart > data.day) throw new NbaBrowserBudgetError('reservation-unavailable')
    const hasAllowance = data.allowanceKey !== undefined || data.allowanceExpiresAt !== undefined
    if (hasAllowance) {
      const ids = input.gameIds
      if (input.workflow !== 'public' || !ids?.length) throw new NbaBrowserBudgetError('reservation-unavailable')
      const october28 = data.allowanceKey === 'nba-public-count-recovery-2026-10-28'
        && data.allowanceExpiresAt === '2026-10-29T00:00:00.000Z'
        && ids.every(game => game >= 21717975 && game <= 21717986)
      const october29 = data.allowanceKey === 'nba-public-count-recovery-2026-10-29'
        && data.day === '2026-10-29'
        && data.allowanceExpiresAt === '2026-10-30T00:00:00.000Z'
        && ids.every(game => [21717987, 21717988, 21717989].includes(game))
      if (!october28 && !october29) throw new NbaBrowserBudgetError('reservation-unavailable')
    }
    return { id, day: data.day, periodStart: data.periodStart, reservedMinutes, reservedCents,
      ...(hasAllowance ? { allowanceKey: data.allowanceKey, allowanceExpiresAt: data.allowanceExpiresAt } : {}) }
  } catch (error) {
    if (error instanceof NbaBrowserBudgetError) throw error
    throw new NbaBrowserBudgetError('reservation-unavailable')
  }
}
