import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const trainingStart = process.argv[2] ?? '2026-07-25'
const trainingEnd = process.argv[3] ?? '2026-08-03'
const holdoutStart = process.argv[4] ?? '2026-08-04'
const holdoutEnd = process.argv[5] ?? '2026-08-11'
const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
if (![trainingStart, trainingEnd, holdoutStart, holdoutEnd].every(valid)) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-calibrate-v2.mts TRAIN_START TRAIN_END HOLDOUT_START HOLDOUT_END')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const { americanImplied } = await import('../src/lib/hrIntelligence')
type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Player = Game['players'][number]

const clamp = (value: number, min = -1, max = 1) => Math.max(min, Math.min(max, value))
const finiteMean = (values: Array<number | null | undefined>) => {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0
}
const viability = (rank: number | null, count: number) => rank == null || count < 2 ? 0 : 1 - (rank - 1) / (count - 1)
const midBand = (rank: number | null, count: number) => {
  if (rank == null || count < 2) return 0
  const normalized = (rank - 1) / (count - 1)
  return clamp(1 - Math.abs(normalized - 0.45) / 0.45, 0, 1)
}
const positive = (value: number | null | undefined, scale: number) => clamp((value ?? 0) / scale, 0, 1)
const negative = (value: number | null | undefined, scale: number) => clamp(-(value ?? 0) / scale, 0, 1)
const subtle = (value: number | null | undefined, scale: number) => clamp(1 - Math.abs(value ?? scale) / scale, 0, 1)
const stable = (value: number | null | undefined, scale: number) => clamp(1 - Math.abs(value ?? scale) / scale, 0, 1)
const meanRank = (rank: Player['paperRank']) => finiteMean(Object.values(rank ?? {}))

const FEATURE_NAMES = [
  'fhr_market', 'hr_market', 'batting_order', 'fhr_mid_band',
  'fhr_shortened', 'fhr_lengthened', 'fhr_stable', 'hr_shortened', 'hr_lengthened', 'hr_stable',
  'fhr_baseline_raise', 'fhr_baseline_drop', 'fhr_baseline_subtle',
  'hr_baseline_raise', 'hr_baseline_drop', 'hr_baseline_subtle',
  'stable_fhr_x_hr_lengthened', 'stable_fhr_x_subtle_baseline', 'mid_x_stable_contradiction',
  'fhr_tie', 'book_paper_gap', 'paper_strength', 'mm_positive', 'mm_negative',
  'contact_positive', 'contact_negative', 'hidden_power',
  'power_short', 'power_long', 'non_power_short', 'non_power_long',
  'contradiction_lane', 'model_lane', 'anytime_lane', 'advertised_lane',
  'public_concealment', 'public_share', 'fhr_top3', 'hr_top3', 'market_rank_divergence',
  'stable_fhr_x_hidden_power', 'hr_longer_x_non_power_short', 'lineup_x_fhr_market',
  'cluster_x_contradiction', 'cluster_x_model', 'cluster_x_tie',
  'active_x_model', 'active_x_contact', 'active_x_market',
  'quiet_x_contradiction', 'quiet_x_model',
  'low_hr_x_model', 'low_hr_x_market',
] as const

