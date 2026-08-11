import { createAdminClient } from '@/lib/supabase/admin'

// Precomputes the two season-average inputs Custom Matrix's FHR%/HR%
// Dugout Specs Factors (and the board's own FHR%/HR% columns) need —
// "today's live price vs. this player's own season-average price" —
// snapshotted ONCE per date instead of resolved live against mlb-party's
// player_price_season_avg on every request.
//
// Real gap (2026-07-25): unlike Statcast/pitchlog_stat/matchup_edge (all
// moved onto an in-house daily precompute earlier this session for exactly
// this reason), FHR%/HR% never got one — dugout/data/route.ts's
// fetchSeasonAvgDirect always re-queries mlb-party's own external table
// live, filtered to whatever `through_date` rows still happen to exist at
// or before the requested date. Reported live: viewing an older past date,
// FHR%/HR% (and any Matrix Factor built on them) come back blank —
// mlb-party's own retention for that table doesn't reliably keep rows far
// enough back, so this codebase has zero LOCAL historical record and is
// fully dependent on an external, unowned system's rollup window for
// backtesting correctness. Snapshotting the raw averages here (not the
// fully-computed FHR%/HR% percentage) keeps the architecture consistent:
// evaluateDugoutSpecsFactor still combines a live/correctly-frozen `fd`
// (today's price, already handled by the existing odds-freeze + gap-odds
// caching) with a now-locally-owned historical `avg`.
export const DUGOUT_SEASON_AVG_TABLE = 'dugout_season_avg_precomputed'

// mlb-party — same tiny fetch helper already duplicated in
// api/admin/dugout-name-check/route.ts and api/dugout/data/route.ts rather
// than exported from either (both are route files, not meant to be
// imported elsewhere); keeping a third self-contained copy here matches
// that existing precedent instead of introducing a new shared-lib coupling
// to route.ts.
const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }

async function mpGet(path: string, range?: string): Promise<any[]> {
  try {
    const headers = range ? { ...mpH, Range: range } : mpH
    const res = await fetch(`${MP_URL}${path}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// A `Range` header does not bypass this project's real per-request cap
// (confirmed live elsewhere in this codebase — see dugout/data/route.ts's
// own mpGetAll comment) — page until a page comes back shorter than the
// page size, the only reliable end-of-data signal.
async function mpGetAll(path: string): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    const page = await mpGet(path, `${offset}-${offset + PAGE - 1}`)
    out.push(...page)
    if (page.length < PAGE) break
  }
  return out
}

// Same "latest through_date at or before the target date" resolution
// dugout/data/route.ts's live fetchSeasonAvgDirect already uses — kept
// identical so a backfilled historical row and today's live value are
// computed by the exact same rule, just captured once instead of
// re-resolved on every request.
async function fetchSeasonAvgDirect(marketKey: string, date: string): Promise<{ name_norm: string; bookmaker: string; avg_price: number }[]> {
  const cutoff = new Date(`${date}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() + 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const rows = await mpGetAll(
    `/rest/v1/player_price_season_avg?select=name_norm,bookmaker,avg_price,through_date&market_key=eq.${marketKey}&bookmaker=in.(fanduel,williamhill_us)&through_date=lte.${cutoffStr}`
  )
  const latest = new Map<string, any>()
  for (const r of rows) {
    const key = `${r.name_norm}|${r.bookmaker}`
    const existing = latest.get(key)
    if (!existing || r.through_date > existing.through_date) latest.set(key, r)
  }
  return Array.from(latest.values())
}

const MARKET_KEYS = ['batter_first_home_run', 'batter_home_runs'] as const

export async function precomputeDugoutSeasonAvgForDate(date: string): Promise<{ date: string; rows: number }> {
  const admin = createAdminClient()
  const rows: { game_date: string; market_key: string; name_norm: string; bookmaker: string; avg_price: number }[] = []
  for (const marketKey of MARKET_KEYS) {
    const marketRows = await fetchSeasonAvgDirect(marketKey, date)
    for (const r of marketRows) {
      if (!r.name_norm || !r.bookmaker || r.avg_price == null) continue
      rows.push({ game_date: date, market_key: marketKey, name_norm: r.name_norm, bookmaker: r.bookmaker, avg_price: Number(r.avg_price) })
    }
  }
  if (!rows.length) return { date, rows: 0 }

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from(DUGOUT_SEASON_AVG_TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'game_date,market_key,name_norm,bookmaker' })
    if (error) throw error
  }
  return { date, rows: rows.length }
}
