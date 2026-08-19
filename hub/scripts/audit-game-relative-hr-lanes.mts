import { buildHrIntelligenceSlate } from '../src/lib/hrIntelligenceData.ts'
import { americanImplied, type HrIntelPlayerResult } from '../src/lib/hrIntelligence.ts'
import { fetchHistoricalGameBundles } from '../src/lib/matrixBacktest.ts'
import { computeGameMechanicsWindows, MECHANICS_WINDOWS, type GameMechanicsWindows } from '../src/lib/hrMechanics.ts'

const START = process.argv[2] ?? '2026-07-16'
const END = process.argv[3] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const DETAIL = process.argv.includes('--details')
const dateRange = (start: string, end: string) => {
  const dates: string[] = []
  for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}
const dates = dateRange(START, END)
const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const gameKey = (date: string, gamePk: number) => `${date}|${gamePk}`
const profitMultiple = (odds: number | null | undefined) => odds == null || !Number.isFinite(odds) || odds === 0
  ? 0
  : odds > 0 ? odds / 100 : 100 / Math.abs(odds)

type Outcome = {
  hr: number
  rbi: number
  hits: number
  totalBases: number
  firstHr: boolean
  hrMl: boolean
}

type AuditRow = {
  date: string
  gamePk: number
  game: string
  team: string
  name: string
  mlbId: number
  battingOrder: number
  noHr: { current: number | null; open: number | null }
  player: HrIntelPlayerResult
  mechanics: Partial<Record<`l${1 | 3 | 5 | 10}`, {
    index: number
    rank: number
    confidence: number
    power: number
    transfer: number
    plane: number
    timing: number
    trajectory: number
    pitcher: number
    trend: number
  }>>
  outcome: Outcome
  features: Record<string, number>
  x: number[]
}

type Tree = { leaf?: number; feature?: number; threshold?: number; left?: Tree; right?: Tree }

function mechanicsForPlayer(windows: GameMechanicsWindows | null, mlbId: number): AuditRow['mechanics'] {
  const output: AuditRow['mechanics'] = {}
  if (!windows) return output
  for (const window of MECHANICS_WINDOWS) {
    const player = windows[window]?.players?.find(candidate => candidate.playerId === mlbId)
    if (!player) continue
    output[`l${window}`] = {
      index: player.scores.overall,
      rank: player.rank,
      confidence: player.scores.confidence,
      power: player.scores.powerFormation,
      transfer: player.scores.transferEfficiency,
      plane: player.scores.planeMatch,
      timing: player.scores.timing,
      trajectory: player.scores.trajectory,
      pitcher: player.scores.pitcherBreakdown,
      trend: player.scores.trend,
    }
  }
  return output
}

function realized(player: HrIntelPlayerResult, game: Awaited<ReturnType<typeof buildHrIntelligenceSlate>>['games'][number]): Outcome {
  const hit = game.validation?.realizedHrOutcomes.find(outcome => outcome.mlbId === player.mlbId)
  return {
    hr: finite(hit?.homeRuns), rbi: finite(hit?.rbi), hits: finite(hit?.hits), totalBases: finite(hit?.totalBases),
    firstHr: Boolean(hit?.firstHr), hrMl: Boolean(hit?.cashedMarkets.includes('HR + team win')),
  }
}

function marketMove(player: HrIntelPlayerResult, key: string) {
  const market = key === 'fhr' ? player.fhr : key === 'hr' ? player.hr : player.markets[key]
  const current = americanImplied(market?.current ?? null)
  const open = americanImplied(market?.open ?? null)
  return current == null || open == null ? 0 : (current - open) * 100
}

function rankMap<T>(items: T[], getter: (item: T) => number, higher = true) {
  const sorted = [...items].sort((a, b) => higher ? getter(b) - getter(a) : getter(a) - getter(b))
  return new Map(sorted.map((item, index) => [item, sorted.length <= 1 ? 1 : 1 - index / (sorted.length - 1)]))
}