function playerFeatures(player: Player, game: Game) {
  const count = game.players.length
  const fhrStable = stable(player.movement.fhrImpliedPoints, 1.4)
  const fhrSubtle = subtle(player.fhrBaselineDeltaPct, 18)
  const hrLonger = negative(player.movement.hrImpliedPoints, 2.5)
  const paperRank = meanRank(player.paperRank)
  const bookRank = meanRank(player.bookRank)
  const mm = finiteMean(Object.values(player.mm ?? {}))
  const fhrMid = midBand(player.fhrRank, count)
  const contradictionLane = clamp(player.contradictionScore / 100, 0, 1)
  const modelLane = clamp(player.modelFhrScore / 100, 0, 1)
  const anytimeLane = clamp(player.anytimeScore / 100, 0, 1)
  const advertisedLane = clamp(player.advertisedScore / 100, 0, 1)
  const fhrMarket = viability(player.fhrRank, count)
  const hrMarket = viability(player.hrRank, count)
  const publicConcealment = player.publicRank == null ? 0.5 : clamp((player.publicRank - 1) / Math.max(1, count - 1), 0, 1)
  const board = game.diagnostics.boardProfile
  const clustered = board === 'clustered' ? 1 : 0
  const active = board === 'active' ? 1 : 0
  const quiet = board === 'quiet' ? 1 : 0
  const lowHr = board === 'low-hr' ? 1 : 0
  const contactPositive = positive(player.contactAcceleration, 45)
  const hiddenPower = clamp(player.movement.hiddenPowerContradiction / 100, 0, 1)
  const nonPowerShort = clamp(player.movement.nonPowerShortened / 12, 0, 1)
  const lineup = clamp((9 - player.battingOrder) / 8, 0, 1)
  return [
    fhrMarket,
    hrMarket,
    lineup,
    fhrMid,
    positive(player.movement.fhrImpliedPoints, 3),
    negative(player.movement.fhrImpliedPoints, 3),
    fhrStable,
    positive(player.movement.hrImpliedPoints, 4),
    hrLonger,
    stable(player.movement.hrImpliedPoints, 2),
    positive(player.fhrBaselineDeltaPct, 50),
    negative(player.fhrBaselineDeltaPct, 50),
    fhrSubtle,
    positive(player.hrBaselineDeltaPct, 50),
    negative(player.hrBaselineDeltaPct, 50),
    subtle(player.hrBaselineDeltaPct, 18),
    fhrStable * hrLonger,
    fhrStable * fhrSubtle,
    fhrMid * fhrStable * Math.max(hrLonger, fhrSubtle),
    clamp((player.fhrTieSize - 1) / 4, 0, 1),
    clamp((bookRank - paperRank) / 12, -1, 1),
    paperRank ? clamp((count + 1 - paperRank) / count, 0, 1) : 0,
    positive(mm, 8),
    negative(mm, 8),
    contactPositive,
    negative(player.contactAcceleration, 45),
    hiddenPower,
    clamp(player.movement.powerShortened / 5, 0, 1),
    clamp(player.movement.powerLengthened / 5, 0, 1),
    nonPowerShort,
    clamp(player.movement.nonPowerLengthened / 12, 0, 1),
    contradictionLane,
    modelLane,
    anytimeLane,
    advertisedLane,
    publicConcealment,
    clamp((player.publicSharePct ?? 0) / 35, 0, 1),
    player.fhrRank != null && player.fhrRank <= 3 ? 1 : 0,
    player.hrRank != null && player.hrRank <= 3 ? 1 : 0,
    clamp((hrMarket - fhrMarket + 1) / 2, 0, 1),
    fhrStable * hiddenPower,
    hrLonger * nonPowerShort,
    lineup * fhrMarket,
    clustered * contradictionLane,
    clustered * modelLane,
    clustered * clamp((player.fhrTieSize - 1) / 4, 0, 1),
    active * modelLane,
    active * contactPositive,
    active * fhrMarket,
    quiet * contradictionLane,
    quiet * modelLane,
    lowHr * modelLane,
    lowHr * fhrMarket,
  ]
}

const GAME_FEATURE_NAMES = [
  'intercept', 'no_hr_market', 'sum_hr_implied', 'sum_fhr_implied', 'top_hr_implied', 'top_fhr_implied',
  'mean_hr_move', 'mean_fhr_move', 'hr_short_count', 'fhr_short_count', 'market_coverage',
] as const

function gameFeatures(game: Game) {
  const hrImplied = game.players.map(player => americanImplied(player.hr.current)).filter((value): value is number => value != null)
  const fhrImplied = game.players.map(player => americanImplied(player.fhr.current)).filter((value): value is number => value != null)
  const hrMoves = game.players.map(player => player.movement.hrImpliedPoints).filter((value): value is number => value != null)
  const fhrMoves = game.players.map(player => player.movement.fhrImpliedPoints).filter((value): value is number => value != null)
  return [
    1,
    americanImplied(game.noHr.current) ?? 0,
    clamp(hrImplied.reduce((sum, value) => sum + value, 0) / 3, 0, 1),
    clamp(fhrImplied.reduce((sum, value) => sum + value, 0) / 2, 0, 1),
    Math.max(0, ...hrImplied),
    Math.max(0, ...fhrImplied),
    clamp(finiteMean(hrMoves) / 3),
    clamp(finiteMean(fhrMoves) / 3),
    clamp(hrMoves.filter(value => value > 0.15).length / Math.max(1, hrMoves.length), 0, 1),
    clamp(fhrMoves.filter(value => value > 0.15).length / Math.max(1, fhrMoves.length), 0, 1),
    game.diagnostics.marketCoveragePct / 100,
  ]
}

