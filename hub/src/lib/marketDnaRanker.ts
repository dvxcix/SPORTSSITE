export type MarketDnaRankerRow = {
  game_date: string
  game_pk: number
  mlb_id: number
  did_hr: boolean
  home_runs?: number
  feature_vector: Record<string, number>
}

export type MarketDnaLaneScores = {
  market: number
  settlement: number
  mechanics: number
  leverage: number
  composite: number
}

export type MarketDnaGameProjection = {
  bucket: 0 | 1 | 2 | 3
  label: '0' | '1' | '2' | '3+'
  probabilities: { zero: number; one: number; two: number; threePlus: number }
  expectedHomeRuns: number
  candidateLimit: number
  confidence: number
}

export type MarketDnaRankerValidation = {
  cutoff: string
  games: number
  gamesWithHr: number
  noHrGames: number
  marketTopOne: number
  marketTopTwo: number
  marketTopThree: number
  learnedTopOne: number
  learnedTopTwo: number
  learnedTopThree: number
  gameFirstTopOne: number
  gameFirstTopTwo: number
  gameFirstTopThree: number
  guardedTopOne: number
  guardedTopTwo: number
  guardedTopThree: number
  guardActive: boolean
  selectedGameCoverage: number
  selectedPlayerPrecision: number
  countBucketAccuracy: number
  noHrAccuracy: number
  countMae: number
  averageMarketHomerRank: number | null
  averageLearnedHomerRank: number | null
  averageGameFirstHomerRank: number | null
}

type BoostNode = {
  feature?: number
  threshold?: number
  left?: BoostNode
  right?: BoostNode
  leaf?: number
}

type GameCountModel = {
  featureNames: string[]
  centers: number[]
  scales: number[]
  weights: number[][]
}

export type MarketDnaRankerArtifact = {
  version: 'game-first-gbdt-v5'
  rankingMode: 'learned-lanes' | 'market-guard'
  trainedThrough: string
  trainingRows: number
  trainingGames: number
  featureNames: string[]
  rawKeys: string[]
  centers: number[]
  scales: number[]
  trees: BoostNode[]
  countModel: GameCountModel
  validation: MarketDnaRankerValidation | null
}

const mean = (values: number[]) => values.reduce((sum, entry) => sum + entry, 0) / Math.max(1, values.length)
const clamp = (entry: number, low: number, high: number) => Math.max(low, Math.min(high, entry))
const sigmoid = (entry: number) => 1 / (1 + Math.exp(-clamp(entry, -20, 20)))
const rowKey = (row: MarketDnaRankerRow) => `${row.game_date}|${row.game_pk}|${row.mlb_id}`
const gameKey = (row: MarketDnaRankerRow) => `${row.game_date}|${row.game_pk}`
const featureValue = (row: MarketDnaRankerRow, key: string) => Number.isFinite(row.feature_vector?.[key]) ? row.feature_vector[key] : .5

function groupCompleteGames(rows: MarketDnaRankerRow[]) {
  const grouped = new Map<string, MarketDnaRankerRow[]>()
  for (const row of rows) grouped.set(gameKey(row), [...(grouped.get(gameKey(row)) ?? []), row])
  return [...grouped.values()].filter(game => game.length >= 18)
}

