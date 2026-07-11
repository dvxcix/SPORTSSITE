import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROP_META } from '@/lib/watchlist'
import { fetchLiveFeed, checkEarlyWin } from '@/lib/pickGrading'

export const revalidate = 0
export const maxDuration = 60

// Runs every couple minutes WHILE games are live (see vercel.json) — unlike
// settle-picks (once daily, only after a game goes Final, which is still
// the authoritative pass for losses/pushes), this one only ever locks in
// EARLY WINS: a stat that has already happened can't be undone mid-game,
// so a leg can flip to ✓ the moment its threshold is crossed instead of
// waiting for the game to end. Losses/pushes are deliberately left alone
// here — a "hits" prop isn't lost until the game is truly over.
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

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()

  const { data: pending, error } = await admin
    .from('picks')
    .select('id, post_id, game_pk, mlb_id, pick_type, post:posts(id, author_id, pick_data)')
    .eq('sport', 'MLB')
    .eq('result', 'pending')
    .not('game_pk', 'is', null)
    .not('mlb_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pending?.length) return NextResponse.json({ won: 0, checked: 0, message: 'No pending MLB picks with game_pk + mlb_id' })

  const byGame = new Map<string, typeof pending>()
  for (const p of pending) {
    if (!byGame.has(p.game_pk)) byGame.set(p.game_pk, [])
    byGame.get(p.game_pk)!.push(p)
  }

  let won = 0
  let checked = 0
  const notified: string[] = []

  for (const [gamePk, picks] of byGame.entries()) {
    const feed = await fetchLiveFeed(gamePk)
    const state = feed?.gameData?.status?.abstractGameState
    // Final games are settle-picks' job (it also handles losses/pushes there
    // in one pass) — skip here to avoid two crons racing on the same row.
    if (state !== 'Live') continue

    for (const pick of picks) {
      checked++
      const post = Array.isArray(pick.post) ? pick.post[0] : pick.post
      if (!post) continue

      const isEarlyWin = checkEarlyWin(pick.pick_type, pick.mlb_id!, feed)
      if (!isEarlyWin) continue

      const nowIso = new Date().toISOString()
      await admin.from('picks').update({ result: 'win', graded_at: nowIso }).eq('id', pick.id)

      let playerName = ''
      if (post.pick_data && Array.isArray(post.pick_data.legs)) {
        const legs = post.pick_data.legs.map((leg: any) => {
          const legPickType = PROP_META[leg.prop_key]?.pickType ?? leg.prop_key
          if (leg.mlb_id === pick.mlb_id && legPickType === pick.pick_type && leg.result === 'pending') {
            playerName = leg.player_name
            return { ...leg, result: 'win' }
          }
          return leg
        })
        // Overall parlay result is NOT rolled up here — it only resolves
        // once every leg is graded, which still happens in settle-picks
        // once the game is Final. This pass only flips individual legs.
        await admin.from('posts').update({ pick_data: { ...post.pick_data, legs } }).eq('id', post.id)
      } else if (post.pick_data) {
        playerName = post.pick_data.player_name ?? ''
        await admin.from('posts').update({ pick_data: { ...post.pick_data, result: 'win' } }).eq('id', post.id)
      }

      won++
      if (post.author_id) {
        await admin.from('notifications').insert({
          user_id: post.author_id,
          type: 'pick_result',
          message: playerName ? `🎉 ${playerName} just hit — your pick is looking good!` : '🎉 Your pick just hit!',
          link: `/posts/${post.id}`,
          target_id: post.id,
          target_type: 'post',
        })
        notified.push(post.id)
      }
    }
  }

  return NextResponse.json({ won, checked, notified })
}
