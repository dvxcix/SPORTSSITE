import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { currentSeason } from '@/lib/playerSync'

export const revalidate = 3600

const AFFINITY_PROFILE_COLUMNS = [
  'key', 'season', 'mlb_id', 'hand', 'name',
  'freq_bbhb', 'freq_so', 'freq_bunt', 'freq_barrel', 'freq_solidcontact',
  'freq_flareburner', 'freq_poorlyunder', 'freq_poorlytopped', 'freq_poorlyweak',
  'updated_at',
].join(',')

// Real Savant "Affinity" data (see affinitySync.ts) for one player's key
// ("<mlb_id>-<hand>") — his own batted-ball quality-of-contact profile plus
// every other player at or above `minScore` similarity, sorted by score
// descending. `role` picks the pitcher- or hitter-side table pair.
export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  const role = searchParams.get('role') === 'hitter' ? 'hitter' : 'pitcher'
  const requestedMinScore = Number(searchParams.get('minScore') ?? '0.6')
  const requestedLimit = Number(searchParams.get('limit') ?? '30')
  if (!key || key.length > 64 || !/^\d+-[A-Za-z]+$/.test(key)) {
    return NextResponse.json({ error: 'Valid key required' }, { status: 400 })
  }
  if (!Number.isFinite(requestedMinScore) || requestedMinScore < 0 || requestedMinScore > 1) {
    return NextResponse.json({ error: 'minScore must be between 0 and 1' }, { status: 400 })
  }
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json({ error: 'limit must be an integer from 1 to 100' }, { status: 400 })
  }
  const minScore = requestedMinScore
  const limit = requestedLimit

  const profilesTable = role === 'pitcher' ? 'pitcher_affinity_profiles' : 'hitter_affinity_profiles'
  const matchesTable = role === 'pitcher' ? 'pitcher_affinity_matches' : 'hitter_affinity_matches'
  const season = currentSeason()
  const admin = createAdminClient()

  const [profileRes, matchesRes] = await Promise.all([
    admin.from(profilesTable).select(AFFINITY_PROFILE_COLUMNS).eq('key', key).eq('season', season).maybeSingle(),
    admin.from(matchesTable).select('key2, match_score').eq('key1', key).eq('season', season).neq('key2', key).gte('match_score', minScore).order('match_score', { ascending: false }).limit(limit),
  ])

  const matchKeys = (matchesRes.data ?? []).map(m => m.key2)
  const namesRes = matchKeys.length
    ? await admin.from(profilesTable).select('key, mlb_id, hand, name').in('key', matchKeys).eq('season', season)
    : { data: [] as { key: string; mlb_id: number; hand: string; name: string }[] }
  const nameByKey = Object.fromEntries((namesRes.data ?? []).map(r => [r.key, r]))

  return NextResponse.json({
    profile: profileRes.data ?? null,
    similar: (matchesRes.data ?? [])
      .map(m => {
        const n = nameByKey[m.key2]
        return n ? { key: m.key2, mlbId: n.mlb_id, hand: n.hand, name: n.name, matchScore: Number(m.match_score) } : null
      })
      .filter((x): x is { key: string; mlbId: number; hand: string; name: string; matchScore: number } => x !== null),
  })
}
