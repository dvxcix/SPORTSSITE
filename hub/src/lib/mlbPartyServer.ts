const MLB_PARTY_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const PAGE_SIZE = 1000

export type PikkitPublicPickRow = {
  player_name: string | null
  picks: number | null
  prop_type: string | null
  game_key: string | null
}

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
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      let detail = ''
      try {
        const parsed = JSON.parse(body) as { code?: string; message?: string }
        detail = [parsed.code, parsed.message].filter(Boolean).join(' ')
      } catch {
        detail = body.slice(0, 160)
      }
      throw new Error(`MLB-PARTY data request failed (${response.status})${detail ? `: ${detail}` : ''}`)
    }

    const page = await response.json()
    if (!Array.isArray(page)) throw new Error('MLB-PARTY data response was not an array.')
    rows.push(...page as T[])
    if (page.length < PAGE_SIZE) break
  }

  return rows
}

export function fetchPikkitPublicPicks(date: string, revalidateSeconds?: number) {
  const encodedDate = encodeURIComponent(date)
  return fetchMlbPartyRows<PikkitPublicPickRow>(
    `/rest/v1/pikkit_public_picks?game_date=eq.${encodedDate}&select=player_name,picks,prop_type,game_key`,
    { revalidateSeconds },
  )
}