function datesBetween(start: string, end: string) {
  const dates: string[] = []
  for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

async function load(start: string, end: string) {
  const slates: Slate[] = []
  for (const date of datesBetween(start, end)) slates.push(await buildHrIntelligenceSlate(date))
  return slates.flatMap(slate => slate.games.filter(game => game.validation))
}

function dot(weights: number[], values: number[]) {
  return weights.reduce((sum, weight, index) => sum + weight * values[index], 0)
}

function softmaxScores(weights: number[], game: Game, excluded = new Set<number>()) {
  const eligible = game.players.filter(player => !excluded.has(player.mlbId))
  const scores = eligible.map(player => dot(weights, playerFeatures(player, game)))
  const maxScore = Math.max(...scores)
  const exp = scores.map(score => Math.exp(score - maxScore))
  const denom = exp.reduce((sum, value) => sum + value, 0)
  return eligible.map((player, index) => ({ player, score: scores[index], probability: exp[index] / denom }))
    .sort((left, right) => right.score - left.score)
}

function trainSoftmax(games: Game[], labelsFor: (game: Game) => Set<number>) {
  const weights = new Array(FEATURE_NAMES.length).fill(0)
  const learningRate = 0.055
  for (let epoch = 0; epoch < 1100; epoch += 1) {
    const gradient = new Array(weights.length).fill(0)
    let used = 0
    for (const game of games) {
      const labels = labelsFor(game)
      if (!labels.size) continue
      const rows = game.players.map(player => playerFeatures(player, game))
      const scores = rows.map(row => dot(weights, row))
      const maxScore = Math.max(...scores)
      const exp = scores.map(score => Math.exp(score - maxScore))
      const denom = exp.reduce((sum, value) => sum + value, 0)
      game.players.forEach((player, playerIndex) => {
        const target = labels.has(player.mlbId) ? 1 / labels.size : 0
        const error = exp[playerIndex] / denom - target
        rows[playerIndex].forEach((value, featureIndex) => { gradient[featureIndex] += error * value })
      })
      used += 1
    }
    weights.forEach((weight, index) => {
      weights[index] -= learningRate * (gradient[index] / Math.max(1, used) + weight * 0.008)
    })
  }
  return weights
}

type BoostedStump = {
  feature: number
  threshold: number
  left: number
  right: number
}

function boostedScore(stumps: BoostedStump[], values: number[]) {
  return stumps.reduce((score, stump) => score + (values[stump.feature] <= stump.threshold ? stump.left : stump.right), 0)
}

function boostedScores(stumps: BoostedStump[], game: Game, excluded = new Set<number>()) {
  return game.players
    .filter(player => !excluded.has(player.mlbId))
    .map(player => ({ player, score: boostedScore(stumps, playerFeatures(player, game)) }))
    .sort((left, right) => right.score - left.score || left.player.battingOrder - right.player.battingOrder)
}

function trainBoostedStumps(games: Game[], labelsFor: (game: Game) => Set<number>, rounds = 180) {
  const stumps: BoostedStump[] = []
  const learningRate = 0.12
  const thresholds = FEATURE_NAMES.map((_, feature) => {
    const values = games.flatMap(game => game.players.map(player => playerFeatures(player, game)[feature])).sort((a, b) => a - b)
    return [...new Set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
      .map(quantile => values[Math.min(values.length - 1, Math.floor((values.length - 1) * quantile))]))]
  })

  for (let round = 0; round < rounds; round += 1) {
    const rows: Array<{ values: number[]; residual: number }> = []
    for (const game of games) {
      const labels = labelsFor(game)
      if (!labels.size) continue
      const values = game.players.map(player => playerFeatures(player, game))
      const scores = values.map(row => boostedScore(stumps, row))
      const maxScore = Math.max(...scores)
      const exp = scores.map(score => Math.exp(score - maxScore))
      const denominator = exp.reduce((sum, value) => sum + value, 0)
      game.players.forEach((player, index) => {
        const target = labels.has(player.mlbId) ? 1 / labels.size : 0
        rows.push({ values: values[index], residual: target - exp[index] / denominator })
      })
    }

    let best: (BoostedStump & { gain: number }) | null = null
    const totalSum = rows.reduce((sum, row) => sum + row.residual, 0)
    const totalSquared = rows.reduce((sum, row) => sum + row.residual * row.residual, 0)
    const parentError = totalSquared - totalSum * totalSum / Math.max(1, rows.length)
    for (let feature = 0; feature < FEATURE_NAMES.length; feature += 1) {
      for (const threshold of thresholds[feature]) {
        let leftCount = 0
        let leftSum = 0
        let leftSquared = 0
        for (const row of rows) {
          if (row.values[feature] > threshold) continue
          leftCount += 1
          leftSum += row.residual
          leftSquared += row.residual * row.residual
        }
        const rightCount = rows.length - leftCount
        if (leftCount < 25 || rightCount < 25) continue
        const rightSum = totalSum - leftSum
        const rightSquared = totalSquared - leftSquared
        const childError = leftSquared - leftSum * leftSum / leftCount + rightSquared - rightSum * rightSum / rightCount
        const gain = parentError - childError
        if (!best || gain > best.gain) {
          best = {
            feature,
            threshold,
            left: learningRate * leftSum / leftCount,
            right: learningRate * rightSum / rightCount,
            gain,
          }
        }
      }
    }
    if (!best || best.gain <= 1e-8) break
    stumps.push({ feature: best.feature, threshold: best.threshold, left: best.left, right: best.right })
  }
  return stumps
}

