import assert from 'node:assert/strict'
import type {
  HrIntelGameInput,
  HrIntelMetricWindow,
  HrIntelPlayerInput,
} from '../src/lib/hrIntelligence'

const hrIntelligenceModule = '../src/lib/hrIntelligence.ts'
const { analyzeHrGame } = await import(hrIntelligenceModule)

const neutralWindow: HrIntelMetricWindow = {
  bbe: 12, pa: 22, avg: 0.245, hr: 1, avgEv: 89, maxEv: 105,
  hardHitPct: 40, barrelPct: 8, sweetSpotPct: 32, avgBatSpeed: 72, pullAirRate: 0.16,
}

function statWindow(overrides: Partial<HrIntelMetricWindow> = {}): HrIntelMetricWindow {
  return { ...neutralWindow, ...overrides }
}

const neutralMarkets: Record<string, { current: number; open: number }> = {
  hr2: { current: 5000, open: 5000 }, laser105: { current: 1400, open: 1400 }, laser110: { current: 3500, open: 3500 },
  moonshot: { current: 2500, open: 2500 }, pa1: { current: 9000, open: 9000 }, hrMl: { current: 1100, open: 1100 },
  rbi1: { current: 300, open: 300 }, rbi2: { current: 1100, open: 1100 }, rbi3: { current: 2600, open: 2600 },
  tb2: { current: 400, open: 400 }, tb3: { current: 850, open: 850 }, tb4: { current: 1500, open: 1500 }, tb5: { current: 2600, open: 2600 },
  singles: { current: 150, open: 150 }, doubles: { current: 450, open: 450 }, triples: { current: 1800, open: 1800 },
  hits1: { current: -180, open: -180 }, hits2: { current: 300, open: 300 }, runs1: { current: 130, open: 130 }, runs2: { current: 850, open: 850 },
  sb1: { current: 800, open: 800 }, sb2: { current: 5000, open: 5000 },
}

function player(overrides: Partial<HrIntelPlayerInput> & Pick<HrIntelPlayerInput, 'mlbId' | 'name' | 'team' | 'battingOrder'>): HrIntelPlayerInput {
  const { mlbId, name, team, battingOrder, ...rest } = overrides
  return {
    mlbId,
    name,
    team,
    opponent: team === 'CLE' ? 'DET' : 'CLE',
    battingOrder,
    position: 'OF', bats: 'R', projected: false,
    fhr: { current: 1800, open: 1800 },
    hr: { current: 900, open: 900 },
    markets: { ...neutralMarkets },
    fhrBaselineDeltaPct: 0, hrBaselineDeltaPct: 0, hrPicks: 40,
    picksByMarket: {
      home_runs: 40, hits: 50, runs: 30, stolen_bases: 3, singles: 5, doubles: 2, triples: 0,
      rbi: 20, hits_runs_rbi: 15, bases: 25,
    },
    windows: {
      season: statWindow(), l10: statWindow(), l5: statWindow({ bbe: 8, pa: 14 }),
      l3: statWindow({ bbe: 5, pa: 9 }), l1: statWindow({ bbe: 3, pa: 4 }),
    },
    mm: { l1: 0, l3: 0, l5: 0, l10: 0 },
    paperRank: { l1: 10, l3: 10, l5: 10, l10: 10 },
    bookRank: { l1: 10, l3: 10, l5: 10, l10: 10 },
    contextReset: false,
    ...rest,
  }
}

const chase = player({
  mlbId: 1, name: 'Chase DeLauter', team: 'CLE', battingOrder: 3,
  fhr: { current: 950, open: 950 }, hr: { current: 630, open: 560 },
  fhrBaselineDeltaPct: -5, hrBaselineDeltaPct: 3.2, hrPicks: 25,
  windows: {
    season: statWindow({ avgEv: 90, maxEv: 108, hardHitPct: 44, barrelPct: 10, sweetSpotPct: 34, avgBatSpeed: 73, pullAirRate: 0.18 }),
    l10: statWindow({ hr: 0, avgEv: 93, maxEv: 112, hardHitPct: 53, barrelPct: 15, sweetSpotPct: 42, avgBatSpeed: 75, pullAirRate: 0.27 }),
    l5: statWindow({ bbe: 8, pa: 14, hr: 0, avgEv: 94, maxEv: 112, hardHitPct: 56, barrelPct: 17, sweetSpotPct: 44, avgBatSpeed: 75.5, pullAirRate: 0.29 }),
    l3: statWindow({ bbe: 5, pa: 9, hr: 0, avgEv: 95, maxEv: 112, hardHitPct: 60, barrelPct: 18, sweetSpotPct: 45, avgBatSpeed: 76, pullAirRate: 0.31 }),
    l1: statWindow({ bbe: 3, pa: 4, hr: 0, avgEv: 96, maxEv: 112, hardHitPct: 67, barrelPct: 20, sweetSpotPct: 50, avgBatSpeed: 76, pullAirRate: 0.33 }),
  },
  mm: { l1: 7, l3: 7, l5: 6, l10: 5 },
  paperRank: { l1: 3, l3: 4, l5: 4, l10: 5 }, bookRank: { l1: 8, l3: 8, l5: 7, l10: 7 },
})

