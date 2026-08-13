import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const start = process.argv[2]
const end = process.argv[3] ?? start
const compact = process.argv.includes('--compact')
if (!start || !end) throw new Error('Usage: npx tsx scripts/hr-intelligence-every-game-audit.mts YYYY-MM-DD [YYYY-MM-DD]')

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData.ts')

const dates: string[] = []
for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
  dates.push(cursor.toISOString().slice(0, 10))
}

const rows: Array<Record<string, unknown>> = []
for (const date of dates) {
  const slate = await buildHrIntelligenceSlate(date)
  for (const game of slate.games) {
    if (!game.validation) continue
    const byId = new Map(game.players.map(player => [player.mlbId, player]))
    const shortlistIds = [...new Set([
      ...game.recommendation.fhrShortlistMlbIds,
      ...game.recommendation.companionShortlistMlbIds,
    ])]
    const actualIds = new Set(game.validation.hrMlbIds)
    const topPairs = game.pairs.slice(0, 3).map(pair => ({
      players: [byId.get(pair.anchorMlbId)?.name, byId.get(pair.companionMlbId)?.name],
      score: pair.score,
    }))
    rows.push({
      date,
      game: game.gameKey,
      actualNoHr: game.validation.actualNoHr,
      actualFhr: game.validation.firstHrName,
      actualHr: game.validation.hrNames,
      shortlist: shortlistIds.map(id => byId.get(id)?.name),
      shortlistHits: shortlistIds.filter(id => actualIds.has(id)).map(id => byId.get(id)?.name),
      topPairs,
      actualSignals: game.validation.hrMlbIds.map(id => {
        const player = byId.get(id)
        return player ? {
          player: player.name,
          pwr: player.isPowerCandidate,
          fhrRank: player.fhrRank,
          hrRank: player.hrRank,
          publicRank: player.publicRank,
          hrPicks: player.hrPicks,
          rbiPicks: player.picksByMarket.rbi,
          lanes: player.qualifiedLanes,
          selectionScore: player.selectionScore,
          structuralPowerScore: player.structuralPowerScore,
          archetypeScores: player.archetypeScores,
          movement: player.movement,
          publicPattern: player.publicPattern,
          paper: player.paperRank,
          book: player.bookRank,
          mm: player.mm,
          ratios: player.ratios,
        } : null
      }),
      complete: game.recommendation.dataComplete,
    })
  }
}

const hrRows = rows.filter(row => !(row.actualNoHr as boolean))
const hitGames = hrRows.filter(row => (row.shortlistHits as unknown[]).length > 0)
process.stdout.write(`${JSON.stringify({
  summary: {
    gradedGames: rows.length,
    hrGames: hrRows.length,
    noHrGames: rows.length - hrRows.length,
    shortlistGameHits: hitGames.length,
    shortlistGameHitRate: hrRows.length ? Math.round(hitGames.length / hrRows.length * 1000) / 10 : null,
  },
  games: compact ? rows.map(row => ({
    date: row.date,
    game: row.game,
    actualNoHr: row.actualNoHr,
    actualFhr: row.actualFhr,
    actualHr: row.actualHr,
    shortlist: row.shortlist,
    shortlistHits: row.shortlistHits,
    topPairs: row.topPairs,
    actualSignals: row.actualSignals,
  })) : rows,
}, null, 2)}\n`)
