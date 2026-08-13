import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  HrIntelGameInput,
  HrIntelMetricWindow,
  HrIntelPlayerInput,
} from '../src/lib/hrIntelligence'
import { HR_INTELLIGENCE_CALIBRATION } from '../src/lib/hrIntelligenceCalibration.ts'

const hrIntelligenceModule = '../src/lib/hrIntelligence.ts'
const { analyzeHrGame } = await import(hrIntelligenceModule)
const { buildRealizedHrOutcomes } = await import('../src/lib/hrOutcomeValidation.ts')

const exactBosTorInput = JSON.parse(readFileSync(
  resolve(process.cwd(), 'scripts/fixtures/hr-intelligence/bos-tor-2026-08-13.json'),
  'utf8',
)) as HrIntelGameInput

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
  sb1: { current: 800, open: 800 }, sb2: { current: 5000, open: 5000 }, hrr: { current: 700, open: 700 },
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
    boardMetrics: {
      isPowerCandidate: false, paToHr: 0.35, hrToRbi: 0.35, hrToMoneyline: 1.35, mgmToFanduel: 1,
    },
    ...rest,
  }
}

const chase = player({
  mlbId: 1, name: 'Chase DeLauter', team: 'CLE', battingOrder: 2,
  fhr: { current: 950, open: 950 }, hr: { current: 630, open: 560 },
  fhrBaselineDeltaPct: -5, hrBaselineDeltaPct: 3.2, hrPicks: 25,
  windows: {
    season: statWindow({ avgEv: 90, maxEv: 108, hardHitPct: 44, barrelPct: 10, sweetSpotPct: 34, avgBatSpeed: 73, pullAirRate: 0.18 }),
    l10: statWindow({ hr: 0, avgEv: 93, maxEv: 112, hardHitPct: 53, barrelPct: 15, sweetSpotPct: 42, avgBatSpeed: 75, pullAirRate: 0.27 }),
    l5: statWindow({ bbe: 8, pa: 14, hr: 0, avgEv: 94, maxEv: 112, hardHitPct: 56, barrelPct: 17, sweetSpotPct: 44, avgBatSpeed: 75.5, pullAirRate: 0.29 }),
    l3: statWindow({ bbe: 5, pa: 9, hr: 0, avgEv: 95, maxEv: 112, hardHitPct: 60, barrelPct: 18, sweetSpotPct: 45, avgBatSpeed: 76, pullAirRate: 0.31 }),
    l1: statWindow({ bbe: 3, pa: 4, hr: 0, avgEv: 96, maxEv: 112, hardHitPct: 67, barrelPct: 20, sweetSpotPct: 50, avgBatSpeed: 76, pullAirRate: 0.33 }),
  },
  mm: { l1: 7, l3: 7, l5: 7, l10: 7 },
  paperRank: { l1: 1, l3: 1, l5: 1, l10: 1 }, bookRank: { l1: 8, l3: 8, l5: 8, l10: 8 },
})

