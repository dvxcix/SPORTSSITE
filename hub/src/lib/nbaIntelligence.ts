import { nbaBinary, nbaPeriod, nbaMarketLogs, nbaAverage, nbaMinutes, nbaSample, nbaValue, type PaintBoard, type PaintMarket, type PaintPlayer, type PaintStat } from './nbaPaint'

export const NBA_SCORE_VERSION = 'nba-opportunity-v2'
const clamp = (value: number, low = 0, high = 100) => Math.max(low, Math.min(high, value))
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const field = (logs: PaintStat[], key: keyof PaintStat) => mean(logs.map(log => log[key]).filter(numeric))
const ceiling: Record<PaintMarket, number> = { points: 35, rebounds: 15, assists: 12, threes: 5, points_rebounds_assists: 55, points_rebounds: 48, points_assists: 46, rebounds_assists: 24, steals: 2.5, blocks: 3, turnovers: 5, double_double: 1, triple_double: 1, points_1q: 35, rebounds_1q: 15, assists_1q: 12 }
export type NbaScorePart = { key: string; label: string; value: number | null; weight: number }
export type NbaDvp = { teamId: number; position: string; market: PaintMarket; games: number; minutes: number; per48: number | null; leaguePer48: number | null; allowance: number | null }
export function nbaPosition(position: string | null | undefined) {
  const first = position?.toUpperCase().split('-')[0]
  return first === 'C' ? 'C' : first && /G/.test(first) ? 'G' : first && /F/.test(first) ? 'F' : null
}
export function nbaGamePace(board: PaintBoard) {
  if (board.historical) return null
  const teams = [board.game.home_team.id, board.game.visitor_team.id]
  const values = teams.map(id => board.teamStats?.find(row => row.team.id === id)?.stats.pace)
  return values.every((value): value is number => numeric(value) && value > 0) ? mean(values) : null
}
/** Descriptive production support, not a win probability or a fitted betting edge. */
export function nbaSlipSurgeScore(player: PaintPlayer, market: PaintMarket, before: string, matchup?: NbaDvp | null, pace?: number | null) {
  const logs = nbaSample(nbaMarketLogs(player, market).filter(log => log.game.date.slice(0, 10) < before), 30)
  const recent = logs.slice(0, 10), prior = logs.slice(10, 30)
  const minutes = mean(recent.map(log => nbaMinutes(log.min)).filter(numeric))
  const production = nbaAverage(recent, market), baseline = nbaAverage(prior, market)
  const fga = field(recent, 'fga'), fta = field(recent, 'fta'), threes = field(recent, 'fg3a')
  // Market-specific opportunity: attempts for scoring, attempts for threes;
  // observed per-36 output for categories without a recorded chance feed.
  const binary = nbaBinary(market), quarter = nbaPeriod(market) === 1, minutesCeiling = quarter ? 12 : 36
  const per36 = production != null && minutes != null && minutes > 0 ? production / minutes * 36 : null
  const opportunity = binary ? production == null ? null : clamp(production * 100) : market === 'points' || market === 'points_1q' ? fga != null && fta != null ? clamp((fga + .44 * fta) / (quarter ? 9.333333 : 28) * 100) : null
    : market === 'threes' ? threes == null ? null : clamp(threes / 12 * 100)
    : per36 == null ? null : clamp(per36 / ceiling[market] * 100)
  const minutesValues = recent.map(log => nbaMinutes(log.min)).filter(numeric)
  const deviation = minutes == null ? null : Math.sqrt(minutesValues.reduce((sum, value) => sum + (value - minutes) ** 2, 0) / Math.max(1, minutesValues.length))
  const stability = minutes != null && deviation != null && minutes > 0 ? clamp(100 - deviation / minutes * 200) : null
  const form = production != null && baseline != null && prior.length >= 5 ? clamp(50 + (production - baseline) / Math.max(1, baseline) * 100) : null
  const parts: NbaScorePart[] = [
    { key: 'opportunity', label: binary ? 'Event frequency' : market === 'points' || market === 'points_1q' || market === 'threes' ? 'Shot opportunity' : 'Per-36 production', value: opportunity, weight: .35 },
    { key: 'role', label: 'Minutes', value: minutes == null ? null : clamp(minutes / minutesCeiling * 100), weight: .20 },
    { key: 'form', label: 'Recent form', value: form, weight: .20 },
    { key: 'stability', label: 'Role stability', value: stability, weight: .10 },
    { key: 'matchup', label: 'Position allowance', value: matchup?.allowance == null ? null : clamp(50 + matchup.allowance * 100), weight: .10 },
    { key: 'pace', label: 'Game pace', value: pace == null || !Number.isFinite(pace) || pace <= 0 ? null : clamp(50 + (pace - 100) * 5), weight: .05 },
  ]
  const valid = parts.filter(part => part.value != null), coverage = valid.reduce((sum, part) => sum + part.weight, 0)
  // Shrink sparse samples toward neutral; missing features remain visible.
  const raw = coverage ? valid.reduce((sum, part) => sum + part.value! * part.weight, 0) / coverage : null
  const marketGames = recent.filter(log => nbaValue(log, market) != null).length
  const score = marketGames >= 5 && coverage >= .55 && raw != null ? Math.round(50 + (raw - 50) * Math.min(1, logs.length / 20)) : null
  const historicalTeams = [...new Set(logs.map(log => log.team.id))]
  const year = Number(before.slice(0, 4)), season = Number(before.slice(5, 7)) < 7 ? year - 1 : year
  const previousSeasonTeams = [...new Set(logs.filter(log => log.game.season != null && log.game.season < season).map(log => log.team.id))]
  const priorTeams = previousSeasonTeams.length ? previousSeasonTeams : historicalTeams
  return { version: NBA_SCORE_VERSION, score, games: logs.length, marketGames, coverage, parts, minutes, production, baseline, pace: pace ?? null, newTeam: priorTeams.length > 0 && !priorTeams.includes(player.team.id), priorTeams }
}

