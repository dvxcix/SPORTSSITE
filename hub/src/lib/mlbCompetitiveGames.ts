// MLB/Savant: regular season, Wild Card, Division, LCS, World Series.
export const MLB_COMPETITIVE_GAME_TYPES = ['R', 'F', 'D', 'L', 'W'] as const
export const SAVANT_COMPETITIVE_GAME_FILTER = MLB_COMPETITIVE_GAME_TYPES.map(type => `${type}%7C`).join('')
export function isCompetitiveMlbGame(type: string | null | undefined): boolean {
  return MLB_COMPETITIVE_GAME_TYPES.some(value => value === type)
}
