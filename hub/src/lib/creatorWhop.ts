import 'server-only'
import { WHOP_API_URL, WHOP_API_VERSION, whopApiHeaders } from './whopApi'
import { getWhopPlatformCompanyId } from './whopPlatform'
import { creatorPaymentState, type CreatorAccount } from './creatorCommerce'

export class CreatorProviderError extends Error {
  constructor(public status: number) { super('Creator payment provider request failed'); this.name = 'CreatorProviderError' }
}

/** Abort the request itself. Retried creates keep the SAME key and body. No provider payloads in errors/logs. */
export async function creatorWhop<T>(path: string, body?: object, idempotencyKey?: string, method = body ? 'POST' : 'GET'): Promise<T> {
  const key = process.env.WHOP_PLATFORM_API_KEY || process.env.WHOP_API_KEY
  if (!key) throw new CreatorProviderError(503)
  const response = await fetch(`${WHOP_API_URL}${path}`, {
    method, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    headers: { ...whopApiHeaders(key, WHOP_API_VERSION), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new CreatorProviderError(response.status)
  return response.json() as Promise<T>
}

export async function getCreatorPaymentState(accountId: string) {
  if (!/^biz_[a-zA-Z0-9]+$/.test(accountId)) throw new CreatorProviderError(409)
  const account = await creatorWhop<CreatorAccount>(`/accounts/${encodeURIComponent(accountId)}`)
  if (account.id !== accountId) throw new CreatorProviderError(409)
  return creatorPaymentState(account, getWhopPlatformCompanyId())
}

export async function creatorAccountLink(accountId: string, useCase: 'account_onboarding' | 'payouts_portal', returnUrl: string) {
  return creatorWhop<{ url: string }>('/account_links', { account_id: accountId, use_case: useCase, refresh_url: returnUrl, return_url: returnUrl })
}
