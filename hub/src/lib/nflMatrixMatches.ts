import type { SidelineLens, SidelinePlayer, SidelineTeamProfile, SidelineWindow } from '@/app/the-sideline/types'
import { ladderMatrixValue } from './nflLadders'
import { evaluateNflMatrix, type NflMatrix, type NflMatrixFactor } from './nflMatrix'
import { nflMatchupTeam as normalizedTeam } from './nflMatchupBoard'
import type { NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'
import { normalizeNflPlayerName as normalizedName } from './nflPlayerName'

const windows: SidelineWindow[] = ['season', 'l1', 'l3', 'l5', 'l10']
type MatrixRow = Pick<SidelinePlayer, 'id' | 'name' | 'team'> & { eligible?: boolean; market: NflOddsPlayer | null }

export function findMarketPlayer(board: SidelineOddsBoard, player: Pick<SidelinePlayer, 'name' | 'team'>) {
  const name = normalizedName(player.name)
  return board.players.find(candidate => normalizedName(candidate.name) === name && (!candidate.team || normalizedTeam(candidate.team) === normalizedTeam(player.team))) ?? null
}

export function baselineMove(player: NflOddsPlayer | null, propType: 'first_td' | 'anytime_td', vendor = 'fanduel') {
  return player?.tdBaselines?.find(item => item.propType === propType && normalizedName(item.vendor) === normalizedName(vendor)) ?? null
}

export function nflMatrixMatches(
  board: SidelineOddsBoard, lens: SidelineLens['windows'], matrices: NflMatrix[],
  rows: MatrixRow[], away: string, home: string,
) {
  if (!matrices.length) return new Map<string, NflMatrix[]>()
  const playerByWindow = new Map<SidelineWindow, Map<string, SidelinePlayer>>()
  const teamByWindow = new Map<SidelineWindow, Map<string, SidelineTeamProfile>>()
  for (const window of windows) {
    playerByWindow.set(window, new Map(lens[window].players.map(player => [`${normalizedTeam(player.team)}:${normalizedName(player.name)}`, player])))
    teamByWindow.set(window, new Map(lens[window].teams.map(profile => [normalizedTeam(profile.team.abbr), profile])))
  }
  const candidateFor = (row: MatrixRow) => ({
    id: row.id,
    team: normalizedTeam(row.team),
    values: (factor: NflMatrixFactor) => {
      if (factor.category === 'picks' || factor.category === 'market') return ladderMatrixValue(findMarketPlayer(board, row), factor)
      if (factor.category === 'baseline') {
        const prop = factor.field === 'ftdPct' ? 'first_td' : 'anytime_td'
        const delta = baselineMove(row.market, prop)?.deltaPct
        return delta == null ? null : Math.round(delta * 1000) / 10
      }
      const key = `${normalizedTeam(row.team)}:${normalizedName(row.name)}`
      const windowPlayer = playerByWindow.get(factor.window)?.get(key)
      if (factor.category === 'team') {
        const profile = teamByWindow.get(factor.window)?.get(normalizedTeam(row.team))
        const opponent = teamByWindow.get(factor.window)?.get(normalizedTeam(row.team) === normalizedTeam(away) ? normalizedTeam(home) : normalizedTeam(away))
        const values: Record<string, number | undefined> = {
          teamPassRate: profile?.passRate,
          teamNeutralPassRate: profile?.neutralPassRate,
          teamShotgunRate: profile?.shotgunRate,
          teamNoHuddleRate: profile?.noHuddleRate,
          teamSuccessRate: profile?.successRate,
          teamExplosiveRate: profile?.explosiveRate,
          teamRedZoneTdRate: profile?.redZoneTdRate,
          teamThirdDownRate: profile?.thirdDownRate,
          oppSuccessAllowed: opponent?.defenseSuccessAllowed,
          oppExplosiveAllowed: opponent?.defenseExplosiveAllowed,
        }
        return values[factor.field] ?? null
      }
      if (!windowPlayer) return null
      if (windowPlayer.unavailableMetrics?.includes(factor.field)) return null
      const values: Record<string, number> = {
        index: windowPlayer.index,
        volume: windowPlayer.volume,
        geometry: windowPlayer.geometry,
        redZone: windowPlayer.redZone,
        breakaway: windowPlayer.breakaway,
        evidence: windowPlayer.evidence,
        targets: windowPlayer.targets,
        targetShare: windowPlayer.targetShare,
        receptions: windowPlayer.receptions,
        receivingYards: windowPlayer.receivingYards,
        carries: windowPlayer.carries,
        carryShare: windowPlayer.carryShare,
        rushingYards: windowPlayer.rushingYards,
        passAttempts: windowPlayer.passAttempts,
        completions: windowPlayer.completions,
        passingYards: windowPlayer.passingYards,
        passingTouchdowns: windowPlayer.passingTouchdowns,
        touchdowns: windowPlayer.touchdowns,
        redZoneLooks: windowPlayer.redZoneLooks,
        goalLineLooks: windowPlayer.goalLineLooks,
        airYards: windowPlayer.airYards,
        airYardsShare: windowPlayer.airYardsShare,
        separation: windowPlayer.separation,
        yacAboveExpected: windowPlayer.yacAboveExpected,
        rushOverExpected: windowPlayer.rushOverExpected,
        catchRate: windowPlayer.catchRate,
        completionRate: windowPlayer.completionRate,
        cpoe: windowPlayer.cpoe,
        timeToThrow: windowPlayer.timeToThrow,
        explosivePlays: windowPlayer.explosivePlays,
      }
      return values[factor.field] ?? null
    },
  })
  const candidates = rows.filter(row => row.eligible !== false).map(candidateFor)
  const result = new Map<string, NflMatrix[]>()
  matrices
    .filter(matrix => matrix.enabled)
    .forEach(matrix => {
      evaluateNflMatrix(matrix, candidates).forEach(id => result.set(id, [...(result.get(id) ?? []), matrix]))
    })
  return result
}
