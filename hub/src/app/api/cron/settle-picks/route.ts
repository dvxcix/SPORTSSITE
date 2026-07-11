import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROP_META } from '@/lib/watchlist'
import { THRESHOLDS, fetchLiveFeed, findFirstHrBatterId, findBattingLine } from '@/lib/pickGrading'

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

    let firstHrBatterId: number | null | undefined // lazy, only computed if a first_hr pick shows up
    for (const pick of picks) {
      const battingLine = findBattingLine(feed, pick.mlb_id!)
      let result: 'win' | 'loss' | 'push'

      if (!battingLine) {
        // Player never appeared in the box score (scratched/DNP) — standard
        // sportsbook convention is to void/push the prop.
        result = 'push'
      } else if (pick.pick_type === 'first_hr') {
        if (firstHrBatterId === undefined) firstHrBatterId = findFirstHrBatterId(feed)
        result = firstHrBatterId === pick.mlb_id ? 'win' : 'loss'
      } else {
        const check = THRESHOLDS[pick.pick_type]
        if (!check) {
          // Unknown/unsupported pick_type (e.g. pitcher_strikeouts — our
          // composer only offers batter props right now) — leave pending
          // rather than guess.
          skipped++
          skipped_reasons[`unsupported:${pick.pick_type}`] = (skipped_reasons[`unsupported:${pick.pick_type}`] ?? 0) + 1
          continue
        }
        result = check(battingLine) ? 'win' : 'loss'
      }

      const nowIso = new Date().toISOString()
      await admin.from('picks').update({ result, graded_at: nowIso }).eq('id', pick.id)
      if (pick.post_id) {
        const { data: post } = await admin.from('posts').select('pick_data').eq('id', pick.post_id).single()
        if (post?.pick_data) {
          if (Array.isArray(post.pick_data.legs)) {
            // Parlay post — update just the matching leg (by mlb_id + pick
            // type, since the leg stores prop_key not pick_type). Overall
            // result only resolves once every leg has graded: any loss wins
            // out, all-push is a push, otherwise it's a win.
            const legs = post.pick_data.legs.map((leg: any) => {
              const legPickType = PROP_META[leg.prop_key]?.pickType ?? leg.prop_key
              if (leg.mlb_id === pick.mlb_id && legPickType === pick.pick_type && leg.result === 'pending') {
                return { ...leg, result }
              }
              return leg
            })
            const allGraded = legs.every((l: any) => l.result !== 'pending')
            const overall = !allGraded ? post.pick_data.result
              : legs.some((l: any) => l.result === 'loss') ? 'loss'
              : legs.every((l: any) => l.result === 'push') ? 'push'
              : 'win'
            await admin.from('posts').update({ pick_data: { ...post.pick_data, legs, result: overall } }).eq('id', pick.post_id)
          } else {
            await admin.from('posts').update({ pick_data: { ...post.pick_data, result } }).eq('id', pick.post_id)
          }
        }
      }
      graded++
      graded_ids.push(pick.id)
    }
  }

  return NextResponse.json({ graded, skipped, skipped_reasons, graded_ids })
}
