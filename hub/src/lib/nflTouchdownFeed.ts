import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeNflPlayerName } from '@/lib/nflPlayerName'
import type { NflOddsPlayer, SidelineOddsBoard } from '@/lib/nflOddsTypes'

export type NflTouchdownMarketQuote = {
  propType: string
  label: string
  vendor: string
  line: number | null
  odds: number
  openingOdds: number | null
}

export type NflTouchdownEvent = {
  id: string; gameId: string; gameDate: string; bdlGameId: number | null; playerName: string; playerId: string | null; bdlPlayerId: number | null
  headshot: string | null; position: string | null; team: string; opponent: string; awayTeam: string; homeTeam: string; teamLogo: string | null
  quarter: number; clock: string; kind: 'receiving' | 'rushing' | 'return' | 'defense' | 'other'; yards: number | null
  passerName: string | null; text: string; awayScore: number; homeScore: number; isFirstTdOfGame: boolean; playerTdNumber: number
  gameStatus: string; occurredAt: string | null; startYardLine: number | null; endYardLine: number | null
  startYardsToEndzone: number | null; endYardsToEndzone: number | null; teamColor: string | null; opponentLogo: string | null
  marketQuotes: NflTouchdownMarketQuote[]
}

type ScheduleRow = { game_id: string; season: number; week: number; game_type: string; gameday: string; away_team: string; home_team: string }
type ApiGame = {
  id: number; date: string; status?: string | null; status_state?: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'canceled' | 'delayed' | 'suspended' | 'abandoned' | 'unknown' | null
  visitor_team: { abbreviation: string }; home_team: { abbreviation: string }
}
type BdlParticipant = { player_id?: number | null; type?: string | null }
type BdlPlay = {
  id: string | number; game?: ApiGame; type_slug?: string | null; type_text?: string | null; text?: string | null; short_text?: string | null
  away_score?: number | null; home_score?: number | null; scoring_play?: boolean | null; period?: number | null; clock_display?: string | null
  team?: { abbreviation?: string | null }; start_yard_line?: number | null; end_yard_line?: number | null
  start_yards_to_endzone?: number | null; end_yards_to_endzone?: number | null; stat_yardage?: number | null
  participants?: BdlParticipant[] | null; wallclock?: string | null
}
type PlayerRow = { gsis_id: string; display_name: string; position: string | null; headshot: string | null; latest_team: string | null }
type BoardRow = { game_id: string; board: SidelineOddsBoard; captured_at?: string }
const TEAM_ALIASES: Record<string, string> = { LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' }
const canonicalTeam = (value: string) => TEAM_ALIASES[value.toUpperCase()] ?? value.toUpperCase()
const numberOrNull = (value: unknown) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null

export function scorerFromText(text: string) {
  const lateral = text.match(/\blateral to (.+?) for \d+ yards/i)?.[1]?.trim()
  if (lateral) return lateral
  return text.match(/^(.+?)\s+-?\d+\s+Yd\b/i)?.[1]?.trim() ?? text.match(/^(.+?)\s+(?:Pass|Rush|Reception|Return)\b/i)?.[1]?.trim() ?? ''
}
function passerFromText(text: string) { return text.match(/\bpass from (.+?)(?:\s*\(|$)/i)?.[1]?.trim() ?? null }
export function classifyNflTouchdown(slug: string, text: string): NflTouchdownEvent['kind'] {
  const value = `${slug} ${text}`.toLowerCase()
  if (value.includes('passing-touchdown') || value.includes('pass from')) return 'receiving'
  if (value.includes('rushing-touchdown') || /\byd rush\b/.test(value)) return 'rushing'
  if (value.includes('interception') || value.includes('fumble')) return 'defense'
  if (value.includes('return')) return 'return'
  return 'other'
}
export function isNflTouchdownPlay(play: Pick<BdlPlay, 'scoring_play' | 'type_slug' | 'type_text' | 'short_text' | 'text'>) {
  return Boolean(play.scoring_play) && /touchdown/i.test(`${play.type_slug ?? ''} ${play.type_text ?? ''} ${play.short_text ?? ''} ${play.text ?? ''}`)
}

function findBoardPlayer(board: SidelineOddsBoard, playerName: string, team: string, bdlPlayerId: number | null) {
  const normalized = normalizeNflPlayerName(playerName)
  return board.players.find(player => (bdlPlayerId != null && player.id === bdlPlayerId) || (canonicalTeam(player.team) === team && normalizeNflPlayerName(player.name) === normalized))
    ?? board.players.find(player => normalizeNflPlayerName(player.name) === normalized)
}

function touchdownQuotes(boards: SidelineOddsBoard[], playerName: string, team: string, bdlPlayerId: number | null) {
  const quotes = new Map<string, NflTouchdownMarketQuote>()
  for (const board of boards) {
    const player: NflOddsPlayer | undefined = findBoardPlayer(board, playerName, team, bdlPlayerId)
    for (const market of player?.markets ?? []) {
      if (!(market.propType === 'first_td' || market.propType.startsWith('anytime_td'))) continue
      for (const offer of market.offers) {
        const odds = offer.current.odds ?? offer.current.over
        if (odds == null) continue
        const key = `${market.propType}:${market.line ?? offer.line ?? ''}:${offer.vendor}`
        const quote = { propType: market.propType, label: market.label, vendor: offer.vendor, line: market.line ?? offer.line, odds, openingOdds: offer.opening?.odds ?? offer.opening?.over ?? null }
        if (!quotes.has(key)) quotes.set(key, quote)
      }
    }
  }
  return [...quotes.values()]
}

export async function loadNflTouchdowns(date: string): Promise<NflTouchdownEvent[]> {
  const admin = createAdminClient()
  const [{ data: schedule, error: scheduleError }, { data: teams }] = await Promise.all([
    admin.from('nfl_schedule').select('game_id,season,week,game_type,gameday,away_team,home_team').eq('gameday', date).limit(24).abortSignal(AbortSignal.timeout(10_000)),
    admin.from('nfl_teams').select('team_abbr,team_logo_espn,team_color').abortSignal(AbortSignal.timeout(10_000)),
  ])
  if (scheduleError) throw scheduleError
  const rows = (schedule ?? []) as ScheduleRow[]
  if (!rows.length) return []
  const {data:savedFeeds,error:feedError}=await admin.from('nfl_game_feeds')
    .select('game_id,payload,fetched_at,reconciled').eq('source','bdl_plays')
    .in('game_id',rows.map(r=>r.game_id)).abortSignal(AbortSignal.timeout(10000))
  // Throw on failed refresh so the shared cache retains its last good value.
  if(feedError) throw new Error('NFL stored touchdown feed unavailable: '+feedError.message)
  const saved=new Map((savedFeeds ?? []).map(r=>[r.game_id,{
    ...r,payload:r.payload as {game:ApiGame;plays:BdlPlay[];stats?:Array<{player:{id:number;first_name:string;last_name:string}}>},
  }]))
  const teamLogos = new Map((teams ?? []).map(row => [canonicalTeam(String(row.team_abbr)), row.team_logo_espn as string | null]))
  const teamColors = new Map((teams ?? []).map(row => [canonicalTeam(String(row.team_abbr)), row.team_color as string | null]))
  // The scheduled ingester owns upstream calls, not every page/cache miss.
  const matched = rows.map(row => ({ row, game: saved.get(row.game_id)?.payload.game }))
    .filter((value): value is { row: ScheduleRow; game: ApiGame } => Boolean(value.game))
    .filter(({ game }) => game.status_state === 'in_progress' || game.status_state === 'final')
  const playResults = matched.map(value => ({...value, plays:saved.get(value.row.game_id)?.payload.plays ?? []}))
  const touchdownPlays = playResults.flatMap(({ row, game, plays }) => plays.filter(isNflTouchdownPlay).map(play => ({ row, game, play })))
  if (!touchdownPlays.length) return []
  const identities = new Map(touchdownPlays.map(({row,play}) => {
    const text = play.short_text?.trim() || play.text?.trim() || ''
    const kind = classifyNflTouchdown(play.type_slug ?? '', text+' '+(play.text ?? ''))
    const roles = kind === 'receiving' ? ['receiver'] : kind === 'rushing' ? ['rusher'] : ['returner','interception_returner','fumble_recoverer']
    const id = numberOrNull(play.participants?.find(p => roles.includes(p.type ?? ''))?.player_id)
    const person = saved.get(row.game_id)?.payload.stats?.find(s => s.player.id === id)?.player
    return [row.game_id+':'+play.id, { id, name:person ? person.first_name+' '+person.last_name : scorerFromText(text), kind }]
  }))
  const gameIds = Array.from(new Set(matched.map(({ row }) => row.game_id)))
  const [{ data: oddsRows, error: oddsError }, fanduelResults] = await Promise.all([
    admin.from('nfl_odds_current').select('game_id,board,captured_at').in('game_id', gameIds).abortSignal(AbortSignal.timeout(10_000)),
    // One indexed receipt per game, not 250 multi-megabyte boards.
    Promise.all(gameIds.map(id => admin.from('nfl_fanduel_capture_history').select('game_id,board,captured_at').eq('game_id', id).order('captured_at', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(10_000)))),
  ])
  const fanduelRows = fanduelResults.flatMap(result => result.data ?? [])
  const fanduelError = fanduelResults.find(result => result.error)?.error
  if (oddsError) console.error('[nfl-touchdowns] odds receipt lookup failed', { date, error: oddsError.message })
  if (fanduelError) console.error('[nfl-touchdowns] FanDuel receipt lookup failed', { date, error: fanduelError.message })
  const boardsByGame = new Map<string, SidelineOddsBoard[]>()
  for (const row of (oddsRows ?? []) as BoardRow[]) boardsByGame.set(row.game_id, [{ ...row.board, capturedAt: row.captured_at ?? row.board.capturedAt }])
  const seenFanduel = new Set<string>()
  for (const row of (fanduelRows ?? []) as BoardRow[]) {
    if (seenFanduel.has(row.game_id)) continue
    seenFanduel.add(row.game_id)
    boardsByGame.set(row.game_id, [...(boardsByGame.get(row.game_id) ?? []), { ...row.board, capturedAt: row.captured_at ?? row.board.capturedAt }])
  }
  const scorerNames = Array.from(new Set([...identities.values()].map(identity => identity.name).filter(Boolean)))
  const { data: playerRows, error: playerError } = await admin.from('nfl_players').select('gsis_id,display_name,position,headshot,latest_team').in('display_name', scorerNames).limit(250).abortSignal(AbortSignal.timeout(10_000))
  if (playerError) console.error('[nfl-touchdowns] player identity lookup failed', { date, error: playerError.message })
  const playerByName = new Map<string, PlayerRow>()
  for (const player of (playerRows ?? []) as PlayerRow[]) {
    const name = normalizeNflPlayerName(player.display_name)
    playerByName.set(`${canonicalTeam(player.latest_team ?? '')}:${name}`, player)
    if (!playerByName.has(name)) playerByName.set(name, player)
  }
  const events: NflTouchdownEvent[] = []
  for (const { row, game, play } of touchdownPlays) {
    const shortText = play.short_text?.trim() || play.text?.trim() || 'Touchdown'
    const identity = identities.get(row.game_id+':'+play.id)!
    const playerName = identity.name || canonicalTeam(play.team?.abbreviation ?? '') || 'Team touchdown'
    const team = canonicalTeam(play.team?.abbreviation ?? '')
    const playerKey = normalizeNflPlayerName(playerName)
    const player = playerByName.get(`${team}:${playerKey}`) ?? playerByName.get(playerKey) ?? null
    const kind = identity.kind
    const bdlPlayerId = identity.id
    events.push({
      id: String(play.id), gameId: row.game_id, gameDate: row.gameday, bdlGameId: game.id, playerName, playerId: player?.gsis_id ?? null, bdlPlayerId,
      headshot: player?.headshot ?? null, position: player?.position ?? null, team, awayTeam: canonicalTeam(row.away_team), homeTeam: canonicalTeam(row.home_team),
      opponent: team === canonicalTeam(row.away_team) ? canonicalTeam(row.home_team) : canonicalTeam(row.away_team), teamLogo: teamLogos.get(team) ?? null,
      quarter: Number(play.period ?? 0), clock: play.clock_display ?? '', kind, yards: numberOrNull(play.stat_yardage), passerName: passerFromText(shortText), text: shortText,
      awayScore: Number(play.away_score ?? 0), homeScore: Number(play.home_score ?? 0), isFirstTdOfGame: false, playerTdNumber: 0,
      gameStatus: game.status ?? game.status_state ?? '', occurredAt: play.wallclock ?? null, startYardLine: numberOrNull(play.start_yard_line), endYardLine: numberOrNull(play.end_yard_line),
      startYardsToEndzone: numberOrNull(play.start_yards_to_endzone), endYardsToEndzone: numberOrNull(play.end_yards_to_endzone), teamColor: teamColors.get(team) ?? null,
      opponentLogo: teamLogos.get(team === canonicalTeam(row.away_team) ? canonicalTeam(row.home_team) : canonicalTeam(row.away_team)) ?? null,
      marketQuotes: touchdownQuotes(boardsByGame.get(row.game_id) ?? [], playerName, team, bdlPlayerId),
    })
  }
  const clockSeconds = (clock: string) => { const [minutes, seconds] = clock.split(':').map(Number); return Number.isFinite(minutes + seconds) ? minutes * 60 + seconds : 0 }
  events.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.quarter - b.quarter || clockSeconds(b.clock) - clockSeconds(a.clock) || Date.parse(a.occurredAt ?? '') - Date.parse(b.occurredAt ?? '') || a.id.localeCompare(b.id, undefined, { numeric: true }))
  const firstByGame = new Set<string>()
  const playerCounts = new Map<string, number>()
  return events.map(event => {
    const countKey = `${event.gameId}:${event.team}:${normalizeNflPlayerName(event.playerName)}`
    const playerTdNumber = (playerCounts.get(countKey) ?? 0) + 1
    playerCounts.set(countKey, playerTdNumber)
    const isFirstTdOfGame = !firstByGame.has(event.gameId)
    firstByGame.add(event.gameId)
    return { ...event, isFirstTdOfGame, playerTdNumber }
  })
}

export const getNflTouchdownFeed = unstable_cache(loadNflTouchdowns, ['nfl-live-touchdown-feed-v4-stored'], { revalidate: 30, tags: ['sideline:nfl-live'] })
