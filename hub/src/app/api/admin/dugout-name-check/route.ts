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

// Reverted the pagination attempt — confirmed live (2026-07-21) that paging
// this RPC via Range offsets returns the exact same first-1000 rows on
// every page regardless of offset, so it doesn't support offset pagination
// at all (unlike the plain table endpoints elsewhere in the real route,
// which do). It only multiplied the request count with no effect.
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

  const [fhrAvgRaw, saAvgRaw, tableSample] = await Promise.all([
    mpRpc('get_fhr_history_avg', { p_date: date }),
    mpRpc('get_sa_history_avg', { p_date: date }),
    mpTableSample('player_price_season_avg'),
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
    }
  }))

  return NextResponse.json({
    date,
    fhrAvgRowCount: fhrAvgRaw.length,
    saAvgRowCount: saAvgRaw.length,
    fhrAvgDistinctPlayers: Object.keys(fhrAvgMap).length,
    saAvgDistinctPlayers: Object.keys(saAvgMap).length,
    results,
    // Introspection only — does player_price_season_avg exist and what
    // columns does it actually have? Tells us whether querying it directly
    // (bypassing the RPC's broken pagination) is even viable.
    underlyingTableProbe: tableSample,
  })
}