const jo = player({
  mlbId: 2, name: 'Jo Adell', team: 'CLE', battingOrder: 5,
  fhr: { current: 900, open: 900 }, hr: { current: 500, open: 560 },
  fhrBaselineDeltaPct: -0.6, hrBaselineDeltaPct: 1.4, hrPicks: 48,
  markets: {
    ...neutralMarkets,
    hr2: { current: 3000, open: 3600 }, laser105: { current: 800, open: 950 },
    laser110: { current: 1800, open: 2400 }, moonshot: { current: 1500, open: 1900 },
  },
  windows: {
    season: statWindow({ avgEv: 91, maxEv: 111, hardHitPct: 47, barrelPct: 12, sweetSpotPct: 33, avgBatSpeed: 74, pullAirRate: 0.2 }),
    l10: statWindow({ avgEv: 94, maxEv: 114, hardHitPct: 57, barrelPct: 18, sweetSpotPct: 42, avgBatSpeed: 76, pullAirRate: 0.29 }),
    l5: statWindow({ bbe: 8, pa: 14, avgEv: 95, maxEv: 114, hardHitPct: 60, barrelPct: 20, sweetSpotPct: 45, avgBatSpeed: 76.5, pullAirRate: 0.31 }),
    l3: statWindow({ bbe: 5, pa: 9, avgEv: 96, maxEv: 114, hardHitPct: 63, barrelPct: 22, sweetSpotPct: 47, avgBatSpeed: 77, pullAirRate: 0.33 }),
    l1: statWindow({ bbe: 3, pa: 4, avgEv: 97, maxEv: 114, hardHitPct: 67, barrelPct: 24, sweetSpotPct: 50, avgBatSpeed: 77, pullAirRate: 0.35 }),
  },
  mm: { l1: 6, l3: 6, l5: 5, l10: 5 },
  paperRank: { l1: 4, l3: 5, l5: 5, l10: 6 }, bookRank: { l1: 7, l3: 7, l5: 6, l10: 6 },
  contextReset: true,
})

const lowe = player({
  mlbId: 3, name: 'Nathaniel Lowe', team: 'DET', battingOrder: 4,
  fhr: { current: 750, open: 950 }, hr: { current: 540, open: 500 },
  fhrBaselineDeltaPct: -25.8, hrBaselineDeltaPct: -18, hrPicks: 131,
  mm: { l1: -2, l3: -1, l5: 0, l10: 1 },
  paperRank: { l1: 12, l3: 11, l5: 10, l10: 9 }, bookRank: { l1: 1, l3: 1, l5: 1, l10: 1 },
})

const fillers = Array.from({ length: 15 }, (_, index) => player({
  mlbId: index + 4, name: `Player ${index + 4}`, team: index < 6 ? 'CLE' : 'DET',
  battingOrder: index < 6 ? index + 4 : index - 5,
  fhr: { current: 1000 + index * 100, open: 1000 + index * 100 },
  hr: { current: 650 + index * 35, open: 650 + index * 35 }, hrPicks: 20 + index,
}))

const game: HrIntelGameInput = {
  date: '2026-08-10', gamePk: 999001, gameKey: 'det-cle-2026-08-10', awayTeam: 'DET', homeTeam: 'CLE',
  awayLineupConfirmed: true, homeLineupConfirmed: true, noHr: { current: 420, open: 420 },
  players: [chase, jo, lowe, ...fillers],
}

const result = analyzeHrGame(game)
const repeatedResult = analyzeHrGame(game)
assert.equal(result.diagnostics.pairCount, 153, 'An 18-player game must score all 153 unordered pairings')
assert.equal(result.recommendation.fhrAnchorMlbId, null, 'An unproven exact FHR gate must not publish an anchor')
assert.equal(result.recommendation.diagnosticLeaderMlbId, chase.mlbId, 'Chase must remain the diagnostic leader')
assert.equal(result.recommendation.contradictionLeaderMlbId, chase.mlbId, 'Chase must remain the contradiction leader')
assert.deepEqual(repeatedResult, result, 'Identical game inputs must produce identical analysis')
assert.equal(result.recommendation.anytimeCompanionMlbId, null, 'The analyzer must not force an unvalidated anytime companion')
assert.ok(result.recommendation.fhrShortlistMlbIds.includes(chase.mlbId), 'The FHR shortlist must retain the contradiction leader')
assert.ok(result.recommendation.companionShortlistMlbIds.includes(jo.mlbId), 'Jo must remain visible in the companion watchlist')
assert.equal(result.recommendation.advertisedAlternativeMlbId, lowe.mlbId, 'Lowe must remain the advertised alternative')

const abstain = analyzeHrGame({ ...game, gamePk: 999002, awayLineupConfirmed: false, players: game.players.slice(0, 17), noHr: { current: -120, open: -110 } })
assert.equal(abstain.recommendation.status, 'abstain', 'Incomplete lineups and a strong No HR price must produce an abstain')

const missingExposure = analyzeHrGame({
  ...game,
  gamePk: 999003,
  players: game.players.map(candidate => ({
    ...candidate,
    hrPicks: null,
    picksByMarket: Object.fromEntries(Object.keys(candidate.picksByMarket).map(key => [key, null])),
  })),
})
assert.equal(missingExposure.recommendation.status, 'abstain', 'Missing exposure must fail closed')
assert.equal(missingExposure.recommendation.dataComplete, false, 'Missing exposure must mark the board partial')
assert.equal(missingExposure.recommendation.fhrAnchorMlbId, null, 'Missing exposure must never publish an exact FHR call')
assert.ok(missingExposure.recommendation.fhrShortlistMlbIds.length > 0, 'Diagnostic candidates must remain inspectable when publication is withheld')

console.log(JSON.stringify({
  pairCount: result.diagnostics.pairCount,
  diagnosticLeader: result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === result.recommendation.diagnosticLeaderMlbId)?.name,
  companion: result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === result.recommendation.anytimeCompanionMlbId)?.name,
  companionWatchlist: result.recommendation.companionShortlistMlbIds.map((id: number) => result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === id)?.name),
  advertised: result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === result.recommendation.advertisedAlternativeMlbId)?.name,
  confidence: result.recommendation.confidence,
  abstain: abstain.recommendation.status,
  missingExposure: missingExposure.recommendation.status,
}, null, 2))
