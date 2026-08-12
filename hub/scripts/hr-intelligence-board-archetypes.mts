import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const trainingStart = process.argv[2] ?? '2026-07-01'
const trainingEnd = process.argv[3] ?? '2026-07-31'
const holdoutStart = process.argv[4] ?? '2026-08-01'
const holdoutEnd = process.argv[5] ?? '2026-08-11'
const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
if (![trainingStart, trainingEnd, holdoutStart, holdoutEnd].every(valid)) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-board-archetypes.mts TRAIN_START TRAIN_END HOLDOUT_START HOLDOUT_END')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const { americanImplied } = await import('../src/lib/hrIntelligence')
type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Player = Game['players'][number]

type Profile = 'low-hr' | 'clustered' | 'active' | 'quiet' | 'mixed'
type Recipe = 'c2f1' | 'c1f1m1' | 'c2m1' | 'c1f2' | 'c2a1' | 'c1f1a1' | 'market3'
type CompanionRecipe = 'c1a1f1' | 'a2f1' | 'f2a1' | 'c2a1' | 'marketAny3'

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

function profile(game: Game): Profile {
  const tiePct = game.players.filter(player => player.fhrTieSize > 1).length / Math.max(1, game.players.length)
  const moves = game.players.flatMap(player => [player.movement.fhrImpliedPoints, player.movement.hrImpliedPoints]).filter((value): value is number => value != null)
  const activePct = moves.filter(value => Math.abs(value) >= 0.15).length / Math.max(1, moves.length)
  const noHr = americanImplied(game.noHr.current)
  if (noHr != null && noHr >= 0.20) return 'low-hr'
  if (tiePct >= 0.45) return 'clustered'
  if (activePct >= 0.50) return 'active'
  if (activePct <= 0.25) return 'quiet'
  return 'mixed'
}

function distinct(groups: Player[][], limit = 3) {
  const selected: Player[] = []
  for (const group of groups) {
    const candidate = group.find(player => !selected.some(existing => existing.mlbId === player.mlbId))
    if (candidate) selected.push(candidate)
    if (selected.length === limit) break
  }
  return selected
}

function candidates(game: Game, recipe: Recipe) {
  const c = [...game.players].sort((a, b) => b.contradictionScore - a.contradictionScore)
  const f = [...game.players].sort((a, b) => b.modelFhrScore - a.modelFhrScore)
  const a = [...game.players].sort((left, right) => right.anytimeScore - left.anytimeScore)
  const m = [...game.players].sort((left, right) => (americanImplied(right.fhr.current) ?? -1) - (americanImplied(left.fhr.current) ?? -1))
  const groups: Record<Recipe, Player[][]> = {
    c2f1: [c, c.slice(1), f],
    c1f1m1: [c, f, m],
    c2m1: [c, c.slice(1), m],
    c1f2: [c, f, f.slice(1)],
    c2a1: [c, c.slice(1), a],
    c1f1a1: [c, f, a],
    market3: [m, m.slice(1), m.slice(2)],
  }
  return distinct(groups[recipe])
}

function companionCandidates(game: Game, recipe: CompanionRecipe) {
  const anchorId = [...game.players].sort((a, b) => b.contradictionScore - a.contradictionScore)[0]?.mlbId
  const eligible = game.players.filter(player => player.mlbId !== anchorId)
  const c = [...eligible].sort((a, b) => b.contradictionScore - a.contradictionScore)
  const f = [...eligible].sort((a, b) => b.modelFhrScore - a.modelFhrScore)
  const a = [...eligible].sort((left, right) => right.anytimeScore - left.anytimeScore)
  const m = [...eligible].sort((left, right) => (americanImplied(right.hr.current) ?? -1) - (americanImplied(left.hr.current) ?? -1))
  const groups: Record<CompanionRecipe, Player[][]> = {
    c1a1f1: [c, a, f],
    a2f1: [a, a.slice(1), f],
    f2a1: [f, f.slice(1), a],
    c2a1: [c, c.slice(1), a],
    marketAny3: [m, m.slice(1), m.slice(2)],
  }
  return distinct(groups[recipe])
}

function leaders(game: Game) {
  const contradiction = [...game.players].sort((a, b) => b.contradictionScore - a.contradictionScore)
  const model = [...game.players].sort((a, b) => b.modelFhrScore - a.modelFhrScore)
  const market = [...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1))
  return { contradiction, model, market }
}

function adaptiveLeader(game: Game, clusteredGap: number) {
  const board = profile(game)
  const ranked = leaders(game)
  if (board === 'mixed') return ranked.contradiction[0]
  if (board === 'clustered') {
    const gap = (ranked.contradiction[0]?.contradictionScore ?? 0) - (ranked.contradiction[1]?.contradictionScore ?? 0)
    return gap >= clusteredGap ? ranked.contradiction[0] : ranked.model[0]
  }
  return ranked.model[0]
}