function derivedVector(row: MarketDnaRankerRow) {
  const avg = (keys: string[]) => mean(keys.map(key => featureValue(row, key)))
  const headlineMove = avg(['market.fhr.movement', 'market.hr.movement'])
  const ordinaryMove = avg(['market.hits1.movement', 'market.hits2.movement', 'market.single.movement', 'market.double.movement'])
  const payoffMove = avg(['market.hrMl.movement', 'market.rbi1.movement', 'market.rbi2.movement', 'market.rbi3.movement', 'market.tb4.movement', 'market.tb5.movement', 'market.hrr.movement'])
  const powerRank = avg(['market.laser105.rank', 'market.hrMl.rank', 'market.hr.rank', 'market.fhr.rank', 'market.tb5.rank'])
  const settlementRank = avg(['market.hrMl.rank', 'market.rbi2.rank', 'market.rbi3.rank', 'market.tb4.rank', 'market.tb5.rank', 'market.hrr.rank'])
  const ordinaryRank = avg(['market.hits1.rank', 'market.hits2.rank', 'market.single.rank', 'market.double.rank', 'market.runs1.rank'])
  const statcastRank = avg(['metric.avgEvL5.rank', 'metric.hardHitL5.rank', 'metric.barrelL10.rank', 'metric.pullAirL5.rank'])
  const mechanicsRank = avg(['mechanics.l3.gameRank', 'mechanics.l3.trajectory.rank', 'mechanics.l5.power.rank', 'mechanics.l10.gameRank'])
  const publicHr = featureValue(row, 'public.home_runs.share')
  const fhrBaseline = featureValue(row, 'metric.fhrVsAveragePct.value')
  const hrBaseline = featureValue(row, 'metric.hrVsAveragePct.value')
  const baselineGap = featureValue(row, 'structure.fhrHrBaselineGap')
  const mm = avg(['metric.mmL1.value', 'metric.mmL3.value', 'metric.mmL5.value', 'metric.mmL10.value'])
  const publicResidual = featureValue(row, 'public.home_runs.hiddenResidual')
  return [
    headlineMove, ordinaryMove, payoffMove,
    headlineMove - ordinaryMove + .5, headlineMove - payoffMove + .5,
    powerRank, settlementRank, ordinaryRank, statcastRank, mechanicsRank,
    settlementRank - powerRank + .5, mechanicsRank - powerRank + .5,
    publicHr, powerRank - publicHr + .5, featureValue(row, 'context.traffic'),
    featureValue(row, 'market.hr.probability'), featureValue(row, 'market.fhr.probability'),
    featureValue(row, 'market.laser105.probability'), featureValue(row, 'market.hrMl.probability'),
    featureValue(row, 'market.tb5.probability'), featureValue(row, 'market.rbi3.probability'),
    fhrBaseline, hrBaseline, baselineGap, Math.abs(fhrBaseline - hrBaseline),
    mm, publicResidual, featureValue(row, 'context.adjacentPowerPressure'),
    featureValue(row, 'context.fhrClusterDensity'),
  ]
}

const DERIVED_NAMES = [
  'd.headlineMove', 'd.ordinaryMove', 'd.payoffMove', 'd.headlineVsOrdinary', 'd.headlineVsPayoff',
  'd.powerRank', 'd.settlementRank', 'd.ordinaryRank', 'd.statcastRank', 'd.mechanicsRank',
  'd.settlementVsPower', 'd.mechanicsVsPower', 'd.publicHr', 'd.powerVsPublic', 'd.traffic',
  'd.hrProbability', 'd.fhrProbability', 'd.laser105Probability', 'd.hrMlProbability',
  'd.tb5Probability', 'd.rbi3Probability', 'd.fhrBaseline', 'd.hrBaseline', 'd.baselineGap',
  'd.baselineAbsGap', 'd.mmWindows', 'd.publicResidual', 'd.adjacentPowerPressure', 'd.fhrClusterDensity',
]