/** A transparent rolling production baseline, evaluated before each next game. */
export function nbaProductionEstimate(logs: PaintStat[], market: PaintMarket, before: string) {
  const sample = nbaSample(logs.filter(log => log.game.date.slice(0, 10) < before), 20)
  if (sample.length < 10) return null
  const recent = sample.slice(0, 5), longer = sample.slice(5)
  const a = nbaAverage(recent, market), b = nbaAverage(longer, market)
  return a == null || b == null ? null : .35 * a + .65 * b
}
export function nbaWalkForward(logs: PaintStat[], market: PaintMarket) {
  const ordered = nbaSample(logs, Number.MAX_SAFE_INTEGER).reverse()
  const rows = ordered.flatMap((game, index) => {
    const prediction = nbaProductionEstimate(ordered.slice(0, index), market, game.game.date.slice(0, 10)), actual = nbaValue(game, market)
    const baseline = nbaAverage(nbaSample(ordered.slice(0, index).filter(log => log.game.date < game.game.date), 10), market)
    return prediction == null || actual == null || baseline == null ? [] : [{ gameId: game.game.id, date: game.game.date, prediction, actual, baseline }]
  })
  return { rows, games: rows.length, mae: mean(rows.map(row => Math.abs(row.actual - row.prediction))), baselineMae: mean(rows.map(row => Math.abs(row.actual - row.baseline))), bias: mean(rows.map(row => row.prediction - row.actual)) }
}

/** Allowance is production per 48 position-minutes, shrunk toward the league mean. */
export function nbaDefenseProfiles(stats: PaintStat[], markets: readonly PaintMarket[]) {
  const groups = new Map<string, { teamId: number; position: string; totals: Map<PaintMarket, { value: number; minutes: number; games: Set<number> }> }>()
  for (const log of [...new Map(stats.map(row => [row.id, row])).values()]) {
    const minutes = nbaMinutes(log.min), position = nbaPosition(log.player.position)
    if (minutes == null || minutes <= 0 || !position || log.game.postseason === true || !['Final', 'final'].includes(log.game.status_state ?? log.game.status)) continue
    const opponent = log.team.id === log.game.home_team_id ? log.game.visitor_team_id : log.team.id === log.game.visitor_team_id ? log.game.home_team_id : null
    if (!opponent) continue
    const key = `${opponent}:${position}`, group = groups.get(key) ?? { teamId: opponent, position, totals: new Map() }
    for (const market of markets) {
      const value = nbaValue(log, market); if (value == null) continue
      const total = group.totals.get(market) ?? { value: 0, minutes: 0, games: new Set<number>() }
      total.value += value; total.minutes += minutes; total.games.add(log.game.id); group.totals.set(market, total)
    }
    groups.set(key, group)
  }
  return [...groups.values()].flatMap(group => markets.map(market => {
    const total = group.totals.get(market)
    const league = [...groups.values()].filter(other => other.position === group.position).flatMap(other => { const total = other.totals.get(market); return total ? [total] : [] })
    const leagueMinutes = league.reduce((sum, row) => sum + row.minutes, 0), leagueValue = league.reduce((sum, row) => sum + row.value, 0)
    const per48 = total && total.minutes > 0 ? total.value / total.minutes * 48 : null, leaguePer48 = leagueMinutes > 0 ? leagueValue / leagueMinutes * 48 : null
    const games = total?.games.size ?? 0
    return { teamId: group.teamId, position: group.position, market, games, minutes: total?.minutes ?? 0, per48, leaguePer48, allowance: games >= 5 && per48 != null && leaguePer48 != null && leaguePer48 > 0 ? (per48 / leaguePer48 - 1) * games / (games + 20) : null } satisfies NbaDvp
  }))
}
