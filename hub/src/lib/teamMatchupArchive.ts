export type MatchupLeague = 'nba' | 'nfl'

export type ArchivedLine = {
  vendor: string
  spread: number | null
  total: number | null
}

export type ArchivedFinal = {
  id: string
  date: string
  season: number
  clock: number
  away: string
  home: string
  awayScore: number
  homeScore: number
}

export type ArchivedLines = { observedAt: string | null; lines: ArchivedLine[]; readFailed?: boolean }
export const emptyArchivedLines: ArchivedLines = { observedAt: null, lines: [] }

export function archivedScore(value: unknown, league: MatchupLeague): number | null {
  const minimum = league === 'nba' ? 1 : 0
  const maximum = league === 'nba' ? 400 : 100
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : null
}

function quoteNumber(value: unknown) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function verifiedArchivedLines(input: unknown, game: ArchivedFinal, league: MatchupLeague, observedAt: string): ArchivedLines {
  const observation = Date.parse(observedAt)
  if (!Array.isArray(input) || input.length > 128 || !Number.isFinite(observation) || observation >= game.clock) return emptyArchivedLines
  const latest = new Map<string, ArchivedLine & { updated: number }>()
  for (const quote of input) {
    if (!quote || typeof quote !== 'object' || typeof quote.vendor !== 'string' || !/^[a-z\d_ -]{1,40}$/i.test(quote.vendor)) continue
    if (league === 'nfl' && quote.isOpeningOnly === true || league === 'nba' && quote.game_id != null && String(quote.game_id) !== game.id) continue
    const sourceTime = league === 'nba' ? quote.updated_at : quote.updatedAt
    const updated = typeof sourceTime === 'string' ? Date.parse(sourceTime) : NaN
    if (!Number.isFinite(updated) || updated > observation) continue
    const home = quoteNumber(league === 'nba' ? quote.spread_home_value : quote.spreadHome)
    const away = quoteNumber(league === 'nba' ? quote.spread_away_value : quote.spreadAway)
    const total = quoteNumber(league === 'nba' ? quote.total_value : quote.total)
    const spread = home != null && away != null && Math.abs(home) <= 100 && Math.abs(away) <= 100 && Math.abs(home + away) < 0.001 ? home : null
    const validTotal = total != null && total >= (league === 'nba' ? 50 : 1) && total <= (league === 'nba' ? 500 : 150) ? total : null
    // A newer one-sided snapshot supersedes an older pair for this exact book.
    const vendor = quote.vendor.trim().toLowerCase()
    if (vendor && (latest.get(vendor)?.updated ?? -Infinity) < updated) latest.set(vendor, { vendor, spread, total: validTotal, updated })
  }
  return { observedAt, lines: [...latest.values()].flatMap(({ vendor, spread, total }) =>
    spread != null || total != null ? [{ vendor, spread, total }] : []) }
}

export function archivedTeamGames(team: string, games: ArchivedFinal[], markets: Map<string, ArchivedLines>) {
  return {
    team,
    games: games.map(game => {
      const home = team === game.home
      const market = markets.get(game.id) ?? emptyArchivedLines
      return {
        id: game.id, date: game.date, season: game.season, opponent: home ? game.away : game.home, home,
        scored: home ? game.homeScore : game.awayScore, allowed: home ? game.awayScore : game.homeScore,
        observedAt: market.observedAt, readFailed: market.readFailed ?? false,
        lines: market.lines.map(line => ({ ...line, spread: line.spread == null || home ? line.spread : -line.spread })),
      }
    }),
  }
}
