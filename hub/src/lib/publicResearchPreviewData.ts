import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import { nflOddsBoardQuotes } from './nflOddsBoard'
import type { SidelineOddsBoard } from './nflOddsTypes'
import { nbaFullBoardCells } from './nbaFullOddsBoard'
import { nbaGameFinal, nbaGameStart, nbaQuoteInMode } from './nbaOddsMode'
import type { PaintGame, PaintProp } from './nbaPaint'
import type { NbaQuoteOpeningRow } from './nbaOddsHistory'
import { PREVIEW_CONFIG, readPreviewContext, selectPreviewPlayers, type PreviewBoard, type PreviewGame, type PreviewSport, type ResearchPreview } from './publicResearchPreview'
import { PUBLIC_PREVIEW_EXAMPLES } from './publicResearchPreviewExamples'

type Admin = ReturnType<typeof createAdminClient>
const readBudget = () => AbortSignal.timeout(2500)
const scheduleDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const score = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null
const team = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{2,3}$/.test(value)

function savedBoard(sport: PreviewSport, game: PreviewGame, capturedAt: string, quotes: Parameters<typeof selectPreviewPlayers>[2]): PreviewBoard | null {
  const capture = Date.parse(capturedAt), start = Date.parse(game.start ?? '')
  if (!Number.isFinite(capture) || !Number.isFinite(start) || capture >= start || capture > Date.now()) return null
  const players = selectPreviewPlayers(sport, game, quotes)
  if (!players.some(row => row.team === game.away) || !players.some(row => row.team === game.home)) return null
  return { game, capturedAt, players, book: 'FanDuel', example: false }
}

async function nbaSchedule(admin: Admin, date: string): Promise<PreviewGame[]> {
  const { data, error } = await admin.from('nba_games').select('id,game_date,payload').eq('game_date', date).order('id').limit(18).abortSignal(readBudget())
  if (error) throw new Error('Preview schedule unavailable')
  return (data ?? []).flatMap(row => {
    const game = row.payload as PaintGame | null
    const id = String(row.id), away = game?.visitor_team?.abbreviation, home = game?.home_team?.abbreviation
    if (!game || String(game.id) !== id || !team(away) || !team(home) || away === home || !readPreviewContext({ preview: 'nba', game: id, date })) return []
    const start = nbaGameStart(game)
    const state = nbaGameFinal(game) ? 'final' : game.status_state === 'in_progress' || game.period > 0 || start != null && start <= Date.now() ? 'started' : 'scheduled'
    return [{ id, date, away, home, start: start == null ? null : new Date(start).toISOString(), state,
      awayScore: state === 'scheduled' ? null : score(game.visitor_team_score), homeScore: state === 'scheduled' ? null : score(game.home_team_score) }]
  })
}

async function nflSchedule(admin: Admin, date: string): Promise<PreviewGame[]> {
  const { data, error } = await admin.from('nfl_schedule').select('game_id,gameday,gametime,away_team,home_team,away_score,home_score')
    .eq('gameday', date).order('gametime').order('game_id').limit(18).abortSignal(readBudget())
  if (error) throw new Error('Preview schedule unavailable')
  return (data ?? []).flatMap(row => {
    const { game_id: id, away_team: away, home_team: home } = row
    if (!team(away) || !team(home) || away === home || !readPreviewContext({ preview: 'nfl', game: id, date })) return []
    const kickoff = nflKickoffAt(row)
    const started = kickoff !== null && kickoff.getTime() <= Date.now()
    const awayScore = started ? score(row.away_score) : null, homeScore = started ? score(row.home_score) : null
    return [{ id, date, start: kickoff?.toISOString() ?? null, away, home, awayScore, homeScore,
      state: awayScore !== null && homeScore !== null ? 'final' : started ? 'started' : 'scheduled' }]
  })
}

