import type { SportKey } from '@slipsurge/core/espn-api'

type SeasonDef = { sm: number; sd: number; em: number; ed: number; wraps?: boolean }

const SEASON_DEFS: Record<string, SeasonDef> = {
  nfl: { sm: 8, sd: 1, em: 2, ed: 15, wraps: true },
  nba: { sm: 10, sd: 1, em: 6, ed: 25, wraps: true },
  nhl: { sm: 10, sd: 7, em: 6, ed: 25, wraps: true },
  mlb: { sm: 3, sd: 20, em: 11, ed: 15 },
  soccer: { sm: 2, sd: 25, em: 12, ed: 1 },
}

export function isSeasonActive(sport: string, date: Date): boolean {
  const def = SEASON_DEFS[sport]
  if (!def) return true
  const y = date.getFullYear()
  const ms = (yr: number, m: number, d: number) => new Date(yr, m - 1, d).getTime()
  const t = date.getTime()
  const pre = 10 * 86_400_000
  const post = 3 * 86_400_000
  if (def.wraps) {
    for (const startYear of [y - 1, y]) {
      if (t >= ms(startYear, def.sm, def.sd) - pre && t <= ms(startYear + 1, def.em, def.ed) + post) return true
    }
    return false
  }
  return t >= ms(y, def.sm, def.sd) - pre && t <= ms(y, def.em, def.ed) + post
}

export const NON_MLB_SPORTS: { key: SportKey; label: string; name: string }[] = [
  { key: 'nfl', label: 'NFL', name: 'National Football League' },
  { key: 'nba', label: 'NBA', name: 'National Basketball Association' },
  { key: 'nhl', label: 'NHL', name: 'National Hockey League' },
  { key: 'soccer', label: 'MLS', name: 'Major League Soccer' },
]
