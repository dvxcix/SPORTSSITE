import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const date = process.argv[2]
const gameSearch = (process.argv[3] ?? '').toUpperCase()
const compact = process.argv.includes('--compact')
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !gameSearch) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-board-dump.mts YYYY-MM-DD TEAM')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData.ts')
const slate = await buildHrIntelligenceSlate(date)
const game = slate.games.find(candidate =>
  candidate.gameKey.toUpperCase().includes(gameSearch) ||
  candidate.awayTeam.toUpperCase() === gameSearch ||
  candidate.homeTeam.toUpperCase() === gameSearch,
)
if (!game) throw new Error(`No ${gameSearch} game found on ${date}`)

const movement = (market: { current: number | null; open: number | null }) => {
  if (market.current == null || market.open == null) return null
  const implied = (price: number) => price < 0 ? -price / (-price + 100) : 100 / (price + 100)
  return Math.round((implied(market.current) - implied(market.open)) * 10_000) / 100
}
const mean = (values: Array<number | null | undefined>) => {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return clean.length ? Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length * 100) / 100 : null
}

const players = game.players
  .sort((left, right) => left.team.localeCompare(right.team) || left.battingOrder - right.battingOrder)

if (compact) {
  const pickRank = new Map([...players]
    .sort((left, right) => (right.hrPicks ?? -1) - (left.hrPicks ?? -1))
    .map((player, index) => [player.mlbId, index + 1]))
  process.stdout.write(`${JSON.stringify({
    date,
    game: game.gameKey,
    noHr: game.noHr,
    actual: game.validation ? { first: game.validation.firstHrName, homers: game.validation.hrNames } : null,
    players: players.map(player => ({
      team: player.team,
      order: player.battingOrder,
      player: player.name,
      fhr: player.fhr.current,
      fhrOpen: player.fhr.open,
      fhrMove: movement(player.fhr),
      fhrBaseline: Math.round((player.fhrBaselineDeltaPct ?? 0) * 10) / 10,
      fhrRank: player.fhrRank,
      fhrTie: player.fhrTieSize,
      hr: player.hr.current,
      hrOpen: player.hr.open,
      hrMove: movement(player.hr),
      hrBaseline: Math.round((player.hrBaselineDeltaPct ?? 0) * 10) / 10,
      hrRank: player.hrRank,
      hrPicks: player.hrPicks,
      hrPickRank: pickRank.get(player.mlbId),
      derivatives: Object.fromEntries(['hr2', 'laser105', 'laser110', 'moonshot', 'pa1', 'hrMl', 'hrr', 'rbi1', 'rbi2', 'rbi3', 'tb2', 'tb3', 'tb4', 'tb5', 'singles', 'doubles', 'triples', 'hits1', 'hits2', 'runs1', 'runs2', 'sb1', 'sb2']
        .map(key => [key, player.markets[key] ? [player.markets[key].current, movement(player.markets[key])] : null])),
      pickShape: player.picksByMarket,
      paper: mean(Object.values(player.paperRank ?? {})),
      book: mean(Object.values(player.bookRank ?? {})),
      mm: mean(Object.values(player.mm ?? {})),
      contact: player.contactAcceleration,
      reset: player.contextReset,
    })),
  }, null, 2)}\n`)
  process.exit(0)
}

process.stdout.write(`${JSON.stringify({
  date,
  game: game.gameKey,
  noHr: game.noHr,
  actual: game.validation ? {
    first: game.validation.firstHrName,
    homers: game.validation.hrNames,
  } : null,
  players: players.map(player => ({
      team: player.team,
      order: player.battingOrder,
      player: player.name,
      fhr: { ...player.fhr, move: movement(player.fhr), baseline: player.fhrBaselineDeltaPct, rank: player.fhrRank, tie: player.fhrTieSize },
      hr: { ...player.hr, move: movement(player.hr), baseline: player.hrBaselineDeltaPct, rank: player.hrRank },
      hrPicks: player.hrPicks,
      picks: player.picksByMarket,
      markets: Object.fromEntries(Object.entries(player.markets).map(([key, market]) => [key, { ...market, move: movement(market) }])),
      books: player.marketBooks,
      mm: player.mm,
      paper: player.paperRank,
      bookRank: player.bookRank,
      paperMean: mean(Object.values(player.paperRank ?? {})),
      bookMean: mean(Object.values(player.bookRank ?? {})),
      contactAcceleration: player.contactAcceleration,
      contextReset: player.contextReset,
    })),
}, null, 2)}\n`)
