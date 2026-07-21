import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups, isPregame } from '@/lib/mlbSchedule'
import { combineOdds, calcPayout } from '@/lib/parlayCalc'
import { PROP_META } from '@/lib/watchlist'
import { notifyMentions } from '@/lib/mentions'
import { notifyFollowers } from '@/lib/notify'

export const revalidate = 0

type Leg = {
  mlb_id: number | null; player_name: string; team: string | null; headshot_url: string | null
  game_pk: string | null; game_date: string | null
  prop_key: string; prop_label: string; line: string; book: string | null; odds: number | null
}

// Every other pick-creation path (FeedComposer) used to insert straight from
// the browser via the Supabase client — a client-side "has this game
// started" check is trivially bypassable (devtools, or just a stale tab left
// open past first pitch), and the whole point of "real graded records" falls
// apart if someone can post a pick after already knowing the outcome. This
// route re-validates every leg's game state live against MLB (same
// getTodaysMatchups/isPregame already used to decide when the Browserbase
// scrapers stop bothering with a game) and is now the ONLY way a pick or
// parlay post gets created — plain text/poll posts still go straight from
// the client since there's no time-sensitive integrity concern there.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const legs: Leg[] = Array.isArray(body?.legs) ? body.legs : []
  const content: string = typeof body?.content === 'string' ? body.content : ''
  const wager: number | null = typeof body?.wager === 'number' && body.wager > 0 ? body.wager : null
  const imageUrl: string | null = typeof body?.imageUrl === 'string' && body.imageUrl ? body.imageUrl : null
  const visibility: string = body?.visibility === 'followers' ? 'followers' : 'public'
  const groupId: string | null = typeof body?.groupId === 'string' ? body.groupId : null

  if (!legs.length) return NextResponse.json({ error: 'No pick legs provided' }, { status: 400 })
  for (const l of legs) {
    if (!l.game_pk || !l.mlb_id || !l.prop_key || l.odds == null) {
      return NextResponse.json({ error: 'Malformed pick leg' }, { status: 400 })
    }
  }

  // Re-fetch live game state per distinct date represented — almost always
  // just today, but a leg's game_date is whatever date it was actually
  // composed against, so don't assume "today" server-side.
  const dates = Array.from(new Set(legs.map(l => l.game_date).filter(Boolean))) as string[]
  const gamesByDate = new Map(await Promise.all(dates.map(async d => [d, await getTodaysMatchups(d)] as const)))

  for (const l of legs) {
    const games = gamesByDate.get(l.game_date ?? '') ?? []
    const game = games.find(g => String(g.gamePk) === String(l.game_pk))
    // A game that's vanished from today's live schedule (postponed and
    // pulled, or a bad game_pk) is treated the same as "already started" —
    // fail closed, not open, when we can't positively confirm it's pregame.
    if (!game || !isPregame(game.status)) {
      // Temporary diagnostic (2026-07-21 incident) — pins down whether this
      // is "schedule fetch came back empty" (games.length === 0, upstream
      // issue) vs "found the date's games but this exact game_pk isn't in
      // them" (client/server game_pk or game_date mismatch) vs "found the
      // game and its real status genuinely isn't pregame" (working as
      // intended). Remove once the false-positive root cause is confirmed.
      console.error('[posts/pick] blocked as already-started', {
        player: l.player_name, game_pk: l.game_pk, game_date: l.game_date,
        gamesForDateCount: games.length,
        foundGame: !!game, gameStatus: game?.status ?? null,
        availableGamePks: games.map(g => g.gamePk),
      })
      return NextResponse.json({ error: `${l.player_name}'s game has already started or is no longer available — pick not posted.` }, { status: 409 })
    }
  }

  const isParlay = legs.length > 1
  const combined = isParlay ? combineOdds(legs.map(l => l.odds ?? 0)) : (legs[0].odds ?? null)
  const payout = combined != null && wager != null ? calcPayout(wager, combined).payout : null

  const legsSummary = legs.map(l => ({
    player_name: l.player_name, team: l.team, mlb_id: l.mlb_id, headshot_url: l.headshot_url,
    game_pk: l.game_pk, game_date: l.game_date,
    prop_key: l.prop_key, prop_label: l.prop_label, line: l.line, odds: l.odds, result: 'pending',
  }))

  const pickData = isParlay
    ? { legs: legsSummary, book: legs[0].book, combined_odds: combined, wager_amount: wager, potential_payout: payout, result: 'pending' }
    : { ...legsSummary[0], book: legs[0].book, wager_amount: wager, potential_payout: payout, sport: 'MLB' }

  const { data: post, error: postErr } = await supabase.from('posts').insert({
    author_id: user.id,
    content: content.trim(),
    post_type: isParlay ? 'parlay' : 'pick',
    sport: 'MLB',
    game_pk: isParlay ? null : legs[0].game_pk,
    book: legs[0].book,
    combined_odds: combined,
    wager_amount: wager,
    potential_payout: payout,
    pick_data: pickData,
    media_urls: imageUrl ? [imageUrl] : [],
    visibility,
    group_id: groupId,
  }).select('id').single()

  if (postErr || !post) return NextResponse.json({ error: 'Failed to post. Please try again.' }, { status: 500 })

  const { error: picksErr } = await supabase.from('picks').insert(legs.map(l => ({
    user_id: user.id,
    post_id: post.id,
    sport: 'MLB',
    game_pk: l.game_pk,
    game_date: l.game_date,
    mlb_id: l.mlb_id,
    pick_type: PROP_META[l.prop_key]?.pickType ?? l.prop_key,
    team: l.team,
    player_name: l.player_name,
    line: l.line,
    odds: l.odds,
    book: l.book,
    result: 'pending',
  })))

  const admin = createAdminClient()
  await notifyMentions(admin, user.id, content, `/posts/${post.id}`, post.id, 'a post')
  if (!picksErr) {
    await notifyFollowers(admin, {
      actorId: user.id, type: 'new_pick', message: `posted a new ${isParlay ? 'parlay' : 'pick'}`,
      link: `/posts/${post.id}`, targetId: post.id, targetType: 'post',
    })
  }

  return NextResponse.json({ id: post.id, picksTracked: !picksErr })
}
