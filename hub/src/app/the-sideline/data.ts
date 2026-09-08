import 'server-only'

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { attachNflTdBaselines, type NflTdBaselineRow } from '@/lib/nflMarketArchive'
import { EMPTY_SIDELINE_ODDS, type SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { getSidelineLens } from './analysis'
import { getSidelineBoardLens } from './boardAnalysis'
import { enrichSidelineOddsBoards } from './playerIdentity'
import type { SidelineGame, SidelineOddsFrame, SidelineRosterPlayer } from './types'

// A populated NFL board is commonly 700-900 KB. Next/Vercel cache entries have
// a 2 MB ceiling, so cache one capture per entry and load them in bounded
// batches. This keeps every market-story stop cacheable without a cold-load
// request stampede.
const HISTORY_PAGE_SIZE = 1
const HISTORY_LOAD_CONCURRENCY = 16
const HISTORY_MAX_FRAMES = 720
const WEEK_SECONDS = 60 * 60 * 24 * 7

function isPastSlate(date: string) {
  return date < new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

const resolveGameDate = unstable_cache(async (gameId: string) => {
  const { data } = await createAdminClient().from('nfl_schedule').select('gameday').eq('game_id', gameId).maybeSingle()
  return data?.gameday as string | undefined
}, ['sideline-game-date-v1'], { revalidate: 3600, tags: ['sideline:nfl-schedule'] })

const resolveNextGameDate = unstable_cache(async (today: string) => {
  const { data } = await createAdminClient().from('nfl_schedule').select('gameday').gte('gameday', today).order('gameday').limit(1).maybeSingle()
  return data?.gameday as string | undefined
}, ['sideline-next-game-date-v1'], { revalidate: 300, tags: ['sideline:nfl-schedule'] })

const loadGamesForDate = unstable_cache(async (date: string): Promise<SidelineGame[]> => {
  const admin = createAdminClient()
  const { data: schedule, error } = await admin
    .from('nfl_schedule')
    .select('game_id, season, game_type, week, gameday, gametime, away_team, home_team, stadium, roof, surface, temp, wind')
    .eq('gameday', date)
    .order('gametime', { ascending: true })
    .limit(24)
  if (error) throw new Error(`NFL schedule unavailable: ${error.message}`)
  if (!schedule?.length) return []

  const abbreviations = Array.from(new Set(schedule.flatMap(game => [game.away_team, game.home_team]).filter(Boolean)))
  const { data: teams, error: teamsError } = await admin
    .from('nfl_teams')
    .select('team_abbr, team_name, team_color, team_color2, team_logo_espn')
    .in('team_abbr', abbreviations)
  if (teamsError) throw new Error(`NFL teams unavailable: ${teamsError.message}`)
  const teamByAbbr = new Map((teams ?? []).map(team => [team.team_abbr, team]))
  const team = (abbr: string) => {
    const found = teamByAbbr.get(abbr)
    return { abbr, name: found?.team_name ?? abbr, color: found?.team_color ?? '#1b2430', color2: found?.team_color2 ?? null, logo: found?.team_logo_espn ?? null }
  }
  return schedule.map(game => ({
    id: game.game_id,
    season: game.season,
    week: game.week,
    gameType: game.game_type,
    gameday: game.gameday,
    gametime: game.gametime,
    stadium: game.stadium,
    roof: game.roof,
    surface: game.surface,
    temp: game.temp,
    wind: game.wind,
    away: team(game.away_team),
    home: team(game.home_team),
  }))
}, ['sideline-games-date-v2'], { revalidate: 300, tags: ['sideline:nfl-schedule'] })

export async function getSidelineGames(requestedDate?: string, requestedGame?: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const date = requestedDate
    ?? (requestedGame ? await resolveGameDate(requestedGame) : undefined)
    ?? await resolveNextGameDate(today)
    ?? today
  return { games: await loadGamesForDate(date), date }
}

async function loadCurrentBoardRaw(gameId: string): Promise<SidelineOddsBoard> {
  const { data, error } = await createAdminClient().from('nfl_odds_current').select('board,captured_at').eq('game_id', gameId).maybeSingle()
  if (error) throw new Error(`NFL current odds unavailable: ${error.message}`)
  return data?.board
    ? { ...(data.board as SidelineOddsBoard), capturedAt: data.captured_at, source: 'snapshot' }
    : EMPTY_SIDELINE_ODDS
}
const loadCurrentBoardRecent = unstable_cache(loadCurrentBoardRaw, ['sideline-current-odds-recent-v3'], { revalidate: 20, tags: ['sideline:nfl-odds'] })
const loadCurrentBoardHistorical = unstable_cache(loadCurrentBoardRaw, ['sideline-current-odds-historical-v3'], { revalidate: WEEK_SECONDS, tags: ['sideline:nfl-odds'] })

async function loadHistoryCountRaw(gameId: string) {
  const { count, error } = await createAdminClient().from('nfl_odds_snapshot_history').select('id', { count: 'exact', head: true }).eq('game_id', gameId)
  if (error) throw new Error(`NFL odds history count unavailable: ${error.message}`)
  return Math.min(count ?? 0, HISTORY_MAX_FRAMES)
}
const loadHistoryCountRecent = unstable_cache(loadHistoryCountRaw, ['sideline-odds-history-count-recent-v2'], { revalidate: 20, tags: ['sideline:nfl-odds'] })
const loadHistoryCountHistorical = unstable_cache(loadHistoryCountRaw, ['sideline-odds-history-count-historical-v2'], { revalidate: WEEK_SECONDS, tags: ['sideline:nfl-odds'] })

async function loadHistoryPageRaw(gameId: string, page: number): Promise<SidelineOddsFrame[]> {
  const from = page * HISTORY_PAGE_SIZE
  const { data, error } = await createAdminClient()
    .from('nfl_odds_snapshot_history')
    .select('board,captured_at')
    .eq('game_id', gameId)
    .order('captured_at', { ascending: true })
    .range(from, from + HISTORY_PAGE_SIZE - 1)
  if (error) throw new Error(`NFL odds history unavailable: ${error.message}`)
  return (data ?? []).map(row => ({
    capturedAt: row.captured_at,
    board: { ...(row.board as SidelineOddsBoard), capturedAt: row.captured_at, source: 'snapshot' },
  }))
}
const loadHistoryPageRecent = unstable_cache(loadHistoryPageRaw, ['sideline-odds-history-page-recent-v3'], { revalidate: 20, tags: ['sideline:nfl-odds'] })
const loadHistoryPageHistorical = unstable_cache(loadHistoryPageRaw, ['sideline-odds-history-page-historical-v3'], { revalidate: WEEK_SECONDS, tags: ['sideline:nfl-odds'] })

async function loadHistoryPages(
  pageCount: number,
  loader: (gameId: string, page: number) => Promise<SidelineOddsFrame[]>,
  gameId: string,
) {
  const pages: SidelineOddsFrame[][] = []
  for (let start = 0; start < pageCount; start += HISTORY_LOAD_CONCURRENCY) {
    const batchSize = Math.min(HISTORY_LOAD_CONCURRENCY, pageCount - start)
    const batch = await Promise.all(Array.from({ length: batchSize }, (_, offset) => loader(gameId, start + offset)))
    pages.push(...batch)
  }
  return pages
}

async function loadTdBaselinesRaw(date: string): Promise<NflTdBaselineRow[]> {
  const { data, error } = await createAdminClient()
    .from('nfl_td_baseline_daily')
    .select('slate_date,player_id,player_name,team_abbr,vendor,prop_type,average_odds,average_implied_probability,sample_games,first_sample_date,through_date')
    .eq('slate_date', date)
  if (error) {
    if (error.code === '42P01') return []
    throw new Error(`NFL TD baselines unavailable: ${error.message}`)
  }
  return (data ?? []) as NflTdBaselineRow[]
}
const loadTdBaselinesRecent = unstable_cache(loadTdBaselinesRaw, ['sideline-td-baselines-recent-v2'], { revalidate: 60, tags: ['sideline:nfl-odds'] })
const loadTdBaselinesHistorical = unstable_cache(loadTdBaselinesRaw, ['sideline-td-baselines-historical-v2'], { revalidate: WEEK_SECONDS, tags: ['sideline:nfl-odds'] })

export async function getSidelineOddsBundle(game: SidelineGame) {
  const historical = isPastSlate(game.gameday)
  const currentLoader = historical ? loadCurrentBoardHistorical : loadCurrentBoardRecent
  const countLoader = historical ? loadHistoryCountHistorical : loadHistoryCountRecent
  const pageLoader = historical ? loadHistoryPageHistorical : loadHistoryPageRecent
  const baselineLoader = historical ? loadTdBaselinesHistorical : loadTdBaselinesRecent
  const current = await currentLoader(game.id)
  const [count, baselines] = await Promise.all([countLoader(game.id), baselineLoader(game.gameday)])
  const pageCount = Math.ceil(count / HISTORY_PAGE_SIZE)
  const pages = await loadHistoryPages(pageCount, pageLoader, game.id)
  let enrichedCurrent = attachNflTdBaselines(current, baselines)
  let history = pages.flat().map(frame => ({ ...frame, board: attachNflTdBaselines(frame.board, baselines) }))
  if (enrichedCurrent.capturedAt && history.at(-1)?.capturedAt !== enrichedCurrent.capturedAt) {
    history.push({ capturedAt: enrichedCurrent.capturedAt, board: enrichedCurrent })
  }
  const identityBoards = await enrichSidelineOddsBoards(game, [enrichedCurrent, ...history.map(frame => frame.board)])
  enrichedCurrent = identityBoards[0]
  history = history.map((frame, index) => ({ ...frame, board: identityBoards[index + 1] }))
  return { odds: enrichedCurrent, history: history.length ? history : enrichedCurrent.capturedAt ? [{ capturedAt: enrichedCurrent.capturedAt, board: enrichedCurrent }] : [] }
}

export const getCachedSidelineBoardLens = unstable_cache(
  async (game: SidelineGame, roster: SidelineRosterPlayer[]) => getSidelineBoardLens(game, roster),
  ['sideline-board-lens-v4'],
  { revalidate: 3600, tags: ['sideline:nfl-data'] },
)

export const getCachedSidelineLens = unstable_cache(
  async (game: SidelineGame) => getSidelineLens(game),
  ['sideline-film-lens-v2'],
  { revalidate: 3600, tags: ['sideline:nfl-data'] },
)
