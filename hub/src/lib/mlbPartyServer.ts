const MLB_PARTY_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const PAGE_SIZE = 1000

type FetchRowsOptions = {
  maxRows?: number
  revalidateSeconds?: number
}

function getServerKey() {
  const key = process.env.MLB_PARTY_SERVICE_ROLE_KEY?.trim()
  if (!key || /placeholder|replace|your_mlb_party/i.test(key)) {
    throw new Error('MLB_PARTY_SERVICE_ROLE_KEY is not configured with a server credential.')
  }
  if (key.startsWith('sb_publishable_')) {
    throw new Error('MLB_PARTY_SERVICE_ROLE_KEY contains a publishable key. A server-only secret or service_role key is required.')
  }
  return key
}

export async function fetchMlbPartyRows<T>(path: string, options: FetchRowsOptions = {}): Promise<T[]> {
  const key = getServerKey()
  const maxRows = options.maxRows ?? 100_000
  const rows: T[] = []

  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const fetchOptions: RequestInit & { next?: { revalidate: number } } = {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
      },
      signal: AbortSignal.timeout(20_000),
    }
    if (options.revalidateSeconds == null) fetchOptions.cache = 'no-store'
    else fetchOptions.next = { revalidate: options.revalidateSeconds }

    const response = await fetch(`${MLB_PARTY_URL}${path}`, fetchOptions)
    if (!response.ok) throw new Error(`MLB-PARTY data request failed (${response.status})`)
    const page = await response.json()
    if (!Array.isArray(page)) throw new Error('MLB-PARTY data response was not an array.')
    rows.push(...page as T[])
    if (page.length < PAGE_SIZE) break
  }

  return rows
}
