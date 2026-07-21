import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normName, resolveNameEntry } from '@/lib/nameNorm'

// Read-only diagnostic for the "why are some batters always blank on
// FHR%/HR%" investigation — does NOT touch buildBatterRow's fhr_pct/sa_pct
// formula or matching logic at all, just surfaces what the same two
// mlb-party RPCs DugoutClient.tsx already calls actually return for a
// specific set of names, so it can be checked from a phone without devtools.
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }

// Confirmed dead end (2026-07-21): the RPC returns the identical first-1000
// rows on every page regardless of Range offset. Kept only for the
// side-by-side comparison in the response below, not used as the real
// data source anymore.
async function mpRpc(fn: string, body: any): Promise<any[]> {
  try {
    const res = await fetch(`${MP_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...mpH, Range: '0-4999' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

async function mpGetAll(path: string): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    try {
      const res = await fetch(`${MP_URL}${path}`, { headers: { ...mpH, Range: `${offset}-${offset + PAGE - 1}` }, cache: 'no-store' })
      if (!res.ok) break
      const page = await res.json()
      if (!Array.isArray(page)) break
      out.push(...page)
      if (page.length < PAGE) break
    } catch { break }
  }
  return out
}

// The actual fix now shipped in api/dugout/data/route.ts — reads
// player_price_season_avg directly (real Range pagination, unlike the RPC)
// instead of the broken get_fhr_history_avg/get_sa_history_avg RPCs. Mirrored
// here so this diagnostic verifies the exact same code path going to
// production, not just a similar one.
async function fetchSeasonAvgDirect(marketKey: string, date: string): Promise<any[]> {
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

// Read-only introspection: does the underlying table exist and paginate
// normally via plain REST (unlike the RPC above)? A single unfiltered
// sample row tells us the real column names without guessing, before
// attempting to bypass the RPC and query the table directly.
async function mpTableSample(table: string): Promise<{ ok: boolean; status: number; sample: any[] }> {
  try {
    const res = await fetch(`${MP_URL}/rest/v1/${table}?select=*&limit=2`, { headers: mpH, cache: 'no-store' })
    const sample = res.ok ? await res.json() : []
    return { ok: res.ok, status: res.status, sample: Array.isArray(sample) ? sample : [] }
  } catch {
    return { ok: false, status: 0, sample: [] }
  }
}

// Bypasses the RPC entirely — a direct, exact-name filter against the real
// table can never hit the RPC's 1000-row cap since it only ever matches a
// handful of rows. If THIS comes back empty for a flagged player, the data
// genuinely never made it into player_price_season_avg for them (an
// upstream pipeline gap); if it comes back non-empty, the bug is purely in
// how the RPC/route queries and dedupes, not a real data gap.
async function mpDirectNameLookup(nameNorm: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${MP_URL}/rest/v1/player_price_season_avg?select=name_norm,bookmaker,market_key,avg_price,through_date&name_norm=eq.${encodeURIComponent(nameNorm)}&order=through_date.desc&limit=20`,
      { headers: mpH, cache: 'no-store' }
    )
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// A hyphenated exact-name lookup can produce a false "doesn't exist" —
// normName() deletes the hyphen ("Encarnacion-Strand" -> "encarnacionstrand"
// as one joined word), but if mlb-party's own pipeline normalizes the same
// name with a SPACE instead ("encarnacion strand"), an exact match against
// OUR spelling would never find their row even though it exists. This does
// a raw ILIKE substring search against the table itself, independent of our
// normalizer entirely, using the single longest raw word-chunk from the
// name (splitting on hyphens/spaces/periods) as the least-ambiguous term.
async function mpSubstringSearch(term: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${MP_URL}/rest/v1/player_price_season_avg?select=name_norm&name_norm=ilike.*${encodeURIComponent(term.toLowerCase())}*&limit=20`,
      { headers: mpH, cache: 'no-store' }
    )
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? Array.from(new Set(d.map((r: any) => r.name_norm))) : []
  } catch { return [] }
}

// Checks the RAW feed props_history is rolled up from — if a player has
// real rows here (under any market_key, including batter_home_runs_alternate,
// which never shows up in player_price_season_avg at all) but zero rows in
// the rollup, the aggregation step is dropping real data, not a genuine
// "TheOddsAPI never carried them" gap. name_norm exact match (same spelling
// the rollup itself uses, so this is comparable apples-to-apples), most
// recent 50 rows, every market_key so an alternate-only player still shows up.
async function mpPropsHistoryLookup(nameNorm: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${MP_URL}/rest/v1/props_history?select=player_name,name_norm,bookmaker,market_key,over_price,over_point,captured_at,game_time&name_norm=eq.${encodeURIComponent(nameNorm)}&order=captured_at.desc&limit=50`,
      { headers: mpH, cache: 'no-store' }
    )
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// Exactly mirrors the fhrAvgMap/saAvgMap useMemo blocks in DugoutClient.tsx
// (lines ~2774-2796) — same dedup-by-name_norm, same fanduel/williamhill_us
// bucketing — so this shows precisely what buildBatterRow itself would see.
function buildAvgMap(rows: any[]): Record<string, { fd?: number; cz?: number }> {
  const m: Record<string, { fd?: number; cz?: number }> = {}
  for (const r of rows) {
    const nn = normName(r.name_norm || r.player_name || '')
    if (!nn) continue
    if (!m[nn]) m[nn] = {}
    if (r.bookmaker === 'fanduel') m[nn].fd = Number(r.avg_price)
    if (r.bookmaker === 'williamhill_us') m[nn].cz = Number(r.avg_price)
  }
  return m
}

const DEFAULT_NAMES = ['Trea Turner', 'Yandy Diaz', 'Willson Contreras', 'Wilyer Abreu', 'Vladimir Guerrero Jr.', 'Jasson Dominguez']

export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const namesParam = searchParams.get('names')
  const names = namesParam ? namesParam.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_NAMES

  const [fhrAvgRaw, saAvgRaw, fhrAvgRpcRaw, saAvgRpcRaw, tableSample, propsHistorySample] = await Promise.all([
    fetchSeasonAvgDirect('batter_first_home_run', date),
    fetchSeasonAvgDirect('batter_home_runs', date),
    mpRpc('get_fhr_history_avg', { p_date: date }),
    mpRpc('get_sa_history_avg', { p_date: date }),
    mpTableSample('player_price_season_avg'),
    // props_history is the raw, per-scrape feed player_price_season_avg is
    // itself rolled up FROM (via refresh_price_season_avg_incremental,
    // nightly). If a player has real rows here but none in the rollup, the
    // aggregation step is the bug, not a genuine "TheOddsAPI never carries
    // them" gap. Unfiltered sample first to learn the real column names
    // before attempting a targeted per-player query against it.
    mpTableSample('props_history'),
  ])

  const fhrAvgMap = buildAvgMap(fhrAvgRaw)
  const saAvgMap = buildAvgMap(saAvgRaw)

  const results = await Promise.all(names.map(async name => {
    const nn = normName(name)
    const fhrExact = fhrAvgMap[nn] ?? null
    const saExact = saAvgMap[nn] ?? null
    const fhrFuzzy = resolveNameEntry(fhrAvgMap, nn)
    const saFuzzy = resolveNameEntry(saAvgMap, nn)
    // Substring scan against every distinct name_norm actually present, to
    // catch a spelling/formatting mismatch resolveNameEntry's fuzzy pass
    // wouldn't — e.g. this player under a different suffix/nickname entirely.
    const lastWord = nn.split(' ').pop() || nn
    const similarFhrKeys = lastWord.length >= 4 ? Object.keys(fhrAvgMap).filter(k => k.includes(lastWord) && k !== nn) : []
    const similarSaKeys = lastWord.length >= 4 ? Object.keys(saAvgMap).filter(k => k.includes(lastWord) && k !== nn) : []
    const directTableRows = await mpDirectNameLookup(nn)
    // Longest raw word-chunk (splitting on anything that isn't a letter —
    // hyphens, spaces, periods, accents included), independent of normName's
    // own hyphen-handling, so a hyphenated name can't produce a false
    // "doesn't exist" just because our normalizer spells it differently.
    const rawWords = name.split(/[^A-Za-zÀ-ÿ]+/).filter(Boolean).sort((a, b) => b.length - a.length)
    const substringTerm = rawWords[0] || nn
    const substringMatches = substringTerm.length >= 4 ? await mpSubstringSearch(substringTerm) : []
    const propsHistoryRows = await mpPropsHistoryLookup(nn)
    return {
      name,
      name_norm: nn,
      fhrAvg: { exactMatch: fhrExact, fuzzyMatch: fhrFuzzy, similarKeysInMap: similarFhrKeys },
      saAvg: { exactMatch: saExact, fuzzyMatch: saFuzzy, similarKeysInMap: similarSaKeys },
      // Bypasses the RPC entirely — a direct exact-name filter against the
      // real table. Non-empty here + null exactMatch above means the RPC
      // dropped real data; empty here means it never existed for this
      // player in the first place (an upstream pipeline gap, not a query bug).
      directTableRows,
      // Independent of our own normalizer entirely — a raw substring search
      // against the table for this name's most distinctive word-chunk. If
      // this is ALSO empty, the data really isn't in the table under any
      // spelling; if it finds something, our normalizer disagrees with
      // mlb-party's own spelling for this name.
      substringSearch: { term: substringTerm, matchingNameNormsInTable: substringMatches },
      // Raw feed rows for this exact name_norm, any market_key/bookmaker/date
      // — non-empty here + empty directTableRows above means real odds data
      // exists but the nightly rollup isn't picking it up (a real, separate
      // aggregation bug); empty here too means TheOddsAPI genuinely never
      // carried this player at all this season.
      propsHistoryRows,
    }
  }))

  return NextResponse.json({
    date,
    // Now sourced via the direct-table fix (fetchSeasonAvgDirect), same
    // code path as api/dugout/data/route.ts.
    fhrAvgDistinctPlayers: Object.keys(fhrAvgMap).length,
    saAvgDistinctPlayers: Object.keys(saAvgMap).length,
    results,
    // Kept for comparison only — the old, still-broken RPC path.
    rpcComparison: {
      fhrAvgRowCount: fhrAvgRpcRaw.length,
      saAvgRowCount: saAvgRpcRaw.length,
      fhrAvgDistinctPlayers: Object.keys(buildAvgMap(fhrAvgRpcRaw)).length,
      saAvgDistinctPlayers: Object.keys(buildAvgMap(saAvgRpcRaw)).length,
    },
    underlyingTableProbe: tableSample,
    // Introspection only — real column names for the raw feed table, to
    // design the next targeted query against it (per-player existence +
    // a broader audit of any other players with raw rows but no rollup).
    propsHistoryProbe: propsHistorySample,
  })
}