export function scoreMarketDnaLaneVector(featureVector: Record<string, number>): MarketDnaLaneScores {
  const row: MarketDnaRankerRow = { game_date: '', game_pk: 0, mlb_id: 0, did_hr: false, feature_vector: featureVector }
  const avg = (keys: string[]) => mean(keys.map(key => featureValue(row, key)))
  const market = avg([
    'market.laser105.rank', 'market.hrMl.rank', 'market.hr.rank', 'market.fhr.rank',
    'market.tb5.rank', 'market.rbi3.rank', 'market.hr2.rank',
  ])
  const settlement = avg([
    'market.hrMl.rank', 'market.rbi2.rank', 'market.rbi3.rank', 'market.tb4.rank',
    'market.tb5.rank', 'market.hrr.rank', 'metric.hrToRbi.rank', 'metric.hrToTb4.rank',
  ])
  const mechanics = avg([
    'mechanics.l3.gameRank', 'mechanics.l3.index.rank', 'mechanics.l3.trajectory.rank',
    'mechanics.l5.power.rank', 'mechanics.l5.plane.rank', 'mechanics.l10.gameRank',
    'metric.avgEvL5.rank', 'metric.hardHitL5.rank', 'metric.barrelL10.rank',
  ])
  const hiddenResidual = featureValue(row, 'public.home_runs.hiddenResidual')
  const expectedActual = featureValue(row, 'public.home_runs.expectedActualRatio')
  const mm = avg(['metric.mmL1.rank', 'metric.mmL3.rank', 'metric.mmL5.rank', 'metric.mmL10.rank'])
  const payoffMove = avg(['market.hrMl.movement', 'market.rbi2.movement', 'market.rbi3.movement', 'market.tb4.movement', 'market.tb5.movement'])
  const headlineMove = avg(['market.fhr.movement', 'market.hr.movement'])
  const divergence = featureValue(row, 'structure.fhrHrBaselineGap')
  const adjacency = featureValue(row, 'context.adjacentPowerPressure')
  const traffic = featureValue(row, 'context.traffic')
  const leverage = clamp(
    hiddenResidual * .27 + expectedActual * .18 + mm * .16
      + clamp(.5 + payoffMove - headlineMove, 0, 1) * .15
      + divergence * .10 + adjacency * .07 + traffic * .07,
    0, 1,
  )
  return {
    market: clamp(market, 0, 1),
    settlement: clamp(settlement, 0, 1),
    mechanics: clamp(mechanics, 0, 1),
    leverage,
    composite: clamp(market * .30 + settlement * .25 + mechanics * .27 + leverage * .18, 0, 1),
  }
}

function buildFeatureSpace(rows: MarketDnaRankerRow[]) {
  const coverage = new Map<string, number>()
  for (const row of rows) for (const key of Object.keys(row.feature_vector ?? {})) coverage.set(key, (coverage.get(key) ?? 0) + 1)
  const rawKeys = [...coverage.entries()]
    .filter(([key, count]) => count / rows.length >= .55 && !key.startsWith('game.'))
    .map(([key]) => key)
    .sort()
  return { rawKeys, featureNames: [...rawKeys, ...DERIVED_NAMES] }
}

function rawVector(row: MarketDnaRankerRow, rawKeys: string[]) {
  return [...rawKeys.map(key => featureValue(row, key)), ...derivedVector(row)]
}

function normalizeVector(vector: number[], centers: number[], scales: number[]) {
  return vector.map((entry, index) => clamp((entry - centers[index]) / scales[index], -4, 4))
}

function treeValue(tree: BoostNode, vector: number[]): number {
  if (tree.leaf != null) return tree.leaf
  return treeValue(vector[tree.feature!] <= tree.threshold! ? tree.left! : tree.right!, vector)
}

