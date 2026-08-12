import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const trainingStart = process.argv[2] ?? '2026-07-25'
const trainingEnd = process.argv[3] ?? '2026-08-03'
const holdoutStart = process.argv[4] ?? '2026-08-04'
const holdoutEnd = process.argv[5] ?? '2026-08-11'
const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
if (![trainingStart, trainingEnd, holdoutStart, holdoutEnd].every(valid)) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-calibrate.mts TRAIN_START TRAIN_END HOLDOUT_START HOLDOUT_END')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const { americanImplied } = await import('../src/lib/hrIntelligence')
type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Player = Game['players'][number]

const clamp = (value: number, min = -1, max = 1) => Math.max(min, Math.min(max, value))
const mean = (values: Array<number | null | undefined>) => {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0
}
const viability = (rank: number | null, count: number) => rank == null || count < 2 ? 0 : 1 - (rank - 1) / (count - 1)

const FEATURE_NAMES = [
  'fhr_market', 'hr_market', 'batting_order', 'fhr_move', 'hr_move', 'fhr_baseline', 'hr_baseline',
  'fhr_tie', 'contact', 'mm', 'hidden_power', 'power_net', 'non_power_net',
] as const

function features(player: Player, game: Game) {
  const count = game.players.length
  return [
    viability(player.fhrRank, count),
    viability(player.hrRank, count),
    clamp((9 - player.battingOrder) / 8, 0, 1),
    clamp((player.movement.fhrImpliedPoints ?? 0) / 3),
    clamp((player.movement.hrImpliedPoints ?? 0) / 3),
    clamp((player.fhrBaselineDeltaPct ?? 0) / 50),
    clamp((player.hrBaselineDeltaPct ?? 0) / 50),
    clamp((player.fhrTieSize - 1) / 4, 0, 1),
    clamp(player.contactAcceleration / 50),
    clamp(mean(Object.values(player.mm ?? {})) / 10),
    clamp(player.movement.hiddenPowerContradiction / 100, 0, 1),
    clamp((player.movement.powerShortened - player.movement.powerLengthened) / 4),
    clamp((player.movement.nonPowerShortened - player.movement.nonPowerLengthened) / 6),
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

function trainSoftmax(games: Game[], labelFor: (game: Game) => number | null) {
  const weights = new Array(FEATURE_NAMES.length).fill(0)
  const learningRate = 0.08
  for (let epoch = 0; epoch < 900; epoch += 1) {
    const gradient = new Array(weights.length).fill(0)
    let used = 0
    for (const game of games) {
      const label = labelFor(game)
      if (label == null) continue
      const rows = game.players.map(player => features(player, game))
      const scores = rows.map(row => dot(weights, row))
      const maxScore = Math.max(...scores)
      const exp = scores.map(score => Math.exp(score - maxScore))
      const denom = exp.reduce((sum, value) => sum + value, 0)
      game.players.forEach((player, playerIndex) => {
        const error = exp[playerIndex] / denom - (player.mlbId === label ? 1 : 0)
        rows[playerIndex].forEach((value, featureIndex) => { gradient[featureIndex] += error * value })
      })
      used += 1
    }
    weights.forEach((weight, index) => {
      weights[index] -= learningRate * (gradient[index] / Math.max(1, used) + weight * 0.002)
    })
  }
  return weights
}

function trainAnytime(games: Game[]) {
  const weights = new Array(FEATURE_NAMES.length + 1).fill(0)
  const learningRate = 0.04
  for (let epoch = 0; epoch < 700; epoch += 1) {
    const gradient = new Array(weights.length).fill(0)
    let rowsUsed = 0
    for (const game of games) {
      const ids = new Set(game.validation?.hrMlbIds ?? [])
      if (!ids.size) continue
      const positiveWeight = Math.min(8, (game.players.length - ids.size) / ids.size)
      for (const player of game.players) {
        const row = [1, ...features(player, game)]
        const label = ids.has(player.mlbId) ? 1 : 0
        const prediction = 1 / (1 + Math.exp(-dot(weights, row)))
        const sampleWeight = label ? positiveWeight : 1
        row.forEach((value, index) => { gradient[index] += (prediction - label) * value * sampleWeight })
        rowsUsed += sampleWeight
      }
    }
    weights.forEach((weight, index) => {
      weights[index] -= learningRate * (gradient[index] / Math.max(1, rowsUsed) + (index === 0 ? 0 : weight * 0.002))
    })
  }
  return weights
}

function evaluate(games: Game[], fhrWeights: number[], anytimeWeights: number[]) {
  let hrGames = 0
  let fhrTop1 = 0
  let fhrTop3 = 0
  let marketTop1 = 0
  let marketTop3 = 0
  let anyTop1 = 0
  let marketAnyTop1 = 0
  const rows: Array<{ game: string; actual: string | null; model: string | null; modelRank: number; marketRank: number }> = []
  for (const game of games) {
    if (!game.validation || game.validation.actualNoHr || game.validation.firstHrMlbId == null) continue
    hrGames += 1
    const actual = game.validation.firstHrMlbId
    const fhr = [...game.players].sort((a, b) => dot(fhrWeights, features(b, game)) - dot(fhrWeights, features(a, game)))
    const market = [...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1))
    const anytime = [...game.players].sort((a, b) => dot(anytimeWeights, [1, ...features(b, game)]) - dot(anytimeWeights, [1, ...features(a, game)]))
    const marketAny = [...game.players].sort((a, b) => (americanImplied(b.hr.current) ?? -1) - (americanImplied(a.hr.current) ?? -1))
    const ids = new Set(game.validation.hrMlbIds)
    const modelRank = fhr.findIndex(player => player.mlbId === actual) + 1
    const marketRank = market.findIndex(player => player.mlbId === actual) + 1
    if (modelRank === 1) fhrTop1 += 1
    if (modelRank <= 3) fhrTop3 += 1
    if (marketRank === 1) marketTop1 += 1
    if (marketRank <= 3) marketTop3 += 1
    if (anytime[0] && ids.has(anytime[0].mlbId)) anyTop1 += 1
    if (marketAny[0] && ids.has(marketAny[0].mlbId)) marketAnyTop1 += 1
    rows.push({ game: game.gameKey, actual: game.validation.firstHrName, model: fhr[0]?.name ?? null, modelRank, marketRank })
  }
  const pct = (value: number) => hrGames ? Math.round(value / hrGames * 1000) / 10 : null
  return { hrGames, fhrTop1, fhrTop3, marketTop1, marketTop3, anyTop1, marketAnyTop1, rates: { fhrTop1: pct(fhrTop1), fhrTop3: pct(fhrTop3), marketTop1: pct(marketTop1), marketTop3: pct(marketTop3), anyTop1: pct(anyTop1), marketAnyTop1: pct(marketAnyTop1) }, rows }
}

const training = await load(trainingStart, trainingEnd)
const holdout = await load(holdoutStart, holdoutEnd)
const fhrWeights = trainSoftmax(training, game => game.validation?.firstHrMlbId ?? null)
const anytimeWeights = trainAnytime(training)
const coefficients = Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, Math.round(fhrWeights[index] * 10_000) / 10_000]))
const anytimeCoefficients = Object.fromEntries(['intercept', ...FEATURE_NAMES].map((name, index) => [name, Math.round(anytimeWeights[index] * 10_000) / 10_000]))

process.stdout.write(`${JSON.stringify({
  ranges: { training: [trainingStart, trainingEnd], holdout: [holdoutStart, holdoutEnd] },
  samples: { trainingGames: training.length, holdoutGames: holdout.length },
  coefficients,
  anytimeCoefficients,
  training: evaluate(training, fhrWeights, anytimeWeights),
  holdout: evaluate(holdout, fhrWeights, anytimeWeights),
}, null, 2)}\n`)
