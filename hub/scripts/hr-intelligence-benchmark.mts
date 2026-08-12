import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const start = process.argv[2]
const end = process.argv[3] ?? start
if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-benchmark.mts YYYY-MM-DD [YYYY-MM-DD]')
}

const dates: string[] = []
for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
  dates.push(cursor.toISOString().slice(0, 10))
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const { americanImplied } = await import('../src/lib/hrIntelligence')

type Metrics = {
  games: number
  graded: number
  hrGames: number
  noHrGames: number
  outcomeFailures: number
  picksCompleteGames: number
  customFhrTop1: number
  customFhrTop3: number
  marketFhrTop1: number
  marketFhrTop3: number
  customAnyTop1: number
  marketAnyTop1: number
  fhrShortlistHits: number
  companionWatchHits: number
  companionGames: number
}

const total: Metrics = {
  games: 0, graded: 0, hrGames: 0, noHrGames: 0, outcomeFailures: 0, picksCompleteGames: 0,
  customFhrTop1: 0, customFhrTop3: 0, marketFhrTop1: 0, marketFhrTop3: 0,
  customAnyTop1: 0, marketAnyTop1: 0, fhrShortlistHits: 0, companionWatchHits: 0, companionGames: 0,
}
const daily: Array<{ date: string } & Metrics> = []

for (const date of dates) {
  const slate = await buildHrIntelligenceSlate(date)
  const metrics: Metrics = {
    games: slate.games.length,
    graded: 0,
    hrGames: 0,
    noHrGames: 0,
    outcomeFailures: slate.diagnostics.outcomeFailures,
    picksCompleteGames: slate.games.filter(game => game.diagnostics.picksCoveragePct >= 80).length,
    customFhrTop1: 0,
    customFhrTop3: 0,
    marketFhrTop1: 0,
    marketFhrTop3: 0,
    customAnyTop1: 0,
    marketAnyTop1: 0,
    fhrShortlistHits: 0,
    companionWatchHits: 0,
    companionGames: 0,
  }
  for (const game of slate.games) {
    const validation = game.validation
    if (!validation) continue
    metrics.graded += 1
    if (validation.actualNoHr) {
      metrics.noHrGames += 1
      continue
    }
    metrics.hrGames += 1
    const customFhr = [...game.players].sort((a, b) => b.fhrScore - a.fhrScore)
    const marketFhr = [...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1))
    const customAny = [...game.players].sort((a, b) => b.anytimeScore - a.anytimeScore)
    const marketAny = [...game.players].sort((a, b) => (americanImplied(b.hr.current) ?? -1) - (americanImplied(a.hr.current) ?? -1))
    const firstId = validation.firstHrMlbId
    const hrIds = new Set(validation.hrMlbIds)
    const companionIds = new Set(validation.hrMlbIds.filter(id => id !== firstId))
    if (customFhr[0]?.mlbId === firstId) metrics.customFhrTop1 += 1
    if (customFhr.slice(0, 3).some(player => player.mlbId === firstId)) metrics.customFhrTop3 += 1
    if (marketFhr[0]?.mlbId === firstId) metrics.marketFhrTop1 += 1
    if (marketFhr.slice(0, 3).some(player => player.mlbId === firstId)) metrics.marketFhrTop3 += 1
    if (customAny[0] && hrIds.has(customAny[0].mlbId)) metrics.customAnyTop1 += 1
    if (marketAny[0] && hrIds.has(marketAny[0].mlbId)) metrics.marketAnyTop1 += 1
    if (validation.fhrShortlistHit) metrics.fhrShortlistHits += 1
    if (companionIds.size) {
      metrics.companionGames += 1
      if (validation.companionShortlistHit) metrics.companionWatchHits += 1
    }
  }
  daily.push({ date, ...metrics })
  for (const key of Object.keys(total) as Array<keyof Metrics>) total[key] += metrics[key]
}

const pct = (hits: number, attempts: number) => attempts ? Math.round((hits / attempts) * 1000) / 10 : null
process.stdout.write(`${JSON.stringify({
  range: { start, end, dates: dates.length },
  total,
  rates: {
    customFhrTop1: pct(total.customFhrTop1, total.hrGames),
    marketFhrTop1: pct(total.marketFhrTop1, total.hrGames),
    customFhrTop3: pct(total.customFhrTop3, total.hrGames),
    marketFhrTop3: pct(total.marketFhrTop3, total.hrGames),
    customAnyTop1: pct(total.customAnyTop1, total.hrGames),
    marketAnyTop1: pct(total.marketAnyTop1, total.hrGames),
    fhrShortlist: pct(total.fhrShortlistHits, total.hrGames),
    companionWatchlist: pct(total.companionWatchHits, total.companionGames),
  },
  daily,
}, null, 2)}\n`)
