import 'server-only'

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { attachNflTdBaselines, type NflTdBaselineRow } from '@/lib/nflMarketArchive'
import { EMPTY_SIDELINE_ODDS, type SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { attachNflPikkitSnapshot, type NflPikkitSnapshot } from '@/lib/nflPikkit'
import { sidelinePublicBoard } from '@/lib/sidelinePublicBoard'
import { attachNflFanduel, loadNflFanduel } from '@/lib/nflFanduel'
import { getSidelineLens } from './analysis'
import { getSidelineBoardLens } from './boardAnalysis'
import type { NflSample } from '@/lib/nflSample'
import { enrichSidelineOddsBoards } from './playerIdentity'
import type { SidelineGame, SidelineRosterPlayer } from './types'
import { scheduledDate, type SidelineScheduleDay } from './scheduleNavigation'

// Cache current and selected boards separately; never serialize the full archive.
const WEEK_SECONDS = 60 * 60 * 24 * 7

function isPastSlate(date: string) {
  return date < new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

const resolveGameDate = unstable_cache(async (gameId: string) => {
  const { data } = await createAdminClient().from('nfl_schedule').select('gameday').eq('game_id', gameId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
  return data?.gameday as string | undefined
}, ['sideline-game-date-v1'], { revalidate: 3600, tags: ['sideline:nfl-schedule'] })

const resolveNextGameDate = unstable_cache(async (today: string) => {
  const { data } = await createAdminClient().from('nfl_schedule').select('gameday').gte('gameday', today).order('gameday').limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
  return data?.gameday as string | undefined
}, ['sideline-next-game-date-v1'], { revalidate: 300, tags: ['sideline:nfl-schedule'] })

const loadGamesForDate = unstable_cache(async (date: string): Promise<SidelineGame[]> => {
  const admin = createAdminClient()
  const { data: schedule, error } = await admin
    .from('nfl_schedule')
    .select('game_id, season, game_type, week, gameday, gametime, away_team, home_team, stadium, roof, surface, temp, wind')
    .eq('gameday', date)
    .order('gametime', { ascending: true })
    .limit(24).abortSignal(AbortSignal.timeout(10000))
  if (error) throw new Error(`NFL schedule unavailable: ${error.message}`)
  if (!schedule?.length) return []

  const abbreviations = Array.from(new Set(schedule.flatMap(game => [game.away_team, game.home_team]).filter(Boolean)))
  const { data: teams, error: teamsError } = await admin
    .from('nfl_teams')
    .select('team_abbr, team_name, team_color, team_color2, team_logo_espn')
    .in('team_abbr', abbreviations).abortSignal(AbortSignal.timeout(10000))
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

const loadScheduleDays = unstable_cache(async (year: number): Promise<SidelineScheduleDay[]> => {
  const { data, error } = await createAdminClient().from('nfl_schedule')
    .select('gameday,season,week,game_type').gte('season', year - 1).lte('season', year)
    .order('gameday').limit(1000).abortSignal(AbortSignal.timeout(10000))
  if (error) throw new Error(`NFL calendar unavailable: ${error.message}`)
  return [...new Map((data ?? []).filter(row => row.gameday).map(row => [row.gameday, {
    date: row.gameday, season: row.season, week: row.week, gameType: row.game_type,
  }])).values()]
}, ['sideline-calendar-v1'], { revalidate: 300, tags: ['sideline:nfl-schedule'] })

export async function getSidelineGames(requestedDate?: string, requestedGame?: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const requested = (requestedGame ? await resolveGameDate(requestedGame) : undefined)
    ?? (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && Number.isFinite(Date.parse(requestedDate)) ? requestedDate : undefined)
    ?? await resolveNextGameDate(today)
    ?? today
  const days = await loadScheduleDays(Number(requested.slice(0, 4)))
  const date = scheduledDate(days, requested) ?? requested
  return { games: await loadGamesForDate(date), date, days }
}

async function loadCurrentBoardRaw(gameId: string): Promise<SidelineOddsBoard> {
  const { data, error } = await createAdminClient().from('nfl_odds_current').select('board,captured_at').eq('game_id', gameId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
  if (error) throw new Error(`NFL current odds unavailable: ${error.message}`)
  return data?.board
    ? { ...(data.board as SidelineOddsBoard), capturedAt: data.captured_at, source: 'snapshot' }
    : EMPTY_SIDELINE_ODDS
}
const loadCurrentBoardRecent = unstable_cache(loadCurrentBoardRaw, ['sideline-current-odds-recent-v3'], { revalidate: 20, tags: ['sideline:nfl-odds'] })
const loadCurrentBoardHistorical = unstable_cache(loadCurrentBoardRaw, ['sideline-current-odds-historical-v3'], { revalidate: WEEK_SECONDS, tags: ['sideline:nfl-odds'] })

async function loadTdBaselinesRaw(date: string): Promise<NflTdBaselineRow[]> {
  const { data, error } = await createAdminClient()
    .from('nfl_td_baseline_daily')
    .select('slate_date,player_id,player_name,team_abbr,vendor,prop_type,average_odds,average_implied_probability,sample_games,first_sample_date,through_date')
    .eq('slate_date', date).abortSignal(AbortSignal.timeout(10000))
  if (error) {
    if (error.code === '42P01') return []
    throw new Error(`NFL TD baselines unavailable: ${error.message}`)
  }
  return (data ?? []) as NflTdBaselineRow[]
}
const loadTdBaselinesRecent = unstable_cache(loadTdBaselinesRaw, ['sideline-td-baselines-recent-v2'], { revalidate: 60, tags: ['sideline:nfl-odds'] })
const loadTdBaselinesHistorical = unstable_cache(loadTdBaselinesRaw, ['sideline-td-baselines-historical-v2'], { revalidate: WEEK_SECONDS, tags: ['sideline:nfl-odds'] })

async function loadPikkitCurrentRaw(gameId: string): Promise<NflPikkitSnapshot | null> {
  const { data, error } = await createAdminClient().from('nfl_pikkit_picks_current').select('snapshot').eq('game_id', gameId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
  if (error) {
    if (error.code === '42P01') return null
    throw new Error(`NFL public picks unavailable: ${error.message}`)
  }
  return data?.snapshot as NflPikkitSnapshot | null
}
const loadPikkitCurrentRecent = unstable_cache(loadPikkitCurrentRaw, ['sideline-pikkit-current-recent-v1'], { revalidate: 30, tags: ['sideline:nfl-picks'] })
const loadPikkitCurrentHistorical = unstable_cache(loadPikkitCurrentRaw, ['sideline-pikkit-current-historical-v1'], { revalidate: WEEK_SECONDS, tags: ['sideline:nfl-picks'] })

// The timeline includes pick-only changes, not just odds changes.
export const getSidelineTimeline = unstable_cache(async (gameId: string): Promise<string[]> => {
  const admin = createAdminClient()
  const times = new Set<string>()
  for (const table of ['nfl_odds_snapshot_history', 'nfl_pikkit_picks_snapshot_history', 'nfl_fanduel_capture_history']) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from(table).select('captured_at')
        .eq('game_id', gameId).order('captured_at').range(offset, offset + 999)
        .abortSignal(AbortSignal.timeout(10000))
      if (error) throw new Error('NFL timeline unavailable')
      for (const row of data ?? []) times.add(new Date(row.captured_at).toISOString())
      if ((data?.length ?? 0) < 1000) break
    }
  }
  return [...times].sort()
}, ['sideline-timeline-index-v1'], { revalidate: 20, tags: ['sideline:nfl-odds', 'sideline:nfl-picks'] })

export const getSidelineOddsBundle = unstable_cache(async (game: SidelineGame) => {
  const historical = isPastSlate(game.gameday)
  const [current, baselines, picks, supplement] = await Promise.all([
    (historical ? loadCurrentBoardHistorical : loadCurrentBoardRecent)(game.id),
    (historical ? loadTdBaselinesHistorical : loadTdBaselinesRecent)(game.gameday),
    (historical ? loadPikkitCurrentHistorical : loadPikkitCurrentRecent)(game.id),
    loadNflFanduel(game.id),
  ])
  const [identified] = await enrichSidelineOddsBoards(game, [attachNflTdBaselines(attachNflFanduel(current, supplement), baselines)])
  return { odds: sidelinePublicBoard(attachNflPikkitSnapshot(identified, picks)) }
}, ['sideline-enriched-current-v1'], { revalidate: 20, tags: ['sideline:nfl-odds', 'sideline:nfl-picks'] })

export const getSidelineCapture = unstable_cache(async (game: SidelineGame, capturedAt: string) => {
  const admin = createAdminClient()
  const [oddsResult, picksResult, baselines, supplement] = await Promise.all([
    admin.from('nfl_odds_snapshot_history').select('board,captured_at')
      .eq('game_id', game.id).lte('captured_at', capturedAt).order('captured_at', { ascending: false })
      .limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle(),
    admin.from('nfl_pikkit_picks_snapshot_history').select('snapshot,captured_at')
      .eq('game_id', game.id).lte('captured_at', capturedAt).order('captured_at', { ascending: false })
      .limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle(),
    (isPastSlate(game.gameday) ? loadTdBaselinesHistorical : loadTdBaselinesRecent)(game.gameday),
    loadNflFanduel(game.id, capturedAt),
  ])
  if (oddsResult.error || picksResult.error) throw new Error('NFL capture unavailable')
  if (!oddsResult.data) return null
  const raw = { ...(oddsResult.data.board as SidelineOddsBoard), capturedAt: oddsResult.data.captured_at, source: 'snapshot' as const }
  const [identified] = await enrichSidelineOddsBoards(game, [attachNflTdBaselines(attachNflFanduel(raw, supplement), baselines)])
  const picks = picksResult.data ? { ...(picksResult.data.snapshot as NflPikkitSnapshot), capturedAt: picksResult.data.captured_at } : null
  return { capturedAt, board: sidelinePublicBoard(attachNflPikkitSnapshot(identified, picks)) }
}, ['sideline-selected-capture-v1'], { revalidate: 3600, tags: ['sideline:nfl-odds', 'sideline:nfl-picks'] })

export const getCachedSidelineBoardLens = unstable_cache(
  async (game: SidelineGame, roster: SidelineRosterPlayer[], sample: NflSample = 'previous') => getSidelineBoardLens(game, roster, sample),
  ['sideline-board-lens-v8-play-volume'],
  { revalidate: 3600, tags: ['sideline:nfl-data'] },
)

export const getCachedSidelineLens = unstable_cache(
  async (game: SidelineGame) => getSidelineLens(game),
  ['sideline-film-lens-v2'],
  { revalidate: 3600, tags: ['sideline:nfl-data'] },
)
