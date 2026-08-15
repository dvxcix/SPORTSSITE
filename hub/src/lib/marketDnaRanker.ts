export type MarketDnaRankerRow = {
  game_date: string
  game_pk: number
  mlb_id: number
  did_hr: boolean
  feature_vector: Record<string, number>
}

export type MarketDnaRankerValidation = {
  cutoff: string
  gamesWithHr: number
  marketTopOne: number
  marketTopTwo: number
  learnedTopOne: number
  learnedTopTwo: number
  learnedTopThree: number
  averageMarketHomerRank: number | null
  averageLearnedHomerRank: number | null
}

type BoostNode = {
  feature?: number
  threshold?: number
  left?: BoostNode
  right?: BoostNode
  leaf?: number
}

export type MarketDnaRankerArtifact = {
  version: 'game-relative-gbdt-v2'
  trainedThrough: string
  trainingRows: number
  featureNames: string[]
  rawKeys: string[]
  centers: number[]
  scales: number[]
  trees: BoostNode[]
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
  const powerRank = avg(['market.fhr.rank', 'market.hr.rank'])
  const settlementRank = avg(['market.hrMl.rank', 'market.rbi1.rank', 'market.rbi2.rank', 'market.rbi3.rank', 'market.tb4.rank', 'market.tb5.rank', 'market.hrr.rank'])
  const ordinaryRank = avg(['market.hits1.rank', 'market.hits2.rank', 'market.single.rank', 'market.double.rank', 'market.runs1.rank'])
  const statcastRank = avg(['metric.avgEvL5.rank', 'metric.hardHitL5.rank', 'metric.barrelL10.rank', 'metric.pullAirL5.rank'])
  const publicHr = featureValue(row, 'public.home_runs.share')
  return [
    headlineMove, ordinaryMove, payoffMove,
    headlineMove - ordinaryMove + .5, headlineMove - payoffMove + .5,
    powerRank, settlementRank, ordinaryRank, statcastRank,
    settlementRank - powerRank + .5, statcastRank - powerRank + .5,
    publicHr, powerRank - publicHr + .5,
    featureValue(row, 'context.traffic'),
    featureValue(row, 'market.hr.probability'), featureValue(row, 'market.fhr.probability'),
    featureValue(row, 'metric.fhrVsAveragePct.value'), featureValue(row, 'metric.hrVsAveragePct.value'),
  ]
}

const DERIVED_NAMES = [
  'd.headlineMove', 'd.ordinaryMove', 'd.payoffMove', 'd.headlineVsOrdinary', 'd.headlineVsPayoff',
  'd.powerRank', 'd.settlementRank', 'd.ordinaryRank', 'd.statcastRank', 'd.settlementVsPower',
  'd.statcastVsPower', 'd.publicHr', 'd.powerVsPublic', 'd.traffic', 'd.hrProbability', 'd.fhrProbability',
  'd.fhrBaseline', 'd.hrBaseline',
]

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