function fitNode(indexes: number[], vectors: number[][], thresholds: number[][], gradients: Float64Array, hessians: Float64Array, depth: number): BoostNode {
  let totalGradient = 0, totalHessian = 0
  for (const index of indexes) { totalGradient += gradients[index]; totalHessian += hessians[index] }
  const leaf = -totalGradient / (totalHessian + 4)
  if (depth <= 0 || indexes.length < 30) return { leaf }
  let bestGain = 0, bestFeature = -1, bestThreshold = 0
  for (let feature = 0; feature < thresholds.length; feature++) {
    for (const threshold of thresholds[feature]) {
      let leftGradient = 0, leftHessian = 0, leftCount = 0
      for (const index of indexes) {
        if (vectors[index][feature] <= threshold) {
          leftGradient += gradients[index]
          leftHessian += hessians[index]
          leftCount++
        }
      }
      if (leftCount < 15 || indexes.length - leftCount < 15) continue
      const rightGradient = totalGradient - leftGradient
      const rightHessian = totalHessian - leftHessian
      const gain = .5 * (
        leftGradient ** 2 / (leftHessian + 4)
        + rightGradient ** 2 / (rightHessian + 4)
        - totalGradient ** 2 / (totalHessian + 4)
      )
      if (gain > bestGain) { bestGain = gain; bestFeature = feature; bestThreshold = threshold }
    }
  }
  if (bestFeature < 0 || bestGain < .0005) return { leaf }
  const leftIndexes: number[] = [], rightIndexes: number[] = []
  for (const index of indexes) (vectors[index][bestFeature] <= bestThreshold ? leftIndexes : rightIndexes).push(index)
  return {
    feature: bestFeature,
    threshold: bestThreshold,
    left: fitNode(leftIndexes, vectors, thresholds, gradients, hessians, depth - 1),
    right: fitNode(rightIndexes, vectors, thresholds, gradients, hessians, depth - 1),
  }
}

const GAME_KEYS = [
  'game.noHr.probability', 'game.noHr.movement',
  'market.hr.probability', 'market.fhr.probability', 'market.laser105.probability',
  'market.hrMl.probability', 'market.rbi2.probability', 'market.rbi3.probability',
  'market.tb4.probability', 'market.tb5.probability', 'market.hr2.probability',
  'mechanics.l3.index', 'mechanics.l3.trajectory', 'mechanics.l5.power', 'mechanics.l10.index',
  'metric.mmL1.value', 'metric.mmL3.value', 'metric.mmL5.value', 'metric.mmL10.value',
]

function gameFeatureVector(game: MarketDnaRankerRow[]) {
  const result: number[] = []
  for (const key of GAME_KEYS) {
    const values = game.map(row => featureValue(row, key))
    const center = mean(values)
    result.push(center, Math.max(...values), Math.sqrt(mean(values.map(value => (value - center) ** 2))))
  }
  const hrShares = game.map(row => featureValue(row, 'public.home_runs.share'))
  const hrProbabilities = game.map(row => featureValue(row, 'market.hr.probability'))
  result.push(
    hrShares.reduce((sum, value) => sum + value * value, 0),
    Math.max(...hrShares),
    hrProbabilities.reduce((sum, value) => sum + value, 0) / 3,
  )
  return result
}

const GAME_FEATURE_NAMES = [
  ...GAME_KEYS.flatMap(key => [`${key}.mean`, `${key}.max`, `${key}.spread`]),
  'game.publicHr.hhi', 'game.publicHr.max', 'game.hrProbability.sumScaled',
]

function homeRunCount(game: MarketDnaRankerRow[]) {
  return game.reduce((sum, row) => sum + Math.max(0, row.home_runs ?? (row.did_hr ? 1 : 0)), 0)
}

function countBucket(game: MarketDnaRankerRow[]): 0 | 1 | 2 | 3 {
  return Math.min(3, homeRunCount(game)) as 0 | 1 | 2 | 3
}

function softmax(logits: number[]) {
  const max = Math.max(...logits)
  const values = logits.map(value => Math.exp(clamp(value - max, -30, 30)))
  const total = values.reduce((sum, value) => sum + value, 0)
  return values.map(value => value / total)
}

