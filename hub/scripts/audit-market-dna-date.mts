import { analyzeMarketDnaSlate, buildMarketDnaSlate } from '../src/lib/marketDna'

const date = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
  throw new Error('Usage: npm run audit:market-dna -- YYYY-MM-DD')
}

const slate = await buildMarketDnaSlate(date)
const audit = await analyzeMarketDnaSlate(date, slate.games)

if (process.argv.includes('--summary')) {
  console.log(JSON.stringify({ date, summary: audit.summary }, null, 2))
  process.exit(0)
}

console.log(JSON.stringify({
  date,
  summary: audit.summary,
  games: audit.games.map(game => ({
    game: `${game.game.awayAbbr}@${game.game.homeAbbr}`,
    score: game.score,
    projection: game.projection,
    readState: game.readState,
    candidates: game.candidates.map(entry => `${entry.tier}: ${entry.player.name} (${entry.score})`),
    topThree: game.ranking.slice(0, 3).map(entry => `${entry.rank}. ${entry.player.name} (${entry.score})`),
    homeRuns: game.actualHomeRuns.map(result => `${result.name} #${result.pregameRank} | ${result.homeRuns} HR, ${result.rbis} RBI, ${result.totalBases} TB${result.hrMlWon ? ', HR/ML' : ''}`),
  })),
}, null, 2))
