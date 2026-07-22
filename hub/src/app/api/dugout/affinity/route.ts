import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { currentSeason } from '@/lib/playerSync'

export const revalidate = 3600

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
  const minScore = Number(searchParams.get('minScore') ?? '0.6')
  const limit = Math.min(Number(searchParams.get('limit') ?? '30'), 100)
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const profilesTable = role === 'pitcher' ? 'pitcher_affinity_profiles' : 'hitter_affinity_profiles'
  const matchesTable = role === 'pitcher' ? 'pitcher_affinity_matches' : 'hitter_affinity_matches'
  const season = currentSeason()
  const admin = createAdminClient()

  const [profileRes, matchesRes] = await Promise.all([
    admin.from(profilesTable).select('*').eq('key', key).eq('season', season).maybeSingle(),
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
