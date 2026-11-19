import { nbaMinutes, nbaSample, nbaValue, type PaintBoard, type PaintMarket, type PaintPlayer, type PaintStat } from './nbaPaint'
import type { NbaTrackingRow } from './nbaTracking'

export const NBA_WORKLOAD_VERSION = 'nba-workload-v1'
export const NBA_WORKLOAD_MARKETS = ['points', 'rebounds', 'assists', 'threes'] as const
export type NbaWorkload = {
  version: string
  market: PaintMarket
  status: 'available' | 'unavailable' | 'unsupported'
  reason: string | null
  opportunityLabel: string
  proxy: boolean
  recentGames: number
  priorGames: number
  recentMinutes: number | null
  priorMinutes: number | null
  recentOpportunity: number | null
  priorOpportunity: number | null
  recentProduction: number | null
  conversion: number | null
  estimate: number | null
  sampleGameIds: number[]
  observedAt: string | null
  teamRank: number | null
  teamPool: number
  teamShare: number | null
}
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day + 'T00:00:00Z')) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day

/** Descriptive opportunity calculation, never a hit probability or ceiling.
 * Both windows use prior current-team, current-season final appearances only.
 * Conversion uses the earlier window, independently of the last two outputs.
 * Passes are explicitly a proxy; they are not potential assists. */
export function nbaWorkload(player: PaintPlayer, market: PaintMarket, game: PaintBoard['game'], tracking: NbaTrackingRow[] = [], observedAt: string | null = null): NbaWorkload {
  const core = NBA_WORKLOAD_MARKETS.includes(market as typeof NBA_WORKLOAD_MARKETS[number])
  const label = market === 'points' ? 'Shot equivalents' : market === 'threes' ? 'Three-point attempts' : market === 'rebounds' ? 'Rebound chances' : market === 'assists' ? 'Passes (proxy)' : 'Unavailable'
  const empty: NbaWorkload = { version: NBA_WORKLOAD_VERSION, market, status: core ? 'unavailable' : 'unsupported',
    reason: core ? 'At least five prior current-team appearances required' : 'Workload is available for full-game points, rebounds, assists and threes',
    opportunityLabel: label, proxy: market === 'assists', recentGames: 0, priorGames: 0, recentMinutes: null, priorMinutes: null,
    recentOpportunity: null, priorOpportunity: null, recentProduction: null, conversion: null, estimate: null, sampleGameIds: [], observedAt,
    teamRank: null, teamPool: 0, teamShare: null }
  if (!core || !validDay(game.date) || !Number.isSafeInteger(game.season) || ![game.home_team.id, game.visitor_team.id].includes(player.team.id)) return empty
  const seen = new Set<number>()
  const logs = nbaSample(player.logs.filter(log => log.player.id === player.id && log.team.id === player.team.id && log.game.id !== game.id
    && log.game.season === game.season && log.game.postseason !== true && (log.period == null || log.period === 0)
    && (log.game.status_state === 'final' || log.game.status === 'Final') && validDay(log.game.date.slice(0, 10))
    && log.game.date.slice(0, 10) < game.date && log.game.date.slice(0, 10) >= `${game.season}-07-01`
    && log.game.date.slice(0, 10) < `${game.season + 1}-07-01`
    && [log.game.home_team_id, log.game.visitor_team_id].includes(log.team.id)), 100)
    .filter(log => { if (seen.has(log.game.id)) return false; seen.add(log.game.id); return true }).slice(0, 10)
  const byGame = new Map<number, NbaTrackingRow>()
  const ambiguous = new Set<number>()
  for (const row of tracking) {
    if (row.playerId !== player.id || row.teamId !== player.team.id) continue
    const previous = byGame.get(row.gameId)
    if (previous && JSON.stringify(previous.values) !== JSON.stringify(row.values)) ambiguous.add(row.gameId)
    byGame.set(row.gameId, row)
  }
  const opportunity = (log: PaintStat) => {
    if (market === 'points') return number(log.fga) && number(log.fta) ? log.fga + .44 * log.fta : null
    if (market === 'threes') return number(log.fg3a) ? log.fg3a : null
    if (ambiguous.has(log.game.id)) return null
    const value = byGame.get(log.game.id)?.values[market === 'rebounds' ? 'rebound_chances_total' : 'passes']
    return number(value) ? value : null
  }
  const recent = logs.slice(0, 2), prior = logs.slice(2)
  const usable = (log: PaintStat) => opportunity(log) != null && nbaValue(log, market) != null && (nbaMinutes(log.min) ?? 0) > 0
  const recentValid = recent.filter(usable), priorValid = prior.filter(usable)
  const value: NbaWorkload = { ...empty, recentGames: recentValid.length, priorGames: priorValid.length, sampleGameIds: logs.map(log => log.game.id),
    recentMinutes: mean(recent.map(log => nbaMinutes(log.min)).filter(number)), priorMinutes: mean(prior.map(log => nbaMinutes(log.min)).filter(number)),
    recentOpportunity: mean(recentValid.map(log => opportunity(log)!)), priorOpportunity: mean(priorValid.map(log => opportunity(log)!)),
    recentProduction: mean(recent.map(log => nbaValue(log, market)).filter(number)) }
  if (recentValid.length !== 2 || priorValid.length < 3) return { ...value, reason: 'Incomplete opportunity or production observations in the two-game / prior-game windows' }
  const denominator = priorValid.reduce((sum, log) => sum + opportunity(log)!, 0)
  if (denominator <= 0) return { ...value, reason: 'No positive prior opportunity denominator' }
  const conversion = priorValid.reduce((sum, log) => sum + nbaValue(log, market)!, 0) / denominator
  // Inconsistent made threes/chances cannot be promoted to usable research.
  if (market !== 'points' && conversion > 1) return { ...value, reason: 'Production exceeds the recorded opportunity sample' }
  return { ...value, status: 'available', reason: null, conversion, estimate: value.recentOpportunity! * conversion }
}

/** Team shares always use the full game roster, never the searched/selected subset.
 * This pool measures recent workload; it is not a forecast of a 240-minute rotation. */
export function nbaWorkloadBoard(board: PaintBoard, tracking: NbaTrackingRow[] = [], observedAt: string | null = null) {
  const rows = board.players.flatMap(player => NBA_WORKLOAD_MARKETS.map(market => ({ playerId: player.id, teamId: player.team.id,
    eligible: !/out|doubtful|inactive|suspended|questionable|game time decision/i.test(player.injury?.status ?? ''), ...nbaWorkload(player, market, board.game, tracking, observedAt) })))
  for (const row of rows) {
    const pool = rows.filter(peer => peer.teamId === row.teamId && peer.market === row.market && peer.eligible && peer.estimate != null)
    const sum = pool.reduce((n, peer) => n + peer.estimate!, 0)
    row.teamPool = pool.length
    if (row.eligible && row.estimate != null && pool.length >= 2 && sum > 0) {
      row.teamRank = 1 + pool.filter(peer => peer.estimate! > row.estimate!).length
      row.teamShare = row.estimate / sum
    }
  }
  return rows
}

/** Exact selected contract only. This gap is descriptive and is never a win chance. */
export function nbaWorkloadGap(workload: NbaWorkload | null | undefined, line: number | null, side: 'over' | 'under' = 'over') {
  return workload?.estimate != null && line != null && Number.isFinite(line) && line >= 0
    ? (workload.estimate - line) * (side === 'under' ? -1 : 1) : null
}

