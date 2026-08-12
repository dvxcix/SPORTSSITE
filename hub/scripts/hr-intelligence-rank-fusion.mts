import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const trainingStart = process.argv[2] ?? '2026-07-01'
const trainingEnd = process.argv[3] ?? '2026-07-31'
const holdoutStart = process.argv[4] ?? '2026-08-01'
const holdoutEnd = process.argv[5] ?? '2026-08-11'
const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
if (![trainingStart, trainingEnd, holdoutStart, holdoutEnd].every(valid)) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-rank-fusion.mts TRAIN_START TRAIN_END HOLDOUT_START HOLDOUT_END')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const { americanImplied } = await import('../src/lib/hrIntelligence')
type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Profile = Game['diagnostics']['boardProfile']
type Weights = { contradiction: number; model: number; market: number; anytime: number }

function datesBetween(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

async function load(start: string, end: string) {
  const games: Game[] = []
  for (const date of datesBetween(start, end)) {
    const slate = await buildHrIntelligenceSlate(date)
    games.push(...slate.games.filter(game => game.validation && !game.validation.actualNoHr && game.validation.firstHrMlbId != null))
  }
  return games
}

function rankMap<T extends { mlbId: number }>(players: T[]) {
  return new Map(players.map((player, index) => [player.mlbId, index + 1]))
}

function fused(game: Game, weights: Weights) {
  const count = game.players.length
  const normalize = (rank: number) => count < 2 ? 0 : 1 - (rank - 1) / (count - 1)
  const contradiction = rankMap([...game.players].sort((a, b) => b.contradictionScore - a.contradictionScore))
  const model = rankMap([...game.players].sort((a, b) => b.modelFhrScore - a.modelFhrScore))
  const market = rankMap([...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1)))
  const anytime = rankMap([...game.players].sort((a, b) => b.anytimeScore - a.anytimeScore))
  return [...game.players].map(player => ({
    player,
    score:
      normalize(contradiction.get(player.mlbId) ?? count) * weights.contradiction +
      normalize(model.get(player.mlbId) ?? count) * weights.model +
      normalize(market.get(player.mlbId) ?? count) * weights.market +
      normalize(anytime.get(player.mlbId) ?? count) * weights.anytime,
  })).sort((left, right) => right.score - left.score || left.player.battingOrder - right.player.battingOrder)
}

function separation(game: Game, weights: Weights) {
  const rows = fused(game, weights)
  const leaderId = rows[0]?.player.mlbId ?? null
  const laneLeaders = [
    [...game.players].sort((a, b) => b.contradictionScore - a.contradictionScore)[0]?.mlbId,
    [...game.players].sort((a, b) => b.modelFhrScore - a.modelFhrScore)[0]?.mlbId,
    [...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1))[0]?.mlbId,
    [...game.players].sort((a, b) => b.anytimeScore - a.anytimeScore)[0]?.mlbId,
  ]
  return {
    rows,
    gap: (rows[0]?.score ?? 0) - (rows[1]?.score ?? 0),
    agreement: laneLeaders.filter(id => id != null && id === leaderId).length,
  }
}

const candidates: Weights[] = []
for (let contradiction = 0; contradiction <= 10; contradiction += 1) {
  for (let model = 0; model <= 10 - contradiction; model += 1) {
    for (let market = 0; market <= 10 - contradiction - model; market += 1) {
      const anytime = 10 - contradiction - model - market
      candidates.push({ contradiction: contradiction / 10, model: model / 10, market: market / 10, anytime: anytime / 10 })
    }
  }
}

function score(games: Game[], weights: Weights) {
  let top1 = 0
  let top3 = 0
  let reciprocalRank = 0
  for (const game of games) {
    const rows = fused(game, weights)
    const rank = rows.findIndex(row => row.player.mlbId === game.validation?.firstHrMlbId) + 1
    if (rank === 1) top1 += 1
    if (rank > 0 && rank <= 3) top3 += 1
    if (rank > 0) reciprocalRank += 1 / rank
  }
  return { games: games.length, top1, top3, reciprocalRank }
}

