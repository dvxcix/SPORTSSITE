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

  const [fhrAvgRaw, saAvgRaw] = await Promise.all([
    mpRpc('get_fhr_history_avg', { p_date: date }),
    mpRpc('get_sa_history_avg', { p_date: date }),
  ])

  const fhrAvgMap = buildAvgMap(fhrAvgRaw)
  const saAvgMap = buildAvgMap(saAvgRaw)

  const results = names.map(name => {
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
    return {
      name,
      name_norm: nn,
      fhrAvg: { exactMatch: fhrExact, fuzzyMatch: fhrFuzzy, similarKeysInMap: similarFhrKeys },
      saAvg: { exactMatch: saExact, fuzzyMatch: saFuzzy, similarKeysInMap: similarSaKeys },
    }
  })

  return NextResponse.json({
    date,
    fhrAvgRowCount: fhrAvgRaw.length,
    saAvgRowCount: saAvgRaw.length,
    fhrAvgDistinctPlayers: Object.keys(fhrAvgMap).length,
    saAvgDistinctPlayers: Object.keys(saAvgMap).length,
    results,
  })
}
