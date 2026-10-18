import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'
import { getNflBdlGames, matchNflBdlGame, type ApiGame } from './nflOdds'
import { mapStoredGame, type ScheduleRow, type TeamRow } from './nflScoreboard'
import { buildNflGameCenter, canonicalNflTeam, type NflCenterFeed } from './nflGameCenter'

/** Shared across visitors. No per-viewer provider requests or ingestion writes. */
export const getNflGameCenter = unstable_cache(async (gameId: string) => {
  if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId)) return null
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('nfl_schedule')
    .select('game_id,season,week,game_type,gameday,gametime,away_team,away_score,home_team,home_score,stadium')
    .eq('game_id', gameId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
  if (error) throw error
  if (!row) return null
  const schedule = row as ScheduleRow
  const [teamResult, feedResult, liveGames] = await Promise.all([
    admin.from('nfl_teams').select('team_abbr,team_name,team_color,team_color2,team_logo_espn')
      .in('team_abbr', [schedule.away_team, schedule.home_team]).abortSignal(AbortSignal.timeout(10000)),
    admin.from('nfl_game_feeds').select('payload,fetched_at,reconciled').eq('game_id', gameId)
      .eq('source', 'bdl_plays').abortSignal(AbortSignal.timeout(10000)).maybeSingle(),
    getNflBdlGames(schedule.season, schedule.week, 'live').catch(() => []),
  ])
  if (teamResult.error) throw teamResult.error
  if (feedResult.error) throw feedResult.error
  const feed = feedResult.data?.payload as NflCenterFeed | null
  const live = matchNflBdlGame(liveGames, { id: gameId, season: schedule.season, week: schedule.week,
    gameType: schedule.game_type, gameday: schedule.gameday, away: { abbr: schedule.away_team }, home: { abbr: schedule.home_team } })
  const rawStored = feed?.game as ApiGame | undefined
  const stored = rawStored?.visitor_team && rawStored?.home_team && rawStored.season === schedule.season && rawStored.week === schedule.week ? rawStored : undefined
  const fallback = stored ? matchNflBdlGame([stored], { id: gameId, season: schedule.season, week: schedule.week,
    gameType: schedule.game_type, gameday: schedule.gameday, away: { abbr: schedule.away_team }, home: { abbr: schedule.home_team } }) : null
  const game = mapStoredGame(schedule, new Map((teamResult.data as TeamRow[]).map(t => [canonicalNflTeam(t.team_abbr), t])), live ?? fallback)
  const complete = Boolean(feedResult.data?.reconciled && feed?.game?.status_state === 'final' && feed.game.id === Number(game.competitions[0].id))
  return { game, ...buildNflGameCenter(game, feed), complete, updatedAt: feedResult.data?.fetched_at ?? null, date: schedule.gameday }
}, ['nfl-game-center-v1'], { revalidate: 30, tags: ['sideline:nfl-live'] })
