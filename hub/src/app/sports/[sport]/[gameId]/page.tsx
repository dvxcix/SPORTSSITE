import { getScoreboard, getGameSummary, getGameStatus, getTeams } from '@/lib/espn-api'
import type { SportKey } from '@/lib/espn-api'
import { getMLBGameFeed } from '@/lib/mlb-api'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { GameDetailClient } from './GameDetailClient'
import { MLBGameClient } from './MLBGameClient'

export const revalidate = 15

const SPORT_LABEL: Record<string, string> = { nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL', soccer: 'MLS' }

export default async function GameDetailPage({ params }: { params: Promise<{ sport: string; gameId: string }> }) {
  const { sport, gameId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── MLB: use official MLB Stats API ─────────────────────────────
  if (sport === 'mlb') {
    const feed = await getMLBGameFeed(gameId)
    if (!feed) notFound()

    const { data: communityPicks } = await supabase
      .from('posts')
      .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
      .in('post_type', ['pick', 'parlay'])
      .eq('game_pk', gameId)
      .order('reaction_count', { ascending: false })
      .limit(20)

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
        communityPicks={communityPicks ?? []}
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

  const { data: communityPicks } = await supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .in('post_type', ['pick', 'parlay'])
    .eq('game_pk', gameId)
    .order('reaction_count', { ascending: false })
    .limit(20)

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
  const teams = game ? getTeams(game) : { away: undefined, home: undefined }

  return (
    <GameDetailClient
      sport={sportKey}
      gameId={gameId}
      sportLabel={SPORT_LABEL[sport] ?? sport.toUpperCase()}
      game={game ?? null}
      summary={summary}
      gameStatus={gameStatus}
      teams={teams}
      communityPicks={communityPicks ?? []}
      initialReactions={reactions}
      isLoggedIn={!!user}
    />
  )
}
