import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import nextEnv from '@next/env'
import type { HrIntelGameInput, HrIntelPlayerInput } from '../src/lib/hrIntelligence.ts'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const date = process.argv[2]
const gameSearch = (process.argv[3] ?? '').toUpperCase()
const output = process.argv[4]
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !gameSearch || !output) {
  throw new Error('Usage: npx tsx scripts/export-hr-intelligence-input-fixture.mts YYYY-MM-DD TEAM OUTPUT')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData.ts')
const slate = await buildHrIntelligenceSlate(date)
const game = slate.games.find(candidate =>
  candidate.gameKey.toUpperCase().includes(gameSearch) ||
  candidate.awayTeam.toUpperCase() === gameSearch ||
  candidate.homeTeam.toUpperCase() === gameSearch,
)
if (!game) throw new Error(`No ${gameSearch} game found on ${date}`)
if (game.diagnostics.lineupSize !== 18 || game.diagnostics.picksCoveragePct < 100 || game.diagnostics.crossMarketPicksCoveragePct < 100) {
  throw new Error(`Refusing to freeze an incomplete board: ${JSON.stringify(game.diagnostics)}`)
}

const players: HrIntelPlayerInput[] = game.players.map(player => ({
  mlbId: player.mlbId,
  name: player.name,
  team: player.team,
  opponent: player.opponent,
  battingOrder: player.battingOrder,
  position: player.position,
  bats: player.bats,
  projected: player.projected,
  fhr: player.fhr,
  hr: player.hr,
  marketBooks: player.marketBooks,
  markets: player.markets,
  fhrBaselineDeltaPct: player.fhrBaselineDeltaPct,
  hrBaselineDeltaPct: player.hrBaselineDeltaPct,
  hrPicks: player.hrPicks,
  picksByMarket: player.picksByMarket,
  windows: player.windows,
  mm: player.mm,
  paperRank: player.paperRank,
  bookRank: player.bookRank,
  contextReset: player.contextReset,
  boardMetrics: player.boardMetrics,
}))
const fixture: HrIntelGameInput = {
  date: game.date,
  gamePk: game.gamePk,
  gameKey: game.gameKey,
  awayTeam: game.awayTeam,
  homeTeam: game.homeTeam,
  awayLineupConfirmed: game.awayLineupConfirmed,
  homeLineupConfirmed: game.homeLineupConfirmed,
  noHr: game.noHr,
  players,
  warnings: [],
}

const outputPath = resolve(process.cwd(), output)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
process.stdout.write(`Wrote outcome-blind ${game.gameKey} fixture with ${players.length} players to ${outputPath}\n`)
