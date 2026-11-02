import 'server-only'
import { createAdminClient } from './supabase/admin'
import type { BrowserbaseAtomicRequest, BrowserbaseCheckRequest } from './browserbaseAtomicAdmission'

function argumentsFor(input: BrowserbaseAtomicRequest) {
  const config = input.nba?.config
  return {
    p_project: input.projectId, p_period: input.periodId, p_minutes: input.browserMinutes,
    p_bytes: input.proxyBytes, p_observed_at: input.observedAt, p_nba: input.nba !== null,
    p_daily_sessions: config?.dailySessions ?? null, p_period_sessions: config?.monthlySessions ?? null,
    p_daily_minutes: config?.dailyMinutes ?? null, p_period_minutes: config?.monthlyMinutes ?? null,
    p_reset_day: config?.resetDay ?? null, p_daily_cents: config?.dailyCents ?? null,
    p_period_cents: config?.periodCents ?? null, p_workflow: input.nba?.scope.workflow ?? null,
    p_game_ids: config?.gameIds ?? null,
  }
}

/** No automatic retry: a lost database response may already have committed a
 * permanent reservation. Error text remains private. */
export async function reserveBrowserbaseAtomicRpc(input: BrowserbaseAtomicRequest): Promise<unknown> {
  const { data, error } = await createAdminClient().rpc('reserve_browserbase_shared_budget', {
    ...argumentsFor(input), p_id: input.id, p_timeout: input.timeoutSeconds,
  }).abortSignal(AbortSignal.timeout(5000))
  if (error) throw new Error('Cloud browser reservation unavailable')
  return data
}

export async function checkBrowserbaseAtomicRpc(input: BrowserbaseCheckRequest): Promise<unknown> {
  const { data, error } = await createAdminClient().rpc('check_browserbase_shared_budget', {
    ...argumentsFor(input), p_id: input.id, p_session_id: input.sessionId,
    p_timeout: input.timeoutSeconds,
  })
    .abortSignal(AbortSignal.timeout(5000))
  if (error) throw new Error('Cloud browser usage unavailable')
  return data
}

type SessionKey = { projectId: string; periodId: string; id: string; sessionId: string }
/** Must succeed before the SDK session-create POST. A failed/unknown result
 * must not send or retry the POST; the creating marker may have committed. */
export async function markBrowserbaseCreating(input: Omit<SessionKey, 'sessionId'>): Promise<string> {
  const { data, error } = await createAdminClient().rpc('mark_browserbase_shared_creating', {
    p_project: input.projectId, p_period: input.periodId, p_id: input.id,
  }).abortSignal(AbortSignal.timeout(5000))
  const receipt = data as { marked?: unknown; notAfter?: unknown } | null
  if (error || receipt?.marked !== true || typeof receipt.notAfter !== 'string' || !Number.isFinite(Date.parse(receipt.notAfter))) {
    throw new Error('Cloud browser state unavailable')
  }
  return receipt.notAfter
}
async function transition(name: 'mark_browserbase_shared_closing' | 'resolve_browserbase_shared_session', input: SessionKey): Promise<void> {
  const { data, error } = await createAdminClient().rpc(name, {
    p_project: input.projectId, p_period: input.periodId, p_id: input.id, p_session_id: input.sessionId,
  }).abortSignal(AbortSignal.timeout(5000))
  if (error || data !== true) throw new Error('Cloud browser state unavailable')
}
/** Call before requesting release. A failure must not skip the release attempt. */
export async function markBrowserbaseClosing(input: SessionKey): Promise<void> { await transition('mark_browserbase_shared_closing', input) }
/** Call only after verifying the exact remote session is stopped. */
export async function resolveBrowserbaseSession(input: SessionKey): Promise<void> { await transition('resolve_browserbase_shared_session', input) }
/** Call only if the session-create POST was definitely never attempted. It
 * may close pending or creating after a lost mark-creating response. */
export async function abandonBrowserbaseBeforeCreate(input: Omit<SessionKey, 'sessionId'>): Promise<void> {
  const { data, error } = await createAdminClient().rpc('abandon_browserbase_shared_before_create', {
    p_project: input.projectId, p_period: input.periodId, p_id: input.id,
  }).abortSignal(AbortSignal.timeout(5000))
  if (error || data !== true) throw new Error('Cloud browser state unavailable')
}
