import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData.ts')
const trainEnd = process.argv[2] ?? '2026-08-08'
const holdoutEnd = process.argv[3] ?? '2026-08-12'

type Row = { date: string; game: string; name: string; y: number; fhrY: number; x: number[] }
const featureNames = [
  'selection','regime','anytime','fhr','modelFhr','contradiction','structural','protected','containment','tieBreak','confirmed',
  'advertised','decoySafety','cash','alternative','crossBook','contact','fhrRank','hrRank','publicQuiet','publicRedirect','publicDivergence',
  'fhrBaseline','hrBaseline','fhrMove','hrMove','powerShort','powerLong','nonPowerShort','nonPowerLong','hiddenPower','pwr','battingOrder',
  'paToHr','hrToRbi','hrToHrr','hrToTb4','hrToMl','mgmToFd','clustered','active','quiet','lowHr',
]
const value = (n: number | null | undefined, fallback = 0) => n == null || !Number.isFinite(n) ? fallback : n
const rows: Row[] = []
for (let day = 1; day <= 12; day += 1) {
  const date = `2026-08-${String(day).padStart(2, '0')}`
  const slate = await buildHrIntelligenceSlate(date)
  for (const game of slate.games) {
    if (!game.validation) continue
    const actual = new Set(game.validation.hrMlbIds)
    for (const p of game.players) rows.push({
      date, game: game.gameKey, name: p.name, y: actual.has(p.mlbId) ? 1 : 0,
      fhrY: game.validation.firstHrMlbId === p.mlbId ? 1 : 0,
      x: [
        p.selectionScore,p.regimeScore,p.anytimeScore,p.fhrScore,p.modelFhrScore,p.contradictionScore,p.structuralPowerScore,
        p.archetypeScores.protected,p.archetypeScores.containment,p.tieBreakScore,p.archetypeScores.marketConfirmed,p.advertisedScore,
        100-p.decoyRiskScore,p.cashStackSupportScore,p.alternativePathScore,p.crossBookSupportScore,p.contactAcceleration,
        p.fhrRank == null ? 0 : 19-p.fhrRank,p.hrRank == null ? 0 : 19-p.hrRank,p.publicRank == null ? 0 : p.publicRank,
        value(p.publicPattern.redirectedExposureScore),value(p.publicPattern.crossMarketDivergencePct),value(p.fhrBaselineDeltaPct),
        value(p.hrBaselineDeltaPct),value(p.movement.fhrImpliedPoints),value(p.movement.hrImpliedPoints),p.movement.powerShortened,
        p.movement.powerLengthened,p.movement.nonPowerShortened,p.movement.nonPowerLengthened,p.movement.hiddenPowerContradiction,
        p.isPowerCandidate ? 1 : 0,10-p.battingOrder,value(p.ratios.paToHr),value(p.ratios.hrToRbi),value(p.ratios.hrToHrr),
        value(p.ratios.hrToTb4),value(p.ratios.hrToMoneyline),value(p.ratios.mgmToFanduel),
        game.diagnostics.boardProfile === 'clustered' ? 1 : 0,game.diagnostics.boardProfile === 'active' ? 1 : 0,
        game.diagnostics.boardProfile === 'quiet' ? 1 : 0,game.diagnostics.boardProfile === 'low-hr' ? 1 : 0,
      ],
    })
  }
}