function trainCountModel(games: MarketDnaRankerRow[][]): GameCountModel {
  const raw = games.map(gameFeatureVector)
  const centers = GAME_FEATURE_NAMES.map((_, index) => mean(raw.map(vector => vector[index])))
  const scales = GAME_FEATURE_NAMES.map((_, index) => Math.max(.04, Math.sqrt(mean(raw.map(vector => (vector[index] - centers[index]) ** 2)))))
  const vectors = raw.map(vector => [1, ...normalizeVector(vector, centers, scales)])
  const labels = games.map(countBucket)
  const counts = [0, 1, 2, 3].map(label => labels.filter(value => value === label).length)
  const weights = Array.from({ length: 4 }, (_, label) => [Math.log((counts[label] + 1) / (games.length + 4)), ...Array(GAME_FEATURE_NAMES.length).fill(0)])
  const classWeights = counts.map(count => Math.sqrt(games.length / Math.max(1, count)))
  for (let iteration = 0; iteration < 550; iteration++) {
    const gradients = weights.map(row => row.map(() => 0))
    for (let index = 0; index < vectors.length; index++) {
      const vector = vectors[index]
      const probabilities = softmax(weights.map(row => row.reduce((sum, weight, feature) => sum + weight * vector[feature], 0)))
      const sampleWeight = classWeights[labels[index]]
      for (let label = 0; label < 4; label++) {
        const error = (probabilities[label] - Number(labels[index] === label)) * sampleWeight
        for (let feature = 0; feature < vector.length; feature++) gradients[label][feature] += error * vector[feature]
      }
    }
    const learningRate = .12 / Math.sqrt(1 + iteration / 45)
    for (let label = 0; label < 4; label++) {
      for (let feature = 0; feature < weights[label].length; feature++) {
        const regularization = feature === 0 ? 0 : .004 * weights[label][feature]
        weights[label][feature] -= learningRate * (gradients[label][feature] / vectors.length + regularization)
      }
    }
  }
  return { featureNames: GAME_FEATURE_NAMES, centers, scales, weights }
}

function scoreCountModel(model: GameCountModel, rows: MarketDnaRankerRow[]) {
  const vector = [1, ...normalizeVector(gameFeatureVector(rows), model.centers, model.scales)]
  return softmax(model.weights.map(row => row.reduce((sum, weight, index) => sum + weight * vector[index], 0)))
}

function candidateLimitFor(probabilities: number[], expectedHomeRuns: number) {
  // A zero-card read is intentionally fail-closed. The first v4 holdout did not
  // correctly identify any no-HR game, so a plurality zero bucket is not enough.
  if (probabilities[0] >= .60) return 0
  if (expectedHomeRuns < 1.5) return 1
  if (expectedHomeRuns < 2.5) return 2
  if (expectedHomeRuns < 3.5) return 3
  return 4
}

export function projectMarketDnaGame(artifact: MarketDnaRankerArtifact, featureVectors: Record<string, number>[]): MarketDnaGameProjection {
  const rows = featureVectors.map((feature_vector, index) => ({ game_date: '', game_pk: 0, mlb_id: index, did_hr: false, feature_vector }))
  const probabilities = scoreCountModel(artifact.countModel, rows)
  const bucket = probabilities.indexOf(Math.max(...probabilities)) as 0 | 1 | 2 | 3
  const expectedHomeRuns = probabilities[1] + probabilities[2] * 2 + probabilities[3] * 3.6
  const confidence = Math.max(...probabilities)
  const candidateLimit = candidateLimitFor(probabilities, expectedHomeRuns)
  return {
    bucket,
    label: bucket === 3 ? '3+' : `${bucket}` as '0' | '1' | '2',
    probabilities: { zero: probabilities[0], one: probabilities[1], two: probabilities[2], threePlus: probabilities[3] },
    expectedHomeRuns,
    candidateLimit,
    confidence,
  }
}