const jo = player({
  mlbId: 2, name: 'Jo Adell', team: 'CLE', battingOrder: 5,
  fhr: { current: 900, open: 900 }, hr: { current: 500, open: 460 },
  fhrBaselineDeltaPct: -0.6, hrBaselineDeltaPct: 1.4, hrPicks: 85,
  markets: {
    ...neutralMarkets,
    hr2: { current: 3600, open: 3000 }, laser105: { current: 950, open: 800 },
    laser110: { current: 2400, open: 1800 }, moonshot: { current: 1900, open: 1500 },
  },
  windows: {
    season: statWindow({ avgEv: 91, maxEv: 111, hardHitPct: 47, barrelPct: 12, sweetSpotPct: 33, avgBatSpeed: 74, pullAirRate: 0.2 }),
    l10: statWindow({ avgEv: 94, maxEv: 114, hardHitPct: 57, barrelPct: 18, sweetSpotPct: 42, avgBatSpeed: 76, pullAirRate: 0.29 }),
    l5: statWindow({ bbe: 8, pa: 14, avgEv: 95, maxEv: 114, hardHitPct: 60, barrelPct: 20, sweetSpotPct: 45, avgBatSpeed: 76.5, pullAirRate: 0.31 }),
    l3: statWindow({ bbe: 5, pa: 9, avgEv: 96, maxEv: 114, hardHitPct: 63, barrelPct: 22, sweetSpotPct: 47, avgBatSpeed: 77, pullAirRate: 0.33 }),
    l1: statWindow({ bbe: 3, pa: 4, avgEv: 97, maxEv: 114, hardHitPct: 67, barrelPct: 24, sweetSpotPct: 50, avgBatSpeed: 77, pullAirRate: 0.35 }),
  },
  mm: { l1: -2, l3: -2, l5: -2, l10: -2 },
  paperRank: { l1: 6, l3: 6, l5: 6, l10: 6 }, bookRank: { l1: 4, l3: 4, l5: 4, l10: 4 },
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
assert.equal(HR_INTELLIGENCE_CALIBRATION.qualifiedRules.length, 0, 'No publication rule may be added without a new dated walk-forward audit')
assert.equal(result.diagnostics.pairCount, 153, 'An 18-player game must score all 153 unordered pairings')
assert.equal(result.recommendation.fhrAnchorMlbId, null, 'An unproven exact FHR gate must not publish an anchor')
assert.equal(result.recommendation.diagnosticLeaderMlbId, chase.mlbId, 'Chase must remain the diagnostic leader')
assert.equal(result.recommendation.contradictionLeaderMlbId, chase.mlbId, 'Chase must remain the contradiction leader')
assert.deepEqual(repeatedResult, result, 'Identical game inputs must produce identical analysis')
assert.equal(result.recommendation.anytimeCompanionMlbId, null, 'The analyzer must not force an unvalidated anytime companion')
assert.deepEqual(result.recommendation.fhrCandidateMlbIds, [], 'Unvalidated historical shapes must not publish an FHR candidate')
assert.deepEqual(result.recommendation.anytimeCandidateMlbIds, [], 'Unvalidated historical shapes must not publish an anytime-HR candidate')
assert.deepEqual(result.recommendation.fhrShortlistMlbIds, [chase.mlbId], 'Chase must remain inspectable as the protected-divergence hypothesis')
assert.deepEqual(result.recommendation.companionShortlistMlbIds, [jo.mlbId], 'Jo must remain inspectable as the role-reset companion hypothesis')
assert.equal(result.recommendation.publicationEligible, false, 'A post-hoc fixture must never qualify itself for publication')
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
assert.deepEqual(missingExposure.recommendation.fhrCandidateMlbIds, [], 'Missing exposure must leave the published set empty')
assert.ok(missingExposure.recommendation.fhrShortlistMlbIds.length > 0, 'Diagnostic hypotheses must remain inspectable when publication is withheld')

const beavers = player({
  mlbId: 81, name: 'Dylan Beavers', team: 'BAL', battingOrder: 5,
  fhr: { current: 1200, open: 1200 }, hr: { current: 700, open: 680 },
  hrPicks: 10,
  markets: {
    ...neutralMarkets,
    pa1: { current: 2200, open: 2200 }, hrMl: { current: 950, open: 950 },
    rbi1: { current: 170, open: 185 }, rbi2: { current: 550, open: 600 },
    doubles: { current: 400, open: 380 }, tb4: { current: 500, open: 490 },
  },
  picksByMarket: { home_runs: 10, hits: 4, runs: 2, stolen_bases: 0, singles: 2, doubles: 2, triples: 0, rbi: 0, hits_runs_rbi: 35, bases: 19 },
  mm: { l1: 3, l3: 6, l5: 1, l10: 6 },
  paperRank: { l1: 2, l3: 1, l5: 2, l10: 1 }, bookRank: { l1: 11, l3: 11, l5: 11, l10: 11 },
  boardMetrics: { isPowerCandidate: true, fhrToHr: 0.615, paToHr: 0.35, hrToRbi: 0.34, hrToHrr: 0.239, hrToTb4: 0.75, hrToTwoHr: 12.625, hrToMoneyline: 1.31, mgmToFanduel: 1.03 },
})
const taveras = player({
  mlbId: 82, name: 'Leody Taveras', team: 'BAL', battingOrder: 7,
  fhr: { current: 1500, open: 1500 }, hr: { current: 680, open: 630 },
  hrPicks: 7,
  markets: {
    ...neutralMarkets,
    pa1: { current: 2200, open: 2200 }, hrMl: { current: 1000, open: 1000 },
    rbi1: { current: 190, open: 175 }, doubles: { current: 400, open: 340 },
    tb4: { current: 490, open: 450 },
  },
  picksByMarket: { home_runs: 7, hits: 12, runs: 0, stolen_bases: 2, singles: 4, doubles: 0, triples: 0, rbi: 0, hits_runs_rbi: 5, bases: 8 },
  mm: { l1: -1, l3: -1, l5: 2, l10: -3 },
  paperRank: { l1: 1, l3: 2, l5: 1, l10: 2 }, bookRank: { l1: 9, l3: 9, l5: 9, l10: 9 },
  boardMetrics: { isPowerCandidate: true, fhrToHr: 0.488, paToHr: 0.34, hrToRbi: 0.37, hrToHrr: 0.256, hrToTb4: 0.756, hrToTwoHr: 12.949, hrToMoneyline: 1.41, mgmToFanduel: 0.89 },
})
const balMinFillers = Array.from({ length: 16 }, (_, index) => player({
  mlbId: 83 + index, name: `BAL-MIN Player ${index + 1}`, team: index < 7 ? 'BAL' : 'MIN',
  battingOrder: index < 7 ? index + 1 : index - 6,
  fhr: { current: 650 + index * 110, open: 650 + index * 110 },
  hr: { current: 360 + index * 45, open: 360 + index * 45 }, hrPicks: 45 + index * 6,
  paperRank: { l1: 3 + index, l3: 3 + index, l5: 3 + index, l10: 3 + index },
  bookRank: { l1: 1 + index, l3: 1 + index, l5: 1 + index, l10: 1 + index },
}))
const balMin = analyzeHrGame({
  ...game, gamePk: 999008, gameKey: 'BAL@MIN', awayTeam: 'BAL', homeTeam: 'MIN',
  players: [beavers, taveras, ...balMinFillers],
})
assert.deepEqual(balMin.recommendation.fhrShortlistMlbIds, [beavers.mlbId], 'The earlier-hitting BAL structural anchor must lead the diagnostic FHR read')
assert.deepEqual(balMin.recommendation.companionShortlistMlbIds, [taveras.mlbId], 'The aligned low-exposure BAL PWR companion must survive')
assert.equal(balMin.recommendation.boardFhrMlbId, beavers.mlbId, 'The full-board payoff resolver must keep Beavers as the FHR anchor')
assert.equal(balMin.recommendation.boardCompanionMlbId, taveras.mlbId, 'The full-board payoff resolver must keep Taveras as the quiet companion')
assert.equal(balMin.diagnostics.gameRegime.length > 0, true, 'Every complete board must receive a game regime')
assert.ok(
  balMin.players.find((candidate: { mlbId: number; isPowerCandidate: boolean }) => candidate.mlbId === beavers.mlbId)?.isPowerCandidate &&
  balMin.players.find((candidate: { mlbId: number; isPowerCandidate: boolean }) => candidate.mlbId === taveras.mlbId)?.isPowerCandidate,
  'Both BAL structural candidates must reproduce the Dugout PWR gate',
)
assert.ok(!balMin.recommendation.fhrCandidateMlbIds.length, 'A new structural pattern remains diagnostic until walk-forward validation')

const ruiz = player({
  mlbId: 101, name: 'Esteury Ruiz', team: 'MIA', battingOrder: 9,
  fhr: { current: 2200, open: 2000 }, hr: { current: 1060, open: 1060 },
  fhrBaselineDeltaPct: 31.7, hrBaselineDeltaPct: 18.3, hrPicks: 3,
  markets: {
    ...neutralMarkets,
    rbi1: { current: 550, open: 650 }, tb2: { current: 500, open: 600 },
    tb3: { current: 1400, open: 1800 }, tb4: { current: 3000, open: 4000 },
    hits1: { current: -110, open: 100 }, runs1: { current: 450, open: 600 },
    hrr: { current: 900, open: 1200 },
  },
  mm: { l1: 6, l3: 5, l5: 5, l10: 6 },
  paperRank: { l1: 4, l3: 4, l5: 12, l10: 14 },
  bookRank: { l1: 14, l3: 14, l5: 14, l10: 14 },
})
const pitMiaFillers = Array.from({ length: 17 }, (_, index) => player({
  mlbId: 102 + index, name: `PIT-MIA Player ${index + 1}`, team: index < 8 ? 'MIA' : 'PIT',
  battingOrder: index < 8 ? index + 1 : index - 7,
  fhr: { current: 650 + index * 90, open: index < 5 ? 800 + index * 90 : 650 + index * 90 },
  hr: { current: 400 + index * 45, open: index < 5 ? 500 + index * 45 : 400 + index * 45 },
  fhrBaselineDeltaPct: index < 5 ? -22 : -4, hrBaselineDeltaPct: index < 5 ? -18 : -3,
  hrPicks: index < 5 ? 295 - index * 35 : 12 + index,
  mm: { l1: -2, l3: -1, l5: 0, l10: 0 },
  paperRank: { l1: 8 + index / 4, l3: 8 + index / 4, l5: 8 + index / 4, l10: 8 + index / 4 },
  bookRank: { l1: 1 + index, l3: 1 + index, l5: 1 + index, l10: 1 + index },
}))
const pitMia = analyzeHrGame({
  ...game, gamePk: 999004, gameKey: 'PIT@MIA', awayTeam: 'PIT', homeTeam: 'MIA',
  noHr: { current: 320, open: 310 }, players: [ruiz, ...pitMiaFillers],
})
assert.deepEqual(pitMia.recommendation.anytimeCandidateMlbIds, [], 'A containment-tail case study must not self-validate for publication')
assert.deepEqual(pitMia.recommendation.fhrShortlistMlbIds, [ruiz.mlbId], 'Ruiz must remain the sole containment-tail diagnostic hypothesis')

const randy = player({
  mlbId: 201, name: 'Randy Arozarena', team: 'SEA', battingOrder: 2,
  fhr: { current: 850, open: 900 }, hr: { current: 460, open: 440 },
  fhrBaselineDeltaPct: -21.9, hrBaselineDeltaPct: -25.3, hrPicks: 80,
  paperRank: { l1: 12, l3: 13, l5: 13, l10: 12 }, bookRank: { l1: 12, l3: 12, l5: 12, l10: 12 },
})
const ward = player({
  mlbId: 202, name: 'Taylor Ward', team: 'SEA', battingOrder: 1,
  fhr: { current: 850, open: 800 }, hr: { current: 460, open: 450 },
  fhrBaselineDeltaPct: -24.1, hrBaselineDeltaPct: -22, hrPicks: 40,
  paperRank: { l1: 7, l3: 8, l5: 9, l10: 10 }, bookRank: { l1: 11, l3: 11, l5: 11, l10: 11 },
})
const seaNyyFillers = Array.from({ length: 16 }, (_, index) => player({
  mlbId: 203 + index, name: `SEA-NYY Player ${index + 1}`, team: index < 7 ? 'SEA' : 'NYY',
  battingOrder: index < 7 ? index + 3 : index - 6,
  fhr: { current: 600 + index * 120, open: 700 + index * 120 },
  hr: { current: 340 + index * 45, open: 420 + index * 45 },
  fhrBaselineDeltaPct: -25, hrBaselineDeltaPct: -22, hrPicks: 700 - index * 28,
  mm: { l1: -2, l3: -2, l5: -1, l10: 0 },
  paperRank: { l1: 8, l3: 9, l5: 10, l10: 11 }, bookRank: { l1: 1 + index, l3: 1 + index, l5: 1 + index, l10: 1 + index },
}))
const seaNyy = analyzeHrGame({
  ...game, gamePk: 999005, gameKey: 'SEA@NYY', awayTeam: 'SEA', homeTeam: 'NYY',
  noHr: { current: 1400, open: 1200 }, players: [randy, ward, ...seaNyyFillers],
})
assert.ok(seaNyy.recommendation.fhrShortlistMlbIds.includes(randy.mlbId), 'Randy must win the diagnostic +850 FHR tie through relative movement')
assert.ok(!seaNyy.recommendation.fhrShortlistMlbIds.includes(ward.mlbId), 'Ward must not survive the same-price diagnostic tie-break')
assert.deepEqual(seaNyy.recommendation.fhrCandidateMlbIds, [], 'The diagnostic tie-break must not become a published pick')

const ozzie = player({
  mlbId: 301, name: 'Ozzie Albies', team: 'ATL', battingOrder: 3,
  fhr: { current: 1300, open: 1300 }, hr: { current: 600, open: 450 },
  fhrBaselineDeltaPct: 8.6, hrBaselineDeltaPct: -6.3, hrPicks: 19,
  markets: {
    ...neutralMarkets,
    rbi1: { current: 370, open: 450 }, tb2: { current: 600, open: 700 },
    tb3: { current: 2000, open: 2600 }, tb4: { current: 5500, open: 7000 },
    hits1: { current: -150, open: -120 }, runs1: { current: 210, open: 260 },
    hrr: { current: 950, open: 1200 },
  },
  mm: { l1: 5, l3: 5, l5: 4, l10: 4 },
  paperRank: { l1: 7, l3: 7, l5: 7, l10: 7 }, bookRank: { l1: 10, l3: 10, l5: 10, l10: 10 },
})
const riley = player({
  mlbId: 302, name: 'Austin Riley', team: 'ATL', battingOrder: 7,
  fhr: { current: 1300, open: 1400 }, hr: { current: 560, open: 650 },
  fhrBaselineDeltaPct: 49.7, hrBaselineDeltaPct: 6.8, hrPicks: 18,
  mm: { l1: 5, l3: 5, l5: 4, l10: 3 },
  paperRank: { l1: 12, l3: 12, l5: 12, l10: 12 }, bookRank: { l1: 7, l3: 7, l5: 7, l10: 7 },
})
const olson = player({
  mlbId: 303, name: 'Matt Olson', team: 'ATL', battingOrder: 4,
  fhr: { current: 700, open: 600 }, hr: { current: 310, open: 265 },
  fhrBaselineDeltaPct: 3.1, hrBaselineDeltaPct: -15.7, hrPicks: 657,
  markets: {
    ...neutralMarkets,
    hr2: { current: 1900, open: 1700 }, laser105: { current: 490, open: 450 },
    rbi1: { current: 290, open: 250 }, tb2: { current: 500, open: 460 },
    tb3: { current: 1900, open: 1700 }, tb4: { current: 2200, open: 2000 },
  },
  windows: {
    season: statWindow({ avgEv: 92, maxEv: 113, hardHitPct: 52, barrelPct: 16, sweetSpotPct: 35, avgBatSpeed: 75, pullAirRate: 0.25 }),
    l10: statWindow({ avgEv: 95, maxEv: 115, hardHitPct: 60, barrelPct: 20, sweetSpotPct: 40, avgBatSpeed: 76, pullAirRate: 0.30 }),
    l5: statWindow({ bbe: 8, pa: 14, avgEv: 96, maxEv: 115, hardHitPct: 63, barrelPct: 22, sweetSpotPct: 42, avgBatSpeed: 76.5, pullAirRate: 0.32 }),
    l3: statWindow({ bbe: 5, pa: 9, avgEv: 97, maxEv: 115, hardHitPct: 67, barrelPct: 24, sweetSpotPct: 45, avgBatSpeed: 77, pullAirRate: 0.34 }),
    l1: statWindow({ bbe: 3, pa: 4, avgEv: 98, maxEv: 115, hardHitPct: 67, barrelPct: 25, sweetSpotPct: 50, avgBatSpeed: 77, pullAirRate: 0.36 }),
  },
  mm: { l1: 9, l3: 8, l5: 8, l10: 7 },
  paperRank: { l1: 2, l3: 2, l5: 2, l10: 2 }, bookRank: { l1: 3, l3: 3, l5: 3, l10: 3 },
})
const nymAtlFillers = Array.from({ length: 15 }, (_, index) => player({
  mlbId: 304 + index, name: `NYM-ATL Player ${index + 1}`, team: index < 6 ? 'ATL' : 'NYM',
  battingOrder: index < 6 ? index + 1 : index - 5,
  fhr: { current: 650 + index * 100, open: 750 + index * 100 },
  hr: { current: 380 + index * 45, open: 460 + index * 45 },
  fhrBaselineDeltaPct: index < 4 ? -20 : -3, hrBaselineDeltaPct: index < 4 ? -16 : -2,
  hrPicks: index < 4 ? 554 - index * 100 : 12 + index,
  mm: { l1: -2, l3: -1, l5: 0, l10: 0 },
  paperRank: { l1: 9, l3: 9, l5: 9, l10: 9 }, bookRank: { l1: 1 + index, l3: 1 + index, l5: 1 + index, l10: 1 + index },
}))
const nymAtl = analyzeHrGame({
  ...game, gamePk: 999006, gameKey: 'NYM@ATL', awayTeam: 'NYM', homeTeam: 'ATL',
  noHr: { current: 600, open: 650 }, players: [ozzie, riley, olson, ...nymAtlFillers],
})
assert.deepEqual(nymAtl.recommendation.fhrShortlistMlbIds, [ozzie.mlbId], 'Ozzie must win the diagnostic +1300 FHR tie over the promoted Riley price')
assert.ok(nymAtl.recommendation.companionShortlistMlbIds.includes(olson.mlbId), 'Olson must survive as the secondary HR hypothesis')
assert.ok(!nymAtl.recommendation.companionShortlistMlbIds.includes(riley.mlbId), 'Riley must not survive the same-price diagnostic tie-break')
assert.deepEqual(nymAtl.recommendation.anytimeCandidateMlbIds, [], 'NYM-ATL must not publish a post-hoc candidate set')

const durbin = player({
  mlbId: 702332, name: 'Caleb Durbin', team: 'BOS', battingOrder: 6,
  fhr: { current: 1400, open: 1600 }, hr: { current: 800, open: 750 },
  fhrBaselineDeltaPct: -33, hrBaselineDeltaPct: -24.6, hrPicks: 8,
  markets: {
    ...neutralMarkets,
    hr2: { current: 12500, open: 10000 }, laser105: { current: 5000, open: 5000 },
    moonshot: { current: 3300, open: 3300 }, pa1: { current: null, open: null },
    hrMl: { current: 1000, open: 1000 }, hrr: { current: -260, open: 100 },
    rbi1: { current: 200, open: 210 }, rbi2: { current: 750, open: 700 },
    rbi3: { current: 6500, open: 6000 }, doubles: { current: 500, open: 470 },
    runs1: { current: 150, open: 130 }, sb1: { current: 400, open: 500 },
  },
  picksByMarket: { home_runs: 8, hits: 8, runs: 0, stolen_bases: 2, singles: 8, doubles: 26, triples: 2, rbi: 1, hits_runs_rbi: 63, bases: 5 },
  mm: { l1: 2, l3: 2, l5: 2, l10: 3 },
  paperRank: { l1: 12, l3: 12, l5: 12, l10: 11 }, bookRank: { l1: 14, l3: 14, l5: 14, l10: 14 },
  windows: {
    season: statWindow(), l10: statWindow({ avgEv: 88.8, hardHitPct: 39 }),
    l5: statWindow({ bbe: 8, pa: 14, avgEv: 88.7, hardHitPct: 38 }),
    l3: statWindow({ bbe: 5, pa: 9, avgEv: 88.5, hardHitPct: 38 }),
    l1: statWindow({ bbe: 3, pa: 4, avgEv: 88.5, hardHitPct: 37 }),
  },
})
const bosTorFillers = Array.from({ length: 17 }, (_, index) => player({
  mlbId: 710000 + index, name: `BOS-TOR Player ${index + 1}`, team: index < 8 ? 'BOS' : 'TOR',
  battingOrder: index < 8 ? index + 1 : index - 7,
  fhr: { current: 550 + index * 95, open: 650 + index * 95 },
  hr: { current: 320 + index * 38, open: 380 + index * 38 },
  fhrBaselineDeltaPct: -12 - index / 3, hrBaselineDeltaPct: -9 - index / 4,
  hrPicks: 25 + index * 11,
  picksByMarket: {
    home_runs: 25 + index * 11, hits: 18 + index * 4, runs: 10 + index * 3,
    stolen_bases: index % 4, singles: 6 + index, doubles: 3 + index,
    triples: index % 2, rbi: 12 + index * 3, hits_runs_rbi: 8 + index * 2, bases: 14 + index * 3,
  },
  mm: { l1: -2, l3: -1, l5: 0, l10: 0 },
  paperRank: { l1: index + 1, l3: index + 1, l5: index + 1, l10: index + 1 },
  bookRank: { l1: index + 1, l3: index + 1, l5: index + 1, l10: index + 1 },
}))
const bosTor = analyzeHrGame({
  ...game, gamePk: 999009, gameKey: 'BOS@TOR', awayTeam: 'BOS', homeTeam: 'TOR',
  players: [durbin, ...bosTorFillers],
})
const durbinResult = bosTor.players.find((candidate: { mlbId: number }) => candidate.mlbId === durbin.mlbId)!
assert.equal(bosTor.recommendation.boardFhrMlbId, durbin.mlbId, 'The payoff-compressed BOS board must reduce to Durbin')
assert.notEqual(bosTor.recommendation.boardCompanionMlbId, null, 'Every complete board must return a second, distinct player')
assert.notEqual(bosTor.recommendation.boardCompanionMlbId, durbin.mlbId, 'The companion must be distinct from the FHR anchor')
assert.equal(durbinResult.diagnosticArchetype, 'payoff-compressed', 'Durbin must be identified as the compressed jackpot swing')
assert.ok(durbinResult.payoffCompressionScore >= 64, 'Durbin must clear the payoff-compression gate')
const [durbinOutcome] = buildRealizedHrOutcomes(bosTor, [{
  game_pk: bosTor.gamePk,
  player_name: durbin.name,
  name_norm: 'caleb durbin',
  mlb_id: durbin.mlbId,
  pitcher_name: 'Pitcher',
  pitcher_mlb_id: 999,
  inning: 8,
  half: 'top',
  is_first_hr_of_game: true,
  ab_index: 55,
  desc: 'Caleb Durbin hits a grand slam.',
  exit_velocity: 102,
  launch_angle: 28,
  hit_distance: 402,
  hr_time: '2026-08-13T20:00:00Z',
  rbi_on_play: 4,
  is_grand_slam: true,
}], {
  [durbin.mlbId]: { h: 2, doubles: 0, triples: 0, hr: 1, rbi: 4, runs: 1, singles: 1, tb: 5, sb: 0, hrr: 7 },
})
assert.equal(durbinOutcome.grandSlam, true, 'The exact HR play must retain the grand slam')
assert.equal(durbinOutcome.maxHrSwingRbi, 4, 'The exact HR swing must retain four RBI')
assert.equal(durbinOutcome.onlyHitWasHr, false, 'Durbin had another hit and must not be mislabeled as HR-only')
assert.equal(durbinOutcome.additionalHit, true, 'Durbin must retain the additional-hit outcome')
assert.ok(durbinOutcome.cashedMarkets.includes('5+ TB'), 'Five total bases must settle as cashed')
assert.ok(durbinOutcome.cashedMarkets.includes('3+ RBI'), 'Four RBI must settle the 3+ RBI ladder')
assert.ok(durbinOutcome.cashedMarkets.includes('2+ Hits'), 'Two hits must settle the 2+ hits ladder')
assert.ok(durbinOutcome.missedMarkets.includes('2+ HR'), 'One home run must leave 2+ HR missed')

// This is the frozen, outcome-blind BOS@TOR board captured before scoring.
// It protects the full 18-player reduction instead of merely testing a
// hand-shaped player in isolation.
const exactBosTor = analyzeHrGame(exactBosTorInput)
const exactDurbin = exactBosTor.players.find((candidate: { name: string }) => candidate.name === 'Caleb Durbin')!
assert.equal(exactBosTor.players.length, 18, 'The exact BOS@TOR fixture must retain all 18 hitters')
assert.equal(exactDurbin.diagnosticArchetype, 'payoff-compressed', 'The exact board must classify Durbin as payoff-compressed')
assert.equal(exactBosTor.recommendation.boardFhrMlbId, exactDurbin.mlbId, 'The exact pregame board must reduce to Durbin')
assert.notEqual(exactBosTor.recommendation.boardCompanionMlbId, null, 'The exact complete board must return two players')
assert.notEqual(exactBosTor.recommendation.boardCompanionMlbId, exactDurbin.mlbId, 'The exact board companion must be distinct from Durbin')
assert.equal(exactDurbin.hrPicks, 8, 'The exact board must retain Durbin\'s quiet HR exposure')
assert.equal(exactDurbin.picksByMarket.rbi, 1, 'The exact board must retain Durbin\'s quiet RBI exposure')
assert.equal(exactDurbin.picksByMarket.hits_runs_rbi, 63, 'The exact board must retain Durbin\'s concentrated H+R+RBI exposure')
assert.equal(exactDurbin.picksByMarket.doubles, 26, 'The exact board must retain Durbin\'s adjacent doubles exposure')

console.log(JSON.stringify({
  pairCount: result.diagnostics.pairCount,
  diagnosticLeader: result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === result.recommendation.diagnosticLeaderMlbId)?.name,
  companion: result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === result.recommendation.anytimeCompanionMlbId)?.name,
  companionWatchlist: result.recommendation.companionShortlistMlbIds.map((id: number) => result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === id)?.name),
  advertised: result.players.find((candidate: { mlbId: number; name: string }) => candidate.mlbId === result.recommendation.advertisedAlternativeMlbId)?.name,
  confidence: result.recommendation.confidence,
  abstain: abstain.recommendation.status,
  missingExposure: missingExposure.recommendation.status,
  pitMia: pitMia.recommendation.fhrShortlistMlbIds,
  seaNyy: seaNyy.recommendation.fhrShortlistMlbIds,
  nymAtl: nymAtl.recommendation.fhrShortlistMlbIds,
  balMinBoardPair: [balMin.recommendation.boardFhrMlbId, balMin.recommendation.boardCompanionMlbId],
  bosTorBoardFhr: bosTor.recommendation.boardFhrMlbId,
  exactBosTorBoardFhr: exactBosTor.recommendation.boardFhrMlbId,
  exactBosTorCompanion: exactBosTor.recommendation.boardCompanionMlbId,
  durbinCompression: durbinResult.payoffCompressionScore,
}, null, 2))
