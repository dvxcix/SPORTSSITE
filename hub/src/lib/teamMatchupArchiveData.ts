import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import { nbaGameFinal, nbaGameStart } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'
import {
  archivedScore, archivedTeamGames, emptyArchivedLines, verifiedArchivedLines,
  type ArchivedFinal, type ArchivedLines, type MatchupLeague,
} from './teamMatchupArchive'

type Admin = ReturnType<typeof createAdminClient>
type NbaRow = { id: number; game_date: string; season: number; home_team_id: number; visitor_team_id: number; payload: PaintGame }
type NflRow = { game_id: string; season: number; gameday: string; gametime: string | null; home_team: string; away_team: string; home_score: number | null; away_score: number | null }
const nflColumns = 'game_id,season,gameday,gametime,home_team,away_team,home_score,away_score'
const nflSeasons = ['REG', 'WC', 'DIV', 'CON', 'SB']
const nbaColumns = 'id,game_date,season,home_team_id,visitor_team_id,payload'
const clockISO = (time: number) => new Date(time).toISOString()
const teamCode = (key: unknown): key is string => typeof key === 'string' && /^[A-Z0-9]{2,3}$/.test(key)

function nbaIdentity(row: NbaRow) {
  const game = row.payload
  if (!game || typeof game.status !== 'string' || game.id !== row.id || game.date !== row.game_date || game.season !== row.season ||
    game.home_team?.id !== row.home_team_id || game.visitor_team?.id !== row.visitor_team_id) return null
  const home = game.home_team.abbreviation, away = game.visitor_team.abbreviation
  const clock = nbaGameStart(game)
  return clock != null && teamCode(home) && teamCode(away) && home !== away ? { home, away, clock } : null
}

function nflIdentity(row: NflRow) {
  const { home_team: home, away_team: away } = row
  const clock = nflKickoffAt({ gameday: row.gameday, gametime: row.gametime ?? '' })?.getTime()
  return clock != null && teamCode(home) && teamCode(away) && home !== away && row.game_id.endsWith(`_${away}_${home}`) ? { home, away, clock } : null
}

function nbaFinal(row: NbaRow): ArchivedFinal | null {
  const identity = nbaIdentity(row)
  if (!identity || !nbaGameFinal(row.payload)) return null
  const homeScore = archivedScore(row.payload.home_team_score, 'nba')
  const awayScore = archivedScore(row.payload.visitor_team_score, 'nba')
  if (homeScore == null || awayScore == null || homeScore === awayScore) return null
  return { ...identity, id: String(row.id), date: row.game_date, season: row.season, homeScore, awayScore }
}

function nflFinal(row: NflRow): ArchivedFinal | null {
  const identity = nflIdentity(row)
  const homeScore = archivedScore(row.home_score, 'nfl'), awayScore = archivedScore(row.away_score, 'nfl')
  if (!identity || homeScore == null || awayScore == null) return null
  return { ...identity, id: row.game_id, date: row.gameday, season: row.season, homeScore, awayScore }
}

function pregameFinals(rows: (ArchivedFinal | null)[], team: string, cutoff: number) {
  return rows.flatMap(game => game && game.clock < cutoff && [game.home, game.away].includes(team) ? [game] : [])
    .sort((a, b) => b.clock - a.clock || a.id.localeCompare(b.id)).slice(0, 10)
}

async function nbaCutoff(admin: Admin, id: number, scheduled: number) {
  const { data, error } = await admin.rpc('nba_phase_cutoff', { p_game_id: id, p_tipoff: clockISO(scheduled) })
    .abortSignal(AbortSignal.timeout(6000))
  const time = typeof data === 'string' ? Date.parse(data) : NaN
  if (error || !Number.isFinite(time) || time > scheduled) throw new Error('NBA clock unavailable')
  return time
}

async function nflCutoff(admin: Admin, id: string, scheduled: number) {
  const [archive, feed] = await Promise.all([
    admin.from('nfl_pregame_research').select('kickoff_at').eq('game_id', id)
      .order('kickoff_at').limit(1).abortSignal(AbortSignal.timeout(6000)).maybeSingle(),
    admin.from('nfl_game_feeds').select('start:payload->game->>date').eq('game_id', id)
      .eq('source', 'bdl_plays').eq('reconciled', true).limit(1).abortSignal(AbortSignal.timeout(6000)).maybeSingle(),
  ])
  if (archive.error || feed.error) throw new Error('NFL clock unavailable')
  const clocks = [archive.data?.kickoff_at, feed.data?.start].flatMap(value => {
    const clock = typeof value === 'string' ? Date.parse(value) : NaN
    return Number.isFinite(clock) ? [clock] : []
  })
  return Math.min(scheduled, ...clocks)
}