function trainCore(rows: MarketDnaRankerRow[]) {
  const completeGames = groupCompleteGames(rows)
  const gamesWithHr = completeGames.filter(game => game.some(row => row.did_hr))
  const trainingRows = gamesWithHr.flat()
  if (trainingRows.length < 900 || completeGames.length < 50) throw new Error('Market DNA needs at least 50 complete historical games before training the game-first reducer.')
  const { rawKeys, featureNames } = buildFeatureSpace(trainingRows)
  const rawVectors = trainingRows.map(row => rawVector(row, rawKeys))
  const centers = featureNames.map((_, index) => mean(rawVectors.map(vector => vector[index])))
  const scales = featureNames.map((_, index) => Math.max(.08, Math.sqrt(mean(rawVectors.map(vector => (vector[index] - centers[index]) ** 2)))))
  const vectors = rawVectors.map(vector => normalizeVector(vector, centers, scales))
  const rowIndexes = new Map(trainingRows.map((row, index) => [rowKey(row), index]))
  const labels = trainingRows.map(row => row.did_hr ? 1 : 0)
  const sampleWeights = new Float64Array(trainingRows.length)
  for (const game of gamesWithHr) {
    const positives = game.filter(row => row.did_hr)
    const negatives = game.filter(row => !row.did_hr)
    const positiveRaw = positives.map(row => Math.pow(Math.max(.08, 1 - featureValue(row, 'market.hr.probability')), 2))
    const negativeRaw = negatives.map(row => Math.pow(Math.max(.08, 1 - featureValue(row, 'market.hr.probability')), 1.25))
    const positiveTotal = positiveRaw.reduce((sum, entry) => sum + entry, 0)
    const negativeTotal = negativeRaw.reduce((sum, entry) => sum + entry, 0)
    positives.forEach((row, index) => { sampleWeights[rowIndexes.get(rowKey(row))!] = .5 * positiveRaw[index] / positiveTotal })
    negatives.forEach((row, index) => { sampleWeights[rowIndexes.get(rowKey(row))!] = .5 * negativeRaw[index] / negativeTotal })
  }
  const indexes = trainingRows.map((_, index) => index)
  const thresholds = featureNames.map((_, feature) => {
    const sorted = indexes.map(index => vectors[index][feature]).sort((a, b) => a - b)
    return [...new Set(Array.from({ length: 11 }, (_, quantile) => sorted[Math.floor((quantile + 1) * sorted.length / 12)]))]
  })
  const predictions = new Float64Array(trainingRows.length)
  const trees: BoostNode[] = []
  for (let round = 0; round < 110; round++) {
    const gradients = new Float64Array(trainingRows.length)
    const hessians = new Float64Array(trainingRows.length)
    for (const index of indexes) {
      const probability = sigmoid(predictions[index])
      gradients[index] = sampleWeights[index] * (probability - labels[index])
      hessians[index] = sampleWeights[index] * probability * (1 - probability)
    }
    const tree = fitNode(indexes, vectors, thresholds, gradients, hessians, 2)
    trees.push(tree)
    for (const index of indexes) predictions[index] += .08 * treeValue(tree, vectors[index])
  }
  return {
    rawKeys, featureNames, centers, scales, trees,
    countModel: trainCountModel(completeGames),
    trainingRows: trainingRows.length,
    trainingGames: completeGames.length,
  }
}

function scoreWithCore(core: ReturnType<typeof trainCore>, row: MarketDnaRankerRow) {
  const vector = normalizeVector(rawVector(row, core.rawKeys), core.centers, core.scales)
  return core.trees.reduce((score, tree) => score + .08 * treeValue(tree, vector), 0)
}

function gameFirstScore(core: ReturnType<typeof trainCore>, game: MarketDnaRankerRow[]) {
  const learned = [...game].sort((a, b) => scoreWithCore(core, b) - scoreWithCore(core, a))
  const relative = new Map(learned.map((row, index) => [rowKey(row), learned.length <= 1 ? 1 : 1 - index / (learned.length - 1)]))
  return [...game].map(row => {
    const lanes = scoreMarketDnaLaneVector(row.feature_vector)
    return { row, score: (relative.get(rowKey(row)) ?? .5) * .44 + lanes.composite * .56 }
  }).sort((a, b) => b.score - a.score)
}

