import type { SidelinePlayer, SidelinePlayerGameLine } from '@/app/the-sideline/SidelineClient'

type LogField = Exclude<keyof SidelinePlayerGameLine, 'gameId'>
export type HitSummary = { hits: number; total: number; rate: number } | null

export const PROP_FIELDS: Record<string, LogField> = {
  receptions: 'receptions', receiving_yards: 'receivingYards', rushing_attempts: 'carries', rushing_yards: 'rushingYards',
  passing_attempts: 'passAttempts', completions: 'completions', passing_yards: 'passingYards', passing_tds: 'passingTouchdowns',
  passing_completions: 'completions',
  anytime_td: 'scorerTouchdowns', first_td: 'firstTouchdowns',
}
const PROJECTION_KEYS: Record<string, string> = {
  receiving_yards: 'receiving-yards', rushing_yards: 'rushing-yards', rushing_attempts: 'rush-attempts',
  passing_yards: 'passing-yards', passing_attempts: 'pass-attempts', receptions: 'receptions',
  completions: 'completions', passing_tds: 'touchdown', anytime_td: 'touchdown', first_td: 'touchdown',
  passing_completions: 'completions',
}
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function isHit(value: number, line: number, milestone: boolean) {
  return milestone ? value >= line : value > line
}

export function hitSummary(log: SidelinePlayerGameLine[], field: LogField, line: number, count: number | null, milestone: boolean): HitSummary {
  const sample = (count == null ? log : log.slice(0, count)).filter(row => row[field] != null && Number.isFinite(row[field]))
  if (!sample.length) return null
  const hits = sample.filter(row => isHit(Number(row[field]), line, milestone)).length
  return { hits, total: sample.length, rate: hits / sample.length * 100 }
}

export function projectedValue(stats: SidelinePlayer, prop: string) {
  const field = PROP_FIELDS[prop]
  const projection = stats.projections.find(item => item.key === PROJECTION_KEYS[prop])
  if (!field || !stats.gameLog.length) return null
  const milestone = prop.includes('td')
  const season = milestone
    ? stats.gameLog.filter(row => Number(row[field]) >= 1).length / stats.gameLog.length * 100
    : average(stats.gameLog.map(row => Number(row[field])))
  const recent3 = milestone
    ? stats.gameLog.slice(0, 3).filter(row => Number(row[field]) >= 1).length / Math.min(3, stats.gameLog.length) * 100
    : average(stats.gameLog.slice(0, 3).map(row => Number(row[field])))
  const recent5 = milestone
    ? stats.gameLog.slice(0, 5).filter(row => Number(row[field]) >= 1).length / Math.min(5, stats.gameLog.length) * 100
    : average(stats.gameLog.slice(0, 5).map(row => Number(row[field])))
  if (season == null || recent3 == null || recent5 == null) return null
  const adjustment = clamp(((projection?.matchup ?? 0) + (projection?.pace ?? 0)) / 100, -.25, .25)
  return Math.max(0, (season * .5 + recent3 * .3 + recent5 * .2) * (1 + adjustment))
}

export function modelProbability(stats: SidelinePlayer, prop: string, line: number, milestone: boolean) {
  const field = PROP_FIELDS[prop]
  if (!field || !stats.gameLog.length) return null
  const season = hitSummary(stats.gameLog, field, line, null, milestone)?.rate
  const l3 = hitSummary(stats.gameLog, field, line, 3, milestone)?.rate
  const l5 = hitSummary(stats.gameLog, field, line, 5, milestone)?.rate
  if (season == null || l3 == null || l5 == null) return null
  const projection = stats.projections.find(item => item.key === PROJECTION_KEYS[prop])
  const adjustment = clamp(((projection?.matchup ?? 0) + (projection?.pace ?? 0)) * .2, -5, 5)
  return clamp(season * .5 + l3 * .3 + l5 * .2 + adjustment, 0, 100)
}
