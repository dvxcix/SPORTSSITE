// Provider identities and descriptive statistics, shared without server credentials.
import type { NbaOpening, NbaGameOpening } from './nbaOddsHistory'
export type PaintTeam = { id: number; abbreviation: string; full_name: string; name: string; city?: string }
export type PaintGame = { id: number; date: string; season: number; status: string; status_state?: string; datetime: string | null; period: number; home_team: PaintTeam; visitor_team: PaintTeam; home_team_score: number; visitor_team_score: number }
export type PaintRoster = { id: number; first_name: string; last_name: string; position: string; jersey_number?: string; height?: string; draft_year?: number | null; draft_round?: number | null; draft_number?: number | null; college?: string; team: PaintTeam }
export type PaintStat = { period?: number; id: number; player: { id: number; first_name?: string; last_name?: string; position?: string; height?: string; jersey_number?: string }; team: { id: number }; game: { id: number; date: string; datetime?: string | null; status: string; status_state?: string; home_team_id: number; visitor_team_id: number; season?: number; postseason?: boolean }; min: string; pts: number | null; reb: number | null; ast: number | null; fg3m: number | null; stl: number | null; blk: number | null; turnover: number | null; fga: number | null; fgm: number | null; fg3a: number | null; fta: number | null; ftm: number | null }
export type PaintProp = { id: number; game_id: number; player_id: number; vendor: string; prop_type: string; line_value: string; market: { type: 'over_under' | 'milestone'; over_odds?: number; under_odds?: number; odds?: number }; updated_at: string; opening?: NbaOpening }
export type PaintPlayer = PaintRoster & { headshot: string | null; injury: { status: string; description: string; return_date?: string } | null; average: Record<string, number | null>; averageSeason?: number; logs: PaintStat[]; periodLogs?: PaintStat[]; props: PaintProp[] }
export type PaintGameOdds = { id: number; game_id?: number; vendor: string; spread_home_value: string | null; spread_away_value: string | null; spread_home_odds?: number | null; spread_away_odds?: number | null; moneyline_home_odds: number | null; moneyline_away_odds: number | null; total_value: string | null; total_over_odds?: number | null; total_under_odds?: number | null; updated_at: string; opening?: NbaGameOpening }
export type PaintBoard = { teams?: PaintTeam[]; game: PaintGame; players: PaintPlayer[]; sampleSeason: number; baselineSeasons?: number[]; historical: boolean; sampleEnd: string; fetchedAt: string; issues: string[]; statsComplete: boolean; periodStatsComplete?: boolean; teamStatsSeason?: number; teamStats?: { team: PaintTeam; stats: Record<string, number | null> }[]; gameOdds?: PaintGameOdds[]; starters?: number[] }
export const PAINT_MARKETS = [
  { key: 'points', label: 'Points', short: 'PTS', stats: ['pts'] },
  { key: 'rebounds', label: 'Rebounds', short: 'REB', stats: ['reb'] },
  { key: 'assists', label: 'Assists', short: 'AST', stats: ['ast'] },
  { key: 'threes', label: 'Threes', short: '3PM', stats: ['fg3m'] },
  { key: 'points_rebounds_assists', label: 'Pts + Reb + Ast', short: 'PRA', stats: ['pts', 'reb', 'ast'] },
  { key: 'points_rebounds', label: 'Pts + Reb', short: 'PR', stats: ['pts', 'reb'] },
  { key: 'points_assists', label: 'Pts + Ast', short: 'PA', stats: ['pts', 'ast'] },
  { key: 'rebounds_assists', label: 'Reb + Ast', short: 'RA', stats: ['reb', 'ast'] },
  { key: 'steals', label: 'Steals', short: 'STL', stats: ['stl'] },
  { key: 'blocks', label: 'Blocks', short: 'BLK', stats: ['blk'] },
  { key: 'turnovers', label: 'Turnovers', short: 'TOV', stats: ['turnover'] },
  { key: 'double_double', label: 'Double-double', short: 'DD', stats: [] },
  { key: 'triple_double', label: 'Triple-double', short: 'TD', stats: [] },
  { key: 'points_1q', label: 'First-quarter points', short: 'Q1 PTS', stats: ['pts'] },
  { key: 'rebounds_1q', label: 'First-quarter rebounds', short: 'Q1 REB', stats: ['reb'] },
  { key: 'assists_1q', label: 'First-quarter assists', short: 'Q1 AST', stats: ['ast'] },
] as const
export type PaintMarket = typeof PAINT_MARKETS[number]['key']
/** Keep complete raw facts in storage; send only research fields to each browser. */
export function nbaCompactStat(row: PaintStat): PaintStat {
  const { id, period, min, pts, reb, ast, fg3m, stl, blk, turnover, fga, fgm, fg3a, fta, ftm } = row
  const { id: gameId, date, datetime, status, status_state, home_team_id, visitor_team_id, season, postseason } = row.game
  return { id, ...(period == null ? {} : { period }), min, pts, reb, ast, fg3m, stl, blk, turnover, fga, fgm, fg3a, fta, ftm, player: { id: row.player.id, position: row.player.position }, team: { id: row.team.id }, game: { id: gameId, date, datetime, status, status_state, home_team_id, visitor_team_id, season, postseason } }
}
export const nbaPeriod = (market: string) => market.endsWith('_1q') ? 1 : 0
export const nbaBinary = (market: string) => market === 'double_double' || market === 'triple_double'
export const nbaMarketLogs = (player: PaintPlayer, market: string) => nbaPeriod(market) ? player.periodLogs ?? [] : player.logs
export const nbaPrice = (offer: PaintProp, side: 'over' | 'under' = 'over') => offer.market.type === 'milestone' ? side === 'over' ? offer.market.odds : undefined : side === 'over' ? offer.market.over_odds : offer.market.under_odds
export function nbaTarget(offer: PaintProp, side: 'over' | 'under' = 'over') { return nbaBinary(offer.prop_type) ? side === 'over' ? 'Yes' : 'No' : offer.market.type === 'milestone' ? `${Number(offer.line_value)}+` : `${side === 'over' ? 'O' : 'U'} ${Number(offer.line_value)}` }
export const nbaName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z]/g, '')
export function nbaMinutes(value: string | number | null | undefined) { if (value == null || !/^\d+(?:\.\d+|:[0-5]\d)?$/.test(String(value))) return null; const parts = String(value).split(':').map(Number); return parts[0] + (parts[1] ?? 0) / 60 }
export function nbaAppeared(row: Partial<PaintStat>) {
  const minutes = nbaMinutes(row.min)
  if (minutes == null || minutes < 0) return false
  // Provider minutes can round a brief appearance to zero. Positive player
  // actions prove participation; all-zero rows remain unverified, not DNPs.
  return minutes > 0 || ['pts','reb','ast','fg3m','stl','blk','turnover','fga','fgm','fg3a','fta','ftm'].some(key => { const value = (row as Record<string, unknown>)[key]; return typeof value === 'number' && Number.isFinite(value) && value > 0 })
}
export function nbaValue(row: Partial<PaintStat> | Record<string, number | null>, market: string): number | null {
  const definition = PAINT_MARKETS.find(m => m.key === market)
  if (!definition) return null
  if (nbaBinary(market)) {
    if ('game' in row && row.period != null && row.period !== 0) return null
    if (!('game' in row)) { const average = row as Record<string,number|null>, count = average[market === 'double_double' ? 'dd2' : 'td3'], games = average.gp; if (typeof count === 'number' && typeof games === 'number' && games > 0 && count >= 0 && count <= games) return count / games; const rate = (row as Record<string,number|null>)[market]; return typeof rate === 'number' && Number.isFinite(rate) ? rate : null }
    const values = ['pts','reb','ast','stl','blk'].map(key => (row as Record<string, unknown>)[key]), required = market === 'double_double' ? 2 : 3
    const successes = values.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 10).length
    const unknown = values.filter(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0).length
    return successes >= required ? 1 : successes + unknown >= required ? null : 0
  }
  if (nbaPeriod(market)) {
    if ('game' in row) { if (row.period !== 1) return null }
    else { const value = (row as Record<string,number|null>)[market]; return typeof value === 'number' && Number.isFinite(value) ? value : null }
  } else if ('game' in row && row.period != null && row.period !== 0) return null
  const values = definition.stats.map(key => (row as Record<string, unknown>)[key])
  return values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) ? (values as number[]).reduce((a, b) => a + b, 0) : null
}
export function nbaSample(logs: PaintStat[], count: number, location: 'all' | 'home' | 'away' = 'all') {
  const unique = [...new Map(logs.map(l => [l.id, l])).values()]
  return unique.filter(l => nbaAppeared(l) && (location === 'all' || (location === 'home' ? l.team.id === l.game.home_team_id : l.team.id === l.game.visitor_team_id)))
    .sort((a, b) => b.game.date.localeCompare(a.game.date) || b.game.id - a.game.id).slice(0, count)
}
export function nbaAverage(logs: PaintStat[], market: string) { const values = logs.map(l => nbaValue(l, market)).filter((v): v is number => v != null); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
export function nbaHitRate(logs: PaintStat[], market: string, line: number, side: 'over' | 'under', milestone = false) {
  let wins = 0, pushes = 0, games = 0
  for (const log of logs) { const value = nbaValue(log, market); if (value == null) continue; games++; if (!milestone && value === line) pushes++; else if (milestone ? value >= line : side === 'over' ? value > line : value < line) wins++ }
  return { wins, pushes, games, rate: games - pushes ? wins / (games - pushes) * 100 : null }
}
export function nbaReference(props: PaintProp[], market: string, vendor = 'all', side: 'over' | 'under' = 'over') {
  const qualified = props.filter(p => p.prop_type === market && Number.isFinite(Number(p.line_value)) && nbaPrice(p, side) != null)
  if (nbaBinary(market)) return qualified.filter(p => (vendor === 'all' || p.vendor === vendor) && (p.market.type === 'milestone' ? [0.5,1].includes(Number(p.line_value)) : Number(p.line_value) === .5)).sort((a,b) => nbaPrice(b,side)! - nbaPrice(a,side)!)[0] ?? null
  if (!qualified.some(p => p.market.type === 'over_under' && (vendor === 'all' || p.vendor === vendor))) return !nbaPeriod(market) ? null : qualified.filter(p => p.market.type === 'milestone' && (vendor === 'all' || p.vendor === vendor)).sort((a,b) => Math.abs(Math.abs(nbaPrice(a,side) ?? -100) - 100) - Math.abs(Math.abs(nbaPrice(b,side) ?? -100) - 100) || Number(a.line_value)-Number(b.line_value))[0] ?? null
  const offers = props.filter(p => p.prop_type === market && p.market.type === 'over_under' && Number.isFinite(Number(p.line_value)) && (side === 'over' ? p.market.over_odds : p.market.under_odds) != null)
  const counts = new Map<string, number>(); for (const p of offers) counts.set(String(Number(p.line_value)), (counts.get(String(Number(p.line_value))) ?? 0) + 1)
  const line = [...counts].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0]
  return offers.filter(p => vendor === 'all' ? Number(p.line_value) === Number(line) : p.vendor === vendor).sort((a, b) => Math.abs(Number(a.line_value) - Number(line)) - Math.abs(Number(b.line_value) - Number(line)) || (b.market[side === 'over' ? 'over_odds' : 'under_odds'] ?? -Infinity) - (a.market[side === 'over' ? 'over_odds' : 'under_odds'] ?? -Infinity))[0] ?? null
}
export const nbaOdds = (value: number | null | undefined) => value == null ? '—' : value > 0 ? `+${value}` : String(value)
export const nbaSeason = (season: number) => `${season}–${String(season + 1).slice(-2)}`
export function nbaTeamLogo(abbreviation: string | null | undefined) { if (!abbreviation || !/^[A-Z]{2,3}$/.test(abbreviation)) return null; const code = ({ GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah' } as Record<string, string>)[abbreviation] ?? abbreviation.toLowerCase(); return `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png` }
export const nbaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
export function nbaDate(value: string | null | undefined, fallback = nbaToday()) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return fallback; return value }
export function nbaSelectionKey(playerId: number, offer: PaintProp, side: 'over' | 'under') { return `nba:${playerId}:${offer.prop_type}:${offer.market.type}:${Number(offer.line_value)}:${offer.market.type === 'milestone' ? 'milestone' : side}` }
export function parseNbaSelection(key: string) {
  const [sport, player, market, type, line, side, extra] = key.split(':')
  if (sport !== 'nba' || extra !== undefined || !/^\d+$/.test(player ?? '') || !PAINT_MARKETS.some(m => m.key === market) || !['over_under', 'milestone'].includes(type) || !line || !Number.isFinite(Number(line)) || Number(line) < 0 || (type === 'milestone' ? side !== 'milestone' : !['over', 'under'].includes(side))) return null
  return { player_id: `bdl:${player}`, prop_key: market, numeric_line: Number(line), market_side: side as 'over' | 'under' | 'milestone', type }
}
export function gradeNbaValue(value: number | null, line: number, side: 'over' | 'under' | 'milestone') { return value == null || !Number.isFinite(value) || !Number.isFinite(line) ? null : side === 'milestone' ? value >= line ? 'win' : 'loss' : value === line ? 'push' : (side === 'over' ? value > line : value < line) ? 'win' : 'loss' }
export function nbaWeightedRank(player: PaintPlayer, players: PaintPlayer[], weights: Record<string, number>) {
  let score = 0, total = 0
  for (const [field, weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight) || weight <= 0 || !['pts', 'reb', 'ast', 'fg3m', 'min'].includes(field)) continue
    const value = player.average[field]; if (value == null || !Number.isFinite(value)) continue
    const sample = players.map(p => p.average[field]).filter((v): v is number => v != null && Number.isFinite(v))
    if (sample.length < 2) continue
    const below = sample.filter(v => v < value).length, equal = sample.filter(v => v === value).length
    score += ((below + (equal - 1) / 2) / (sample.length - 1)) * 100 * weight; total += weight
  }
  return total ? score / total : null
}
