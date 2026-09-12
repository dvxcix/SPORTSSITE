import { getScoreboard, getGameSummary, getGameStatus, getTeams } from '@slipsurge/core/espn-api'
import type { SportKey } from '@slipsurge/core/espn-api'
import { getMLBGameFeed } from '@slipsurge/core/mlb-api'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { GameDetailClient } from './GameDetailClient'
import { MLBGameClient } from './MLBGameClient'
import type { GameRoomMessage } from '@/components/community/GameRoom'

export const revalidate = 15

const SPORT_LABEL: Record<string, string> = { nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL', soccer: 'MLS' }

// A straight pick's game_pk lives on the post itself, but a parlay's legs
// can span different games — game_pk was previously (bug, now fixed at the
// write site in FeedComposer.tsx) dropped when a leg got summarized into
// pick_data.legs[], leaving no way to tell which exact game a leg belonged
// to. Matching used to fall back to team abbreviation, which is wrong on
// two counts: abbreviations aren't unique across sports (an MLB team's
// abbreviation can collide with an unrelated soccer club's, so an MLB pick
// could show up on a totally different sport's game page), and it has no
// game/date scoping at all, so ANY past pick ever posted about that team
// would show up on every one of that team's games, not just this one.
// Matching is now exact game_pk only — a pick belongs to this game's tab
// if and only if its own game_pk (straight) or one of its legs' game_pk
// (parlay) equals this exact game.
async function fetchCommunityPicksForGame(supabase: any, gameId: string) {
  const { data } = await supabase
    .from('posts')
    .select('*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, bio, follower_count, is_verified, account_type, pick_record, tier, beta_access_active)')
    .in('post_type', ['pick', 'parlay'])
    .order('created_at', { ascending: false })
    .limit(300)

  const matches = (data ?? []).filter((p: any) => {
    if (String(p.game_pk) === String(gameId)) return true
    const legs = p.pick_data?.legs
    if (Array.isArray(legs)) return legs.some((leg: any) => leg.game_pk != null && String(leg.game_pk) === String(gameId))
    return false
  })

  matches.sort((a: any, b: any) => (b.reaction_count ?? 0) - (a.reaction_count ?? 0))
  return matches.slice(0, 20)
}

async function fetchGameRoomMessages(supabase: any, sport: string, gameId: string): Promise<GameRoomMessage[]> {
  const { data } = await supabase.from('game_room_messages')
    .select('id,sport,game_id,user_id,content,created_at,sender:users!game_room_messages_user_id_fkey(username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified)')
    .eq('sport', sport).eq('game_id', gameId).order('created_at', { ascending: true }).limit(160)
  return (data ?? []) as unknown as GameRoomMessage[]
}

export default async function GameDetailPage({ params }: { params: Promise<{ sport: string; gameId: string }> }) {
  const { sport, gameId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── MLB: use official MLB Stats API ─────────────────────────────
  if (sport === 'mlb') {
    const feed = await getMLBGameFeed(gameId)
    if (!feed) notFound()

    const [communityPicks, roomMessages] = await Promise.all([fetchCommunityPicksForGame(supabase, gameId), fetchGameRoomMessages(supabase, sport, gameId)])

    const { data: reactionsRaw } = await supabase
      .from('play_reactions')
      .select('play_id, emoji, user_id')
      .eq('game_id', String(gameId))

    const reactions: Record<string, Record<string, { count: number; mine: boolean }>> = {}
    for (const r of reactionsRaw ?? []) {
      if (!reactions[r.play_id]) reactions[r.play_id] = {}
      if (!reactions[r.play_id][r.emoji]) reactions[r.play_id][r.emoji] = { count: 0, mine: false }
      reactions[r.play_id][r.emoji].count++
      if (user && r.user_id === user.id) reactions[r.play_id][r.emoji].mine = true
    }

    return (
      <MLBGameClient
        gamePk={Number(gameId)}
        feed={feed}
        communityPicks={communityPicks}
        initialReactions={reactions}
        isLoggedIn={!!user}
        roomMessages={roomMessages}
        currentUserId={user?.id}
      />
    )
  }

  // ── Other sports: ESPN ───────────────────────────────────────────
  const sportKey = sport as SportKey

  const [games, summary] = await Promise.all([
    getScoreboard(sportKey),
    getGameSummary(sportKey, gameId),
  ])

  const game = games.find(g => g.id === gameId)
  if (!game && !summary) notFound()

  const teams = game ? getTeams(game) : { away: undefined, home: undefined }
  const [communityPicks, roomMessages] = await Promise.all([fetchCommunityPicksForGame(supabase, gameId), fetchGameRoomMessages(supabase, sport, gameId)])

  const { data: reactionsRaw } = await supabase
    .from('play_reactions')
    .select('play_id, emoji, user_id')
    .eq('game_id', gameId)

  const reactions: Record<string, Record<string, { count: number; mine: boolean }>> = {}
  for (const r of reactionsRaw ?? []) {
    if (!reactions[r.play_id]) reactions[r.play_id] = {}
    if (!reactions[r.play_id][r.emoji]) reactions[r.play_id][r.emoji] = { count: 0, mine: false }
    reactions[r.play_id][r.emoji].count++
    if (user && r.user_id === user.id) reactions[r.play_id][r.emoji].mine = true
  }

  const gameStatus = game ? getGameStatus(game) : { state: 'pre' as const, label: '', isLive: false }

  return (
    <GameDetailClient
      sport={sportKey}
      gameId={gameId}
      sportLabel={SPORT_LABEL[sport] ?? sport.toUpperCase()}
      game={game ?? null}
      summary={summary}
      gameStatus={gameStatus}
      teams={teams}
      communityPicks={communityPicks}
      initialReactions={reactions}
      isLoggedIn={!!user}
      roomMessages={roomMessages}
      currentUserId={user?.id}
    />
  )
}