function rawFeatures(row: Omit<AuditRow, 'features' | 'x'>, gameRows: Array<Omit<AuditRow, 'features' | 'x'>>) {
  const player = row.player
  const teamRows = gameRows.filter(candidate => candidate.team === row.team)
  const fhrProb = americanImplied(player.fhr.current) ?? 0
  const hrProb = americanImplied(player.hr.current) ?? 0
  const totalHrPicks = gameRows.reduce((sum, candidate) => sum + finite(candidate.player.hrPicks), 0)
  const teamHrPicks = teamRows.reduce((sum, candidate) => sum + finite(candidate.player.hrPicks), 0)
  const allOrder = new Map(teamRows.map(candidate => [candidate.battingOrder, candidate]))
  const at = (offset: number) => allOrder.get(((row.battingOrder + offset - 1 + 9) % 9) + 1)
  const adjacent = [at(-1), at(1)].filter((candidate): candidate is Omit<AuditRow, 'features' | 'x'> => Boolean(candidate))
  const preceding = [at(-1), at(-2), at(-3)].filter((candidate): candidate is Omit<AuditRow, 'features' | 'x'> => Boolean(candidate))
  const ratios = player.ratios
  const mechanics = row.mechanics
  const gameHrProb = gameRows.reduce((sum, candidate) => sum + (americanImplied(candidate.player.hr.current) ?? 0), 0)
  const teamHrProb = teamRows.reduce((sum, candidate) => sum + (americanImplied(candidate.player.hr.current) ?? 0), 0)
  const publicHhi = totalHrPicks ? gameRows.reduce((sum, candidate) => sum + (finite(candidate.player.hrPicks) / totalHrPicks) ** 2, 0) : 0
  const bookValues = (market: 'fhr' | 'hr') => Object.values(player.marketBooks?.[market] ?? {})
    .map(entry => americanImplied(entry?.current ?? null)).filter((value): value is number => value != null)
  const hrBooks = bookValues('hr')
  const fhrBooks = bookValues('fhr')
  const values: Record<string, number> = {
    'market.fhr': fhrProb, 'market.hr': hrProb,
    'market.fhrMove': marketMove(player, 'fhr'), 'market.hrMove': marketMove(player, 'hr'),
    'market.fhrRank': 19 - finite(player.fhrRank, 19), 'market.hrRank': 19 - finite(player.hrRank, 19),
    'market.fhrTie': player.fhrTieSize, 'market.hrTie': player.hrTieSize,
    'market.fhrPct': finite(player.fhrBaselineDeltaPct), 'market.hrPct': finite(player.hrBaselineDeltaPct),
    'market.fhrHrGap': finite(player.fhrBaselineDeltaPct) - finite(player.hrBaselineDeltaPct),
    'public.hrPicks': finite(player.hrPicks),
    'public.gameShare': totalHrPicks ? finite(player.hrPicks) / totalHrPicks : 0,
    'public.teamShare': teamHrPicks ? finite(player.hrPicks) / teamHrPicks : 0,
    'public.rank': finite(player.publicRank, 19),
    'public.redirect': finite(player.publicPattern.redirectedExposureScore),
    'public.crossDivergence': finite(player.publicPattern.crossMarketDivergencePct),
    'public.nonHrExposure': finite(player.publicPattern.nonHrExposurePercentile),
    'public.gameHhi': publicHhi,
    'public.teamTotal': teamHrPicks,
    'market.gameHrSum': gameHrProb,
    'market.teamHrSum': teamHrProb,
    'book.hrCount': hrBooks.length, 'book.fhrCount': fhrBooks.length,
    'book.hrDispersion': hrBooks.length ? Math.max(...hrBooks) - Math.min(...hrBooks) : 0,
    'book.fhrDispersion': fhrBooks.length ? Math.max(...fhrBooks) - Math.min(...fhrBooks) : 0,
    'ratio.mf': finite(ratios.mgmToFanduel, 1), 'ratio.fhrHr': finite(ratios.fhrToHr, 1),
    'ratio.paHr': finite(ratios.paToHr, 1), 'ratio.hrRbi': finite(ratios.hrToRbi, 1),
    'ratio.hrRbi2': finite(ratios.hrToRbi2, 1), 'ratio.hrRbi3': finite(ratios.hrToRbi3, 1),
    'ratio.hrHrr': finite(ratios.hrToHrr, 1), 'ratio.hrTb2': finite(ratios.hrToTb2, 1),
    'ratio.hrTb3': finite(ratios.hrToTb3, 1), 'ratio.hrTb4': finite(ratios.hrToTb4, 1),
    'ratio.hrTb5': finite(ratios.hrToTb5, 1), 'ratio.hr2': finite(ratios.hrToTwoHr, 1),
    'ratio.hrMl': finite(ratios.hrToMoneyline, 1),
    'mm.l1': finite(player.mm?.l1), 'mm.l3': finite(player.mm?.l3), 'mm.l5': finite(player.mm?.l5), 'mm.l10': finite(player.mm?.l10),
    'existing.selection': player.selectionScore, 'existing.structural': player.structuralPowerScore,
    'existing.contradiction': player.contradictionScore, 'existing.form': player.formSupportScore,
    'existing.decoySafe': 100 - player.decoyRiskScore, 'existing.cash': player.cashStackSupportScore,
    'existing.crossBook': player.crossBookSupportScore,
    'context.order': row.battingOrder, 'context.noHr': americanImplied(row.noHr.current) ?? 0,
    'context.adjacentPublic': mean(adjacent.map(candidate => finite(candidate.player.publicSharePct))),
    'context.adjacentHr': mean(adjacent.map(candidate => americanImplied(candidate.player.hr.current) ?? 0)),
    'context.precedingHits': mean(preceding.map(candidate => americanImplied(candidate.player.markets.hits1?.current ?? null) ?? 0)),
    'context.precedingRuns': mean(preceding.map(candidate => americanImplied(candidate.player.markets.runs1?.current ?? null) ?? 0)),
  }
  for (const key of ['hrMl', 'rbi1', 'rbi2', 'rbi3', 'tb2', 'tb3', 'tb4', 'tb5', 'hrr', 'singles', 'doubles', 'triples', 'hits1', 'hits2', 'runs1', 'runs2', 'laser105', 'laser110', 'moonshot', 'pa1', 'hr2']) {
    values[`odds.${key}`] = americanImplied(player.markets[key]?.current ?? null) ?? 0
    values[`move.${key}`] = marketMove(player, key)
  }
  const pickOdds: Record<string, number | null | undefined> = {
    home_runs: player.hr.current, hits: player.markets.hits1?.current, runs: player.markets.runs1?.current,
    rbi: player.markets.rbi1?.current, hits_runs_rbi: player.markets.hrr?.current,
    bases: player.markets.tb2?.current, singles: player.markets.singles?.current,
    doubles: player.markets.doubles?.current, triples: player.markets.triples?.current,
    stolen_bases: player.markets.sb1?.current,
  }
  let guaranteedHrLiability = 0
  for (const key of Object.keys(pickOdds)) {
    const count = finite(player.picksByMarket[key])
    const gameTotal = gameRows.reduce((sum, candidate) => sum + finite(candidate.player.picksByMarket[key]), 0)
    const teamTotal = teamRows.reduce((sum, candidate) => sum + finite(candidate.player.picksByMarket[key]), 0)
    const liability = count * profitMultiple(pickOdds[key])
    values[`picks.${key}`] = count
    values[`picksGameShare.${key}`] = gameTotal ? count / gameTotal : 0
    values[`picksTeamShare.${key}`] = teamTotal ? count / teamTotal : 0
    values[`liability.${key}`] = liability
    if (['home_runs', 'hits', 'runs', 'rbi', 'hits_runs_rbi', 'bases'].includes(key)) guaranteedHrLiability += liability
  }
  const directHrHandle = gameRows.reduce((sum, candidate) => sum + finite(candidate.player.picksByMarket.home_runs), 0)
  values['liability.guaranteedHrStack'] = guaranteedHrLiability
  values['liability.directHrBookNet'] = directHrHandle - finite(player.picksByMarket.home_runs) * (1 + profitMultiple(player.hr.current))
  for (const window of [1, 3, 5, 10] as const) {
    const score = mechanics[`l${window}`]
    values[`mechanics.l${window}.index`] = finite(score?.index)
    values[`mechanics.l${window}.rank`] = score ? 19 - score.rank : 0
    values[`mechanics.l${window}.confidence`] = finite(score?.confidence)
    values[`mechanics.l${window}.power`] = finite(score?.power)
    values[`mechanics.l${window}.transfer`] = finite(score?.transfer)
    values[`mechanics.l${window}.plane`] = finite(score?.plane)
    values[`mechanics.l${window}.timing`] = finite(score?.timing)
    values[`mechanics.l${window}.trajectory`] = finite(score?.trajectory)
    values[`mechanics.l${window}.pitcher`] = finite(score?.pitcher)
    values[`mechanics.l${window}.trend`] = finite(score?.trend)
    const stat = player.windows[`l${window}`]
    for (const metric of ['avgEv', 'maxEv', 'hardHitPct', 'barrelPct', 'pullAirRate', 'avgBatSpeed', 'blastPct', 'squaredUpPct', 'avgAttackAngle', 'idealAttackAngleRate', 'onTimePct', 'missDistance', 'avgLa'] as const) {
      values[`stat.l${window}.${metric}`] = finite(stat?.[metric])
    }
  }
  values['mechanics.indexAcceleration'] = finite(mechanics.l1?.index) - finite(mechanics.l10?.index)
  values['mechanics.planeAcceleration'] = finite(mechanics.l1?.plane) - finite(mechanics.l10?.plane)
  values['mechanics.trajectoryAcceleration'] = finite(mechanics.l1?.trajectory) - finite(mechanics.l10?.trajectory)
  return values
}

