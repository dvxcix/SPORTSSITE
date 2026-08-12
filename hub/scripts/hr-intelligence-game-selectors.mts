import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const ranges = {
  train: [process.argv[2] ?? '2026-07-17', process.argv[3] ?? '2026-07-31'],
  calibrate: [process.argv[4] ?? '2026-08-01', process.argv[5] ?? '2026-08-07'],
  test: [process.argv[6] ?? '2026-08-08', process.argv[7] ?? '2026-08-11'],
} as const

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData.ts')
type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Player = Game['players'][number]
type Split = keyof typeof ranges

type Selector = {
  name: string
  score: (player: Player, game: Game) => number
}

type Pick = {
  split: Split
  date: string
  game: Game
  player: Player
  selector: string
  margin: number
  fhrHit: boolean
  hrHit: boolean
  predicates: string[]
}

const finiteMean = (values: Array<number | null | undefined>) => {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null
}
const value = (input: number | null | undefined, fallback = -999) => typeof input === 'number' && Number.isFinite(input) ? input : fallback
const inverseRank = (rank: number | null, count: number) => rank == null ? 0 : (count + 1 - rank) / count * 100
const meanRank = (rank: Player['paperRank']) => finiteMean(Object.values(rank ?? {}))

const selectors: Selector[] = [
  { name: 'selection', score: player => player.selectionScore },
  { name: 'contradiction', score: player => player.contradictionScore },
  { name: 'model', score: player => player.modelFhrScore },
  { name: 'fhr-score', score: player => player.fhrScore },
  { name: 'anytime-score', score: player => player.anytimeScore },
  { name: 'tie-break', score: player => player.tieBreakScore },
  { name: 'cash-stack', score: player => player.cashStackSupportScore },
  { name: 'alternative-path', score: player => player.alternativePathScore },
  { name: 'cross-book', score: player => player.crossBookSupportScore },
  { name: 'contact', score: player => player.contactAcceleration },
  { name: 'paper', score: (player, game) => inverseRank(meanRank(player.paperRank), game.players.length) },
  { name: 'book', score: (player, game) => inverseRank(meanRank(player.bookRank), game.players.length) },
  { name: 'mm', score: player => value(finiteMean(Object.values(player.mm ?? {}))) },
  { name: 'fhr-price', score: (player, game) => inverseRank(player.fhrRank, game.players.length) },
  { name: 'hr-price', score: (player, game) => inverseRank(player.hrRank, game.players.length) },
  { name: 'hidden-public', score: player => value(player.publicRank, 1) + value(player.publicPattern.redirectedExposureScore, 0) / 10 },
  { name: 'protected-market', score: player => value(player.crossBookSupportScore, 0) + value(player.cashStackSupportScore, 0) - player.decoyRiskScore },
  { name: 'form-v-market-gap', score: player => inverseRank(meanRank(player.paperRank), 18) - inverseRank(meanRank(player.bookRank), 18) + player.contactAcceleration / 4 },
]

