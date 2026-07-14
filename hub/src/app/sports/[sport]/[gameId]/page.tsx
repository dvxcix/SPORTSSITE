import { getScoreboard, getGameSummary, getGameStatus, getTeams } from '@/lib/espn-api'
import type { SportKey } from '@/lib/espn-api'
import { getMLBGameFeed } from '@/lib/mlb-api'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { GameDetailClient } from './GameDetailClient'
import { MLBGameClient } from './MLBGameClient'

export const revalidate = 15

const SPORT_LABEL: Record<string, string> = { nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL', soccer: 'MLS' }

// A straight pick's game_pk lives on the post itself, but a parlay's
// legs can span different games, so FeedComposer/watchlist.ts deliberately
// write parlays with game_pk = null at the top level — the per-leg game
// association only exists as a team abbreviation inside pick_data.legs[].
// `.eq('game_pk', gameId)` alone therefore silently excludes every parlay
// from a game's "community picks" tab, no matter how relevant a leg is.
// Fetches a bounded recent window of picks/parlays and matches in JS
// against either the post's own game_pk (straight picks) or any leg's team
// abbreviation equaling this game's home/away team (parlays), then
// re-sorts by reaction_count to match the original query's ordering.
async function fetchCommunityPicksForGame(supabase: any, gameId: string, teamAbbrs: (string | undefined)[]) {
  const abbrs = new Set(teamAbbrs.filter((a): a is string => !!a))
  const { data } = await supabase
    .from('posts')
    .select('*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .in('post_type', ['pick', 'parlay'])
    .order('created_at', { ascending: false })
    .limit(300)

  const matches = (data ?? []).filter((p: any) => {
    if (String(p.game_pk) === String(gameId)) return true
    const legs = p.pick_data?.legs
    if (Array.isArray(legs)) return legs.some((leg: any) => teamInGame(abbrs, leg.team))
    return teamInGame(abbrs, p.pick_data?.team)
  })

  matches.sort((a: any, b: any) => (b.reaction_count ?? 0) - (a.reaction_count ?? 0))
  return matches.slice(0, 20)
}

function teamInGame(abbrs: Set<string>, team: string | undefined | null) {
  return !!team && abbrs.has(team)
}

export default async function GameDetailPage({ params }: { params: Promise<{ sport: string; gameId: string }> }) {
  const { sport, gameId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── MLB: use official MLB Stats API ─────────────────────────────
  if (sport === 'mlb') {
    const feed = await getMLBGameFeed(gameId)
    if (!feed) notFound()

    const communityPicks = await fetchCommunityPicksForGame(supabase, gameId, [
      feed.gameData.teams.home.abbreviation,
      feed.gameData.teams.away.abbreviation,
    ])

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
  const communityPicks = await fetchCommunityPicksForGame(supabase, gameId, [
    teams.home?.team.abbreviation,
    teams.away?.team.abbreviation,
  ])

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
    />
  )
}