const rows: AuditRow[] = []
let cursor = 0
async function worker() {
  while (cursor < dates.length) {
    const date = dates[cursor++]
    const [slate, bundles] = await Promise.all([
      buildHrIntelligenceSlate(date, undefined, { strictPregameFeatures: true }),
      fetchHistoricalGameBundles(date, { strictPregameFeatures: true }),
    ])
    const bundleByPk = new Map(bundles.map(bundle => [bundle.game.gamePk, bundle]))
    for (const game of slate.games) {
      if (game.players.length < 18 || !game.validation) continue
      const bundle = bundleByPk.get(game.gamePk)
      // Saved mechanics rows cannot be trusted for historical grading until
      // their source boundary is proven. Recompute from the newest snapshot
      // strictly before this game instead.
      let mechanics: GameMechanicsWindows | null = null
      if (bundle) try { mechanics = await computeGameMechanicsWindows(bundle.game, date, { strictPregameFeatures: true }) } catch { mechanics = null }
      const base = game.players.map(player => ({
        date, gamePk: game.gamePk, game: game.gameKey, team: player.team, name: player.name, mlbId: player.mlbId,
        battingOrder: player.battingOrder, noHr: bundle?.noHr ?? { current: null, open: null },
        player, mechanics: mechanicsForPlayer(mechanics, player.mlbId), outcome: realized(player, game),
      }))
      const featureRows = base.map(row => ({ ...row, features: rawFeatures(row, base), x: [] }))
      rows.push(...featureRows)
    }
  }
}
await Promise.all([worker(), worker()])

