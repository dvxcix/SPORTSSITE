import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROP_META } from '@/lib/watchlist'
import { fetchLiveFeed, checkEarlyWin, settleFinalPick, applyLegResultToPost } from '@/lib/pickGrading'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'

export const revalidate = 0
export const maxDuration = 60

// Runs every ~2 minutes (see vercel.json) and is now the PRIMARY grading
// path, not just an early-win nicety:
//  - Live (in progress): only ever locks in early WINS — a stat that's
//    already happened can't be undone mid-game, so a leg can flip to ✓ the
//    moment its threshold is crossed. Losses/pushes are never called here;
//    a "hits" prop isn't dead until the game actually ends.
//  - Final: runs the SAME full settlement settle-picks does (win/loss/push
//    + parlay rollup, via the shared settleFinalPick), so a game that just
//    ended gets graded within ~2 minutes instead of sitting pending until
//    the once-daily settle-picks run. That daily cron still runs too, as a
//    backstop in case this one ever misses a beat — not the primary path.
function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

const FINAL_MESSAGES: Record<string, string> = {
  win: '🎉 Your pick hit! Final result: WIN',
  loss: 'Your pick settled — final result: LOSS',
  push: 'Your pick pushed (voided) — stake refunded',
}

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()

  const { data: pending, error } = await admin
    .from('picks')
    .select('id, post_id, game_pk, mlb_id, pick_type, team, post:posts(id, author_id, pick_data)')
    .eq('sport', 'MLB')
    .eq('result', 'pending')
    .not('game_pk', 'is', null)
    .not('mlb_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pending?.length) return NextResponse.json({ won: 0, settled: 0, checked: 0, message: 'No pending MLB picks with game_pk + mlb_id' })

  const byGame = new Map<string, typeof pending>()
  for (const p of pending) {
    if (!byGame.has(p.game_pk)) byGame.set(p.game_pk, [])
    byGame.get(p.game_pk)!.push(p)
  }

  let won = 0
  let settled = 0
  let checked = 0
  const notified: string[] = []

  for (const [gamePk, picks] of byGame.entries()) {
    const feed = await fetchLiveFeed(gamePk)
    const state = feed?.gameData?.status?.abstractGameState

    if (state === 'Final') {
      for (const pick of picks) {
        checked++
        const post = Array.isArray(pick.post) ? pick.post[0] : pick.post
        const outcome = await settleFinalPick(admin, pick as any, feed, PROP_META)
        if (!outcome) continue // unsupported pick_type — left pending
        settled++
        if (outcome.result === 'win') won++

        if (post?.author_id && outcome.legPlayerName && outcome.result === 'win') {
          const teamLogo = getTeamLogoUrl((pick as any).team)
          await admin.from('notifications').insert({
            user_id: post.author_id, type: 'pick_result',
            message: `🎉 ${outcome.legPlayerName} came through — that leg hit!`,
            link: `/posts/${outcome.postId}`, target_id: outcome.postId, target_type: 'post',
            data: (outcome.legHeadshotUrl || teamLogo) ? { avatar_url: outcome.legHeadshotUrl, team_logo: teamLogo } : null,
          })
          notified.push(outcome.postId!)
        }
        if (post?.author_id && outcome.overallResult) {
          await admin.from('notifications').insert({
            user_id: post.author_id, type: 'pick_result',
            message: FINAL_MESSAGES[outcome.overallResult],
            link: `/posts/${outcome.postId}`, target_id: outcome.postId, target_type: 'post',
          })
          notified.push(outcome.postId!)
        }
      }
      continue
    }

    if (state !== 'Live') continue // Preview/Postponed/etc — nothing to do yet

    for (const pick of picks) {
      checked++
      const post = Array.isArray(pick.post) ? pick.post[0] : pick.post
      if (!post) continue

      const isEarlyWin = checkEarlyWin(pick.pick_type, pick.mlb_id!, feed)
      if (!isEarlyWin) continue

      const nowIso = new Date().toISOString()
      await admin.from('picks').update({ result: 'win', graded_at: nowIso }).eq('id', pick.id)

      // Uses the same compare-and-swap helper settleFinalPick does — two
      // legs of the same parlay grading close together (this one early via
      // Live, another via a Final game in the same run) both touch the same
      // pick_data blob, and a plain read-then-write would let one silently
      // clobber the other.
      const { legPlayerName, legHeadshotUrl } = await applyLegResultToPost(admin, post.id, pick.mlb_id!, pick.pick_type, 'win', PROP_META)
      const playerName = legPlayerName ?? ''

      won++
      if (post.author_id) {
        const teamLogo = getTeamLogoUrl(pick.team)
        await admin.from('notifications').insert({
          user_id: post.author_id,
          type: 'pick_result',
          message: playerName ? `🎉 ${playerName} just hit — your pick is looking good!` : '🎉 Your pick just hit!',
          link: `/posts/${post.id}`,
          target_id: post.id,
          target_type: 'post',
          data: (legHeadshotUrl || teamLogo) ? { avatar_url: legHeadshotUrl, team_logo: teamLogo } : null,
        })
        notified.push(post.id)
      }
    }
  }

  return NextResponse.json({ won, settled, checked, notified })
}