function fitNode(
  indexes: number[],
  vectors: number[][],
  thresholds: number[][],
  gradients: Float64Array,
  hessians: Float64Array,
  depth: number,
): BoostNode {
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

function trainCore(rows: MarketDnaRankerRow[]) {
  const completeGames = groupCompleteGames(rows).filter(game => game.some(row => row.did_hr))
  const trainingRows = completeGames.flat()
  if (trainingRows.length < 900) throw new Error('Market DNA needs at least 50 complete historical games before training the learned reducer.')
  const { rawKeys, featureNames } = buildFeatureSpace(trainingRows)
  const rawVectors = trainingRows.map(row => rawVector(row, rawKeys))
  const centers = featureNames.map((_, index) => mean(rawVectors.map(vector => vector[index])))
  const scales = featureNames.map((_, index) => Math.max(.08, Math.sqrt(mean(rawVectors.map(vector => (vector[index] - centers[index]) ** 2)))))
  const vectors = rawVectors.map(vector => normalizeVector(vector, centers, scales))
  const rowIndexes = new Map(trainingRows.map((row, index) => [rowKey(row), index]))
  const labels = trainingRows.map(row => row.did_hr ? 1 : 0)
  const sampleWeights = new Float64Array(trainingRows.length)
  for (const game of completeGames) {
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
  return { rawKeys, featureNames, centers, scales, trees, trainingRows: trainingRows.length }
}

function scoreWithCore(core: ReturnType<typeof trainCore>, row: MarketDnaRankerRow) {
  const vector = normalizeVector(rawVector(row, core.rawKeys), core.centers, core.scales)
  return core.trees.reduce((score, tree) => score + .08 * treeValue(tree, vector), 0)
}

function validate(core: ReturnType<typeof trainCore>, rows: MarketDnaRankerRow[], cutoff: string): MarketDnaRankerValidation {
  const games = groupCompleteGames(rows).filter(game => game.some(row => row.did_hr))
  let marketTopOne = 0, marketTopTwo = 0, learnedTopOne = 0, learnedTopTwo = 0, learnedTopThree = 0
  let marketRankSum = 0, learnedRankSum = 0, homerCount = 0
  for (const game of games) {
    const actualIds = new Set(game.filter(row => row.did_hr).map(row => row.mlb_id))
    const market = [...game].sort((a, b) => featureValue(b, 'market.hr.probability') - featureValue(a, 'market.hr.probability'))
    const learned = [...game].sort((a, b) => scoreWithCore(core, b) - scoreWithCore(core, a))
    const marketRanks = [...actualIds].map(id => market.findIndex(row => row.mlb_id === id) + 1)
    const learnedRanks = [...actualIds].map(id => learned.findIndex(row => row.mlb_id === id) + 1)
    if (Math.min(...marketRanks) <= 1) marketTopOne++
    if (Math.min(...marketRanks) <= 2) marketTopTwo++
    if (Math.min(...learnedRanks) <= 1) learnedTopOne++
    if (Math.min(...learnedRanks) <= 2) learnedTopTwo++
    if (Math.min(...learnedRanks) <= 3) learnedTopThree++
    marketRankSum += marketRanks.reduce((sum, rank) => sum + rank, 0)
    learnedRankSum += learnedRanks.reduce((sum, rank) => sum + rank, 0)
    homerCount += actualIds.size
  }
  const count = games.length
  return {
    cutoff,
    gamesWithHr: count,
    marketTopOne: count ? marketTopOne / count : 0,
    marketTopTwo: count ? marketTopTwo / count : 0,
    learnedTopOne: count ? learnedTopOne / count : 0,
    learnedTopTwo: count ? learnedTopTwo / count : 0,
    learnedTopThree: count ? learnedTopThree / count : 0,
    averageMarketHomerRank: homerCount ? marketRankSum / homerCount : null,
    averageLearnedHomerRank: homerCount ? learnedRankSum / homerCount : null,
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
    version: 'game-relative-gbdt-v2',
    trainedThrough: dates.at(-1)!,
    trainingRows: core.trainingRows,
    featureNames: core.featureNames,
    rawKeys: core.rawKeys,
    centers: core.centers,
    scales: core.scales,
    trees: core.trees,
    validation: validationResult,
  }
}

export function scoreMarketDnaVector(artifact: MarketDnaRankerArtifact, featureVector: Record<string, number>) {
  const row: MarketDnaRankerRow = { game_date: '', game_pk: 0, mlb_id: 0, did_hr: false, feature_vector: featureVector }
  const vector = normalizeVector(rawVector(row, artifact.rawKeys), artifact.centers, artifact.scales)
  const rawScore = artifact.trees.reduce((score, tree) => score + .08 * treeValue(tree, vector), 0)
  return { rawScore, probability: sigmoid(rawScore) }
}