function adaptiveAccuracy(games: Game[], clusteredGap: number) {
  const hits = games.filter(game => adaptiveLeader(game, clusteredGap)?.mlbId === game.validation?.firstHrMlbId).length
  return { hits, rate: games.length ? Math.round(hits / games.length * 1000) / 10 : null }
}

function evaluate(games: Game[]) {
  const profiles: Profile[] = ['low-hr', 'clustered', 'active', 'quiet', 'mixed']
  const recipes: Recipe[] = ['c2f1', 'c1f1m1', 'c2m1', 'c1f2', 'c2a1', 'c1f1a1', 'market3']
  const companionRecipes: CompanionRecipe[] = ['c1a1f1', 'a2f1', 'f2a1', 'c2a1', 'marketAny3']
  return Object.fromEntries(profiles.map(board => {
    const relevant = games.filter(game => profile(game) === board)
    const multi = relevant.filter(game => new Set(game.validation?.hrMlbIds ?? []).size >= 2)
    const contradictionLeaderHits = relevant.filter(game => [...game.players]
      .sort((a, b) => b.contradictionScore - a.contradictionScore)[0]?.mlbId === game.validation?.firstHrMlbId).length
    const modelLeaderHits = relevant.filter(game => [...game.players]
      .sort((a, b) => b.modelFhrScore - a.modelFhrScore)[0]?.mlbId === game.validation?.firstHrMlbId).length
    const marketLeaderHits = relevant.filter(game => [...game.players]
      .sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1))[0]?.mlbId === game.validation?.firstHrMlbId).length
    return [board, {
      games: relevant.length,
      leaders: {
        contradiction: { hits: contradictionLeaderHits, rate: relevant.length ? Math.round(contradictionLeaderHits / relevant.length * 1000) / 10 : null },
        model: { hits: modelLeaderHits, rate: relevant.length ? Math.round(modelLeaderHits / relevant.length * 1000) / 10 : null },
        market: { hits: marketLeaderHits, rate: relevant.length ? Math.round(marketLeaderHits / relevant.length * 1000) / 10 : null },
      },
      recipes: Object.fromEntries(recipes.map(recipe => {
        const hits = relevant.filter(game => candidates(game, recipe).some(player => player.mlbId === game.validation?.firstHrMlbId)).length
        return [recipe, { hits, rate: relevant.length ? Math.round(hits / relevant.length * 1000) / 10 : null }]
      })),
      companionGames: multi.length,
      companionRecipes: Object.fromEntries(companionRecipes.map(recipe => {
        const hits = multi.filter(game => {
          const first = game.validation?.firstHrMlbId
          const companions = new Set((game.validation?.hrMlbIds ?? []).filter(id => id !== first))
          return companionCandidates(game, recipe).some(player => companions.has(player.mlbId))
        }).length
        return [recipe, { hits, rate: multi.length ? Math.round(hits / multi.length * 1000) / 10 : null }]
      })),
    }]
  }))
}

const training = await load(trainingStart, trainingEnd)
const holdout = await load(holdoutStart, holdoutEnd)
const clusteredGapSearch = Array.from({ length: 81 }, (_, index) => index * 0.25)
  .map(gap => ({ gap, ...adaptiveAccuracy(training, gap) }))
  .sort((left, right) => right.hits - left.hits || right.gap - left.gap)
const selectedClusteredGap = clusteredGapSearch[0]?.gap ?? 0
process.stdout.write(`${JSON.stringify({
  ranges: { training: [trainingStart, trainingEnd], holdout: [holdoutStart, holdoutEnd] },
  totals: { training: training.length, holdout: holdout.length },
  adaptiveGate: {
    selectedClusteredGap,
    training: adaptiveAccuracy(training, selectedClusteredGap),
    holdout: adaptiveAccuracy(holdout, selectedClusteredGap),
    topTrainingThresholds: clusteredGapSearch.slice(0, 8),
  },
  training: evaluate(training),
  holdout: evaluate(holdout),
  holdoutDetails: holdout.filter(game => game.date === holdoutEnd).map(game => ({
    game: game.gameKey,
    profile: profile(game),
    actual: game.validation?.firstHrName,
    adaptive: adaptiveLeader(game, selectedClusteredGap)?.name ?? null,
    recipes: Object.fromEntries((['c2f1', 'c1f1m1', 'c2m1', 'c1f2', 'c2a1', 'c1f1a1', 'market3'] as Recipe[]).map(recipe => [recipe, candidates(game, recipe).map(player => player.name)])),
  })),
}, null, 2)}\n`)