function validate(core: ReturnType<typeof trainCore>, rows: MarketDnaRankerRow[], cutoff: string): MarketDnaRankerValidation {
  const games = groupCompleteGames(rows)
  const gamesWithHr = games.filter(game => game.some(row => row.did_hr))
  let marketTopOne = 0, marketTopTwo = 0, marketTopThree = 0, learnedTopOne = 0, learnedTopTwo = 0, learnedTopThree = 0
  let gameFirstTopOne = 0, gameFirstTopTwo = 0, gameFirstTopThree = 0
  let marketRankSum = 0, learnedRankSum = 0, gameFirstRankSum = 0, homerCount = 0
  let countCorrect = 0, noHrCorrect = 0, countError = 0
  const selectionAudits: Array<{ actualIds: Set<number>; market: MarketDnaRankerRow[]; gameFirst: ReturnType<typeof gameFirstScore>; selectedCount: number }> = []
  for (const game of games) {
    const actualIds = new Set(game.filter(row => row.did_hr).map(row => row.mlb_id))
    const market = [...game].sort((a, b) => featureValue(b, 'market.hr.probability') - featureValue(a, 'market.hr.probability'))
    const learned = [...game].sort((a, b) => scoreWithCore(core, b) - scoreWithCore(core, a))
    const gameFirst = gameFirstScore(core, game)
    const probabilities = scoreCountModel(core.countModel, game)
    const predictedBucket = probabilities.indexOf(Math.max(...probabilities)) as 0 | 1 | 2 | 3
    const actualBucket = countBucket(game)
    const expected = probabilities[1] + probabilities[2] * 2 + probabilities[3] * 3.6
    countCorrect += Number(predictedBucket === actualBucket)
    if (actualBucket === 0) noHrCorrect += Number(predictedBucket === 0)
    countError += Math.abs(expected - homeRunCount(game))
    selectionAudits.push({ actualIds, market, gameFirst, selectedCount: candidateLimitFor(probabilities, expected) })
    if (!actualIds.size) continue
    const marketRanks = [...actualIds].map(id => market.findIndex(row => row.mlb_id === id) + 1)
    const learnedRanks = [...actualIds].map(id => learned.findIndex(row => row.mlb_id === id) + 1)
    const gameFirstRanks = [...actualIds].map(id => gameFirst.findIndex(entry => entry.row.mlb_id === id) + 1)
    if (Math.min(...marketRanks) <= 1) marketTopOne++
    if (Math.min(...marketRanks) <= 2) marketTopTwo++
    if (Math.min(...marketRanks) <= 3) marketTopThree++
    if (Math.min(...learnedRanks) <= 1) learnedTopOne++
    if (Math.min(...learnedRanks) <= 2) learnedTopTwo++
    if (Math.min(...learnedRanks) <= 3) learnedTopThree++
    if (Math.min(...gameFirstRanks) <= 1) gameFirstTopOne++
    if (Math.min(...gameFirstRanks) <= 2) gameFirstTopTwo++
    if (Math.min(...gameFirstRanks) <= 3) gameFirstTopThree++
    marketRankSum += marketRanks.reduce((sum, rank) => sum + rank, 0)
    learnedRankSum += learnedRanks.reduce((sum, rank) => sum + rank, 0)
    gameFirstRankSum += gameFirstRanks.reduce((sum, rank) => sum + rank, 0)
    homerCount += actualIds.size
  }
  const hrCount = gamesWithHr.length
  const noHrCount = games.length - hrCount
  const marketTopOneRate = hrCount ? marketTopOne / hrCount : 0
  const marketTopTwoRate = hrCount ? marketTopTwo / hrCount : 0
  const marketTopThreeRate = hrCount ? marketTopThree / hrCount : 0
  const gameFirstTopOneRate = hrCount ? gameFirstTopOne / hrCount : 0
  const gameFirstTopTwoRate = hrCount ? gameFirstTopTwo / hrCount : 0
  const gameFirstTopThreeRate = hrCount ? gameFirstTopThree / hrCount : 0
  const guardActive = gameFirstTopTwoRate + .02 < marketTopTwoRate
  let selectedCovered = 0, selectedHits = 0, selectedPlayers = 0
  for (const audit of selectionAudits) {
    const selectedIds = guardActive
      ? audit.market.slice(0, audit.selectedCount).map(row => row.mlb_id)
      : audit.gameFirst.slice(0, audit.selectedCount).map(entry => entry.row.mlb_id)
    selectedPlayers += selectedIds.length
    const hits = selectedIds.filter(id => audit.actualIds.has(id)).length
    selectedHits += hits
    selectedCovered += Number(hits > 0 || (audit.actualIds.size === 0 && selectedIds.length === 0))
  }
  return {
    cutoff, games: games.length, gamesWithHr: hrCount, noHrGames: noHrCount,
    marketTopOne: marketTopOneRate,
    marketTopTwo: marketTopTwoRate,
    marketTopThree: marketTopThreeRate,
    learnedTopOne: hrCount ? learnedTopOne / hrCount : 0,
    learnedTopTwo: hrCount ? learnedTopTwo / hrCount : 0,
    learnedTopThree: hrCount ? learnedTopThree / hrCount : 0,
    gameFirstTopOne: gameFirstTopOneRate,
    gameFirstTopTwo: gameFirstTopTwoRate,
    gameFirstTopThree: gameFirstTopThreeRate,
    guardedTopOne: guardActive ? marketTopOneRate : gameFirstTopOneRate,
    guardedTopTwo: guardActive ? marketTopTwoRate : gameFirstTopTwoRate,
    guardedTopThree: guardActive ? marketTopThreeRate : gameFirstTopThreeRate,
    guardActive,
    selectedGameCoverage: games.length ? selectedCovered / games.length : 0,
    selectedPlayerPrecision: selectedPlayers ? selectedHits / selectedPlayers : 0,
    countBucketAccuracy: games.length ? countCorrect / games.length : 0,
    noHrAccuracy: noHrCount ? noHrCorrect / noHrCount : 0,
    countMae: games.length ? countError / games.length : 0,
    averageMarketHomerRank: homerCount ? marketRankSum / homerCount : null,
    averageLearnedHomerRank: homerCount ? learnedRankSum / homerCount : null,
    averageGameFirstHomerRank: homerCount ? gameFirstRankSum / homerCount : null,
  }
}

