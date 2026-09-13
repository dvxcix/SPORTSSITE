export type NflContextPlayer = {
  position: string
  games: number
  volume: number
  geometry: number
  redZone: number
  breakaway: number
  evidence: number
  targets: number
  receptions: number
  receivingYards: number
  carries: number
  rushingYards: number
  passAttempts: number
  completions: number
  passingYards: number
  passingTouchdowns: number
  touchdowns: number
  targetShare: number
  carryShare: number
  airYards: number
  airYardsShare: number
  separation: number
  yacAboveExpected: number
  rushOverExpected: number
  catchRate: number
  completionRate: number
  cpoe: number
  timeToThrow: number
  redZoneLooks: number
  goalLineLooks: number
  explosivePlays: number
  dvp?: Record<string, number>
  teamProfile?: {
    passRate: number
    neutralPassRate: number
    successRate: number
    explosiveRate: number
    redZoneTdRate: number
    thirdDownRate: number
  } | null
  opponentProfile?: {
    defenseSuccessAllowed: number
    defenseExplosiveAllowed: number
  } | null
}

export type NflScoreContext = {
  propType: string
  label: string
  family:
    | 'touchdown'
    | 'receiving'
    | 'rushing'
    | 'scrimmage'
    | 'passing'
    | 'kicking'
    | 'defense'
}

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))
const perGame = (value: number, games: number) => value / Math.max(1, games)
const blend = (...parts: Array<[number, number]>) =>
  Math.round(
    clamp(
      parts.reduce((sum, [value, weight]) => sum + clamp(value) * weight, 0) /
        parts.reduce((sum, [, weight]) => sum + weight, 0),
    ),
  )
const scale = (value: number, ceiling: number, floor = 0) =>
  clamp(((value - floor) / Math.max(0.001, ceiling - floor)) * 100)
const matchup = (player: NflContextPlayer, stat: string) =>
  player.dvp?.[stat] == null ? 50 : clamp(50 + player.dvp[stat] * 1.35)
const rawTeamPass = (player: NflContextPlayer) =>
  (player.teamProfile?.passRate ?? 55) * 0.55 +
  (player.teamProfile?.neutralPassRate ?? 55) * 0.45
const teamPass = (player: NflContextPlayer) =>
  scale(rawTeamPass(player), 68, 42)
const teamRun = (player: NflContextPlayer) =>
  scale(100 - rawTeamPass(player), 58, 32)
const environment = (
  player: NflContextPlayer,
  family: NflScoreContext['family'],
  teamWinProbability?: number | null,
  gameTotal?: number | null,
) => {
  const total = gameTotal == null ? 50 : scale(gameTotal, 56, 34)
  const win = teamWinProbability == null ? 50 : clamp(teamWinProbability * 100)
  const script =
    family === 'rushing'
      ? win
      : family === 'receiving' || family === 'passing'
        ? 100 - win
        : 50
  return blend(
    [total, 0.5],
    [script, 0.25],
    [player.teamProfile?.successRate ?? 50, 0.15],
    [player.opponentProfile?.defenseSuccessAllowed ?? 50, 0.1],
  )
}

export function nflScoreContext(
  propType: string,
  position: string,
): NflScoreContext {
  const prop = propType.toLowerCase()
  if (prop === 'passing_tds' || prop.includes('passing_touchdown'))
    return { propType, label: 'Passing TDs', family: 'passing' }
  if (prop.includes('rushing_receiving') || prop.includes('scrimmage'))
    return { propType, label: 'Scrimmage yards', family: 'scrimmage' }
  if (prop.includes('td') || prop.includes('touchdown'))
    return {
      propType,
      label: prop.includes('first') ? 'First TD' : 'Anytime TD',
      family: 'touchdown',
    }
  if (prop.includes('reception') || prop.includes('receiving'))
    return {
      propType,
      label: prop.includes('yard')
        ? 'Receiving yards'
        : prop.includes('longest')
          ? 'Longest reception'
          : 'Receptions',
      family: 'receiving',
    }
  if (prop.includes('rush'))
    return {
      propType,
      label: prop.includes('attempt')
        ? 'Rushing attempts'
        : prop.includes('longest')
          ? 'Longest rush'
          : 'Rushing yards',
      family: 'rushing',
    }
  if (prop.includes('pass') || prop.includes('completion'))
    return {
      propType,
      label: prop.includes('completion')
        ? 'Completions'
        : prop.includes('attempt')
          ? 'Passing attempts'
          : 'Passing yards',
      family: 'passing',
    }
  if (prop.includes('kick') || prop.includes('field_goal'))
    return { propType, label: 'Kicking', family: 'kicking' }
  if (position === 'QB')
    return {
      propType: 'passing_yards',
      label: 'Passing yards',
      family: 'passing',
    }
  if (position === 'RB' || position === 'FB')
    return {
      propType: 'rushing_yards',
      label: 'Rushing yards',
      family: 'rushing',
    }
  return {
    propType: 'receiving_yards',
    label: 'Receiving yards',
    family: 'receiving',
  }
}