function evaluateBoosted(games: Game[], fhrStumps: BoostedStump[], companionStumps: BoostedStump[]) {
  let hrGames = 0
  let fhrTop1 = 0
  let fhrTop3 = 0
  let multiHrGames = 0
  let companionTop1 = 0
  let companionTop3 = 0
  const august11: Array<Record<string, unknown>> = []
  for (const game of games) {
    const validation = game.validation!
    if (validation.actualNoHr || validation.firstHrMlbId == null) continue
    hrGames += 1
    const fhr = boostedScores(fhrStumps, game)
    const firstRank = fhr.findIndex(row => row.player.mlbId === validation.firstHrMlbId) + 1
    if (firstRank === 1) fhrTop1 += 1
    if (firstRank > 0 && firstRank <= 3) fhrTop3 += 1
    const actualCompanions = new Set(validation.hrMlbIds.filter(id => id !== validation.firstHrMlbId))
    const companions = boostedScores(companionStumps, game, new Set([validation.firstHrMlbId]))
    const companionRank = companions.findIndex(row => actualCompanions.has(row.player.mlbId)) + 1
    if (actualCompanions.size) {
      multiHrGames += 1
      if (companionRank === 1) companionTop1 += 1
      if (companionRank > 0 && companionRank <= 3) companionTop3 += 1
    }
    if (game.date === '2026-08-11') august11.push({
      game: game.gameKey,
      actual: validation.firstHrName,
      homeRuns: validation.hrNames,
      fhr: fhr[0]?.player.name ?? null,
      fhrTop3: fhr.slice(0, 3).map(row => row.player.name),
      firstRank,
      companions: companions.slice(0, 3).map(row => row.player.name),
      companionRank: actualCompanions.size ? companionRank : null,
    })
  }
  return {
    counts: { hrGames, fhrTop1, fhrTop3, multiHrGames, companionTop1, companionTop3 },
    rates: {
      fhrTop1: Math.round(fhrTop1 / Math.max(1, hrGames) * 1000) / 10,
      fhrTop3: Math.round(fhrTop3 / Math.max(1, hrGames) * 1000) / 10,
      companionTop1: Math.round(companionTop1 / Math.max(1, multiHrGames) * 1000) / 10,
      companionTop3: Math.round(companionTop3 / Math.max(1, multiHrGames) * 1000) / 10,
    },
    august11,
  }
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))))
}

function trainGameLogistic(games: Game[], labelFor: (game: Game) => number) {
  const weights = new Array(GAME_FEATURE_NAMES.length).fill(0)
  const learningRate = 0.08
  for (let epoch = 0; epoch < 1400; epoch += 1) {
    const gradient = new Array(weights.length).fill(0)
    for (const game of games) {
      const row = gameFeatures(game)
      const error = sigmoid(dot(weights, row)) - labelFor(game)
      row.forEach((value, index) => { gradient[index] += error * value })
    }
    weights.forEach((weight, index) => {
      weights[index] -= learningRate * (gradient[index] / Math.max(1, games.length) + (index === 0 ? 0 : weight * 0.01))
    })
  }
  return weights
}

