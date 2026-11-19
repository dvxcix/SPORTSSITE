import { WHOP_API_URL, whopApiHeaders } from './whopApi'

const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 12_000
const MAX_PAGES = 30
const REQUEST_SPACING_MS = 1_200

export type WhopMembershipRecord = {
  id: string
  status?: string
  valid_status?: string
  valid?: boolean
  cancel_at_period_end?: boolean
  metadata?: { internal_user_id?: string }
  renewal_period_end?: string | number
  current_period_end?: string | number
  period_end?: string | number
  expires_at?: string | number
  variant_id?: string
  plan_id?: string
  plan?: string | { id?: string }
  user_id?: string
  user?: string | { id?: string }
}

export function whopMembershipPlanId(member: WhopMembershipRecord) {
  return member.variant_id ?? member.plan_id ?? (typeof member.plan === 'string' ? member.plan : member.plan?.id)
}
export function whopMembershipUserId(member: WhopMembershipRecord) {
  return member.user_id ?? (typeof member.user === 'string' ? member.user : member.user?.id)
}
function readMembership(value: unknown): WhopMembershipRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const member = value as WhopMembershipRecord
  return typeof member.id === 'string' && /^mem_[A-Za-z0-9]+$/.test(member.id)
    && typeof member.status === 'string' && !!whopMembershipPlanId(member) ? member : null
}

async function fetchWhopPage(url: URL | string, apiKey: string): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: whopApiHeaders(apiKey), cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status !== 429 && response.status < 500) return response
      if (attempt === MAX_ATTEMPTS - 1) return response
      const retryAfter = Number(response.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15_000)
        : response.status === 429 ? 5_000 : 500 * 2 ** attempt
      await new Promise(resolve => setTimeout(resolve, delay))
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) throw new Error('Whop request failed after bounded retries')
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  throw new Error('Whop request failed after bounded retries')
}

export async function fetchWhopMembershipById(apiKey: string, membershipId: string):
Promise<{ membership: WhopMembershipRecord } | { missing: true } | { error: string }> {
  if (!/^mem_[A-Za-z0-9]+$/.test(membershipId)) return { error: 'Invalid Whop membership ID' }
  try {
    const response = await fetchWhopPage(`${WHOP_API_URL}/memberships/${encodeURIComponent(membershipId)}`, apiKey)
    if (response.status === 404) return { missing: true }
    if (!response.ok) return { error: `Whop membership lookup returned ${response.status}` }
    const body = await response.json().catch(() => null)
    const member = readMembership(body?.data ?? body)
    if (!member || member.id !== membershipId) return { error: 'Whop membership lookup returned incomplete or mismatched data' }
    return { membership: member }
  } catch { return { error: 'Whop membership lookup failed after bounded retries' } }
}

export async function fetchAllWhopMemberships(
  apiKey: string, planId: string | string[],
  options: { userId?: string; statuses?: string[] } = {},
): Promise<{ memberships: WhopMembershipRecord[]; pagesFetched: number } | { error: string }> {
  const planIds = new Set(Array.isArray(planId) ? planId : [planId])
  const url = new URL(`${WHOP_API_URL}/memberships`)
  url.searchParams.set('first', '100')
  for (const id of planIds) url.searchParams.append('variant_ids', id)
  for (const status of options.statuses ?? []) url.searchParams.append('statuses', status)
  if (options.userId) url.searchParams.set('user_id', options.userId)
  const cursors = new Set<string>(), deduped = new Map<string, WhopMembershipRecord>()
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const response = await fetchWhopPage(url, apiKey)
      if (!response.ok) return { error: `Whop memberships lookup returned ${response.status}` }
      const body = await response.json().catch(() => null)
      if (!Array.isArray(body?.data) || typeof body?.page_info?.has_next_page !== 'boolean') return { error: 'Whop memberships returned incomplete pagination' }
      for (const raw of body.data) {
        const member = readMembership(raw)
        if (!member || !planIds.has(whopMembershipPlanId(member)!) ||
          options.userId && whopMembershipUserId(member) !== options.userId) return { error: 'Whop memberships returned an unverified plan or owner' }
        deduped.set(member.id, member)
      }
      if (!body.page_info.has_next_page) return { memberships: [...deduped.values()], pagesFetched: page }
      const cursor = body.page_info.end_cursor
      if (!body.data.length || typeof cursor !== 'string' || !cursor || cursors.has(cursor)) return { error: 'Whop memberships pagination did not advance' }
      cursors.add(cursor)
      url.searchParams.set('after', cursor)
      await new Promise(resolve => setTimeout(resolve, REQUEST_SPACING_MS))
    } catch { return { error: `Whop memberships page ${page} failed after ${MAX_ATTEMPTS} attempts` } }
  }
  return { error: 'Whop memberships exceeded the bounded pagination limit' }
}
