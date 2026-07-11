import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROP_META } from '@/lib/watchlist'
import { fetchLiveFeed, settleFinalPick } from '@/lib/pickGrading'

export const revalidate = 0
export const maxDuration = 60

function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured — refusing to run an unauthenticated settlement job' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()

  const { data: pending, error } = await admin
    .from('picks')
    .select('id, post_id, game_pk, mlb_id, pick_type, game_date')
    .eq('sport', 'MLB')
    .eq('result', 'pending')
    .not('game_pk', 'is', null)
    .not('mlb_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pending?.length) return NextResponse.json({ graded: 0, skipped: 0, message: 'No pending MLB picks with game_pk + mlb_id' })

  const byGame = new Map<string, typeof pending>()
  for (const p of pending) {
    if (!byGame.has(p.game_pk)) byGame.set(p.game_pk, [])
    byGame.get(p.game_pk)!.push(p)
  }

  let graded = 0
  let skipped = 0
  const graded_ids: string[] = []
  const skipped_reasons: Record<string, number> = {}

  for (const [gamePk, picks] of byGame.entries()) {
    const feed = await fetchLiveFeed(gamePk)
    const state = feed?.gameData?.status?.abstractGameState
    if (state !== 'Final') {
      skipped += picks.length
      skipped_reasons[state ?? 'unknown'] = (skipped_reasons[state ?? 'unknown'] ?? 0) + picks.length
      continue
    }

    for (const pick of picks) {
      const outcome = await settleFinalPick(admin, pick as any, feed, PROP_META)
      if (!outcome) {
        // Unknown/unsupported pick_type (e.g. pitcher_strikeouts — our
        // composer only offers batter props right now) — left pending
        // rather than guessed.
        skipped++
        skipped_reasons[`unsupported:${pick.pick_type}`] = (skipped_reasons[`unsupported:${pick.pick_type}`] ?? 0) + 1
        continue
      }
      graded++
      graded_ids.push(pick.id)
    }
  }

  return NextResponse.json({ graded, skipped, skipped_reasons, graded_ids })
}