const train = rows.filter(row => row.date <= trainEnd)
const holdout = rows.filter(row => row.date > trainEnd && row.date <= holdoutEnd)
const means = featureNames.map((_, index) => train.reduce((sum, row) => sum + row.x[index], 0) / train.length)
const sds = featureNames.map((_, index) => Math.sqrt(train.reduce((sum, row) => sum + (row.x[index] - means[index]) ** 2, 0) / train.length) || 1)
const scale = (row: Row) => row.x.map((n, index) => (n - means[index]) / sds[index])
const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, z))))
const weights = Array(featureNames.length).fill(0) as number[]
let intercept = Math.log((train.filter(row => row.y).length + 1) / (train.filter(row => !row.y).length + 1))
for (let iteration = 0; iteration < 4500; iteration += 1) {
  const gradient = Array(weights.length).fill(0) as number[]
  let interceptGradient = 0
  for (const row of train) {
    const x = scale(row)
    const prediction = sigmoid(x.reduce((sum, n, index) => sum + n * weights[index], intercept))
    const error = prediction - row.y
    interceptGradient += error
    for (let index = 0; index < weights.length; index += 1) gradient[index] += error * x[index]
  }
  const rate = 0.08
  for (let index = 0; index < weights.length; index += 1) weights[index] -= rate * (gradient[index] / train.length + 0.003 * weights[index])
  intercept -= rate * interceptGradient / train.length
}
const score = (row: Row) => sigmoid(scale(row).reduce((sum, n, index) => sum + n * weights[index], intercept))
type Stump = { feature: number; threshold: number; left: number; right: number }
function fitBoosted(target: 'y' | 'fhrY', rounds = 240, learningRate = 0.075) {
  const positives = train.filter(row => row[target]).length
  const base = Math.log((positives + 1) / (train.length - positives + 1))
  const trainScores = Array(train.length).fill(base) as number[]
  const stumps: Stump[] = []
  const thresholds = featureNames.map((_, feature) => {
    const sorted = train.map(row => scale(row)[feature]).sort((a,b) => a-b)
    return [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9].map(q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))])
  })
  const scaledTrain = train.map(scale)
  for (let round = 0; round < rounds; round += 1) {
    const residuals = train.map((row, index) => row[target] - sigmoid(trainScores[index]))
    let best: { stump: Stump; loss: number } | null = null
    for (let feature = 0; feature < featureNames.length; feature += 1) for (const threshold of thresholds[feature]) {
      let leftSum = 0, leftN = 0, rightSum = 0, rightN = 0
      for (let index = 0; index < train.length; index += 1) {
        if (scaledTrain[index][feature] <= threshold) { leftSum += residuals[index]; leftN += 1 } else { rightSum += residuals[index]; rightN += 1 }
      }
      if (leftN < 12 || rightN < 12) continue
      const left = leftSum / leftN, right = rightSum / rightN
      let loss = 0
      for (let index = 0; index < train.length; index += 1) {
        const prediction = scaledTrain[index][feature] <= threshold ? left : right
        loss += (residuals[index] - prediction) ** 2
      }
      if (!best || loss < best.loss) best = { stump: { feature, threshold, left: left * learningRate, right: right * learningRate }, loss }
    }
    if (!best) break
    stumps.push(best.stump)
    for (let index = 0; index < train.length; index += 1) trainScores[index] += scaledTrain[index][best.stump.feature] <= best.stump.threshold ? best.stump.left : best.stump.right
  }
  const predict = (row: Row) => {
    const x = scale(row)
    return sigmoid(stumps.reduce((sum, stump) => sum + (x[stump.feature] <= stump.threshold ? stump.left : stump.right), base))
  }
  return { base, stumps, predict }
}
function grade(set: Row[], scorer = score, target: 'y' | 'fhrY' = 'y') {
  const games = new Map<string, Row[]>()
  for (const row of set) games.set(`${row.date}:${row.game}`, [...(games.get(`${row.date}:${row.game}`) ?? []), row])
  const out: Record<string, number> = {}
  const hrGames = [...games.values()].filter(game => game.some(row => row[target])).length
  for (const k of [1,2,3,4,5,6,8,10]) {
    const hits = [...games.values()].filter(game => game.some(row => row[target]) && [...game].sort((a,b) => scorer(b)-scorer(a)).slice(0,k).some(row => row[target])).length
    out[k] = Math.round(hits / Math.max(1, hrGames) * 1000) / 10
  }
  return { hrGames, gameRecallAtK: out }
}
const anytimeBoosted = fitBoosted('y')
const fhrBoosted = fitBoosted('fhrY')
process.stdout.write(`${JSON.stringify({
  split: { trainEnd, holdoutEnd },
  logistic: { train: grade(train), holdout: grade(holdout) },
  boostedAnytime: { train: grade(train, anytimeBoosted.predict), holdout: grade(holdout, anytimeBoosted.predict) },
  boostedFhr: { train: grade(train, fhrBoosted.predict, 'fhrY'), holdout: grade(holdout, fhrBoosted.predict, 'fhrY') },
  coefficients: featureNames.map((name, index) => ({ name, weight: Math.round(weights[index] * 1000) / 1000 }))
    .sort((a,b) => Math.abs(b.weight)-Math.abs(a.weight)),
  frozen: {
    featureNames,
    rawCoefficients: weights.map((weight, index) => weight / sds[index]),
    rawIntercept: intercept - weights.reduce((sum, weight, index) => sum + weight * means[index] / sds[index], 0),
  },
}, null, 2)}\n`)
