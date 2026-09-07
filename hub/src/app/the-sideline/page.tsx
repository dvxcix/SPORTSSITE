import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getLiveNflOddsBoard } from '@/lib/nflOdds'
import { EMPTY_SIDELINE_ODDS, type SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { SidelineBoardClient } from './SidelineBoardClient'
import { SidelineClient } from './SidelineClient'
import { getSidelineLens } from './analysis'
import { getSidelineBoardLens } from './boardAnalysis'
import type { SidelineGame, SidelineOddsFrame } from './types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Sideline - SlipSurge',
  description: 'Private NFL market, matchup, tracking and historical-play intelligence suite.',
  robots: { index: false, follow: false, nocache: true },
}

async function getGames(requestedDate?: string, requestedGame?: string): Promise<{ games: SidelineGame[]; date: string }> {
  const admin = createAdminClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  let date = requestedDate
  if (!date && requestedGame) {
    const { data } = await admin.from('nfl_schedule').select('gameday').eq('game_id', requestedGame).maybeSingle()
    date = data?.gameday ?? undefined
  }
  if (!date) {
    const { data } = await admin.from('nfl_schedule').select('gameday').gte('gameday', today).order('gameday').limit(1).maybeSingle()
    date = data?.gameday ?? today
  }

  const resolvedDate = date ?? today
  const { data: schedule, error } = await admin
    .from('nfl_schedule')
    .select('game_id, season, game_type, week, gameday, gametime, away_team, home_team, stadium, roof, surface, temp, wind')
    .eq('gameday', resolvedDate)
    .order('gametime', { ascending: true })
    .limit(24)
  if (error) throw new Error(`NFL schedule unavailable: ${error.message}`)
  if (!schedule?.length) return { games: [], date: resolvedDate }

  const abbreviations = Array.from(new Set(schedule.flatMap(game => [game.away_team, game.home_team]).filter(Boolean)))
  const { data: teams, error: teamsError } = await admin
    .from('nfl_teams')
    .select('team_abbr, team_name, team_color, team_color2, team_logo_espn')
    .in('team_abbr', abbreviations)
  if (teamsError) throw new Error(`NFL teams unavailable: ${teamsError.message}`)

  const teamByAbbr = new Map((teams ?? []).map(team => [team.team_abbr, team]))
  const team = (abbr: string) => {
    const found = teamByAbbr.get(abbr)
    return {
      abbr,
      name: found?.team_name ?? abbr,
      color: found?.team_color ?? '#1b2430',
      color2: found?.team_color2 ?? null,
      logo: found?.team_logo_espn ?? null,
    }
  }

  return {
    date: resolvedDate,
    games: schedule.map(game => ({
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
    })),
  }
}

async function getSidelineOdds(game: SidelineGame): Promise<SidelineOddsBoard> {
  let stored: SidelineOddsBoard | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('nfl_odds_current').select('board, captured_at').eq('game_id', game.id).maybeSingle()
    if (data?.board) {
      stored = { ...(data.board as SidelineOddsBoard), capturedAt: data.captured_at, source: 'snapshot' }
      const age = Date.now() - new Date(data.captured_at).getTime()
      if (Number.isFinite(age) && age <= 90_000) return stored
    }
  } catch {
    // Live fetch below keeps the board available while snapshots recover.
  }
  try {
    const live = await getLiveNflOddsBoard(game)
    if (live.status === 'ready' || !stored) return live
  } catch (error) {
    console.error('[the-sideline] NFL odds fetch failed', game.id, error)
  }
  return stored ?? EMPTY_SIDELINE_ODDS
}

async function getSidelineOddsHistory(game: SidelineGame, current: SidelineOddsBoard): Promise<SidelineOddsFrame[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('nfl_odds_snapshot_history')
      .select('board,captured_at')
      .eq('game_id', game.id)
      .order('captured_at', { ascending: true })
      .limit(720)
    const frames: SidelineOddsFrame[] = (data ?? []).map(row => ({
      capturedAt: row.captured_at,
      board: { ...(row.board as SidelineOddsBoard), capturedAt: row.captured_at, source: 'snapshot' as const },
    }))
    if (current.capturedAt && frames.at(-1)?.capturedAt !== current.capturedAt) {
      frames.push({ capturedAt: current.capturedAt, board: current })
    }
    return frames.length ? frames : current.capturedAt ? [{ capturedAt: current.capturedAt, board: current }] : []
  } catch {
    return current.capturedAt ? [{ capturedAt: current.capturedAt, board: current }] : []
  }
}

export default async function SidelinePage({ searchParams }: {
  searchParams: Promise<{ game?: string | string[]; date?: string | string[]; mode?: string | string[] }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') notFound()

  const params = await searchParams
  const requestedGame = Array.isArray(params.game) ? params.game[0] : params.game
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const mode = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === 'film' ? 'film' : 'board'
  const { games, date } = await getGames(requestedDate, requestedGame)
  if (!games.length) {
    return <main style={{ minHeight: '100vh', padding: 32, color: '#f5f8fb', background: '#060a0f' }}><h1>The Sideline</h1><p>No NFL games are scheduled for {date}.</p></main>
  }

  const selected = games.find(game => game.id === requestedGame) ?? games[0]
  if (mode === 'film') {
    const lens = await getSidelineLens(selected)
    return <SidelineClient key={selected.id} games={games} selectedId={selected.id} lens={lens} boardHref={`/the-sideline?date=${date}&game=${encodeURIComponent(selected.id)}`} />
  }

  const [lens, odds] = await Promise.all([getSidelineBoardLens(selected), getSidelineOdds(selected)])
  const history = await getSidelineOddsHistory(selected, odds)
  return <SidelineBoardClient key={selected.id} games={games} selectedId={selected.id} selectedDate={date} lens={lens} odds={odds} history={history} />
}
