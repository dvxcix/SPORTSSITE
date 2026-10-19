import { nbaSample, type PaintPlayer } from './nbaPaint'

/** Observed roster history only; no scoring or projection calculations. */
export function nbaRosterHistory(player: PaintPlayer, before: string) {
  const logs = nbaSample(player.logs.filter(log => log.game.date.slice(0, 10) < before), 30)
  const year = Number(before.slice(0, 4)), season = Number(before.slice(5, 7)) < 7 ? year - 1 : year
  const historicalTeams = [...new Set(logs.map(log => log.team.id))]
  const previousSeasonTeams = [...new Set(logs.filter(log => log.game.season != null && log.game.season < season).map(log => log.team.id))]
  const priorTeams = previousSeasonTeams.length ? previousSeasonTeams : historicalTeams
  return { priorTeams, newTeam: priorTeams.length > 0 && !priorTeams.includes(player.team.id) }
}