export function contextualNflScore(
  player: NflContextPlayer,
  requestedProp: string,
  teamWinProbability?: number | null,
  gameTotal?: number | null,
) {
  const context = nflScoreContext(
    requestedProp === 'role' ? '' : requestedProp,
    player.position,
  )
  const games = Math.max(1, player.games)
  const evidence = player.evidence
  const env = environment(player, context.family, teamWinProbability, gameTotal)

  if (
    requestedProp === 'passing_tds' ||
    requestedProp.includes('passing_touchdown')
  ) {
    return {
      context,
      score: blend(
        [scale(perGame(player.passAttempts, games), 42), 0.2],
        [scale(perGame(player.passingTouchdowns, games), 3.1), 0.2],
        [player.redZone, 0.13],
        [scale(perGame(player.redZoneLooks, games), 6), 0.08],
        [matchup(player, 'passing_tds'), 0.14],
        [teamPass(player), 0.09],
        [player.teamProfile?.redZoneTdRate ?? 50, 0.08],
        [env, 0.05],
        [evidence, 0.03],
      ),
    }
  }

  if (context.family === 'touchdown') {
    const tdStat =
      player.position === 'QB'
        ? 'passing_tds'
        : player.position === 'RB' || player.position === 'FB'
          ? 'rushing_tds'
          : 'receiving_tds'
    return {
      context,
      score: blend(
        [player.redZone, 0.22],
        [scale(perGame(player.redZoneLooks, games), 5), 0.14],
        [scale(perGame(player.goalLineLooks, games), 2), 0.13],
        [scale(perGame(player.touchdowns, games), 1), 0.14],
        [player.volume, 0.1],
        [player.breakaway, 0.07],
        [matchup(player, tdStat), 0.1],
        [player.teamProfile?.redZoneTdRate ?? 50, 0.06],
        [env, 0.04],
      ),
    }
  }

  if (context.family === 'receiving') {
    const longest = requestedProp.includes('longest')
    const receptions = requestedProp === 'receptions'
    return {
      context,
      score: blend(
        [scale(player.targetShare, 34), 0.18],
        [scale(perGame(player.targets, games), 11), 0.16],
        [
          scale(perGame(player.receivingYards, games), 115),
          longest ? 0.08 : 0.16,
        ],
        [scale(perGame(player.receptions, games), 8), receptions ? 0.2 : 0.1],
        [player.geometry, longest ? 0.19 : 0.1],
        [player.breakaway, longest ? 0.16 : 0.06],
        [scale(player.catchRate, 82, 45), receptions ? 0.11 : 0.05],
        [matchup(player, receptions ? 'receptions' : 'receiving_yards'), 0.11],
        [teamPass(player), 0.06],
        [env, 0.05],
        [evidence, 0.03],
      ),
    }
  }

  if (context.family === 'rushing') {
    const attempts = requestedProp.includes('attempt')
    const longest = requestedProp.includes('longest')
    return {
      context,
      score: blend(
        [scale(player.carryShare, 72), 0.2],
        [scale(perGame(player.carries, games), 24), attempts ? 0.25 : 0.18],
        [scale(perGame(player.rushingYards, games), 115), 0.18],
        [scale(player.rushOverExpected, 2.2, -1), longest ? 0.13 : 0.08],
        [player.breakaway, longest ? 0.2 : 0.08],
        [matchup(player, 'rushing_yards'), 0.12],
        [teamRun(player), 0.07],
        [env, 0.07],
        [evidence, 0.02],
      ),
    }
  }

  if (context.family === 'scrimmage') {
    return {
      context,
      score: blend(
        [scale(player.targetShare + player.carryShare, 78), 0.18],
        [scale(perGame(player.targets + player.carries, games), 25), 0.18],
        [
          scale(
            perGame(player.receivingYards + player.rushingYards, games),
            145,
          ),
          0.23,
        ],
        [matchup(player, 'receiving_yards'), 0.08],
        [matchup(player, 'rushing_yards'), 0.08],
        [player.breakaway, 0.09],
        [player.volume, 0.07],
        [env, 0.06],
        [evidence, 0.03],
      ),
    }
  }

  if (context.family === 'passing') {
    const attempts = requestedProp.includes('attempt')
    const completions = requestedProp.includes('completion')
    return {
      context,
      score: blend(
        [
          scale(perGame(player.passAttempts, games), 42),
          attempts ? 0.27 : 0.18,
        ],
        [scale(perGame(player.passingYards, games), 325), 0.2],
        [
          scale(perGame(player.completions, games), 30),
          completions ? 0.23 : 0.1,
        ],
        [scale(player.completionRate, 75, 50), completions ? 0.12 : 0.06],
        [scale(player.cpoe, 10, -10), 0.08],
        [player.geometry, 0.08],
        [
          matchup(
            player,
            completions
              ? 'completions'
              : attempts
                ? 'attempts'
                : 'passing_yards',
          ),
          0.12,
        ],
        [teamPass(player), 0.08],
        [env, 0.07],
        [evidence, 0.03],
      ),
    }
  }

  return {
    context,
    score: blend([player.volume, 0.4], [player.evidence, 0.3], [env, 0.3]),
  }
}