const featureNames = [...new Set(rows.flatMap(row => Object.keys(row.features)))].sort()
for (const row of rows) row.x = featureNames.map(name => finite(row.features[name]))
const grouped = new Map<string, AuditRow[]>()
for (const row of rows) grouped.set(gameKey(row.date, row.gamePk), [...(grouped.get(gameKey(row.date, row.gamePk)) ?? []), row])

// Every raw feature gets both an 18-player game percentile and a nine-player team percentile.
for (const gameRows of grouped.values()) {
  for (let feature = 0; feature < featureNames.length; feature++) {
    const gameRanks = rankMap(gameRows, row => row.x[feature])
    const teamRanks = new Map<AuditRow, number>()
    for (const team of new Set(gameRows.map(row => row.team))) {
      for (const [row, rank] of rankMap(gameRows.filter(candidate => candidate.team === team), row => row.x[feature])) teamRanks.set(row, rank)
    }
    for (const row of gameRows) row.x.push(gameRanks.get(row) ?? .5, teamRanks.get(row) ?? .5)
  }
}
const expandedFeatureNames = [...featureNames, ...featureNames.flatMap(name => [`rank.game.${name}`, `rank.team.${name}`])]

function buildTree(indexes: number[], vectors: number[][], gradients: number[], hessians: number[], thresholds: number[][], depth: number): Tree {
  const gradient = indexes.reduce((sum, index) => sum + gradients[index], 0)
  const hessian = indexes.reduce((sum, index) => sum + hessians[index], 0)
  const leaf = -gradient / (hessian + 4)
  if (!depth || indexes.length < 60) return { leaf }
  let best: { gain: number; feature: number; threshold: number } | null = null
  for (let feature = 0; feature < thresholds.length; feature++) for (const threshold of thresholds[feature]) {
    const left = indexes.filter(index => vectors[index][feature] <= threshold)
    if (left.length < 30 || indexes.length - left.length < 30) continue
    const lg = left.reduce((sum, index) => sum + gradients[index], 0)
    const lh = left.reduce((sum, index) => sum + hessians[index], 0)
    const rg = gradient - lg, rh = hessian - lh
    const gain = .5 * (lg ** 2 / (lh + 4) + rg ** 2 / (rh + 4) - gradient ** 2 / (hessian + 4))
    if (!best || gain > best.gain) best = { gain, feature, threshold }
  }
  if (!best || best.gain < .001) return { leaf }
  const left = indexes.filter(index => vectors[index][best.feature] <= best.threshold)
  const leftSet = new Set(left)
  const right = indexes.filter(index => !leftSet.has(index))
  return { feature: best.feature, threshold: best.threshold, left: buildTree(left, vectors, gradients, hessians, thresholds, depth - 1), right: buildTree(right, vectors, gradients, hessians, thresholds, depth - 1) }
}