export function trainMarketDnaRanker(rows: MarketDnaRankerRow[], targetDate: string): MarketDnaRankerArtifact {
  const priorRows = rows.filter(row => row.game_date < targetDate)
  const dates = [...new Set(priorRows.map(row => row.game_date))].sort()
  const validationCutoff = dates[Math.max(0, dates.length - 4)]
  let validationResult: MarketDnaRankerValidation | null = null
  if (validationCutoff) {
    const validationTrain = priorRows.filter(row => row.game_date < validationCutoff)
    const validationTest = priorRows.filter(row => row.game_date >= validationCutoff)
    if (validationTrain.length >= 900 && validationTest.length >= 18) validationResult = validate(trainCore(validationTrain), validationTest, validationCutoff)
  }
  const core = trainCore(priorRows)
  return {
    version: 'game-first-gbdt-v5',
    rankingMode: validationResult?.guardActive ? 'market-guard' : 'learned-lanes',
    trainedThrough: dates.at(-1)!,
    trainingRows: core.trainingRows,
    trainingGames: core.trainingGames,
    featureNames: core.featureNames,
    rawKeys: core.rawKeys,
    centers: core.centers,
    scales: core.scales,
    trees: core.trees,
    countModel: core.countModel,
    validation: validationResult,
  }
}

export function scoreMarketDnaVector(artifact: MarketDnaRankerArtifact, featureVector: Record<string, number>) {
  const row: MarketDnaRankerRow = { game_date: '', game_pk: 0, mlb_id: 0, did_hr: false, feature_vector: featureVector }
  const vector = normalizeVector(rawVector(row, artifact.rawKeys), artifact.centers, artifact.scales)
  const rawScore = artifact.trees.reduce((score, tree) => score + .08 * treeValue(tree, vector), 0)
  return { rawScore, probability: sigmoid(rawScore) }
}