function datesBetween(start: string, end: string) {
  const dates: string[] = []
  for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function addThresholds(target: string[], label: string, input: number | null, thresholds: number[], direction: 'gte' | 'lte') {
  if (input == null) return
  for (const threshold of thresholds) {
    if (direction === 'gte' ? input >= threshold : input <= threshold) target.push(`${label}${direction === 'gte' ? '>=' : '<='}${threshold}`)
  }
}

function predicatesFor(player: Player, game: Game, selector: string, margin: number) {
  const predicates = [`selector=${selector}`, `profile=${game.diagnostics.boardProfile}`]
  const paper = meanRank(player.paperRank)
  const book = meanRank(player.bookRank)
  const mm = finiteMean(Object.values(player.mm ?? {}))
  const gap = paper == null || book == null ? null : book - paper
  const fhrMove = player.movement.fhrImpliedPoints
  const hrMove = player.movement.hrImpliedPoints
  const noHr = game.diagnostics.noHrImpliedPct
  if (player.battingOrder <= 3) predicates.push('order<=3')
  if (player.battingOrder <= 5) predicates.push('order<=5')
  if (player.battingOrder >= 6) predicates.push('order>=6')
  if (player.battingOrder >= 8) predicates.push('order>=8')
  if (player.fhrTieSize === 1) predicates.push('fhr-unique')
  if (player.fhrTieSize === 2) predicates.push('fhr-tie2')
  if (player.fhrTieSize >= 2) predicates.push('fhr-tied')
  if (player.contextReset) predicates.push('context-reset')
  addThresholds(predicates, 'margin>=', margin, [0, 1, 2, 4, 6, 10, 15, 20], 'gte')
  addThresholds(predicates, 'fhr-rank<=', player.fhrRank, [1, 2, 3, 5, 8, 12], 'lte')
  addThresholds(predicates, 'fhr-rank>=', player.fhrRank, [4, 7, 10, 13, 15], 'gte')
  addThresholds(predicates, 'hr-rank<=', player.hrRank, [1, 2, 3, 5, 8, 12], 'lte')
  addThresholds(predicates, 'public-rank>=', player.publicRank, [4, 7, 10, 13, 16], 'gte')
  addThresholds(predicates, 'public-rank<=', player.publicRank, [1, 3, 5, 8], 'lte')
  addThresholds(predicates, 'nohr<=', noHr, [13, 15, 17, 19, 21], 'lte')
  addThresholds(predicates, 'nohr>=', noHr, [13, 15, 17, 19, 21], 'gte')
  addThresholds(predicates, 'fhr-move>=', fhrMove, [0, 0.2, 0.5, 1, 2], 'gte')
  addThresholds(predicates, 'fhr-move<=', fhrMove, [0, -0.2, -0.5, -1, -2], 'lte')
  addThresholds(predicates, 'hr-move>=', hrMove, [0, 0.2, 0.5, 1, 2], 'gte')
  addThresholds(predicates, 'hr-move<=', hrMove, [0, -0.2, -0.5, -1, -2], 'lte')
  addThresholds(predicates, 'fhr-base>=', player.fhrBaselineDeltaPct, [-10, 0, 10, 20, 30], 'gte')
  addThresholds(predicates, 'fhr-base<=', player.fhrBaselineDeltaPct, [10, 0, -10, -20, -30], 'lte')
  addThresholds(predicates, 'hr-base>=', player.hrBaselineDeltaPct, [-10, 0, 10, 20, 30], 'gte')
  addThresholds(predicates, 'hr-base<=', player.hrBaselineDeltaPct, [10, 0, -10, -20, -30], 'lte')
  addThresholds(predicates, 'contact>=', player.contactAcceleration, [0, 10, 20, 30], 'gte')
  addThresholds(predicates, 'paper<=', paper, [2, 4, 6, 9], 'lte')
  addThresholds(predicates, 'book<=', book, [2, 4, 6, 9], 'lte')
  addThresholds(predicates, 'paper-book-gap>=', gap, [2, 4, 6], 'gte')
  addThresholds(predicates, 'mm>=', mm, [0, 1, 2, 4], 'gte')
  addThresholds(predicates, 'cash>=', player.cashStackSupportScore, [50, 65, 80], 'gte')
  addThresholds(predicates, 'alt>=', player.alternativePathScore, [50, 65, 80], 'gte')
  addThresholds(predicates, 'cross-book>=', player.crossBookSupportScore, [50, 65, 80, 90], 'gte')
  addThresholds(predicates, 'decoy<=', player.decoyRiskScore, [10, 20, 30, 40], 'lte')
  if (player.movement.powerShortened >= 2) predicates.push('power-short>=2')
  if (player.movement.powerLengthened >= 2) predicates.push('power-long>=2')
  if (player.movement.nonPowerShortened >= 4) predicates.push('non-power-short>=4')
  return [...new Set(predicates)]
}

const picks: Pick[] = []
for (const split of Object.keys(ranges) as Split[]) {
  for (const date of datesBetween(ranges[split][0], ranges[split][1])) {
    const slate = await buildHrIntelligenceSlate(date)
    for (const game of slate.games) {
      if (!game.validation || game.players.length !== 18 || game.diagnostics.picksCoveragePct < 80 || game.diagnostics.crossMarketPicksCoveragePct < 70) continue
      const hrs = new Set(game.validation.hrMlbIds)
      for (const selector of selectors) {
        const ranked = game.players.map(player => ({ player, score: selector.score(player, game) }))
          .sort((left, right) => right.score - left.score || left.player.battingOrder - right.player.battingOrder)
        const leader = ranked[0]
        if (!leader) continue
        const margin = leader.score - (ranked[1]?.score ?? leader.score)
        picks.push({
          split,
          date,
          game,
          player: leader.player,
          selector: selector.name,
          margin,
          fhrHit: game.validation.firstHrMlbId === leader.player.mlbId,
          hrHit: hrs.has(leader.player.mlbId),
          predicates: predicatesFor(leader.player, game, selector.name, margin),
        })
      }
    }
  }
}

type Metric = { selected: number; hits: number; precision: number; games: number }
function metric(rule: string[], split: Split, target: 'fhrHit' | 'hrHit'): Metric {
  const matching = picks.filter(pick => pick.split === split && rule.every(predicate => pick.predicates.includes(predicate)))
  // Multiple selectors can choose the same player in the same game. That is
  // selector agreement, not independent evidence, so count the player once.
  const selected = [...new Map(matching.map(pick => [
    `${pick.date}:${pick.game.gameKey}:${pick.player.mlbId}`,
    pick,
  ])).values()]
  const hits = selected.filter(pick => pick[target]).length
  return { selected: selected.length, hits, precision: selected.length ? hits / selected.length : 0, games: new Set(selected.map(pick => `${pick.date}:${pick.game.gameKey}`)).size }
}

function wilsonLower(hits: number, total: number, z = 1.645) {
  if (!total) return 0
  const p = hits / total
  const denominator = 1 + z * z / total
  return (p + z * z / (2 * total) - z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / denominator
}

for (const target of ['fhrHit', 'hrHit'] as const) {
  const minimum = target === 'fhrHit'
    ? { trainGames: 15, calibrationGames: 8, precision: 0.55 }
    : { trainGames: 12, calibrationGames: 6, precision: 0.65 }
  const support = new Map<string, number>()
  for (const pick of picks.filter(pick => pick.split === 'train')) {
    for (const predicate of pick.predicates) support.set(predicate, (support.get(predicate) ?? 0) + 1)
  }
  const predicates = [...support.entries()].filter(([, count]) => count >= 4).map(([name]) => name)
  const pairs: string[][] = []
  for (let i = 0; i < predicates.length; i += 1) {
    for (let j = i + 1; j < predicates.length; j += 1) pairs.push([predicates[i], predicates[j]])
  }
  const pairSurvivors = pairs.filter(rule => {
    const train = metric(rule, 'train', target)
    return train.games >= minimum.trainGames && train.precision >= minimum.precision
  })
  const triples: string[][] = []
  for (const pair of pairSurvivors) {
    const lastIndex = predicates.indexOf(pair[1])
    for (let index = lastIndex + 1; index < predicates.length; index += 1) triples.push([...pair, predicates[index]])
  }
  const scored = [...pairs, ...triples].map(rule => {
    const train = metric(rule, 'train', target)
    const calibrate = metric(rule, 'calibrate', target)
    return {
      rule,
      train,
      calibrate,
      test: metric(rule, 'test', target),
      lower: wilsonLower(train.hits + calibrate.hits, train.selected + calibrate.selected),
    }
  }).filter(result => result.train.games >= minimum.trainGames && result.calibrate.games >= minimum.calibrationGames &&
    result.train.precision >= minimum.precision &&
    result.calibrate.precision >= minimum.precision)
    .sort((left, right) => right.lower - left.lower || (right.train.selected + right.calibrate.selected) - (left.train.selected + left.calibrate.selected))
    .slice(0, 30)

  process.stdout.write(`${JSON.stringify({ target, rowCounts: Object.fromEntries((Object.keys(ranges) as Split[]).map(split => [split, picks.filter(pick => pick.split === split).length])), selectors: selectors.length, rules: scored }, null, 2)}\n`)
}
