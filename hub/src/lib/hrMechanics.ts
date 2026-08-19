import priors from '@/data/biomechanics/openbiomechanics-hitting-priors.json'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPlayerPitchRows } from '@/lib/pitchLogFetch'
import type { TodayGame, LineupPlayer, ProbablePitcher } from '@slipsurge/core/mlbSchedule'

export const HR_MECHANICS_MODEL_VERSION = priors.modelVersion
export const MECHANICS_WINDOWS = [1, 3, 5, 10] as const
export type MechanicsWindow = typeof MECHANICS_WINDOWS[number]

type WindowMetrics = {
  hr?: number | null
  avgEv?: number | null
  avgLa?: number | null
  fbRate?: number | null
  avgTilt?: number | null
  blastPct?: number | null
  barrelPct?: number | null
  onTimePct?: number | null
  hardHitPct?: number | null
  avgBatSpeed?: number | null
  pullAirRate?: number | null
  missDistance?: number | null
  squaredUpPct?: number | null
  sweetSpotPct?: number | null
  hardSwingRate?: number | null
  avgAttackAngle?: number | null
  avgSwingLength?: number | null
  idealAttackAngleRate?: number | null
}

type StatcastPrecomputeRow = {
  game_date?: string
  mlb_id: number
  pitcher_hand: string
  windows: Record<string, WindowMetrics>
  computed_at: string
}

type PitchLogRow = {
  game_date?: string | null
  pitch_type?: string | null
  stand?: string | null
  is_in_play?: boolean | null
  is_home_run?: boolean | null
  launch_speed?: number | null
  launch_speed_angle?: number | null
  bb_type?: string | null
  velocity?: number | null
}

export type PitchShape = {
  pitchType: string
  usage: number
  velocity: number | null
  hrRate: number
  hardHitRate: number
}

export type MechanicsScores = {
  overall: number
  powerFormation: number
  transferEfficiency: number
  planeMatch: number
  timing: number
  trajectory: number
  pitcherBreakdown: number
  trend: number
  confidence: number
}

export type MechanicsPlayer = {
  playerId: number
  playerName: string
  team: string
  opponent: string
  position: string
  bats: string
  battingOrder: number
  pitcherId: number | null
  pitcherName: string | null
  pitcherHand: string | null
  projected: boolean
  rank: number
  scores: MechanicsScores
  metrics: {
    batSpeed: number | null
    attackAngle: number | null
    idealAttackRate: number | null
    blastRate: number | null
    squaredUpRate: number | null
    onTimeRate: number | null
    missDistance: number | null
    exitVelocity: number | null
    barrelRate: number | null
    hardHitRate: number | null
    pullAirRate: number | null
    expectedExitVelocity: number | null
    transferDelta: number | null
    modeledCarry: number | null
    recentHomeRuns: number
    sourceComputedAt: string | null
  }
  pitcher: {
    battedBalls: number
    hrRate: number
    barrelRate: number
    hardHitRate: number
    flyBallRate: number
    averageExitVelocity: number | null
    pitchShapes: PitchShape[]
  }
  reasons: string[]
  cautions: string[]
}

