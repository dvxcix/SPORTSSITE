import type { PaintGame, PaintPlayer, PaintRoster } from './nbaPaint'

export type NbaInjuryReportRow = NonNullable<PaintPlayer['injury']> & { player: { id: number } }

export function nbaMarketUnavailable(status: string | undefined) {
  return /^(?:out\b|inactive$|dnp$|did not play$|suspended\b|not with team$)/i.test(status?.trim() ?? '')
}

export function nbaMarketRoster<T extends PaintRoster & { injury?: PaintPlayer['injury'] }>(
  game: Pick<PaintGame, 'home_team' | 'visitor_team'>,
  roster: T[],
  injuries: NbaInjuryReportRow[] = [],
) {
  const unavailable = new Set(injuries.filter(row => nbaMarketUnavailable(row.status)).map(row => row.player.id))
  return roster.filter(player => (player.team.id === game.home_team.id || player.team.id === game.visitor_team.id)
    && !unavailable.has(player.id) && !nbaMarketUnavailable(player.injury?.status))
}