function selectThreshold(rows: Array<{ probability: number; hit: boolean }>, minimumCoveragePct: number) {
  const candidates = [...new Set(rows.map(row => Math.round(row.probability * 1000) / 1000))].sort((a, b) => a - b)
  let best = { threshold: 1, coverage: 0, precision: 0, hits: 0, selected: 0 }
  for (const threshold of candidates) {
    const selected = rows.filter(row => row.probability >= threshold)
    const coverage = selected.length / Math.max(1, rows.length)
    if (coverage < minimumCoveragePct / 100) continue
    const hits = selected.filter(row => row.hit).length
    const precision = hits / Math.max(1, selected.length)
    if (precision > best.precision || (precision === best.precision && coverage > best.coverage)) {
      best = { threshold, coverage, precision, hits, selected: selected.length }
    }
  }
  return best
}

function evaluate(games: Game[], fhrWeights: number[], companionWeights: number[], noHrWeights: number[], multiWeights: number[], thresholds?: { fhr: number; companion: number; noHr: number; multi: number }) {
  let hrGames = 0
  let noHrGames = 0
  let fhrTop1 = 0
  let fhrTop3 = 0
  let marketTop1 = 0
  let companionTop1 = 0
  let pairHits = 0
  let pairSelections = 0
  let noHrHits = 0
  let noHrSelections = 0
  const fhrRows: Array<{ probability: number; hit: boolean }> = []
  const companionRows: Array<{ probability: number; hit: boolean }> = []
  const noHrRows: Array<{ probability: number; hit: boolean }> = []
  const multiRows: Array<{ probability: number; hit: boolean }> = []
  const misses: Array<Record<string, unknown>> = []
  for (const game of games) {
    const validation = game.validation!
    const noHrProbability = sigmoid(dot(noHrWeights, gameFeatures(game)))
    const distinctHrIds = new Set(validation.hrMlbIds)
    const multiProbability = sigmoid(dot(multiWeights, gameFeatures(game)))
    noHrRows.push({ probability: noHrProbability, hit: validation.actualNoHr })
    multiRows.push({ probability: multiProbability, hit: distinctHrIds.size >= 2 })
    if (thresholds && noHrProbability >= thresholds.noHr) {
      noHrSelections += 1
      if (validation.actualNoHr) noHrHits += 1
    }
    if (validation.actualNoHr || validation.firstHrMlbId == null) {
      noHrGames += 1
      continue
    }
    hrGames += 1
    const fhr = softmaxScores(fhrWeights, game)
    const market = [...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1))
    const firstId = validation.firstHrMlbId
    const fhrRank = fhr.findIndex(row => row.player.mlbId === firstId) + 1
    const fhrHit = fhr[0]?.player.mlbId === firstId
    fhrRows.push({ probability: fhr[0]?.probability ?? 0, hit: fhrHit })
    if (fhrHit) fhrTop1 += 1
    if (fhrRank <= 3) fhrTop3 += 1
    if (market[0]?.mlbId === firstId) marketTop1 += 1
    const actualCompanions = new Set([...distinctHrIds].filter(id => id !== firstId))
    const predictedAnchor = fhr[0]?.player
    const companions = predictedAnchor ? softmaxScores(companionWeights, game, new Set([predictedAnchor.mlbId])) : []
    const companionHit = !!companions[0] && actualCompanions.has(companions[0].player.mlbId)
    if (companionHit) companionTop1 += 1
    companionRows.push({ probability: companions[0]?.probability ?? 0, hit: companionHit })
    const shouldPair = thresholds
      ? noHrProbability < thresholds.noHr && multiProbability >= thresholds.multi && (fhr[0]?.probability ?? 0) >= thresholds.fhr && (companions[0]?.probability ?? 0) >= thresholds.companion
      : true
    if (shouldPair) {
      pairSelections += 1
      if (fhrHit && companionHit) pairHits += 1
    }
    if (game.date === '2026-08-11') misses.push({
      game: game.gameKey,
      actual: validation.firstHrName,
      hrs: validation.hrNames,
      fhr: fhr[0]?.player.name,
      fhrRank,
      fhrProbability: fhr[0]?.probability,
      companion: companions[0]?.player.name,
      companionProbability: companions[0]?.probability,
      noHrProbability,
      multiProbability,
      pair: shouldPair,
    })
  }
  return {
    counts: { games: games.length, hrGames, noHrGames, fhrTop1, fhrTop3, marketTop1, companionTop1, pairSelections, pairHits, noHrSelections, noHrHits },
    rates: {
      fhrTop1: fhrTop1 / Math.max(1, hrGames),
      fhrTop3: fhrTop3 / Math.max(1, hrGames),
      marketTop1: marketTop1 / Math.max(1, hrGames),
      companionTop1: companionTop1 / Math.max(1, hrGames),
      pairPrecision: pairHits / Math.max(1, pairSelections),
      pairCoverage: pairSelections / Math.max(1, games.length),
      noHrPrecision: noHrHits / Math.max(1, noHrSelections),
      noHrCoverage: noHrSelections / Math.max(1, games.length),
    },
    calibrationRows: { fhrRows, companionRows, noHrRows, multiRows },
    august11: misses,
  }
}

