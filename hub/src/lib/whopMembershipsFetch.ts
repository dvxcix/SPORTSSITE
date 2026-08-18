// Whop's memberships-list endpoint paginates — confirmed live against the
// real addon-plan response: { pagination: { current_page, total_page,
// total_count }, data: [...] }, 39 real memberships across 4 pages. Both
// reconcile routes previously only ever fetched page 1, which is the real
// root cause behind two separate live incidents: real customers wrongly
// downgraded (their membership just wasn't on page 1) and real purchases
// never granted at all (same reason). Follows page 2..total_page via the
// same URL + &page=N once a working candidate path is found on page 1.
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 12_000

export type WhopMembershipRecord = {
  id?: string
  status?: string
  valid_status?: string
  valid?: boolean
  cancel_at_period_end?: boolean
  metadata?: { internal_user_id?: string }
  renewal_period_end?: string | number
  period_end?: string | number
  expires_at?: string | number
}

type WhopMembershipPage = {
  data?: WhopMembershipRecord[]
  memberships?: WhopMembershipRecord[]
  pagination?: { total_page?: number }
}

function parseMembershipPage(value: unknown): { memberships: WhopMembershipRecord[]; totalPages: number } | null {
  if (Array.isArray(value)) return { memberships: value as WhopMembershipRecord[], totalPages: 1 }
  if (!value || typeof value !== 'object') return null
  const page = value as WhopMembershipPage
  const memberships = Array.isArray(page.data) ? page.data : Array.isArray(page.memberships) ? page.memberships : []
  const rawTotalPages = page.pagination?.total_page
  const totalPages = typeof rawTotalPages === 'number' && Number.isInteger(rawTotalPages) && rawTotalPages > 0
    ? rawTotalPages
    : 1
  return { memberships, totalPages }
}

async function fetchWhopPage(url: string, apiKey: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (res.status !== 429 && res.status < 500) return res
      lastError = new Error(`Whop returned ${res.status}`)
      if (attempt < MAX_ATTEMPTS - 1) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 15_000)
          : Math.min(500 * 2 ** attempt, 4_000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS - 1) await new Promise(resolve => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4_000)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Whop request failed')
}

export async function fetchAllWhopMemberships(apiKey: string, planId: string): Promise<{ memberships: WhopMembershipRecord[]; pagesFetched: number } | { error: string }> {
  const candidates = [
    `https://api.whop.com/api/v2/memberships?plan_id=${planId}`,
    `https://api.whop.com/api/v2/memberships?plan=${planId}`,
    `https://api.whop.com/api/v1/memberships?plan_id=${planId}`,
  ]
  let baseUrl: string | null = null
  let firstPage: { memberships: WhopMembershipRecord[]; totalPages: number } | null = null
  let lastStatus: number | null = null
  for (const url of candidates) {
    let attempt: Response
    try {
      attempt = await fetchWhopPage(url, apiKey)
    } catch {
      continue
    }
    if (attempt.ok) {
      baseUrl = url
      firstPage = parseMembershipPage(await attempt.json().catch(() => null))
      if (firstPage) break
      baseUrl = null
      continue
    }
    lastStatus = attempt.status
  }
  if (!baseUrl || !firstPage) {
    console.error('[whop-memberships] lookup failed', { status: lastStatus ?? undefined })
    return { error: 'Whop memberships lookup failed' }
  }

  const memberships = [...firstPage.memberships]
  let totalPages = firstPage.totalPages
  let pagesFetched = 1

  // Keep the read fail-closed, but fetch pages independently. A single slow
  // page now gets its own retry budget and a useful page number in telemetry
  // instead of cancelling every other in-flight request in Promise.all().
  for (let page = 2; page <= totalPages; page++) {
    const pageUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`
    try {
      const res = await fetchWhopPage(pageUrl, apiKey)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const pageBody = parseMembershipPage(await res.json().catch(() => null))
      if (!pageBody) throw new Error('Invalid JSON')
      memberships.push(...pageBody.memberships)
      pagesFetched += 1
      // Whop can add a page during a reconciliation. Honor a larger total
      // reported by later responses without ever accepting a partial list.
      totalPages = Math.max(totalPages, pageBody.totalPages)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown failure'
      console.error('[whop-memberships] pagination failed', { page, totalPages, reason })
      return { error: `Whop memberships page ${page} of ${totalPages} failed after ${MAX_ATTEMPTS} attempts` }
    }
  }

  const deduped = new Map<string, WhopMembershipRecord>()
  for (const membership of memberships) {
    const key = membership.id
      ?? `${membership.metadata?.internal_user_id ?? 'unknown'}:${membership.renewal_period_end ?? membership.period_end ?? membership.expires_at ?? 'open'}:${membership.status ?? membership.valid_status ?? membership.valid ?? 'unknown'}`
    deduped.set(key, membership)
  }
  return { memberships: [...deduped.values()], pagesFetched }
}
