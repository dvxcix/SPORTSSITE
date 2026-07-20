// Whop's memberships-list endpoint paginates — confirmed live against the
// real addon-plan response: { pagination: { current_page, total_page,
// total_count }, data: [...] }, 39 real memberships across 4 pages. Both
// reconcile routes previously only ever fetched page 1, which is the real
// root cause behind two separate live incidents: real customers wrongly
// downgraded (their membership just wasn't on page 1) and real purchases
// never granted at all (same reason). Follows page 2..total_page via the
// same URL + &page=N once a working candidate path is found on page 1.
export async function fetchAllWhopMemberships(apiKey: string, planId: string): Promise<{ memberships: any[] } | { error: string }> {
  const candidates = [
    `https://api.whop.com/api/v2/memberships?plan_id=${planId}`,
    `https://api.whop.com/api/v2/memberships?plan=${planId}`,
    `https://api.whop.com/api/v1/memberships?plan_id=${planId}`,
  ]
  let baseUrl: string | null = null
  let firstBody: any = null
  let lastErr = ''
  for (const url of candidates) {
    const attempt = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (attempt.ok) {
      baseUrl = url
      firstBody = await attempt.json().catch(() => null)
      break
    }
    lastErr = `${url} -> ${attempt.status} ${await attempt.text().catch(() => '')}`
  }
  if (!baseUrl || !firstBody) {
    return { error: `Whop memberships lookup failed on every candidate path. Last: ${lastErr}` }
  }

  const memberships: any[] = firstBody?.data ?? firstBody?.memberships ?? (Array.isArray(firstBody) ? firstBody : [])
  const totalPages: number = firstBody?.pagination?.total_page ?? 1

  for (let page = 2; page <= totalPages; page++) {
    const pageUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`
    const res = await fetch(pageUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) continue
    const body = await res.json().catch(() => null)
    const pageMemberships: any[] = body?.data ?? body?.memberships ?? (Array.isArray(body) ? body : [])
    memberships.push(...pageMemberships)
  }

  return { memberships }
}
