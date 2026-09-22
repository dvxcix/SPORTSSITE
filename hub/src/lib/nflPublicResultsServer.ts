import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'
import { fetchAllBdl } from './nflGameFeeds'
import { getNflTouchdownFeed } from './nflTouchdownFeed'
import { getNflBdlGame } from './nflOdds'
import type { SidelineGame } from '@/app/the-sideline/types'
import type { NflPublicResult, NflResultPlayer } from './nflPublicResults'
import { matchesResultPlayer } from './nflPublicResults'

type Stat = Record<string, unknown> & { player: { id: number; first_name: string; last_name: string }; team: { abbreviation: string }; game: { id: number; status_state: string } }
const fields: Record<string, string> = {
  receptions: 'receptions', receiving_yards: 'receiving_yards', rushing_yards: 'rushing_yards',
  rushing_attempts: 'rushing_attempts', passing_yards: 'passing_yards', passing_attempts: 'passing_attempts',
  completions: 'passing_completions', passing_completions: 'passing_completions', passing_tds: 'passing_touchdowns', interceptions: 'passing_interceptions',
  longest_reception: 'long_reception', longest_rush: 'long_rushing', field_goals: 'field_goals_made', fg_made: 'field_goals_made', kicking_points: 'total_points',
}
const number = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)

export const getNflPublicResults = unstable_cache(async (game: SidelineGame, bdlId: number | null): Promise<NflPublicResult> => {
  const admin = createAdminClient()
  const { data: saved } = await admin.from('nfl_game_feeds').select('payload,reconciled,fetched_at').eq('game_id', game.id).eq('source', 'bdl_plays').maybeSingle()
  const stored = saved?.payload as { game?: { id: number; status_state: string } } | undefined
  const { data: odds } = bdlId == null && stored?.game?.id == null
    ? await admin.from('nfl_odds_current').select('board').eq('game_id', game.id).maybeSingle() : { data: null }
  const id = bdlId ?? stored?.game?.id ?? (odds?.board as { bdlGameId?: number } | undefined)?.bdlGameId ?? null
  const base: NflPublicResult = { status: 'unknown', updatedAt: new Date().toISOString(), players: [], firstTd: null, firstTdKnown: false }
  if (id == null) return base
  const [current, stats, touchdowns] = await Promise.all([
    saved?.reconciled ? Promise.resolve(stored?.game) : getNflBdlGame(id),
    fetchAllBdl<Stat>(`stats?game_ids[]=${id}&per_page=100`).catch(() => []),
    getNflTouchdownFeed(game.gameday).catch(() => []),
  ])
  base.status = current?.status_state ?? 'unknown'
  base.players = stats.filter(row => row.game.id === id).map(row => ({
    id: row.player.id, name: `${row.player.first_name} ${row.player.last_name}`, team: row.team.abbreviation,
    stats: Object.fromEntries(Object.entries(fields).map(([key, source]) => [key, number(row[source])])),
  }))
  // Durable final box scores also provide explicit zeroes for players who had
  // no catch/carry. Never invent zeroes from absence in a live provider response.
  if (base.status === 'final') {
    const { data, error } = await admin.from('nfl_player_stats').select('player_id,player_display_name,recent_team,receptions,receiving_yards,carries,rushing_yards,attempts,completions,passing_yards,passing_tds,receiving_tds,rushing_tds,special_teams_tds').eq('game_id', game.id)
    if (!error) for (const row of data ?? []) {
      const existing = base.players.find(player => matchesResultPlayer({ id: player.id ?? -1, gsisId: player.gsisId, name: player.name, team: player.team }, { id: null, gsisId: row.player_id, name: row.player_display_name, team: row.recent_team }))
      const values = { receptions: number(row.receptions), receiving_yards: number(row.receiving_yards), rushing_attempts: number(row.carries), rushing_yards: number(row.rushing_yards), passing_attempts: number(row.attempts), completions: number(row.completions), passing_yards: number(row.passing_yards), passing_tds: number(row.passing_tds), anytime_td: row.receiving_tds != null && row.rushing_tds != null && row.special_teams_tds != null ? Number(row.receiving_tds) + Number(row.rushing_tds) + Number(row.special_teams_tds) : null }
      if (existing) { existing.gsisId = row.player_id; for (const [key, value] of Object.entries(values)) if (existing.stats[key] == null) existing.stats[key] = value }
      else base.players.push({ id: null, gsisId: row.player_id, name: row.player_display_name, team: row.recent_team, stats: values } as NflResultPlayer)
    }
  }
  const gameTds = touchdowns.filter(event => event.gameId === game.id)
  const first = gameTds.find(event => event.isFirstTdOfGame)
  base.firstTd = first ? { id: first.bdlPlayerId, gsisId: first.playerId, name: first.playerName, team: first.team } : null
  // Empty/failed TD feeds are not proof of a scoreless game.
  const storedPlays = (saved?.payload as { plays?: Array<{ scoring_play?: boolean; type_slug?: string; type_text?: string }> } | undefined)?.plays
  const verifiedNoTd = saved?.reconciled && storedPlays && !storedPlays.some(play => play.scoring_play && /touchdown/i.test(`${play.type_slug} ${play.type_text}`))
  base.firstTdKnown = Boolean(first || verifiedNoTd)
  for (const player of base.players) {
    player.stats.rushing_receiving_yards = player.stats.rushing_yards != null && player.stats.receiving_yards != null ? player.stats.rushing_yards + player.stats.receiving_yards : null
    player.stats.passing_completions ??= player.stats.completions
    const source = stats.find(row => row.player.id === player.id)
    const scoring = source ? ['receiving_touchdowns', 'rushing_touchdowns', 'kick_return_touchdowns', 'punt_return_touchdowns', 'fumbles_touchdowns', 'interception_touchdowns'].map(key => number(source[key])) : []
    const scored = gameTds.filter(event => (player.id != null && event.bdlPlayerId === player.id) || (player.gsisId != null && event.playerId === player.gsisId) || (event.playerName === player.name && event.team === player.team)).length
    player.stats.anytime_td = scoring.some(value => value != null) ? scoring.reduce<number>((sum, value) => sum + (value ?? 0), 0) : scored > 0 ? scored : player.stats.anytime_td ?? null
  }
  return base
}, ['nfl-public-results-v1'], { revalidate: 20, tags: ['sideline:nfl-live'] })
