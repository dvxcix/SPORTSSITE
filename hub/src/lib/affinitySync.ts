import { createAdminClient } from '@/lib/supabase/admin'
import { parseCsv } from '@/lib/savantSync'

type AdminClient = ReturnType<typeof createAdminClient>

// Savant's "Affinity" tool (baseballsavant.mlb.com/affinity-pitchersAndHitters-
// byHittingProfile) clusters players by batted-ball QUALITY-OF-CONTACT profile
// — barrel/solid-contact/weak-topped-under/flare-burner/strikeout/bunt rates —
// not by pitch mix or velocity. Confirmed live via the page's own network
// tab: these are six plain, static, unauthenticated CSVs at a permanent
// path, CORS-open, refreshing at least daily (last-modified was ~45min old
// when checked) — Savant's already done the similarity math; this just
// downloads and stores it, same shape as every other Savant sync here.
const BASE = 'https://baseballsavant.mlb.com/app/affinity'

async function fetchAffinityCsv(name: string): Promise<Record<string, string>[]> {
  const res = await fetch(`${BASE}/${name}.csv`, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/csv,text/plain,*/*',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Affinity CSV ${res.status}: ${name} :: ${text.slice(0, 300)}`)
  return parseCsv(text)
}

const WRITE_CHUNK_SIZE = 1000

const num = (v: string | undefined): number | null => (v === undefined || v === '' ? null : Number(v))

async function syncSide(admin: AdminClient, side: 'pitchers' | 'hitters'): Promise<{ profiles: number; matches: number }> {
  const profilesTable = side === 'pitchers' ? 'pitcher_affinity_profiles' : 'hitter_affinity_profiles'
  const matchesTable = side === 'pitchers' ? 'pitcher_affinity_matches' : 'hitter_affinity_matches'

  const [indexRows, profileRows, matchRows] = await Promise.all([
    fetchAffinityCsv(`affinity_${side}ByHittingProfile_index`),
    fetchAffinityCsv(`affinity_${side}ByHittingProfile_profiles`),
    fetchAffinityCsv(`affinity_${side}ByHittingProfile_matchScores`),
  ])

  const profileByKey = new Map(profileRows.map(r => [r.key, r]))
  const profileUpserts = indexRows
    .filter(r => r.key && r.id && r.side)
    .map(r => {
      const p = profileByKey.get(r.key)
      return {
        key: r.key, season: Number(r.year), mlb_id: Number(r.id), hand: r.side, name: r.name,
        freq_bbhb: num(p?.freq_bbhb), freq_so: num(p?.freq_so), freq_bunt: num(p?.freq_bunt),
        freq_barrel: num(p?.freq_barrel), freq_solidcontact: num(p?.freq_solidcontact),
        freq_flareburner: num(p?.freq_flareburner), freq_poorlyunder: num(p?.freq_poorlyunder),
        freq_poorlytopped: num(p?.freq_poorlytopped), freq_poorlyweak: num(p?.freq_poorlyweak),
        updated_at: new Date().toISOString(),
      }
    })

  for (let i = 0; i < profileUpserts.length; i += WRITE_CHUNK_SIZE) {
    const { error } = await admin.from(profilesTable).upsert(profileUpserts.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'key,season' })
    if (error) throw error
  }

  // Season isn't in the matchScores CSV itself — every row shares whatever
  // season the index/profiles CSVs just reported (Savant computes this
  // per-season, current year only).
  const season = indexRows[0] ? Number(indexRows[0].year) : new Date().getFullYear()
  const matchUpserts = matchRows
    .filter(r => r.key1 && r.key2 && r.match_score !== '')
    .map(r => ({ key1: r.key1, key2: r.key2, season, match_score: Number(r.match_score), updated_at: new Date().toISOString() }))

  for (let i = 0; i < matchUpserts.length; i += WRITE_CHUNK_SIZE) {
    const { error } = await admin.from(matchesTable).upsert(matchUpserts.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'key1,key2,season' })
    if (error) throw error
  }

  return { profiles: profileUpserts.length, matches: matchUpserts.length }
}

export async function syncAffinityData(admin: AdminClient) {
  const [pitchers, hitters] = await Promise.all([
    syncSide(admin, 'pitchers'),
    syncSide(admin, 'hitters'),
  ])
  return { pitchers, hitters }
}
