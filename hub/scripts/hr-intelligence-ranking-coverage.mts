import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const start = process.argv[2]
const end = process.argv[3] ?? start
if (!start || !end) throw new Error('Usage: npx tsx scripts/hr-intelligence-ranking-coverage.mts YYYY-MM-DD [YYYY-MM-DD]')

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData.ts')
const { americanImplied } = await import('../src/lib/hrIntelligence.ts')

const dates: string[] = []
for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
  dates.push(cursor.toISOString().slice(0, 10))
}

const cutoffs = [1, 2, 3, 4, 5, 6, 8, 10, 12, 18]
const methods = ['calibrated', 'selection', 'anytime', 'fhr', 'marketHr', 'marketFhr'] as const
type Method = typeof methods[number]
const gameHits = Object.fromEntries(methods.map(method => [method, Object.fromEntries(cutoffs.map(k => [k, 0]))])) as Record<Method, Record<number, number>>
const playerHits = Object.fromEntries(methods.map(method => [method, Object.fromEntries(cutoffs.map(k => [k, 0]))])) as Record<Method, Record<number, number>>
const actualRanks = Object.fromEntries(methods.map(method => [method, [] as number[]])) as Record<Method, number[]>
let hrGames = 0
let hrPlayers = 0

for (const date of dates) {
  const slate = await buildHrIntelligenceSlate(date)
  for (const game of slate.games) {
    if (!game.validation || game.validation.actualNoHr) continue
    hrGames += 1
    hrPlayers += game.validation.hrMlbIds.length
    const actual = new Set(game.validation.hrMlbIds)
    const ranked: Record<Method, typeof game.players> = {
      calibrated: [...game.players].sort((a, b) => b.calibratedAnytimeScore - a.calibratedAnytimeScore),
      selection: [...game.players].sort((a, b) => b.selectionScore - a.selectionScore),
      anytime: [...game.players].sort((a, b) => b.anytimeScore - a.anytimeScore),
      fhr: [...game.players].sort((a, b) => b.fhrScore - a.fhrScore),
      marketHr: [...game.players].sort((a, b) => (americanImplied(b.hr.current) ?? -1) - (americanImplied(a.hr.current) ?? -1)),
      marketFhr: [...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1)),
    }
    for (const method of methods) {
      const ranks = ranked[method]
      for (const id of actual) actualRanks[method].push(ranks.findIndex(player => player.mlbId === id) + 1)
      for (const k of cutoffs) {
        const ids = new Set(ranks.slice(0, k).map(player => player.mlbId))
        const hits = [...actual].filter(id => ids.has(id)).length
        if (hits > 0) gameHits[method][k] += 1
        playerHits[method][k] += hits
      }
    }
  }
}

const pct = (n: number, d: number) => d ? Math.round(n / d * 1000) / 10 : null
const output = Object.fromEntries(methods.map(method => [method, {
  gameRecallAtK: Object.fromEntries(cutoffs.map(k => [k, pct(gameHits[method][k], hrGames)])),
  playerRecallAtK: Object.fromEntries(cutoffs.map(k => [k, pct(playerHits[method][k], hrPlayers)])),
  meanActualRank: Math.round(actualRanks[method].reduce((sum, rank) => sum + rank, 0) / Math.max(1, actualRanks[method].length) * 10) / 10,
}]))

process.stdout.write(`${JSON.stringify({ range: { start, end }, hrGames, hrPlayers, methods: output }, null, 2)}\n`)
