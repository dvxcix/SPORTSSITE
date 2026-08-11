const GAME_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const GAME_KEY_RE = /^[A-Za-z0-9]+@[A-Za-z0-9]+(?:-G\d+)?$/
const TEAM_NAME_RE = /^[A-Za-z0-9 .&'()-]+$/

export function isValidPikkitTeamName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 2
    && value.length <= 80
    && TEAM_NAME_RE.test(value)
}

export function isValidPikkitGameMetadata(input: {
  gameDate: unknown
  homeTeam: unknown
  awayTeam: unknown
  gameKey?: unknown
}): boolean {
  return typeof input.gameDate === 'string'
    && GAME_DATE_RE.test(input.gameDate)
    && isValidPikkitTeamName(input.homeTeam)
    && isValidPikkitTeamName(input.awayTeam)
    && (input.gameKey == null || (typeof input.gameKey === 'string' && GAME_KEY_RE.test(input.gameKey)))
}