export type GameMechanicsResult = {
  modelVersion: string
  gameDate: string
  gamePk: number
  gameKey: string
  window: MechanicsWindow
  lineupConfirmed: boolean
  sourceThroughDate: string | null
  calibration: {
    label: string
    swings: number
    trajectoryContacts: number
    transferMaeMph: number
    carryMaeFeet: number
    repository: string
    limitation: string
  }
  players: MechanicsPlayer[]
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const round = (value: number, digits = 1) => Number(value.toFixed(digits))
const finite = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const high = (value: number | null, low: number, top: number, fallback = 45) => value == null ? fallback : clamp((value - low) / (top - low) * 100)
const low = (value: number | null, best: number, poor: number, fallback = 45) => value == null ? fallback : clamp((poor - value) / (poor - best) * 100)
const closeness = (value: number | null, target: number, tolerance: number, fallback = 45) => value == null ? fallback : clamp(100 - Math.abs(value - target) / tolerance * 100)
const asRate = (value: number | null | undefined) => {
  const n = finite(value)
  if (n == null) return null
  return n > 1 ? n / 100 : n
}
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

function expectedExitVelocity(batSpeed: number | null, attackAngle: number | null) {
  if (batSpeed == null || attackAngle == null) return null
  const model = priors.models.exitVelocityTransfer
  return model.intercept
    + model.coefficients.batSpeed * batSpeed
    + model.coefficients.attackAngle * attackAngle
    + model.coefficients.attackAngleSquared * attackAngle ** 2
}

function modeledCarry(exitVelocity: number | null, launchAngle: number | null) {
  if (exitVelocity == null || launchAngle == null) return null
  const model = priors.models.carryDistance
  return model.intercept
    + model.coefficients.exitVelocity * exitVelocity
    + model.coefficients.launchAngle * launchAngle
    + model.coefficients.launchAngleSquared * launchAngle ** 2
    + model.coefficients.exitVelocityLaunchAngle * exitVelocity * launchAngle
}

function batterStand(bats: string, pitcherHand: string) {
  if (bats === 'S') return pitcherHand === 'L' ? 'R' : 'L'
  return bats
}

function summarizePitcher(rows: PitchLogRow[], cutoffDate: string, stand: string) {
  const eligible = rows.filter(row => String(row.game_date) < cutoffDate)
  const handed = eligible.filter(row => row.stand === stand)
  const pool = handed.length >= 120 ? handed : eligible
  const dates = [...new Set(pool.map(row => String(row.game_date)))].sort().slice(-8)
  const recent = pool.filter(row => dates.includes(String(row.game_date)))
  const use = recent.length >= 100 ? recent : pool
  const bbe = use.filter(row => row.is_in_play && finite(row.launch_speed) != null)
  const hr = bbe.filter(row => row.is_home_run).length
  const barrels = bbe.filter(row => finite(row.launch_speed_angle) === 6).length
  const hard = bbe.filter(row => (finite(row.launch_speed) ?? 0) >= 95).length
  const fly = bbe.filter(row => row.bb_type === 'fly_ball').length
  const avgEv = bbe.length ? mean(bbe.map(row => finite(row.launch_speed)!).filter(value => value != null)) : null
  const pitchGroups = new Map<string, PitchLogRow[]>()
  for (const row of use) {
    if (!row.pitch_type) continue
    const group = pitchGroups.get(row.pitch_type) ?? []
    group.push(row); pitchGroups.set(row.pitch_type, group)
  }
  const pitchShapes = [...pitchGroups.entries()].map(([pitchType, group]) => {
    const contacts = group.filter(row => row.is_in_play && finite(row.launch_speed) != null)
    return {
      pitchType,
      usage: use.length ? group.length / use.length : 0,
      velocity: group.some(row => finite(row.velocity) != null) ? mean(group.map(row => finite(row.velocity)!).filter(value => value != null)) : null,
      hrRate: contacts.length ? contacts.filter(row => row.is_home_run).length / contacts.length : 0,
      hardHitRate: contacts.length ? contacts.filter(row => (finite(row.launch_speed) ?? 0) >= 95).length / contacts.length : 0,
    }
  }).sort((a, b) => b.usage - a.usage).slice(0, 4)
  return {
    battedBalls: bbe.length,
    hrRate: bbe.length ? hr / bbe.length : 0,
    barrelRate: bbe.length ? barrels / bbe.length : 0,
    hardHitRate: bbe.length ? hard / bbe.length : 0,
    flyBallRate: bbe.length ? fly / bbe.length : 0,
    averageExitVelocity: avgEv,
    pitchShapes,
  }
}

function scorePlayer(
  player: LineupPlayer,
  opponent: string,
  pitcher: ProbablePitcher | null,
  stat: StatcastPrecomputeRow | undefined,
  pitcherRows: PitchLogRow[],
  window: MechanicsWindow,
  cutoffDate: string,
): Omit<MechanicsPlayer, 'rank'> {
  const recent = stat?.windows?.[`l${window}`] ?? {}
  const season = stat?.windows?.season ?? {}
  const batSpeed = finite(recent.avgBatSpeed)
  const attackAngle = finite(recent.avgAttackAngle)
  const idealAttackRate = asRate(recent.idealAttackAngleRate)
  const blastRate = asRate(recent.blastPct)
  const squaredUpRate = asRate(recent.squaredUpPct)
  const onTimeRate = asRate(recent.onTimePct)
  const missDistance = finite(recent.missDistance)
  const exitVelocity = finite(recent.avgEv)
  const barrelRate = asRate(recent.barrelPct)
  const hardHitRate = asRate(recent.hardHitPct)
  const pullAirRate = asRate(recent.pullAirRate)
  const expectedEv = expectedExitVelocity(batSpeed, attackAngle)
  const transferDelta = exitVelocity != null && expectedEv != null ? exitVelocity - expectedEv : null
  const carry = modeledCarry(exitVelocity, finite(recent.avgLa))
  const stand = batterStand(player.bats, pitcher?.hand ?? 'R')
  const pitcherSummary = summarizePitcher(pitcherRows, cutoffDate, stand)

  const powerFormation = mean([
    high(batSpeed, 62, 76),
    high(blastRate, 0.03, 0.22),
    high(squaredUpRate, 0.2, 0.5),
    high(asRate(recent.hardSwingRate), 0.02, 0.18),
  ])
  const transferEfficiency = mean([
    closeness(transferDelta, 0, 9),
    high(exitVelocity, 82, 99),
    high(batSpeed, priors.observablePriors.batSpeedMph.p10, priors.observablePriors.batSpeedMph.p90),
  ])
  const planeMatch = mean([
    closeness(attackAngle, 12, 18),
    high(idealAttackRate, 0.35, 0.78),
    closeness(finite(recent.avgTilt), 35, 18),
  ])
  const timing = mean([
    high(onTimeRate, 0.48, 0.82),
    low(missDistance, 1.5, 6),
    high(squaredUpRate, 0.2, 0.5),
  ])
  const trajectory = mean([
    high(barrelRate, 0.02, 0.18),
    high(hardHitRate, 0.2, 0.62),
    high(pullAirRate, 0.2, 0.58),
    high(carry, 245, 375),
  ])
  const pitcherBreakdown = mean([
    high(pitcherSummary.hrRate, 0.015, 0.09),
    high(pitcherSummary.barrelRate, 0.03, 0.16),
    high(pitcherSummary.hardHitRate, 0.25, 0.55),
    high(pitcherSummary.flyBallRate, 0.2, 0.48),
  ])
  const trendSignals = [
    [batSpeed, finite(season.avgBatSpeed), 4],
    [blastRate, asRate(season.blastPct), 0.08],
    [barrelRate, asRate(season.barrelPct), 0.08],
    [exitVelocity, finite(season.avgEv), 7],
    [idealAttackRate, asRate(season.idealAttackAngleRate), 0.16],
    [pullAirRate, asRate(season.pullAirRate), 0.15],
  ].filter((pair): pair is [number, number, number] => pair[0] != null && pair[1] != null)
  const trend = trendSignals.length ? clamp(50 + mean(trendSignals.map(([now, baseline, scale]) => (now - baseline) / scale * 30))) : 45
  const metricCoverage = [batSpeed, attackAngle, idealAttackRate, blastRate, squaredUpRate, onTimeRate, missDistance, exitVelocity, barrelRate, hardHitRate, pullAirRate].filter(value => value != null).length / 11
  const sampleConfidence = clamp((pitcherSummary.battedBalls / 80) * 100)
  const confidence = 35 + metricCoverage * 45 + sampleConfidence * 0.2
  const overall = powerFormation * 0.2 + transferEfficiency * 0.14 + planeMatch * 0.14 + timing * 0.14 + trajectory * 0.19 + pitcherBreakdown * 0.12 + trend * 0.07

  const reasons: string[] = []
  const cautions: string[] = []
  if (powerFormation >= 65) reasons.push('Bat speed, blast rate and contact efficiency form a strong power base.')
  if (planeMatch >= 65) reasons.push('Recent attack plane is repeatedly entering the productive lift band.')
  if (timing >= 65) reasons.push('On-time and squared-up contact support the current swing shape.')
  if (trajectory >= 65) reasons.push('Recent contact is combining damage, lift and pull-side air contact.')
  if (pitcherBreakdown >= 62) reasons.push('The opposing starter has allowed a compatible damage shape to this side.')
  if (trend >= 62) reasons.push(`The last ${window} games are stronger than the season mechanics baseline.`)
  if (trend <= 38) cautions.push(`The last ${window} games are below the player’s season mechanics baseline.`)
  if (metricCoverage < 0.65) cautions.push('Bat-tracking coverage is limited, so the confidence band is wider.')
  if (pitcherSummary.battedBalls < 35) cautions.push('The starter-side contact sample is small.')
  if (!reasons.length) reasons.push('No single mechanic dominates; the score reflects the complete measured profile.')

  return {
    playerId: player.mlb_id,
    playerName: player.name,
    team: player.team,
    opponent,
    position: player.position,
    bats: player.bats,
    battingOrder: player.batting_order,
    pitcherId: pitcher?.id ?? null,
    pitcherName: pitcher?.name ?? null,
    pitcherHand: pitcher?.hand ?? null,
    projected: player.projected,
    scores: {
      overall: round(overall), powerFormation: round(powerFormation), transferEfficiency: round(transferEfficiency),
      planeMatch: round(planeMatch), timing: round(timing), trajectory: round(trajectory),
      pitcherBreakdown: round(pitcherBreakdown), trend: round(trend), confidence: round(confidence),
    },
    metrics: {
      batSpeed: batSpeed == null ? null : round(batSpeed), attackAngle: attackAngle == null ? null : round(attackAngle),
      idealAttackRate: idealAttackRate == null ? null : round(idealAttackRate * 100), blastRate: blastRate == null ? null : round(blastRate * 100),
      squaredUpRate: squaredUpRate == null ? null : round(squaredUpRate * 100), onTimeRate: onTimeRate == null ? null : round(onTimeRate * 100),
      missDistance: missDistance == null ? null : round(missDistance, 2), exitVelocity: exitVelocity == null ? null : round(exitVelocity),
      barrelRate: barrelRate == null ? null : round(barrelRate * 100), hardHitRate: hardHitRate == null ? null : round(hardHitRate * 100),
      pullAirRate: pullAirRate == null ? null : round(pullAirRate * 100), expectedExitVelocity: expectedEv == null ? null : round(expectedEv),
      transferDelta: transferDelta == null ? null : round(transferDelta), modeledCarry: carry == null ? null : round(carry),
      recentHomeRuns: Math.round(finite(recent.hr) ?? 0), sourceComputedAt: stat?.computed_at ?? null,
    },
    pitcher: {
      ...pitcherSummary,
      hrRate: round(pitcherSummary.hrRate * 100), barrelRate: round(pitcherSummary.barrelRate * 100),
      hardHitRate: round(pitcherSummary.hardHitRate * 100), flyBallRate: round(pitcherSummary.flyBallRate * 100),
      averageExitVelocity: pitcherSummary.averageExitVelocity == null ? null : round(pitcherSummary.averageExitVelocity),
      pitchShapes: pitcherSummary.pitchShapes.map(shape => ({ ...shape, usage: round(shape.usage * 100), velocity: shape.velocity == null ? null : round(shape.velocity), hrRate: round(shape.hrRate * 100), hardHitRate: round(shape.hardHitRate * 100) })),
    },
    reasons,
    cautions,
  }
}

export type GameMechanicsWindows = Record<MechanicsWindow, GameMechanicsResult>

// Load the shared 18-player inputs once, then score every supported recency
// window from that same immutable field. The daily precompute and lineup
// refresh both need L1/L3/L5/L10; doing four independent passes previously
// repeated the same Statcast query and both pitchers' full pitch-log reads.
export async function computeGameMechanicsWindows(
  game: TodayGame,
  gameDate: string,
  options: { strictPregameFeatures?: boolean; useTargetPregameCache?: boolean } = {},
): Promise<GameMechanicsWindows> {
  const admin = createAdminClient()
  const lineup = [...game.awayLineup.slice(0, 9), ...game.homeLineup.slice(0, 9)]
  const ids = lineup.map(player => player.mlb_id)
  const start = new Date(`${gameDate}T12:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 14)
  const statQuery = options.strictPregameFeatures && !options.useTargetPregameCache
    ? admin.from('dugout_statcast_precomputed').select('game_date,mlb_id,pitcher_hand,windows,computed_at')
      .gte('game_date', start.toISOString().slice(0, 10)).lt('game_date', gameDate).in('mlb_id', ids)
      .order('game_date', { ascending: false }).order('mlb_id').order('pitcher_hand')
    : admin.from('dugout_statcast_precomputed').select('game_date,mlb_id,pitcher_hand,windows,computed_at')
      .eq('game_date', gameDate).in('mlb_id', ids)
  const { data: statRows, error } = await statQuery
  if (error) throw error
  const rows = (statRows ?? []) as StatcastPrecomputeRow[]
  const statMap = new Map<string, StatcastPrecomputeRow>()
  for (const row of rows) {
    const key = `${row.mlb_id}:${row.pitcher_hand}`
    if (!statMap.has(key)) statMap.set(key, row)
  }
  const pitchers = [game.homePitcher, game.awayPitcher].filter((pitcher): pitcher is ProbablePitcher => Boolean(pitcher?.id))
  const pitcherRows = new Map<number, PitchLogRow[]>()
  await Promise.all(pitchers.map(async pitcher => pitcherRows.set(
    pitcher.id,
    await fetchPlayerPitchRows(admin, pitcher.id, 'pitcher') as PitchLogRow[],
  )))
  const calibration = {
    label: 'Driveline OpenBiomechanics calibrated',
    swings: priors.samples.transferRows,
    trajectoryContacts: priors.samples.distanceRows,
    transferMaeMph: round(priors.models.exitVelocityTransfer.groupedAthleteCv.mae),
    carryMaeFeet: round(priors.models.carryDistance.groupedAthleteCv.mae),
    repository: priors.source.repository,
    limitation: priors.source.importantLimit,
  }

  return Object.fromEntries(MECHANICS_WINDOWS.map(window => {
    const players = lineup.map(player => {
      const away = player.team === game.awayAbbr
      const pitcher = away ? game.homePitcher : game.awayPitcher
      const opponent = away ? game.homeAbbr : game.awayAbbr
      const stat = statMap.get(`${player.mlb_id}:${pitcher?.hand ?? 'R'}`) ?? rows.find(row => row.mlb_id === player.mlb_id)
      return scorePlayer(player, opponent, pitcher, stat, pitcher ? pitcherRows.get(pitcher.id) ?? [] : [], window, gameDate)
    }).sort((a, b) => b.scores.overall - a.scores.overall || a.battingOrder - b.battingOrder)
      .map((player, index) => ({ ...player, rank: index + 1 }))
    const sourceDates = players.map(player => player.metrics.sourceComputedAt?.slice(0, 10)).filter((value): value is string => Boolean(value)).sort()
    const result: GameMechanicsResult = {
      modelVersion: HR_MECHANICS_MODEL_VERSION,
      gameDate,
      gamePk: game.gamePk,
      gameKey: game.gameKey,
      window,
      lineupConfirmed: game.awayLineupConfirmed && game.homeLineupConfirmed,
      sourceThroughDate: sourceDates.at(-1) ?? null,
      calibration,
      players,
    }
    return [window, result]
  })) as GameMechanicsWindows
}

export async function computeGameMechanics(game: TodayGame, gameDate: string, window: MechanicsWindow): Promise<GameMechanicsResult> {
  return (await computeGameMechanicsWindows(game, gameDate))[window]
}