function treeScore(tree: Tree, vector: number[]): number {
  if (tree.leaf != null) return tree.leaf
  return treeScore(vector[tree.feature!] <= tree.threshold! ? tree.left! : tree.right!, vector)
}

function train(trainRows: AuditRow[]) {
  const vectors = trainRows.map(row => row.x)
  const labels = trainRows.map(row => Number(row.outcome.hr > 0))
  const base = 0
  const predictions = Array(trainRows.length).fill(0)
  const indexes = trainRows.map((_, index) => index)
  const gameIndexes = new Map<string, number[]>()
  trainRows.forEach((row, index) => gameIndexes.set(gameKey(row.date, row.gamePk), [...(gameIndexes.get(gameKey(row.date, row.gamePk)) ?? []), index]))
  const thresholds = expandedFeatureNames.map((_, feature) => {
    const sorted = vectors.map(vector => vector[feature]).sort((a, b) => a - b)
    return [...new Set([1, 2, 3, 4, 5, 6, 7, 8, 9].map(q => sorted[Math.floor(q * (sorted.length - 1) / 10)]))]
  })
  const trees: Tree[] = []
  for (let round = 0; round < 260; round++) {
    const gradients = Array(trainRows.length).fill(0)
    const hessians = Array(trainRows.length).fill(.001)
    for (const group of gameIndexes.values()) {
      const positives = group.reduce((sum, index) => sum + labels[index], 0)
      if (!positives) continue
      const maxScore = Math.max(...group.map(index => predictions[index]))
      const exps = group.map(index => Math.exp(predictions[index] - maxScore))
      const denom = exps.reduce((sum, value) => sum + value, 0)
      group.forEach((index, offset) => {
        const probability = exps[offset] / denom
        const target = labels[index] / positives
        gradients[index] = probability - target
        hessians[index] = Math.max(.001, probability * (1 - probability))
      })
    }
    const tree = buildTree(indexes, vectors, gradients, hessians, thresholds, 3)
    trees.push(tree)
    predictions.forEach((_, index) => { predictions[index] += .06 * treeScore(tree, vectors[index]) })
  }
  return { base, trees, score: (row: AuditRow) => base + trees.reduce((sum, tree) => sum + .06 * treeScore(tree, row.x), 0) }
}

