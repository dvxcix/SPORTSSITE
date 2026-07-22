import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'
import { currentSeason } from '@/lib/playerSync'

export const revalidate = 3600

// Same mlb-party direct-REST pattern as dugout/data/route.ts's mpGet — a
// separate Supabase project (reliever_ratings/bullpen_ratings live there,
// not in this project's own DB), read via its own service-role key rather
// than a live one baked into source.
const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }

async function mpGet(path: string): Promise<any[]> {
  try {
    const res = await fetch(`${MP_URL}${path}`, { headers: mpH, next: { revalidate: 3600 } })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

// mlb-party stores Arizona as "ARI" — every other ambiguous team abbr
// (CWS/KC/SD/SF/TB/WSH) already matches the canonical form Dugout's own
// game data uses (see dugout/data/route.ts's TEAM_ABBR_ALIASES), confirmed
// directly against bullpen_ratings; Arizona is the one real mismatch.
const MP_TEAM_ABBR: Record<string, string> = { AZ: 'ARI' }

// Backs both the bullpen rating badge next to a Dugout matchup's starting
// pitcher (mlb-party's own team-level rollup: ERA/OPS-vs-hand/HR-9/tier)
// and the "Vs. This Team" scope in MatchupPitchBreakdown, which needs the
// real roster of mlb ids currently rated as that team's relievers to filter
// a batter's own pitch log down to what he's actually seen from that
// bullpen. reliever_ratings has no 'starter' role at all — every row in it
// already is a reliever, so no exclusion filtering is needed.
export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const rawTeamAbbr = (searchParams.get('teamAbbr') || '').toUpperCase()
  if (!rawTeamAbbr) return NextResponse.json({ error: 'teamAbbr required' }, { status: 400 })
  const teamAbbr = MP_TEAM_ABBR[rawTeamAbbr] ?? rawTeamAbbr

  const season = currentSeason()
  const [bullpenRows, relieverRows] = await Promise.all([
    mpGet(`/rest/v1/bullpen_ratings?team_abbr=eq.${teamAbbr}&season=eq.${season}&select=*`),
    mpGet(`/rest/v1/reliever_ratings?team_abbr=eq.${teamAbbr}&season=eq.${season}&select=*&order=ip.desc.nullslast`),
  ])

  const b = bullpenRows[0]
  return NextResponse.json({
    bullpen: b ? {
      era: num(b.bullpen_era), opsVsLhb: num(b.bullpen_ops_vs_lhb), opsVsRhb: num(b.bullpen_ops_vs_rhb),
      hrPer9: num(b.bullpen_hr_per9), whip: num(b.bullpen_whip), k9: num(b.bullpen_k9),
      tier: (b.bullpen_tier as string) ?? null, updatedAt: (b.updated_at as string) ?? null,
    } : null,
    relievers: relieverRows.map(r => ({
      mlbId: r.pitcher_mlb_id as number, name: (r.pitcher_name as string) ?? null, role: (r.role as string) ?? null,
      era: num(r.era), ip: num(r.ip), hrPer9: num(r.hr_per9),
      vsLhbOps: num(r.vs_lhb_ops), vsRhbOps: num(r.vs_rhb_ops),
      appearances: (r.appearances as number) ?? null, saves: (r.saves as number) ?? null, holds: (r.holds as number) ?? null,
    })),
  })
}