const training = await load(trainingStart, trainingEnd)
const holdout = await load(holdoutStart, holdoutEnd)
const fhrWeights = trainSoftmax(training, game => new Set(game.validation?.firstHrMlbId == null ? [] : [game.validation.firstHrMlbId]))
const companionWeights = trainSoftmax(training, game => {
  const first = game.validation?.firstHrMlbId
  return new Set((game.validation?.hrMlbIds ?? []).filter(id => id !== first))
})
const noHrWeights = trainGameLogistic(training, game => game.validation?.actualNoHr ? 1 : 0)
const multiWeights = trainGameLogistic(training, game => new Set(game.validation?.hrMlbIds ?? []).size >= 2 ? 1 : 0)
const fhrStumps = trainBoostedStumps(training, game => new Set(game.validation?.firstHrMlbId == null ? [] : [game.validation.firstHrMlbId]))
const companionStumps = trainBoostedStumps(training, game => {
  const first = game.validation?.firstHrMlbId
  return new Set((game.validation?.hrMlbIds ?? []).filter(id => id !== first))
})
const rawTraining = evaluate(training, fhrWeights, companionWeights, noHrWeights, multiWeights)
const fhrThreshold = selectThreshold(rawTraining.calibrationRows.fhrRows, 20).threshold
const companionThreshold = selectThreshold(rawTraining.calibrationRows.companionRows, 20).threshold
const noHrThreshold = selectThreshold(rawTraining.calibrationRows.noHrRows, 8).threshold
const multiThreshold = selectThreshold(rawTraining.calibrationRows.multiRows, 25).threshold
const thresholds = { fhr: fhrThreshold, companion: companionThreshold, noHr: noHrThreshold, multi: multiThreshold }

const rounded = (names: readonly string[], weights: number[]) => Object.fromEntries(names.map((name, index) => [name, Math.round(weights[index] * 10_000) / 10_000]))
const summarize = (result: ReturnType<typeof evaluate>) => ({ counts: result.counts, rates: Object.fromEntries(Object.entries(result.rates).map(([key, value]) => [key, Math.round(value * 1000) / 10])), august11: result.august11 })

const report = {
  ranges: { training: [trainingStart, trainingEnd], holdout: [holdoutStart, holdoutEnd] },
  samples: { training: training.length, holdout: holdout.length },
  thresholds,
  coefficients: {
    fhr: rounded(FEATURE_NAMES, fhrWeights),
    companion: rounded(FEATURE_NAMES, companionWeights),
    noHr: rounded(GAME_FEATURE_NAMES, noHrWeights),
    multi: rounded(GAME_FEATURE_NAMES, multiWeights),
  },
  training: summarize(evaluate(training, fhrWeights, companionWeights, noHrWeights, multiWeights, thresholds)),
  holdout: summarize(evaluate(holdout, fhrWeights, companionWeights, noHrWeights, multiWeights, thresholds)),
  boosted: {
    trees: { fhr: fhrStumps.length, companion: companionStumps.length },
    training: evaluateBoosted(training, fhrStumps, companionStumps),
    holdout: evaluateBoosted(holdout, fhrStumps, companionStumps),
  },
}
const compact = process.argv.includes('--compact')
process.stdout.write(`${JSON.stringify(compact ? {
  ranges: report.ranges,
  samples: report.samples,
  thresholds: report.thresholds,
  training: report.training,
  holdout: report.holdout,
  boosted: report.boosted,
} : report, null, 2)}\n`)