const trainEnd = dates[Math.max(0, Math.floor(dates.length * .50) - 1)]
const calibrationEnd = dates[Math.max(0, Math.floor(dates.length * .72) - 1)]
const trainRows = rows.filter(row => row.date <= trainEnd)
const calibrationRows = rows.filter(row => row.date > trainEnd && row.date <= calibrationEnd)
const holdoutRows = rows.filter(row => row.date > calibrationEnd)
const model = train(trainRows)

function gamesOf(input: AuditRow[]) {
  const output = new Map<string, AuditRow[]>()
  for (const row of input) output.set(gameKey(row.date, row.gamePk), [...(output.get(gameKey(row.date, row.gamePk)) ?? []), row])
  return [...output.values()]
}

function tuneThreshold(input: AuditRow[]) {
  let best = { threshold: .5, f1: -1 }
  for (let threshold = .04; threshold <= .50; threshold += .01) {
    let tp = 0, fp = 0, fn = 0
    for (const gameRows of gamesOf(input)) {
      const maxScore = Math.max(...gameRows.map(row => model.score(row)))
      const weighted = gameRows.map(row => ({ row, weight: Math.exp(model.score(row) - maxScore) }))
      const denom = weighted.reduce((sum, item) => sum + item.weight, 0)
      for (const { row, weight } of weighted) {
        const selected = weight / denom >= threshold
        const actual = row.outcome.hr > 0
        if (selected && actual) tp++; else if (selected) fp++; else if (actual) fn++
      }
    }
    const f1 = 2 * tp / Math.max(1, 2 * tp + fp + fn)
    if (f1 > best.f1) best = { threshold, f1 }
  }
  return best
}
const tuned = tuneThreshold(calibrationRows)

function singleFeatureCoverage(input: AuditRow[], feature: number, descending: boolean) {
  const games = gamesOf(input).filter(gameRows => gameRows.some(row => row.outcome.hr > 0))
  let top1 = 0, top2 = 0, top3 = 0
  for (const gameRows of games) {
    const ranked = [...gameRows].sort((a, b) => descending ? b.x[feature] - a.x[feature] : a.x[feature] - b.x[feature])
    if (ranked.slice(0, 1).some(row => row.outcome.hr > 0)) top1++
    if (ranked.slice(0, 2).some(row => row.outcome.hr > 0)) top2++
    if (ranked.slice(0, 3).some(row => row.outcome.hr > 0)) top3++
  }
  return { games: games.length, top1: top1 / Math.max(1, games.length), top2: top2 / Math.max(1, games.length), top3: top3 / Math.max(1, games.length) }
}

const stableFeatures = expandedFeatureNames.map((feature, index) => {
  const high = singleFeatureCoverage(calibrationRows, index, true)
  const low = singleFeatureCoverage(calibrationRows, index, false)
  const descending = high.top1 + high.top2 * .45 >= low.top1 + low.top2 * .45
  const calibration = descending ? high : low
  const holdout = singleFeatureCoverage(holdoutRows, index, descending)
  return { feature, direction: descending ? 'high' : 'low', calibration, holdout }
}).filter(result => result.calibration.top1 >= .14 && result.holdout.top1 >= .14)
  .sort((left, right) => (right.holdout.top1 + right.holdout.top2 * .45) - (left.holdout.top1 + left.holdout.top2 * .45))