async function readNbaLines(admin: Admin, game: ArchivedFinal): Promise<ArchivedLines> {
  // The tape RPC applies the earliest stored tip as well as this schedule clock.
  const { data, error } = await admin.rpc('read_nba_book_frames', {
    p_game_id: Number(game.id), p_mode: 'pregame', p_feed: 'game', p_tipoff: clockISO(game.clock),
    p_selection: 'latest', p_market: null, p_player_id: null, p_as_of: clockISO(game.clock),
  }).abortSignal(AbortSignal.timeout(6500))
  if (error || !Array.isArray(data) || data.length > 1) throw new Error('NBA lines unavailable')
  const row = data[0]
  return row ? verifiedArchivedLines(row.quotes, game, 'nba', row.captured_at) : emptyArchivedLines
}

async function readNflLines(admin: Admin, game: ArchivedFinal): Promise<ArchivedLines> {
  const { data, error } = await admin.rpc('read_nfl_pregame_research', {
    p_game_id: game.id, p_resource: 'odds:v1', p_version: 1, p_kickoff: clockISO(game.clock),
  }).abortSignal(AbortSignal.timeout(6500))
  if (error) throw new Error('NFL lines unavailable')
  if (!data || !['capture', 'recovered-cache'].includes(data.source)) return emptyArchivedLines
  const archivedKickoff = Date.parse(data.kickoff_at)
  if (!Number.isFinite(archivedKickoff)) return emptyArchivedLines
  return verifiedArchivedLines(data.payload?.gameLines,
    { ...game, clock: Math.min(game.clock, archivedKickoff) }, 'nfl', data.observed_at)
}

async function readLines(admin: Admin, league: MatchupLeague, away: ArchivedFinal[], home: ArchivedFinal[]) {
  const games = [...new Map([...away, ...home].map(game => [game.id, game])).values()]
  const markets = new Map<string, ArchivedLines>()
  const read = league === 'nba' ? readNbaLines : readNflLines
  for (let offset = 0; offset < games.length; offset += 5) {
    await Promise.all(games.slice(offset, offset + 5).map(async game => {
      try { markets.set(game.id, await read(admin, game)) }
      catch { markets.set(game.id, { ...emptyArchivedLines, readFailed: true }) }
    }))
  }
  return markets
}

export async function getTeamMatchupArchive(league: MatchupLeague, id: string, date: string) {
  const admin = createAdminClient()
  if (league === 'nba') {
    const target = await admin.from('nba_games').select(nbaColumns).eq('id', Number(id)).eq('game_date', date)
      .abortSignal(AbortSignal.timeout(6000)).maybeSingle()
    if (target.error) throw new Error('NBA matchup unavailable')
    const row = target.data as NbaRow | null
    const game = row && nbaIdentity(row)
    if (!row || !game) return null
    const cutoff = await nbaCutoff(admin, row.id, game.clock)
    const readTeam = async (team: number, code: string) => {
      const { data, error } = await admin.from('nba_games').select(nbaColumns)
        .or(`home_team_id.eq.${team},visitor_team_id.eq.${team}`).lt('game_date', date)
        .order('game_date', { ascending: false }).order('id', { ascending: false }).limit(24).abortSignal(AbortSignal.timeout(6000))
      if (error) throw new Error('NBA team results unavailable')
      return pregameFinals((data as NbaRow[]).map(nbaFinal), code, Math.min(cutoff, Date.now()))
    }
    const [away, home] = await Promise.all([readTeam(row.visitor_team_id, game.away), readTeam(row.home_team_id, game.home)])
    const markets = await readLines(admin, league, away, home)
    return { league, game: id, date, season: row.season, cutoffAt: clockISO(cutoff),
      away: archivedTeamGames(game.away, away, markets), home: archivedTeamGames(game.home, home, markets) }
  }

  const target = await admin.from('nfl_schedule').select(nflColumns).eq('game_id', id).eq('gameday', date).in('game_type', nflSeasons)
    .abortSignal(AbortSignal.timeout(6000)).maybeSingle()
  if (target.error) throw new Error('NFL matchup unavailable')
  const row = target.data as NflRow | null
  const game = row && nflIdentity(row)
  if (!row || !game) return null
  const cutoff = await nflCutoff(admin, id, game.clock)
  const readTeam = async (team: string) => {
    const { data, error } = await admin.from('nfl_schedule').select(nflColumns)
      .or(`home_team.eq.${team},away_team.eq.${team}`).lt('gameday', date).in('game_type', nflSeasons)
      .not('home_score', 'is', null).not('away_score', 'is', null)
      .order('gameday', { ascending: false }).order('game_id', { ascending: false }).limit(16).abortSignal(AbortSignal.timeout(6000))
    if (error) throw new Error('NFL team results unavailable')
    return pregameFinals((data as NflRow[]).map(nflFinal), team, Math.min(cutoff, Date.now()))
  }
  const [away, home] = await Promise.all([readTeam(game.away), readTeam(game.home)])
  const markets = await readLines(admin, league, away, home)
  return { league, game: id, date, season: row.season, cutoffAt: clockISO(cutoff),
    away: archivedTeamGames(game.away, away, markets), home: archivedTeamGames(game.home, home, markets) }
}
