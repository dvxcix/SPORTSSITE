import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const ranges = {
  train: [process.argv[2] ?? '2026-07-25', process.argv[3] ?? '2026-08-03'],
  calibrate: [process.argv[4] ?? '2026-08-04', process.argv[5] ?? '2026-08-07'],
  test: [process.argv[6] ?? '2026-08-08', process.argv[7] ?? '2026-08-11'],
} as const

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Player = Game['players'][number]
type Split = keyof typeof ranges

type Row = {
  split: Split
  date: string
  game: Game
  player: Player
  fhrHit: boolean
  hrHit: boolean
  predicates: string[]
}

const finiteMean = (values: Array<number | null | undefined>) => {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null
}

function datesBetween(start: string, end: string) {
  const dates: string[] = []
  for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function addThresholds(target: string[], label: string, value: number | null, thresholds: number[], direction: 'gte' | 'lte') {
  if (value == null) return
  for (const threshold of thresholds) {
    if (direction === 'gte' ? value >= threshold : value <= threshold) target.push(`${label}${direction === 'gte' ? '>=' : '<='}${threshold}`)
  }
}

function predicatesFor(player: Player, game: Game) {
  const p: string[] = []
  const paper = finiteMean(Object.values(player.paperRank ?? {}))
  const book = finiteMean(Object.values(player.bookRank ?? {}))
  const mm = finiteMean(Object.values(player.mm ?? {}))
  const paperBookGap = paper == null || book == null ? null : book - paper
  const peer = game.players.filter(candidate => candidate.mlbId !== player.mlbId && candidate.fhr.current === player.fhr.current)
  const bestPeerFhrMove = peer.length ? Math.max(...peer.map(candidate => candidate.movement.fhrImpliedPoints ?? -99)) : null
  const bestPeerHrMove = peer.length ? Math.max(...peer.map(candidate => candidate.movement.hrImpliedPoints ?? -99)) : null
  const maxPeerPublic = peer.length ? Math.max(...peer.map(candidate => candidate.publicRank ?? 0)) : null

  p.push(`profile=${game.diagnostics.boardProfile}`)
  if (game.diagnostics.noHrImpliedPct != null) {
    addThresholds(p, 'nohr<=', game.diagnostics.noHrImpliedPct, [13, 15, 17, 19, 21], 'lte')
    addThresholds(p, 'nohr>=', game.diagnostics.noHrImpliedPct, [13, 15, 17, 19, 21], 'gte')
  }
  if (player.battingOrder <= 3) p.push('order<=3')
  if (player.battingOrder <= 5) p.push('order<=5')
  if (player.battingOrder >= 6) p.push('order>=6')
  if (player.battingOrder >= 8) p.push('order>=8')
  addThresholds(p, 'fhrRank<=', player.fhrRank, [1, 2, 3, 5, 8, 12], 'lte')
  addThresholds(p, 'fhrRank>=', player.fhrRank, [4, 7, 10, 13, 15], 'gte')
  addThresholds(p, 'hrRank<=', player.hrRank, [1, 2, 3, 5, 8, 12], 'lte')
  addThresholds(p, 'hrRank>=', player.hrRank, [4, 7, 10, 13, 15], 'gte')
  if (player.fhrTieSize === 1) p.push('fhrUnique')
  if (player.fhrTieSize === 2) p.push('fhrTie2')
  if (player.fhrTieSize >= 2) p.push('fhrTied')
  if (player.hrTieSize >= 2) p.push('hrTied')
  addThresholds(p, 'fhrMove>=', player.movement.fhrImpliedPoints, [0, 0.2, 0.5, 1, 2], 'gte')
  addThresholds(p, 'fhrMove<=', player.movement.fhrImpliedPoints, [0, -0.2, -0.5, -1, -2], 'lte')
  addThresholds(p, 'hrMove>=', player.movement.hrImpliedPoints, [0, 0.2, 0.5, 1, 2], 'gte')
  addThresholds(p, 'hrMove<=', player.movement.hrImpliedPoints, [0, -0.2, -0.5, -1, -2], 'lte')
  addThresholds(p, 'fhrBase>=', player.fhrBaselineDeltaPct, [-10, 0, 10, 20, 30], 'gte')
  addThresholds(p, 'fhrBase<=', player.fhrBaselineDeltaPct, [10, 0, -10, -20, -30], 'lte')
  addThresholds(p, 'hrBase>=', player.hrBaselineDeltaPct, [-10, 0, 10, 20, 30], 'gte')
  addThresholds(p, 'hrBase<=', player.hrBaselineDeltaPct, [10, 0, -10, -20, -30], 'lte')
  addThresholds(p, 'publicRank>=', player.publicRank, [4, 7, 10, 13, 16], 'gte')
  addThresholds(p, 'publicRank<=', player.publicRank, [1, 3, 5, 8, 12], 'lte')
  addThresholds(p, 'publicShare<=', player.publicSharePct, [1, 2, 4, 7, 12], 'lte')
  addThresholds(p, 'contact>=', player.contactAcceleration, [-10, 0, 10, 20, 30], 'gte')
  addThresholds(p, 'contact<=', player.contactAcceleration, [10, 0, -10, -20], 'lte')
  addThresholds(p, 'paper<=', paper, [2, 4, 6, 9, 12], 'lte')
  addThresholds(p, 'book<=', book, [2, 4, 6, 9, 12], 'lte')
  addThresholds(p, 'paperBookGap>=', paperBookGap, [2, 4, 6, 9], 'gte')
  addThresholds(p, 'mm>=', mm, [0, 1, 2, 4], 'gte')
  addThresholds(p, 'cash>=', player.cashStackSupportScore, [50, 65, 80], 'gte')
  addThresholds(p, 'alt>=', player.alternativePathScore, [50, 65, 80], 'gte')
  addThresholds(p, 'crossBook>=', player.crossBookSupportScore, [50, 65, 80, 90], 'gte')
  addThresholds(p, 'decoy<=', player.decoyRiskScore, [10, 20, 30, 40, 55], 'lte')
  addThresholds(p, 'redirected>=', player.publicPattern.redirectedExposureScore, [40, 55, 70], 'gte')
  if (player.movement.powerShortened >= 1) p.push('powerShort>=1')
  if (player.movement.powerShortened >= 2) p.push('powerShort>=2')
  if (player.movement.powerLengthened >= 1) p.push('powerLong>=1')
  if (player.movement.powerLengthened >= 2) p.push('powerLong>=2')
  if (player.movement.nonPowerShortened >= 2) p.push('nonPowerShort>=2')
  if (player.movement.nonPowerShortened >= 4) p.push('nonPowerShort>=4')
  if (player.fhrTieSize >= 2 && bestPeerFhrMove != null && (player.movement.fhrImpliedPoints ?? -99) >= bestPeerFhrMove) p.push('tieBestFhrMove')
  if (player.fhrTieSize >= 2 && bestPeerHrMove != null && (player.movement.hrImpliedPoints ?? -99) <= bestPeerHrMove) p.push('tieMostProtectedHrMove')
  if (player.fhrTieSize >= 2 && maxPeerPublic != null && (player.publicRank ?? 0) >= maxPeerPublic) p.push('tieMostHiddenPublic')
  return [...new Set(p)]
}

const rows: Row[] = []
for (const split of Object.keys(ranges) as Split[]) {
  for (const date of datesBetween(ranges[split][0], ranges[split][1])) {
    const slate = await buildHrIntelligenceSlate(date)
    for (const game of slate.games) {
      if (!game.validation || game.players.length !== 18 || game.diagnostics.picksCoveragePct < 80 || game.diagnostics.crossMarketPicksCoveragePct < 70) continue
      const hrs = new Set(game.validation.hrMlbIds)
      for (const player of game.players) rows.push({
        split,
        date,
        game,
        player,
        fhrHit: game.validation.firstHrMlbId === player.mlbId,
        hrHit: hrs.has(player.mlbId),
        predicates: predicatesFor(player, game),
      })
    }
  }
}

type Metric = { selected: number; hits: number; precision: number; games: number }
function metric(rule: string[], split: Split, target: 'fhrHit' | 'hrHit'): Metric {
  const selected = rows.filter(row => row.split === split && rule.every(predicate => row.predicates.includes(predicate)))
  const hits = selected.filter(row => row[target]).length
  return { selected: selected.length, hits, precision: selected.length ? hits / selected.length : 0, games: new Set(selected.map(row => `${row.date}:${row.game.gameKey}`)).size }
}

function wilsonLower(hits: number, total: number, z = 1.645) {
  if (!total) return 0
  const p = hits / total
  const denominator = 1 + z * z / total
  return (p + z * z / (2 * total) - z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / denominator
}

const predicateSupport = new Map<string, number>()
for (const row of rows.filter(row => row.split === 'train')) {
  for (const predicate of row.predicates) predicateSupport.set(predicate, (predicateSupport.get(predicate) ?? 0) + 1)
}
const predicates = [...predicateSupport.entries()].filter(([, count]) => count >= 8).map(([name]) => name)
const candidates: string[][] = predicates.map(predicate => [predicate])
for (let i = 0; i < predicates.length; i += 1) {
  for (let j = i + 1; j < predicates.length; j += 1) candidates.push([predicates[i], predicates[j]])
}
for (const target of ['fhrHit', 'hrHit'] as const) {
  const pairSurvivors = candidates.filter(rule => {
    const train = metric(rule, 'train', target)
    return rule.length === 2 && train.selected >= 5 && train.precision >= 0.35
  })
  const triples: string[][] = []
  for (const pair of pairSurvivors) {
    const lastIndex = predicates.indexOf(pair[1])
    for (let k = lastIndex + 1; k < predicates.length; k += 1) triples.push([...pair, predicates[k]])
  }
  const all = [...candidates, ...triples]
  const scored = all.map(rule => {
    const train = metric(rule, 'train', target)
    const calibrate = metric(rule, 'calibrate', target)
    const combinedHits = train.hits + calibrate.hits
    const combinedSelected = train.selected + calibrate.selected
    return {
      rule,
      train,
      calibrate,
      test: metric(rule, 'test', target),
      lower: wilsonLower(combinedHits, combinedSelected),
    }
  }).filter(result => result.train.selected >= 4 && result.calibrate.selected >= 2 && result.train.precision >= 0.5 && result.calibrate.precision >= 0.5)
    .sort((left, right) => right.lower - left.lower || (right.train.selected + right.calibrate.selected) - (left.train.selected + left.calibrate.selected))
    .slice(0, 40)

  process.stdout.write(`${JSON.stringify({ target, rowCounts: Object.fromEntries((Object.keys(ranges) as Split[]).map(split => [split, rows.filter(row => row.split === split).length])), rules: scored }, null, 2)}\n`)
}