function evaluate(input: AuditRow[]) {
  const games = gamesOf(input)
  let tp = 0, fp = 0, fn = 0, top1 = 0, top2 = 0, top3 = 0, gamesWithHr = 0, gamesCovered = 0, exactNoHr = 0, noHrGames = 0
  const details = games.map(gameRows => {
    const rawScores = new Map(gameRows.map(row => [row, model.score(row)]))
    const maxScore = Math.max(...rawScores.values())
    const exponentials = new Map(gameRows.map(row => [row, Math.exp((rawScores.get(row) ?? 0) - maxScore)]))
    const denominator = [...exponentials.values()].reduce((sum, value) => sum + value, 0)
    const probabilities = new Map(gameRows.map(row => [row, (exponentials.get(row) ?? 0) / denominator]))
    const ranked = [...gameRows].sort((a, b) => (probabilities.get(b) ?? 0) - (probabilities.get(a) ?? 0))
    const actual = ranked.filter(row => row.outcome.hr > 0)
    const selected = ranked.filter(row => (probabilities.get(row) ?? 0) >= tuned.threshold)
    if (actual.length) {
      gamesWithHr++
      if (actual.some(row => ranked.indexOf(row) < 1)) top1++
      if (actual.some(row => ranked.indexOf(row) < 2)) top2++
      if (actual.some(row => ranked.indexOf(row) < 3)) top3++
      if (selected.some(row => row.outcome.hr > 0)) gamesCovered++
    } else {
      noHrGames++
      if (!selected.length) exactNoHr++
    }
    for (const row of ranked) {
      const picked = selected.includes(row), hit = row.outcome.hr > 0
      if (picked && hit) tp++; else if (picked) fp++; else if (hit) fn++
    }
    const advertised = [...gameRows].filter(row => !row.outcome.hr).sort((a, b) => finite(b.player.hrPicks) - finite(a.player.hrPicks))[0]
    return {
      date: gameRows[0].date, game: gameRows[0].game,
      actual: actual.map(row => ({ name: row.name, team: row.team, first: row.outcome.firstHr, hr: row.outcome.hr, rbi: row.outcome.rbi, tb: row.outcome.totalBases, score: Math.round((probabilities.get(row) ?? 0) * 1000) / 10, mf: row.player.ratios.mgmToFanduel, mm: row.player.mm?.l1, mechanics: Object.fromEntries([1, 3, 5, 10].map(window => [`l${window}`, row.mechanics[`l${window as 1 | 3 | 5 | 10}`]?.index ?? null])) })),
      selected: selected.map(row => ({ name: row.name, score: Math.round((probabilities.get(row) ?? 0) * 1000) / 10 })),
      advertisedShield: advertised ? { name: advertised.name, picks: advertised.player.hrPicks, score: Math.round((probabilities.get(advertised) ?? 0) * 1000) / 10 } : null,
    }
  })
  return {
    games: games.length, gamesWithHr, noHrGames, threshold: Math.round(tuned.threshold * 100) / 100,
    precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), f1: 2 * tp / Math.max(1, 2 * tp + fp + fn),
    gameCoverage: gamesCovered / Math.max(1, gamesWithHr), noHrAccuracy: exactNoHr / Math.max(1, noHrGames),
    top1: top1 / Math.max(1, gamesWithHr), top2: top2 / Math.max(1, gamesWithHr), top3: top3 / Math.max(1, gamesWithHr), details,
  }
}

const importance = new Map<number, number>()
function countTree(tree: Tree) {
  if (tree.feature == null) return
  importance.set(tree.feature, (importance.get(tree.feature) ?? 0) + 1)
  countTree(tree.left!); countTree(tree.right!)
}
model.trees.forEach(countTree)
const calibrationEvaluation = evaluate(calibrationRows)
const holdoutEvaluation = evaluate(holdoutRows)
const withoutDetails = <T extends { details: unknown }>(evaluation: T): Omit<T, 'details'> =>
  Object.fromEntries(Object.entries(evaluation).filter(([key]) => key !== 'details')) as Omit<T, 'details'>
const report = {
  range: { start: START, end: END, trainThrough: trainEnd, calibrationThrough: calibrationEnd },
  coverage: { players: rows.length, games: grouped.size, mechanicsPlayerWindows: rows.reduce((sum, row) => sum + Object.keys(row.mechanics).length, 0) },
  threshold: tuned,
  calibration: DETAIL ? calibrationEvaluation : withoutDetails(calibrationEvaluation),
  holdout: DETAIL ? holdoutEvaluation : withoutDetails(holdoutEvaluation),
  actualHomeRunsPerGame: Object.fromEntries([...grouped.values()].reduce((counts, gameRows) => {
    const total = gameRows.reduce((sum, row) => sum + row.outcome.hr, 0)
    counts.set(total, (counts.get(total) ?? 0) + 1)
    return counts
  }, new Map<number, number>())),
  stableSingleFeatures: stableFeatures.slice(0, 35),
  topFeatures: [...importance.entries()].sort((a, b) => b[1] - a[1]).slice(0, 35).map(([index, splits]) => ({ feature: expandedFeatureNames[index], splits })),
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