async function nbaBoard(admin: Admin, game: PreviewGame): Promise<PreviewBoard | null> {
  const gameId = Number(game.id)
  const clock = await admin.rpc('nba_phase_cutoff', { p_game_id: gameId, p_tipoff: game.start }).abortSignal(readBudget())
  const cutoff = clock.data as string | null, start = Date.parse(cutoff ?? '')
  if (clock.error || !cutoff || !Number.isFinite(start) || start > Date.parse(game.start ?? '')) return null
  const { data, error } = await admin.rpc('read_nba_book_frames', {
    p_game_id: gameId, p_mode: 'pregame', p_feed: 'props', p_tipoff: cutoff,
    p_selection: 'latest', p_market: 'points', p_player_id: null, p_as_of: null,
  }).abortSignal(readBudget())
  const frame = Array.isArray(data) && data.length === 1 ? data[0] as { captured_at: string; quotes: PaintProp[] } : null
  if (error || !frame || !Array.isArray(frame.quotes) || frame.quotes.length > 2500) return null
  const at = Date.parse(frame.captured_at)
  if (!Number.isFinite(at) || at >= start || at > Date.now()) return null
  const quotes = frame.quotes.filter(quote => quote.game_id === gameId && quote.vendor === 'fanduel' && quote.prop_type === 'points'
    && quote.market?.type === 'milestone' && (PREVIEW_CONFIG.nba.lines as readonly number[]).includes(Number(quote.line_value))
    && nbaQuoteInMode(quote, { datetime: cutoff, status: '' }, 'pregame', at))
  const ids = [...new Set(quotes.map(quote => quote.player_id))]
  if (!ids.length || ids.length > 60) return null
  const [identities, openings] = await Promise.all([
    admin.from('nba_players').select('id,first:payload->>first_name,last:payload->>last_name,team:payload->team->>abbreviation').in('id', ids).limit(60).abortSignal(readBudget()),
    admin.from('nba_odds_phase_openings').select('game_id,player_id,vendor,market,market_type,line,side,odds,observed_at')
      .eq('game_id', gameId).eq('mode', 'pregame').eq('vendor', 'fanduel').eq('market', 'points').eq('market_type', 'milestone').eq('side', 'over')
      .in('line', PREVIEW_CONFIG.nba.lines).in('player_id', ids).lt('observed_at', cutoff).limit(360).abortSignal(readBudget()),
  ])
  if (identities.error) return null
  const directory = new Map((identities.data ?? []).map(row => [Number(row.id), row]))
  const cells = nbaFullBoardCells(gameId, 'points', quotes, [], (openings.data ?? []) as NbaQuoteOpeningRow[], frame.captured_at)
  return savedBoard('nba', { ...game, start: cutoff }, frame.captured_at, cells.flatMap(cell => {
    const player = directory.get(cell.playerId)
    if (!player || !player.first || !player.last || !team(player.team)) return []
    return [{ id: cell.playerId, name: player.first + ' ' + player.last, team: player.team, line: cell.line,
      price: cell.current.odds, opening: cell.opening?.odds ?? null }]
  }))
}

async function nflBoard(admin: Admin, game: PreviewGame): Promise<PreviewBoard | null> {
  const clock = await admin.rpc('nfl_research_kickoff', { p_game_id: game.id, p_kickoff: game.start }).abortSignal(readBudget())
  const cutoff = clock.data as string | null, start = Date.parse(cutoff ?? '')
  if (clock.error || !cutoff || !Number.isFinite(start) || start > Date.parse(game.start ?? '')) return null
  const { data, error } = await admin.from('nfl_odds_snapshot_history').select('board,captured_at').eq('game_id', game.id)
    .lt('captured_at', cutoff).lte('captured_at', new Date().toISOString()).order('captured_at', { ascending: false }).limit(1).abortSignal(readBudget()).maybeSingle()
  if (error || !data?.board) return null
  const board = data.board as SidelineOddsBoard
  if (!Array.isArray(board.players) || board.players.length > 160) return null
  const quotes = nflOddsBoardQuotes(game.id, [game.away, game.home], cutoff, [[{
    board, capturedAt: data.captured_at, typedOpeningSource: board.source === 'live' && !('fanduelParserVersion' in board),
  }]]).filter(quote => quote.market === 'receiving_yards' && quote.vendor === 'fanduel')
  return savedBoard('nfl', { ...game, start: cutoff }, data.captured_at, quotes.map(quote => ({
    id: quote.playerId, name: quote.player, team: quote.team, line: quote.line, price: quote.current, opening: quote.opening,
  })))
}

// A fixed sport/date cache key keeps visitor filters from creating database
// work. Only schedules and saved frames are read, and only public DTOs cached.
const example = (sport: PreviewSport, date: string): ResearchPreview => ({ date, schedule: [], board: PUBLIC_PREVIEW_EXAMPLES[sport], scheduleAvailable: false })
const loadPreview = unstable_cache(async (sport: PreviewSport, date: string): Promise<ResearchPreview> => {
  let admin: Admin, schedule: PreviewGame[]
  try {
    admin = createAdminClient()
    schedule = (await (sport === 'nba' ? nbaSchedule(admin, date) : nflSchedule(admin, date)))
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.id.localeCompare(b.id))
  } catch {
    return example(sport, date)
  }
  const candidates = schedule.filter(game => game.start && game.state === 'scheduled').slice(0, 2)
  const boards = await Promise.allSettled(candidates.map(game => sport === 'nba' ? nbaBoard(admin, game) : nflBoard(admin, game)))
  for (const result of boards) if (result.status === 'fulfilled' && result.value) return { date, schedule, board: result.value, scheduleAvailable: true }
  return { date, schedule, board: PUBLIC_PREVIEW_EXAMPLES[sport], scheduleAvailable: true }
}, ['public-research-preview-v1'], { revalidate: 300 })

export async function getPublicResearchPreview(sport: PreviewSport): Promise<ResearchPreview> {
  const date = scheduleDate()
  try {
    return await loadPreview(sport, date)
  } catch {
    return example(sport, date)
  }
}