function choose(games: Game[]) {
  return candidates.map(weights => ({ weights, ...score(games, weights) }))
    .sort((left, right) =>
      right.top1 - left.top1 ||
      right.top3 - left.top3 ||
      right.reciprocalRank - left.reciprocalRank ||
      Math.max(...Object.values(left.weights)) - Math.max(...Object.values(right.weights)),
    )[0]
}

const training = await load(trainingStart, trainingEnd)
const holdout = await load(holdoutStart, holdoutEnd)
const profiles: Profile[] = ['low-hr', 'clustered', 'active', 'quiet', 'mixed']
const global = choose(training)
const selected = Object.fromEntries(profiles.map(profile => {
  const relevant = training.filter(game => game.diagnostics.boardProfile === profile)
  return [profile, relevant.length >= 30 ? choose(relevant) : global]
})) as Record<Profile, ReturnType<typeof choose>>

function chooseGate(games: Game[]) {
  const rows = games.map(game => {
    const read = separation(game, selected[game.diagnostics.boardProfile].weights)
    return {
      gap: read.gap,
      agreement: read.agreement,
      hit: read.rows[0]?.player.mlbId === game.validation?.firstHrMlbId,
    }
  })
  const minimumSelections = Math.ceil(games.length * 0.12)
  let best = { gap: 1, agreement: 4, selected: 0, hits: 0, precision: 0, coverage: 0 }
  for (let gap = 0; gap <= 0.3; gap += 0.005) {
    for (let agreement = 1; agreement <= 4; agreement += 1) {
      const chosen = rows.filter(row => row.gap >= gap && row.agreement >= agreement)
      if (chosen.length < minimumSelections) continue
      const hits = chosen.filter(row => row.hit).length
      const precision = hits / chosen.length
      const coverage = chosen.length / rows.length
      if (precision > best.precision || (precision === best.precision && coverage > best.coverage)) {
        best = { gap: Math.round(gap * 1000) / 1000, agreement, selected: chosen.length, hits, precision, coverage }
      }
    }
  }
  return best
}

const gate = chooseGate(training)

function evaluate(games: Game[]) {
  let top1 = 0
  let top3 = 0
  let published = 0
  let publishedHits = 0
  const details: Array<Record<string, unknown>> = []
  for (const game of games) {
    const choice = selected[game.diagnostics.boardProfile]
    const read = separation(game, choice.weights)
    const rows = read.rows
    const rank = rows.findIndex(row => row.player.mlbId === game.validation?.firstHrMlbId) + 1
    if (rank === 1) top1 += 1
    if (rank > 0 && rank <= 3) top3 += 1
    if (read.gap >= gate.gap && read.agreement >= gate.agreement) {
      published += 1
      if (rank === 1) publishedHits += 1
    }
    if (game.date === '2026-08-11') details.push({
      game: game.gameKey,
      profile: game.diagnostics.boardProfile,
      actual: game.validation?.firstHrName,
      leader: rows[0]?.player.name ?? null,
      shortlist: rows.slice(0, 3).map(row => row.player.name),
      rank,
      separation: Math.round(read.gap * 1000) / 1000,
      agreement: read.agreement,
      published: read.gap >= gate.gap && read.agreement >= gate.agreement,
      weights: choice.weights,
    })
  }
  return {
    games: games.length,
    top1,
    top3,
    published,
    publishedHits,
    top1Rate: games.length ? Math.round(top1 / games.length * 1000) / 10 : null,
    top3Rate: games.length ? Math.round(top3 / games.length * 1000) / 10 : null,
    publishedPrecision: published ? Math.round(publishedHits / published * 1000) / 10 : null,
    publishedCoverage: games.length ? Math.round(published / games.length * 1000) / 10 : null,
    details,
  }
}

process.stdout.write(`${JSON.stringify({
  ranges: { training: [trainingStart, trainingEnd], holdout: [holdoutStart, holdoutEnd] },
  global,
  selected,
  gate,
  training: evaluate(training),
  holdout: evaluate(holdout),
}, null, 2)}\n`)
