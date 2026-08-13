export type HrIntelWindow = 'l1' | 'l3' | 'l5' | 'l10'

export type HrIntelMetricWindow = {
  bbe: number | null
  pa: number | null
  avg: number | null
  hr: number | null
  avgEv: number | null
  maxEv: number | null
  hardHitPct: number | null
  barrelPct: number | null
  sweetSpotPct: number | null
  avgBatSpeed: number | null
  hardSwingRate?: number | null
  squaredUpPct?: number | null
  blastPct?: number | null
  avgSwingLength?: number | null
  avgAttackAngle?: number | null
  idealAttackAngleRate?: number | null
  avgTilt?: number | null
  avgLa?: number | null
  fbRate?: number | null
  onTimePct?: number | null
  missDistance?: number | null
  pullAirRate: number | null
}

export type HrIntelMarket = {
  current: number | null
  open: number | null
}

import { HR_INTELLIGENCE_CALIBRATION } from './hrIntelligenceCalibration.ts'

export type HrIntelBook = 'fanduel' | 'caesars' | 'betmgm' | 'betrivers' | 'fanatics'

export type HrIntelBookMarkets = Partial<Record<HrIntelBook, HrIntelMarket>>

export type HrIntelPlayerInput = {
  mlbId: number
  name: string
  team: string
  opponent: string
  battingOrder: number
  position: string
  bats: string
  projected: boolean
  fhr: HrIntelMarket
  hr: HrIntelMarket
  marketBooks?: {
    fhr: HrIntelBookMarkets
    hr: HrIntelBookMarkets
  }
  markets: Record<string, HrIntelMarket>
  fhrBaselineDeltaPct: number | null
  hrBaselineDeltaPct: number | null
  hrPicks: number | null
  picksByMarket: Record<string, number | null>
  windows: Record<'season' | HrIntelWindow, HrIntelMetricWindow | null>
  mm: Record<HrIntelWindow, number | null> | null
  paperRank: Record<HrIntelWindow, number | null> | null
  bookRank: Record<HrIntelWindow, number | null> | null
  contextReset: boolean
  boardMetrics: {
    isPowerCandidate: boolean
    fdCaesarsFhrGap?: number | null
    fhrToHr?: number | null
    paToHr: number | null
    hrToRbi: number | null
    hrToRbi2?: number | null
    hrToRbi3?: number | null
    hrToHrr?: number | null
    hrToTb2?: number | null
    hrToTb3?: number | null
    hrToTb4?: number | null
    hrToTb5?: number | null
    hrToTwoHr?: number | null
    hrToMoneyline: number | null
    mgmToFanduel: number | null
  }
}

export type HrIntelEvidence = {
  key: string
  label: string
  value: string
  tone: 'positive' | 'warning' | 'neutral'
}

export type HrIntelPlayerResult = HrIntelPlayerInput & {
  fhrScore: number
  modelFhrScore: number
  contradictionScore: number
  formSupportScore: number
  anytimeScore: number
  advertisedScore: number
  selectionScore: number
  regimeScore: number
  calibratedAnytimeScore: number
  graphFhrScore: number
  graphAnytimeScore: number
  payoffIsolationScore: number
  payoffCompressionScore: number
  diagnosticFhrScore: number
  diagnosticAnytimeScore: number
  decoyRiskScore: number
  cashStackSupportScore: number
  alternativePathScore: number
  tieBreakScore: number
  crossBookSupportScore: number
  structuralPowerScore: number
  isPowerCandidate: boolean
  ratios: {
    fdCaesarsFhrGap: number | null
    fhrToHr: number | null
    paToHr: number | null
    hrToRbi: number | null
    hrToRbi2: number | null
    hrToRbi3: number | null
    hrToHrr: number | null
    hrToTb2: number | null
    hrToTb3: number | null
    hrToTb4: number | null
    hrToTb5: number | null
    hrToTwoHr: number | null
    hrToMoneyline: number | null
    mgmToFanduel: number | null
  }
  candidateArchetype: 'protected' | 'containment' | 'tie-break' | 'market-confirmed' | 'none'
  diagnosticArchetype: 'payoff-compressed' | 'payoff-isolated' | 'data-confirmed-hidden' | 'advertised-real' | 'alternative-diversion' | 'public-bait' | 'unsupported'
  qualifiedLanes: HrIntelQualifiedLane[]
  archetypeScores: {
    protected: number
    containment: number
    tieBreak: number
    marketConfirmed: number
  }
  fhrRank: number | null
  hrRank: number | null
  fhrTieSize: number
  hrTieSize: number
  publicRank: number | null
  publicSharePct: number | null
  publicPattern: {
    marketCoveragePct: number
    hrExposurePercentile: number | null
    nonHrExposurePercentile: number | null
    crossMarketDivergencePct: number | null
    redirectedExposureScore: number | null
    loudestMarket: string | null
  }
  contactAcceleration: number
  movement: {
    fhrImpliedPoints: number | null
    hrImpliedPoints: number | null
    powerShortened: number
    powerLengthened: number
    nonPowerShortened: number
    nonPowerLengthened: number
    hiddenPowerContradiction: number
  }
  evidence: HrIntelEvidence[]
}

export type HrIntelQualifiedLane =
  | 'fhr-cluster'
  | 'protected-divergence'
  | 'concealed-anchor'
  | 'tied-companion'
  | 'containment-tail'
  | 'released-favorite'
  | 'active-confirmation'
  | 'form-backed-promotion'
  | 'hidden-derivative'
  | 'structural-power-pair'

export type HrIntelPairResult = {
  anchorMlbId: number
  companionMlbId: number
  score: number
  anchorScore: number
  companionScore: number
  exposurePenalty: number
  synergy: number
  evidence: HrIntelEvidence[]
}

export type HrIntelBoardProfile = 'low-hr' | 'clustered' | 'active' | 'quiet' | 'mixed'
export type HrIntelGameRegime = 'sparse-coherent' | 'concealment-explosion' | 'advertised-explosion' | 'mixed-concentrated' | 'open-board'
export type HrIntelPrimaryLane = 'contradiction' | 'model' | 'relational'
export type HrIntelReductionLane =
  | 'market-form-anchor'
  | 'paper-book-dislocation'
  | 'split-market-protection'
  | 'payoff-compression'
  | 'payoff-redirect'
  | 'buried-derivative'
  | 'quiet-viable'
  | 'structural-fallback'

export type HrIntelGameInput = {
  date: string
  gamePk: number
  gameKey: string
  awayTeam: string
  homeTeam: string
  awayLineupConfirmed: boolean
  homeLineupConfirmed: boolean
  noHr: HrIntelMarket
  players: HrIntelPlayerInput[]
  warnings?: string[]
}

export type HrIntelGameResult = Omit<HrIntelGameInput, 'players'> & {
  players: HrIntelPlayerResult[]
  pairs: HrIntelPairResult[]
  recommendation: {
    status: 'qualified' | 'caution' | 'abstain'
    mode: 'fhr-read' | 'fhr-watch' | 'no-hr-watch' | 'abstain'
    confidence: number
    confidenceLabel: 'Low' | 'Measured' | 'Strong'
    primaryLane: HrIntelPrimaryLane
    diagnosticLeaderMlbId: number | null
    boardFhrMlbId: number | null
    boardCompanionMlbId: number | null
    boardFhrScore: number | null
    boardCompanionScore: number | null
    boardFhrLane: HrIntelReductionLane | null
    boardCompanionLane: HrIntelReductionLane | null
    fhrAnchorMlbId: number | null
    anytimeCompanionMlbId: number | null
    fhrCandidateMlbIds: number[]
    anytimeCandidateMlbIds: number[]
    fhrShortlistMlbIds: number[]
    calibratedAnytimeShortlistMlbIds: number[]
    graphFhrShortlistMlbIds: number[]
    graphAnytimeShortlistMlbIds: number[]
    companionShortlistMlbIds: number[]
    contradictionWatchMlbId: number | null
    contrarianWatchMlbIds: number[]
    contradictionLeaderMlbId: number | null
    fhrRecipe: string
    companionRecipe: string
    modelLeaderMlbId: number | null
    marketLeaderMlbId: number | null
    advertisedAlternativeMlbId: number | null
    exposureLeaderMlbId: number | null
    exactCallQualified: boolean
    multiHrRead: 'unlikely' | 'unclear' | 'elevated'
    calibrationVersion: string
    dataComplete: boolean
    publicationEligible: boolean
    publicationTarget: 'fhr' | 'anytime' | null
    publicationRuleId: string | null
    publicationReason: string
    publicationSupport: {
      trainGames: number
      calibrationGames: number
      holdoutGames: number
      trainPrecision: number
      calibrationPrecision: number
      holdoutPrecision: number
    } | null
    reason: string
  }
  diagnostics: {
    lineupSize: number
    marketCoveragePct: number
    picksCoveragePct: number
    crossMarketPicksCoveragePct: number
    noHrImpliedPct: number | null
    boardProfile: HrIntelBoardProfile
    gameRegime: HrIntelGameRegime
    regimeReasons: string[]
    fhrClusterPct: number
    movementActivityPct: number
    publicConcentrationPct: number
    redirectedExposurePct: number
    powerCandidatePct: number
    hiddenPowerPct: number
    automaticCashSupportPct: number
    payoffReleasePct: number
    paperBookDisagreementPct: number
    pairCount: number
  }
  validation?: {
    actualNoHr: boolean
    firstHrMlbId: number | null
    firstHrName: string | null
    hrMlbIds: number[]
    hrNames: string[]
    anchorHit: boolean
    diagnosticLeaderHit: boolean
    primaryPublished: boolean
    companionHit: boolean
    companionPublished: boolean
    pairHit: boolean
    fhrShortlistHit: boolean
    fhrShortlistPublished: boolean
    diagnosticFhrShortlistHit: boolean
    anytimeCandidateHits: number
    anytimeCandidateMisses: number
    anytimeCandidatesPublished: boolean
    contrarianWatchHit: boolean
    companionShortlistHit: boolean
    companionWatchPublished: boolean
    candidateSetPairHit: boolean
    candidateContrarianPairHit: boolean
    pairCoverageHit: boolean
    boardFhrHit: boolean
    boardCompanionHit: boolean
    boardPairHit: boolean
    contradictionLeaderHit: boolean
    modelLeaderHit: boolean
    marketLeaderHit: boolean
    realizedHrOutcomes: HrIntelRealizedOutcome[]
  }
  warnings: string[]
}

export type HrIntelRealizedOutcome = {
  mlbId: number
  name: string
  team: string
  firstHr: boolean
  hits: number | null
  homeRuns: number | null
  singles: number | null
  doubles: number | null
  triples: number | null
  totalBases: number | null
  runs: number | null
  rbi: number | null
  stolenBases: number | null
  hrr: number | null
  hrSwingRbiTotal: number
  maxHrSwingRbi: number
  grandSlam: boolean
  onlyHitWasHr: boolean | null
  additionalHit: boolean | null
  cashedMarkets: string[]
  missedMarkets: string[]
}

const POWER_EXTENSION_MARKETS = ['hr2', 'laser105', 'laser110', 'moonshot', 'pa1', 'hrMl']
// A single home run settles each of these positively. They are not equivalent
// to a generic non-power prop and must be evaluated as one payoff stack.
const GUARANTEED_HR_CASH_MARKETS = ['rbi1', 'tb2', 'tb3', 'tb4', 'hits1', 'runs1', 'hrr']
// These can win without a home run, or require a second event after one. They
// are useful as exposure-diversion evidence, not direct home-run confirmation.
const ALTERNATIVE_PATH_MARKETS = ['rbi2', 'rbi3', 'tb5', 'singles', 'doubles', 'triples', 'hits2', 'runs2', 'sb1', 'sb2']
const BOOKS: HrIntelBook[] = ['fanduel', 'caesars', 'betmgm', 'betrivers', 'fanatics']

// Frozen on 2026-08-08 and evaluated only against 2026-08-09 through
// 2026-08-12. This is a diagnostic ranker, not a publication rule. Keeping
// the coefficients here makes production use exactly the same feature vector
// as the chronological audit instead of rebuilding a second approximation.
const CALIBRATED_ANYTIME_INTERCEPT = -5.050686917804455
const CALIBRATED_ANYTIME_COEFFICIENTS = [
  0.000927761230879286, -0.004635442746133856, -0.006128953010040216, 0.0020710125252618706,
  0.014678901477405975, 0.0020710125252618706, 0.020146952542841445, 0.012527008364287598,
  -0.01635349201269106, 0.0028774507035637465, 0.005812970920780734, -0.0018678667122628478,
  0.0031612413684166843, -0.003898897439894011, 0.009402942760551125, 0.010852119444763298,
  0.0475541050300414, -0.039872600558372114, -0.0023303377743187957, 0.0020932586017074232,
  -0.01020733593418594, 0.009530240410986716, -0.000650847222360502, 0.0045725257526499545,
  0.051643938495624736, -0.005287197261433143, -0.01619976931689527, 0.03748626425849725,
  0.037424095291147326, 0.032487933383372844, 0.00021121288378136936, -0.44217860628052,
  -0.06728845973261764, -1.1894552899922513, 2.0493699220531583, -0.30623323465208707,
  -0.6284268422953887, 0.594700925867777, 0.18404958360404305, -0.4345262653085439,
  -0.3345776717038623, 0, -0.5033556197834146,
] as const

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const round1 = (value: number) => Math.round(value * 10) / 10
const round3 = (value: number) => Math.round(value * 1000) / 1000

export function americanImplied(odds: number | null): number | null {
  if (odds == null || !Number.isFinite(odds) || odds === 0) return null
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)
}

function impliedMove(market: HrIntelMarket): number | null {
  const current = americanImplied(market.current)
  const open = americanImplied(market.open)
  return current == null || open == null ? null : (current - open) * 100
}

function movementCounts(player: HrIntelPlayerInput, keys: string[]) {
  let shortened = 0
  let lengthened = 0
  for (const key of keys) {
    const move = impliedMove(player.markets[key] ?? { current: null, open: null })
    if (move == null || Math.abs(move) < 0.15) continue
    if (move > 0) shortened += 1
    else lengthened += 1
  }
  return { shortened, lengthened }
}

function rankByPrice(players: HrIntelPlayerInput[], market: 'fhr' | 'hr') {
  const sorted = players
    .filter(player => player[market].current != null)
    .sort((a, b) => (americanImplied(b[market].current) ?? 0) - (americanImplied(a[market].current) ?? 0))
  const ranks = new Map<number, number>()
  let previousPrice: number | null = null
  let previousRank = 0
  sorted.forEach((player, index) => {
    const price = player[market].current
    const rank = previousPrice === price ? previousRank : index + 1
    ranks.set(player.mlbId, rank)
    previousPrice = price
    previousRank = rank
  })
  return ranks
}

function bookMarket(player: HrIntelPlayerInput, market: 'fhr' | 'hr', book: HrIntelBook): HrIntelMarket {
  if (book === 'fanduel') return player.marketBooks?.[market]?.fanduel ?? player[market]
  return player.marketBooks?.[market]?.[book] ?? { current: null, open: null }
}

function rankByBookPrice(players: HrIntelPlayerInput[], market: 'fhr' | 'hr', book: HrIntelBook) {
  const sorted = players
    .map(player => ({ player, price: bookMarket(player, market, book).current }))
    .filter((entry): entry is { player: HrIntelPlayerInput; price: number } => entry.price != null)
    .sort((a, b) => (americanImplied(b.price) ?? 0) - (americanImplied(a.price) ?? 0))
  const ranks = new Map<number, number>()
  let previousPrice: number | null = null
  let previousRank = 0
  sorted.forEach(({ player, price }, index) => {
    const rank = previousPrice === price ? previousRank : index + 1
    ranks.set(player.mlbId, rank)
    previousPrice = price
    previousRank = rank
  })
  return ranks
}

function availableMovementCount(player: HrIntelPlayerInput, keys: string[]) {
  return keys.filter(key => {
    const market = player.markets[key]
    return market?.current != null && market.open != null
  }).length
}

function tieSize(players: HrIntelPlayerInput[], market: 'fhr' | 'hr', price: number | null) {
  if (price == null) return 0
  return players.filter(player => player[market].current === price).length
}

function rankByPicks(players: HrIntelPlayerInput[]) {
  const sorted = players
    .filter(player => player.hrPicks != null)
    .sort((a, b) => (b.hrPicks ?? 0) - (a.hrPicks ?? 0))
  return new Map(sorted.map((player, index) => [player.mlbId, index + 1]))
}

function mean(values: Array<number | null>) {
  const available = values.filter((value): value is number => value != null && Number.isFinite(value))
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null
}

function percentile(value: number | null, values: number[]) {
  if (value == null || !values.length) return null
  const below = values.filter(other => other < value).length
  const equal = values.filter(other => other === value).length
  return values.length === 1 ? 0.5 : (below + Math.max(0, equal - 1) / 2) / (values.length - 1)
}

function normalizedDelta(recent: number | null, season: number | null, scale: number) {
  if (recent == null || season == null || !scale) return null
  return clamp((recent - season) / scale, -1, 1)
}

function contactAcceleration(player: HrIntelPlayerInput) {
  const season = player.windows.season
  const windows: Array<{ key: HrIntelWindow; weight: number }> = [
    { key: 'l10', weight: 0.42 },
    { key: 'l5', weight: 0.30 },
    { key: 'l3', weight: 0.20 },
    { key: 'l1', weight: 0.08 },
  ]
  if (!season) return 0
  let weighted = 0
  let totalWeight = 0
  for (const { key, weight } of windows) {
    const recent = player.windows[key]
    if (!recent) continue
    const metrics = [
      normalizedDelta(recent.avgEv, season.avgEv, 5),
      normalizedDelta(recent.maxEv, season.maxEv, 8),
      normalizedDelta(recent.hardHitPct, season.hardHitPct, 22),
      normalizedDelta(recent.barrelPct, season.barrelPct, 12),
      normalizedDelta(recent.sweetSpotPct, season.sweetSpotPct, 20),
      normalizedDelta(recent.avgBatSpeed, season.avgBatSpeed, 4),
      normalizedDelta(recent.hardSwingRate ?? null, season.hardSwingRate ?? null, 18),
      normalizedDelta(recent.squaredUpPct ?? null, season.squaredUpPct ?? null, 18),
      normalizedDelta(recent.blastPct ?? null, season.blastPct ?? null, 12),
      normalizedDelta(season.avgSwingLength ?? null, recent.avgSwingLength ?? null, 1.2),
      normalizedDelta(recent.idealAttackAngleRate ?? null, season.idealAttackAngleRate ?? null, 18),
      normalizedDelta(recent.onTimePct ?? null, season.onTimePct ?? null, 18),
      normalizedDelta(season.missDistance ?? null, recent.missDistance ?? null, 5),
      normalizedDelta(recent.pullAirRate, season.pullAirRate, 0.15),
    ].filter((value): value is number => value != null)
    if (!metrics.length) continue
    const sample = clamp((recent.bbe ?? 0) / (key === 'l10' ? 12 : key === 'l5' ? 8 : key === 'l3' ? 5 : 3))
    const score = metrics.reduce((sum, value) => sum + value, 0) / metrics.length
    weighted += score * weight * (0.35 + 0.65 * sample)
    totalWeight += weight
  }
  return totalWeight ? clamp(weighted / totalWeight, -1, 1) : 0
}

function marketViability(rank: number | null, count: number) {
  if (rank == null || count < 2) return 0.35
  return 1 - (rank - 1) / (count - 1)
}

function subtleBaseline(delta: number | null) {
  if (delta == null) return 0.45
  const magnitude = Math.abs(delta)
  if (magnitude <= 8) return 1
  if (magnitude <= 16) return 0.7
  if (magnitude <= 28) return 0.35
  return 0.08
}

function quietSignal(value: number | null, scale: number) {
  if (value == null) return 0
  return clamp(1 - Math.abs(value) / scale)
}

function midMarketBand(rank: number | null, count: number) {
  if (rank == null || count < 2) return 0.15
  return rank >= 4 && rank <= Math.min(12, count) ? 1 : 0.15
}

function positiveMm(player: HrIntelPlayerInput) {
  const values = player.mm ? Object.values(player.mm).filter((value): value is number => value != null) : []
  if (!values.length) return 0.35
  const positive = values.filter(value => value > 0)
  const magnitude = positive.length ? positive.reduce((sum, value) => sum + Math.min(10, value), 0) / positive.length : 0
  return clamp((positive.length / values.length) * 0.55 + (magnitude / 10) * 0.45)
}

function positiveMeanMm(player: HrIntelPlayerInput) {
  const values = player.mm ? Object.values(player.mm).filter((value): value is number => value != null) : []
  if (!values.length) return 0
  return clamp((values.reduce((sum, value) => sum + value, 0) / values.length) / 8)
}

function meanRank(rank: HrIntelPlayerInput['paperRank']) {
  const values = rank ? Object.values(rank).filter((value): value is number => value != null) : []
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function selectDistinct(groups: HrIntelPlayerResult[][], limit: number) {
  const selected: HrIntelPlayerResult[] = []
  for (const group of groups) {
    for (const candidate of group) {
      if (!selected.some(existing => existing.mlbId === candidate.mlbId)) selected.push(candidate)
      if (selected.length >= limit) return selected
    }
  }
  return selected
}

function classifyBoard(
  noHrImpliedPct: number | null,
  fhrClusterPct: number,
  movementActivityPct: number,
): HrIntelBoardProfile {
  if (noHrImpliedPct != null && noHrImpliedPct >= 20) return 'low-hr'
  if (fhrClusterPct >= 45) return 'clustered'
  if (movementActivityPct >= 50) return 'active'
  if (movementActivityPct <= 25) return 'quiet'
  return 'mixed'
}

function fmtOdds(value: number | null) {
  return value == null ? 'Missing' : value > 0 ? `+${value}` : String(value)
}

function fmtSigned(value: number | null, suffix = '') {
  if (value == null) return 'Missing'
  return `${value > 0 ? '+' : ''}${round1(value)}${suffix}`
}

function playerEvidence(
  player: HrIntelPlayerInput,
  fhrRank: number | null,
  publicRank: number | null,
  publicSharePct: number | null,
  acceleration: number,
  fhrMove: number | null,
  hrMove: number | null,
  power: { shortened: number; lengthened: number },
) {
  const evidence: HrIntelEvidence[] = [
    { key: 'fhr', label: 'First HR', value: `${fmtOdds(player.fhr.current)} | rank ${fhrRank ?? 'n/a'}`, tone: 'neutral' },
    { key: 'fhr-baseline', label: 'FHR vs baseline', value: fmtSigned(player.fhrBaselineDeltaPct, '%'), tone: subtleBaseline(player.fhrBaselineDeltaPct) >= 0.7 ? 'positive' : 'warning' },
    { key: 'hr-move', label: 'Anytime move', value: `${fmtOdds(player.hr.open)} to ${fmtOdds(player.hr.current)} | ${fmtSigned(hrMove, ' pp')}`, tone: hrMove != null && hrMove < -0.15 ? 'positive' : 'neutral' },
    { key: 'public', label: 'Public HR exposure', value: `${player.hrPicks ?? 'Missing'} picks | rank ${publicRank ?? 'n/a'}${publicSharePct == null ? '' : ` | ${round1(publicSharePct)}%`}`, tone: publicRank != null && publicRank > 6 ? 'positive' : 'neutral' },
    { key: 'contact', label: 'Contact acceleration', value: fmtSigned(acceleration * 100, '%'), tone: acceleration > 0.12 ? 'positive' : acceleration < -0.12 ? 'warning' : 'neutral' },
    { key: 'power-ladder', label: 'Power ladder', value: `${power.shortened} shorter | ${power.lengthened} longer`, tone: power.shortened > power.lengthened ? 'positive' : 'neutral' },
  ]
  if (fhrMove != null) evidence.splice(2, 0, { key: 'fhr-move', label: 'FHR move', value: fmtSigned(fhrMove, ' pp'), tone: Math.abs(fhrMove) <= 0.25 ? 'positive' : 'neutral' })
  if (player.contextReset) evidence.push({ key: 'context', label: 'Role context', value: 'Team or lineup-role baseline may be stale', tone: 'warning' })
  return evidence
}

export function analyzeHrGame(input: HrIntelGameInput): HrIntelGameResult {
  const warnings = [...(input.warnings ?? [])]
  const players = input.players.filter(player => player.mlbId && player.name)
  const fhrRanks = rankByPrice(players, 'fhr')
  const hrRanks = rankByPrice(players, 'hr')
  const fhrBookRanks = new Map(BOOKS.map(book => [book, rankByBookPrice(players, 'fhr', book)]))
  const hrBookRanks = new Map(BOOKS.map(book => [book, rankByBookPrice(players, 'hr', book)]))
  const publicRanks = rankByPicks(players)
  const pickValues = players.map(player => player.hrPicks).filter((value): value is number => value != null)
  const pickTotal = pickValues.reduce((sum, value) => sum + value, 0)
  const pickMarketKeys = [...new Set(players.flatMap(player => Object.keys(player.picksByMarket)))]
  const pickValuesByMarket = new Map(pickMarketKeys.map(key => [
    key,
    players.map(player => player.picksByMarket[key]).filter((value): value is number => value != null),
  ]))
  const fhrCount = fhrRanks.size
  const hrCount = hrRanks.size

  const results: HrIntelPlayerResult[] = players.map(player => {
    const fhrRank = fhrRanks.get(player.mlbId) ?? null
    const hrRank = hrRanks.get(player.mlbId) ?? null
    const publicRank = publicRanks.get(player.mlbId) ?? null
    const publicPct = percentile(player.hrPicks, pickValues)
    const publicSharePct = player.hrPicks == null || !pickTotal ? null : (player.hrPicks / pickTotal) * 100
    const marketExposure = Object.fromEntries(pickMarketKeys.map(key => [
      key,
      percentile(player.picksByMarket[key] ?? null, pickValuesByMarket.get(key) ?? []),
    ])) as Record<string, number | null>
    const availablePickMarkets = Object.values(player.picksByMarket).filter(value => value != null).length
    const publicMarketCoveragePct = pickMarketKeys.length ? availablePickMarkets / pickMarketKeys.length * 100 : 0
    const hrExposurePercentile = marketExposure.home_runs ?? null
    const nonHrExposurePercentile = mean(Object.entries(marketExposure)
      .filter(([key]) => key !== 'home_runs')
      .map(([, value]) => value))
    const crossMarketDivergence = hrExposurePercentile == null || nonHrExposurePercentile == null
      ? null
      : nonHrExposurePercentile - hrExposurePercentile
    const redirectedExposureScore = hrExposurePercentile == null || nonHrExposurePercentile == null
      ? null
      : 100 * clamp(
          (1 - hrExposurePercentile) * 0.42 +
          nonHrExposurePercentile * 0.33 +
          clamp(nonHrExposurePercentile - hrExposurePercentile, 0, 1) * 0.25,
        )
    const loudestMarket = Object.entries(marketExposure)
      .filter((entry): entry is [string, number] => entry[1] != null)
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
    const concealment = publicPct == null ? 0.45 : 1 - publicPct
    const fhrTieSize = tieSize(players, 'fhr', player.fhr.current)
    const hrTieSize = tieSize(players, 'hr', player.hr.current)
    const tiePeers = fhrTieSize > 1
      ? players.filter(candidate => candidate.fhr.current === player.fhr.current).map(candidate => candidate.hrPicks).filter((value): value is number => value != null)
      : []
    const tieConcealment = fhrTieSize > 1
      ? 1 - (percentile(player.hrPicks, tiePeers) ?? 0.5)
      : 0.35
    const fhrMove = impliedMove(player.fhr)
    const hrMove = impliedMove(player.hr)
    const hrLengthened = hrMove == null ? 0.35 : clamp((-hrMove + 0.15) / 1.5)
    const mm = positiveMm(player)
    const formMm = positiveMeanMm(player)
    const acceleration = contactAcceleration(player)
    const power = movementCounts(player, POWER_EXTENSION_MARKETS)
    const cashStack = movementCounts(player, GUARANTEED_HR_CASH_MARKETS)
    const alternativePath = movementCounts(player, ALTERNATIVE_PATH_MARKETS)
    const cashStackAvailable = availableMovementCount(player, GUARANTEED_HR_CASH_MARKETS)
    const alternativeAvailable = availableMovementCount(player, ALTERNATIVE_PATH_MARKETS)
    const powerSupport = clamp((power.shortened - power.lengthened + 2) / 5)
    const cashStackSupport = cashStackAvailable
      ? clamp((cashStack.shortened + (cashStackAvailable - cashStack.shortened - cashStack.lengthened) * 0.45) / cashStackAvailable)
      : 0.35
    const alternativePathScore = alternativeAvailable
      ? clamp((alternativePath.shortened + (alternativeAvailable - alternativePath.shortened - alternativePath.lengthened) * 0.35) / alternativeAvailable)
      : 0.35
    const hiddenPowerContradiction = clamp((power.lengthened + cashStack.shortened + alternativePath.shortened - power.shortened + 2) / 11)
    const coldHot = player.windows.l10?.hr === 0 && acceleration > 0
      ? clamp(0.55 + acceleration * 0.45)
      : clamp(0.35 + acceleration * 0.45)
    const paperMean = meanRank(player.paperRank)
    const bookMean = meanRank(player.bookRank)
    const paperStrength = paperMean == null ? 0.35 : clamp((players.length + 1 - paperMean) / players.length)
    const paperBookGap = paperMean == null || bookMean == null ? 0 : clamp((bookMean - paperMean) / 10)
    const crossBookViability = BOOKS.flatMap(book => {
      const fhrBookRank = fhrBookRanks.get(book)?.get(player.mlbId) ?? null
      const hrBookRank = hrBookRanks.get(book)?.get(player.mlbId) ?? null
      const fhrBookCount = fhrBookRanks.get(book)?.size ?? 0
      const hrBookCount = hrBookRanks.get(book)?.size ?? 0
      return [
        ...(fhrBookRank == null ? [] : [marketViability(fhrBookRank, fhrBookCount)]),
        ...(hrBookRank == null ? [] : [marketViability(hrBookRank, hrBookCount)]),
      ]
    })
    const crossBookSupport = mean(crossBookViability) ?? 0.35
    const {
      fdCaesarsFhrGap, fhrToHr, paToHr, hrToRbi, hrToRbi2, hrToRbi3,
      hrToHrr, hrToTb2, hrToTb3, hrToTb4, hrToTb5, hrToTwoHr,
      hrToMoneyline, mgmToFanduel, isPowerCandidate,
    } = player.boardMetrics
    const ratioCoherence = mean([
      fhrToHr == null ? null : clamp((0.55 - Math.abs(fhrToHr - 1.2)) / 0.55),
      paToHr == null ? null : clamp((0.50 - Math.abs(paToHr - 0.345)) / 0.50),
      hrToRbi == null ? null : clamp((0.50 - Math.abs(hrToRbi - 0.355)) / 0.50),
      hrToHrr == null ? null : clamp((0.55 - Math.abs(hrToHrr - 1.1)) / 0.55),
      hrToTb4 == null ? null : clamp((0.75 - Math.abs(hrToTb4 - 1.55)) / 0.75),
      hrToMoneyline == null ? null : clamp((0.80 - Math.abs(hrToMoneyline - 1.35)) / 0.80),
      mgmToFanduel == null ? null : clamp((0.45 - Math.abs(mgmToFanduel - 0.96)) / 0.45),
    ].filter((value): value is number => value != null)) ?? 0.35

    const advertisedScore = round1(100 * (
      (publicPct ?? 0.45) * 0.42 +
      clamp(((player.fhrBaselineDeltaPct == null ? 0 : -player.fhrBaselineDeltaPct) - 5) / 30) * 0.28 +
      clamp(((fhrMove ?? 0) - 0.1) / 1.8) * 0.18 +
      marketViability(fhrRank, fhrCount) * 0.12
    ))
    const tiePeerInputs = fhrTieSize > 1
      ? players.filter(candidate => candidate.fhr.current === player.fhr.current)
      : []
    const peerFhrMoves = tiePeerInputs.map(candidate => impliedMove(candidate.fhr)).filter((value): value is number => value != null)
    const peerHrMoves = tiePeerInputs.map(candidate => impliedMove(candidate.hr)).filter((value): value is number => value != null)
    const tieDirection = fhrTieSize > 1 ? percentile(fhrMove, peerFhrMoves) ?? 0.5 : 0
    const tieHrContainment = fhrTieSize > 1 && hrMove != null && peerHrMoves.length
      ? 1 - (percentile(hrMove, peerHrMoves) ?? 0.5)
      : fhrTieSize > 1 ? 0.5 : 0
    const tieBreakScore = fhrTieSize > 1
      ? 100 * clamp(tieDirection * 0.36 + tieHrContainment * 0.39 + tieConcealment * 0.25)
      : 0
    const publicPromotion = publicPct ?? 0.45
    const baselinePromotion = clamp((-(player.fhrBaselineDeltaPct ?? 0) - 6) / 28)
    const dayPromotion = clamp(((fhrMove ?? 0) - 0.1) / 1.8)
    const decoyRiskScore = 100 * clamp(
      publicPromotion * 0.36 + baselinePromotion * 0.26 + dayPromotion * 0.18 +
      marketViability(fhrRank, fhrCount) * 0.12 - clamp(acceleration, 0, 1) * 0.08,
    )
    // Contradiction and form are deliberately independent lanes. Historical
    // testing showed that blending every input into one universal score hid
    // the exact quiet-price pattern the tool is meant to surface.
    // Keep ranking precision here. Rounding to one decimal before sorting made
    // genuinely different players tie and fall back to lineup insertion order.
    const contradictionScore = round3(100 * (
      quietSignal(fhrMove, 1.1) * 0.20 +
      clamp(-(hrMove ?? 0) / 2.5) * 0.19 +
      quietSignal(player.fhrBaselineDeltaPct, 15) * 0.16 +
      clamp(1 - advertisedScore / 100) * 0.12 +
      paperBookGap * 0.11 +
      midMarketBand(fhrRank, fhrCount) * 0.09 +
      hiddenPowerContradiction * 0.08 +
      clamp((fhrTieSize - 1) / 3) * 0.05
    ))
    const fhrScore = contradictionScore
    const anytimeScore = round1(100 * (
      clamp((acceleration + 1) / 2) * 0.22 +
      marketViability(hrRank, hrCount) * 0.14 +
      concealment * 0.11 +
      hrLengthened * 0.11 +
      powerSupport * 0.08 +
      hiddenPowerContradiction * 0.16 +
      coldHot * 0.08 +
      mm * 0.10
    ))
    // This lane answers a different question than the contradiction score:
    // which player is supported by price, batting order, paper rank, MM, and
    // recent contact together? Keeping the lanes separate prevents one loud
    // input from erasing a legitimate market contradiction.
    const modelFhrScore = round3(100 * clamp(
      marketViability(fhrRank, fhrCount) * 0.30 +
      clamp((acceleration * 100 + 45) / 90) * 0.28 +
      formMm * 0.16 +
      paperStrength * 0.14 +
      clamp((10 - player.battingOrder) / 9) * 0.12,
    ))

    const flatOrLongFhr = fhrMove == null ? 0.4 : fhrMove <= 0.15 ? 1 : clamp(1 - fhrMove / 2)
    const baselineProtection = player.fhrBaselineDeltaPct == null
      ? 0.35
      : clamp((player.fhrBaselineDeltaPct + 12) / 36)
    const protectedScore = 100 * clamp(
      concealment * 0.18 + flatOrLongFhr * 0.13 + hrLengthened * 0.13 +
      baselineProtection * 0.10 + hiddenPowerContradiction * 0.11 +
      cashStackSupport * 0.08 + paperBookGap * 0.07 +
      clamp((acceleration + 1) / 2) * 0.06 + crossBookSupport * 0.04,
    )
    const containmentGate = fhrRank != null && fhrRank >= Math.max(9, Math.ceil(fhrCount * 0.55)) &&
      (player.fhrBaselineDeltaPct ?? -99) >= 12 && (player.hrBaselineDeltaPct ?? -99) >= 6 &&
      publicPromotion <= 0.45
    const containmentScore = containmentGate
      ? 100 * clamp(
          concealment * 0.22 + baselineProtection * 0.18 + hrLengthened * 0.13 +
          cashStackSupport * 0.14 + alternativePathScore * 0.10 + mm * 0.10 +
          midMarketBand(fhrRank, fhrCount) * 0.05 + crossBookSupport * 0.08,
        )
      : 0
    const tieScore = fhrTieSize > 1 ? tieBreakScore : 0
    const marketConfirmedScore = 100 * clamp(
      marketViability(fhrRank, fhrCount) * 0.24 + marketViability(hrRank, hrCount) * 0.18 +
      crossBookSupport * 0.16 + paperStrength * 0.13 + clamp((acceleration + 1) / 2) * 0.12 +
      powerSupport * 0.09 + cashStackSupport * 0.08 - clamp(decoyRiskScore / 100 - 0.72, 0, 1) * 0.12,
    )
    const structuralPowerScore = 100 * clamp(
      paperStrength * 0.24 +
      (isPowerCandidate ? 1 : 0) * 0.20 +
      ratioCoherence * 0.16 +
      concealment * 0.13 +
      clamp((acceleration + 1) / 2) * 0.08 +
      crossBookSupport * 0.07 +
      (player.picksByMarket.rbi === 0 ? 1 : 0) * 0.07 +
      quietSignal(fhrMove, 0.8) * 0.05,
    )
    const archetypes = [
      { name: 'containment' as const, score: containmentScore },
      { name: 'tie-break' as const, score: tieScore },
      { name: 'protected' as const, score: protectedScore },
      { name: 'market-confirmed' as const, score: marketConfirmedScore },
    ].sort((left, right) => right.score - left.score)
    const selectionScore = archetypes[0]?.score ?? 0
    const candidateArchetype = selectionScore >= 56 ? archetypes[0].name : 'none'

    return {
      ...player,
      fhrScore,
      modelFhrScore,
      contradictionScore,
      formSupportScore: anytimeScore,
      anytimeScore,
      advertisedScore,
      selectionScore: round1(selectionScore),
      regimeScore: 0,
      calibratedAnytimeScore: 0,
      graphFhrScore: 0,
      graphAnytimeScore: 0,
      payoffIsolationScore: 0,
      payoffCompressionScore: 0,
      diagnosticFhrScore: 0,
      diagnosticAnytimeScore: 0,
      decoyRiskScore: round1(decoyRiskScore),
      cashStackSupportScore: round1(cashStackSupport * 100),
      alternativePathScore: round1(alternativePathScore * 100),
      tieBreakScore: round1(tieBreakScore),
      crossBookSupportScore: round1(crossBookSupport * 100),
      structuralPowerScore: round1(structuralPowerScore),
      isPowerCandidate,
      ratios: {
        fdCaesarsFhrGap: fdCaesarsFhrGap == null ? null : round3(fdCaesarsFhrGap),
        fhrToHr: fhrToHr == null ? null : round3(fhrToHr),
        paToHr: paToHr == null ? null : round3(paToHr),
        hrToRbi: hrToRbi == null ? null : round3(hrToRbi),
        hrToRbi2: hrToRbi2 == null ? null : round3(hrToRbi2),
        hrToRbi3: hrToRbi3 == null ? null : round3(hrToRbi3),
        hrToHrr: hrToHrr == null ? null : round3(hrToHrr),
        hrToTb2: hrToTb2 == null ? null : round3(hrToTb2),
        hrToTb3: hrToTb3 == null ? null : round3(hrToTb3),
        hrToTb4: hrToTb4 == null ? null : round3(hrToTb4),
        hrToTb5: hrToTb5 == null ? null : round3(hrToTb5),
        hrToTwoHr: hrToTwoHr == null ? null : round3(hrToTwoHr),
        hrToMoneyline: hrToMoneyline == null ? null : round3(hrToMoneyline),
        mgmToFanduel: mgmToFanduel == null ? null : round3(mgmToFanduel),
      },
      candidateArchetype,
      diagnosticArchetype: 'unsupported',
      qualifiedLanes: [],
      archetypeScores: {
        protected: round1(protectedScore),
        containment: round1(containmentScore),
        tieBreak: round1(tieScore),
        marketConfirmed: round1(marketConfirmedScore),
      },
      fhrRank,
      hrRank,
      fhrTieSize,
      hrTieSize,
      publicRank,
      publicSharePct,
      publicPattern: {
        marketCoveragePct: round1(publicMarketCoveragePct),
        hrExposurePercentile: hrExposurePercentile == null ? null : round1(hrExposurePercentile * 100),
        nonHrExposurePercentile: nonHrExposurePercentile == null ? null : round1(nonHrExposurePercentile * 100),
        crossMarketDivergencePct: crossMarketDivergence == null ? null : round1(crossMarketDivergence * 100),
        redirectedExposureScore: redirectedExposureScore == null ? null : round1(redirectedExposureScore),
        loudestMarket,
      },
      contactAcceleration: round1(acceleration * 100),
      movement: {
        fhrImpliedPoints: fhrMove == null ? null : round1(fhrMove),
        hrImpliedPoints: hrMove == null ? null : round1(hrMove),
        powerShortened: power.shortened,
        powerLengthened: power.lengthened,
        nonPowerShortened: cashStack.shortened + alternativePath.shortened,
        nonPowerLengthened: cashStack.lengthened + alternativePath.lengthened,
        hiddenPowerContradiction: round1(hiddenPowerContradiction * 100),
      },
      evidence: [
        ...playerEvidence(player, fhrRank, publicRank, publicSharePct, acceleration, fhrMove, hrMove, power),
        ...(fhrTieSize > 1 ? [{ key: 'fhr-tie', label: 'FHR price cluster', value: `${fhrTieSize} players tied at ${fmtOdds(player.fhr.current)}`, tone: tieConcealment >= 0.6 ? 'positive' as const : 'neutral' as const }] : []),
        { key: 'cross-market-public', label: 'Cross-market exposure', value: redirectedExposureScore == null ? 'Missing' : `${round1(redirectedExposureScore)} | ${loudestMarket ?? 'n/a'} leads`, tone: redirectedExposureScore != null && redirectedExposureScore >= 65 ? 'positive' : 'neutral' },
        { key: 'hidden-power', label: 'Hidden-power contradiction', value: `${round1(hiddenPowerContradiction * 100)}%`, tone: hiddenPowerContradiction >= 0.6 ? 'positive' : 'neutral' },
        { key: 'archetype', label: 'Candidate lane', value: `${candidateArchetype} | ${round1(selectionScore)}`, tone: candidateArchetype === 'none' ? 'neutral' : 'positive' },
        { key: 'cash-stack', label: 'Automatic HR payoff stack', value: `${round1(cashStackSupport * 100)}%`, tone: cashStackSupport >= 0.6 ? 'positive' : 'neutral' },
        { key: 'cross-book', label: 'Cross-book support', value: `${round1(crossBookSupport * 100)}%`, tone: crossBookSupport >= 0.65 ? 'positive' : 'neutral' },
        { key: 'power-structure', label: 'Power structure', value: `${isPowerCandidate ? 'PWR' : 'No PWR'} | FHR/HR ${fhrToHr == null ? 'Missing' : round3(fhrToHr)} | PA/HR ${paToHr == null ? 'Missing' : round3(paToHr)} | HR/RBI ${hrToRbi == null ? 'Missing' : round3(hrToRbi)} | HR/HRR ${hrToHrr == null ? 'Missing' : round3(hrToHrr)} | HR/TB4 ${hrToTb4 == null ? 'Missing' : round3(hrToTb4)} | HR/ML ${hrToMoneyline == null ? 'Missing' : round3(hrToMoneyline)} | M/F ${mgmToFanduel == null ? 'Missing' : round3(mgmToFanduel)}`, tone: isPowerCandidate && structuralPowerScore >= 65 ? 'positive' : 'neutral' },
      ],
    }
  })

  const pairs: HrIntelPairResult[] = []
  for (let i = 0; i < results.length; i += 1) {
    for (let j = i + 1; j < results.length; j += 1) {
      const left = results[i]
      const right = results[j]
      const orientations: Array<[HrIntelPlayerResult, HrIntelPlayerResult]> = [[left, right], [right, left]]
      const scored = orientations.map(([anchor, companion]) => {
        const sameTeam = anchor.team === companion.team
        const combinedShare = (anchor.publicSharePct ?? 0) + (companion.publicSharePct ?? 0)
        const exposurePenalty = clamp((combinedShare - 10) / 25) * 12 + (anchor.advertisedScore > 70 && companion.advertisedScore > 70 ? 8 : 0)
        const roleComplement = clamp((anchor.fhrScore - companion.fhrScore + 20) / 40) * 5
        const orderPower = anchor.battingOrder <= 5 && companion.contactAcceleration > 0 ? 4 : 0
        const sameTeamBonus = sameTeam ? 1.5 : 0
        const synergy = roleComplement + orderPower + sameTeamBonus
        const score = round1(anchor.fhrScore * 0.52 + companion.anytimeScore * 0.43 + synergy - exposurePenalty)
        return { anchor, companion, score, exposurePenalty: round1(exposurePenalty), synergy: round1(synergy) }
      }).sort((a, b) => b.score - a.score)[0]
      pairs.push({
        anchorMlbId: scored.anchor.mlbId,
        companionMlbId: scored.companion.mlbId,
        score: scored.score,
        anchorScore: scored.anchor.fhrScore,
        companionScore: scored.companion.anytimeScore,
        exposurePenalty: scored.exposurePenalty,
        synergy: scored.synergy,
        evidence: [
          { key: 'roles', label: 'Role split', value: `${scored.anchor.name} FHR | ${scored.companion.name} anytime`, tone: 'positive' },
          { key: 'exposure', label: 'Combined HR exposure', value: `${round1((scored.anchor.publicSharePct ?? 0) + (scored.companion.publicSharePct ?? 0))}%`, tone: scored.exposurePenalty > 5 ? 'warning' : 'positive' },
          { key: 'teams', label: 'Pair shape', value: scored.anchor.team === scored.companion.team ? 'Same-team pair' : 'Cross-team pair', tone: 'neutral' },
        ],
      })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  const contradictionRanked = [...results].sort((a, b) => b.contradictionScore - a.contradictionScore)
  const modelRanked = [...results].sort((a, b) => b.modelFhrScore - a.modelFhrScore)
  const marketRanked = [...results].sort((a, b) => {
    const impliedGap = (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1)
    return impliedGap || b.modelFhrScore - a.modelFhrScore
  })
  const contradictionLeader = contradictionRanked[0] ?? null
  const modelLeader = modelRanked[0] ?? null
  const marketLeader = marketRanked[0] ?? null
  const exposureRanked = [...results]
    .filter(player => player.publicPattern.redirectedExposureScore != null)
    .sort((a, b) => (b.publicPattern.redirectedExposureScore ?? -1) - (a.publicPattern.redirectedExposureScore ?? -1))
  const exposureLeader = exposureRanked[0] ?? null
  const advertised = [...results].sort((a, b) => b.advertisedScore - a.advertisedScore)[0] ?? null
  const lineupComplete = players.length === 18 && input.awayLineupConfirmed && input.homeLineupConfirmed
  const marketCoveragePct = players.length ? (players.filter(player => player.fhr.current != null && player.hr.current != null).length / players.length) * 100 : 0
  const picksCoveragePct = players.length ? (players.filter(player => player.hrPicks != null).length / players.length) * 100 : 0
  const noHrImpliedPct = americanImplied(input.noHr.current)
  const fhrClusterPct = players.length
    ? (results.filter(player => player.fhrTieSize > 1).length / players.length) * 100
    : 0
  const capturedMoves = results
    .flatMap(player => [player.movement.fhrImpliedPoints, player.movement.hrImpliedPoints])
    .filter((value): value is number => value != null)
  const movementActivityPct = capturedMoves.length
    ? (capturedMoves.filter(value => Math.abs(value) >= 0.15).length / capturedMoves.length) * 100
    : 0
  const boardProfile = classifyBoard(
    noHrImpliedPct == null ? null : noHrImpliedPct * 100,
    fhrClusterPct,
    movementActivityPct,
  )
  const noHrPct = noHrImpliedPct == null ? null : noHrImpliedPct * 100
  const publicShares = results.map(player => player.publicSharePct ?? 0)
  const publicConcentrationPct = publicShares.reduce((sum, share) => sum + share * share, 0) / 100
  const redirectedExposurePct = mean(results.map(player => player.publicPattern.redirectedExposureScore)) ?? 0
  const powerCandidatePct = results.length ? results.filter(player => player.isPowerCandidate).length / results.length * 100 : 0
  const hiddenPowerPct = mean(results.map(player => player.movement.hiddenPowerContradiction)) ?? 0
  const automaticCashSupportPct = mean(results.map(player => player.cashStackSupportScore)) ?? 0
  const paperBookDisagreementPct = mean(results.map(player => {
    const paper = meanRank(player.paperRank)
    const book = meanRank(player.bookRank)
    return paper == null || book == null ? null : Math.min(100, Math.abs(book - paper) / Math.max(1, results.length - 1) * 100)
  })) ?? 0

  // Every component below is ranked inside this game's 18-player board. This
  // prevents a raw score or price from carrying the same meaning across quiet,
  // clustered, heavily promoted, and low-HR environments.
  const relative = (player: HrIntelPlayerResult, getter: (candidate: HrIntelPlayerResult) => number) =>
    percentile(getter(player), results.map(getter)) ?? 0.5
  const effectiveProfile: HrIntelBoardProfile = noHrPct != null && noHrPct >= 20
    ? 'low-hr'
    : fhrClusterPct >= 45 || powerCandidatePct >= 38
      ? 'clustered'
      : movementActivityPct >= 50 || publicConcentrationPct >= 18
        ? 'active'
        : movementActivityPct <= 25 && redirectedExposurePct >= 48
          ? 'quiet'
          : boardProfile

  for (const player of results) {
    const protectedRank = relative(player, candidate => candidate.archetypeScores.protected)
    const containmentRank = relative(player, candidate => candidate.archetypeScores.containment)
    const tieRank = relative(player, candidate => candidate.tieBreakScore)
    const confirmedRank = relative(player, candidate => candidate.archetypeScores.marketConfirmed)
    const structuralRank = relative(player, candidate => candidate.structuralPowerScore)
    const contradictionRank = relative(player, candidate => candidate.contradictionScore)
    const formRank = relative(player, candidate => candidate.formSupportScore)
    const concealmentRank = 1 - relative(player, candidate => candidate.hrPicks ?? 0)
    const redirectRank = relative(player, candidate => candidate.publicPattern.redirectedExposureScore ?? 0)
    const decoySafety = 1 - relative(player, candidate => candidate.decoyRiskScore)
    const score = effectiveProfile === 'clustered'
      ? tieRank * 0.21 + structuralRank * 0.24 + contradictionRank * 0.14 + concealmentRank * 0.13 + redirectRank * 0.10 + formRank * 0.08 + decoySafety * 0.10
      : effectiveProfile === 'active'
        ? confirmedRank * 0.20 + structuralRank * 0.20 + contradictionRank * 0.13 + concealmentRank * 0.12 + redirectRank * 0.12 + formRank * 0.11 + decoySafety * 0.12
        : effectiveProfile === 'quiet'
          ? protectedRank * 0.20 + containmentRank * 0.15 + structuralRank * 0.20 + contradictionRank * 0.16 + concealmentRank * 0.12 + redirectRank * 0.10 + formRank * 0.07
          : effectiveProfile === 'low-hr'
            ? structuralRank * 0.27 + containmentRank * 0.18 + protectedRank * 0.14 + redirectRank * 0.11 + concealmentRank * 0.10 + formRank * 0.10 + decoySafety * 0.10
            : structuralRank * 0.22 + protectedRank * 0.15 + confirmedRank * 0.13 + contradictionRank * 0.14 + concealmentRank * 0.11 + redirectRank * 0.10 + formRank * 0.08 + decoySafety * 0.07
    player.regimeScore = round1(score * 100)
  }
  const calibratedFeatureVector = (player: HrIntelPlayerResult) => [
    player.selectionScore, player.regimeScore, player.anytimeScore, player.fhrScore, player.modelFhrScore,
    player.contradictionScore, player.structuralPowerScore, player.archetypeScores.protected,
    player.archetypeScores.containment, player.tieBreakScore, player.archetypeScores.marketConfirmed,
    player.advertisedScore, 100 - player.decoyRiskScore, player.cashStackSupportScore,
    player.alternativePathScore, player.crossBookSupportScore, player.contactAcceleration,
    player.fhrRank == null ? 0 : 19 - player.fhrRank, player.hrRank == null ? 0 : 19 - player.hrRank,
    player.publicRank ?? 0, player.publicPattern.redirectedExposureScore ?? 0,
    player.publicPattern.crossMarketDivergencePct ?? 0, player.fhrBaselineDeltaPct ?? 0,
    player.hrBaselineDeltaPct ?? 0, player.movement.fhrImpliedPoints ?? 0,
    player.movement.hrImpliedPoints ?? 0, player.movement.powerShortened, player.movement.powerLengthened,
    player.movement.nonPowerShortened, player.movement.nonPowerLengthened,
    player.movement.hiddenPowerContradiction, player.isPowerCandidate ? 1 : 0, 10 - player.battingOrder,
    player.ratios.paToHr ?? 0, player.ratios.hrToRbi ?? 0, player.ratios.hrToHrr ?? 0,
    player.ratios.hrToTb4 ?? 0, player.ratios.hrToMoneyline ?? 0, player.ratios.mgmToFanduel ?? 0,
    effectiveProfile === 'clustered' ? 1 : 0, effectiveProfile === 'active' ? 1 : 0,
    effectiveProfile === 'quiet' ? 1 : 0, effectiveProfile === 'low-hr' ? 1 : 0,
  ]
  for (const player of results) {
    const logit = calibratedFeatureVector(player).reduce(
      (total, feature, index) => total + feature * (CALIBRATED_ANYTIME_COEFFICIENTS[index] ?? 0),
      CALIBRATED_ANYTIME_INTERCEPT,
    )
    player.calibratedAnytimeScore = round1(100 / (1 + Math.exp(-Math.max(-25, Math.min(25, logit)))))
  }
  const calibratedAnytimeRanked = [...results].sort((left, right) =>
    right.calibratedAnytimeScore - left.calibratedAnytimeScore ||
    right.structuralPowerScore - left.structuralPowerScore ||
    left.battingOrder - right.battingOrder,
  )

  // Treat the complete game as a weighted graph instead of forcing players
  // through hand-authored candidate lanes. Node scores describe how unusual a
  // player is relative to this board. Edge scores describe how strongly two
  // players share (or complement) the same market construction.
  const boardPercentile = (player: HrIntelPlayerResult, getter: (candidate: HrIntelPlayerResult) => number) =>
    percentile(getter(player), results.map(getter)) ?? 0.5
  const baselineSplit = (player: HrIntelPlayerResult) =>
    player.fhrBaselineDeltaPct == null || player.hrBaselineDeltaPct == null
      ? 0
      : Math.abs(player.fhrBaselineDeltaPct - player.hrBaselineDeltaPct)
  const rankDislocation = (player: HrIntelPlayerResult) => {
    const comparisons = [player.hrRank, player.publicRank].filter((rank): rank is number => rank != null)
    if (player.fhrRank == null || !comparisons.length) return 0
    return Math.max(0, player.fhrRank - Math.min(...comparisons))
  }
  const clusterCamouflage = (player: HrIntelPlayerResult) => player.fhrTieSize > 1
    ? clamp((player.fhrTieSize - 1) / 3) : 0
  const quietExposureNode = (player: HrIntelPlayerResult) =>
    player.publicRank == null ? 0.5 : clamp((player.publicRank - 1) / 17)

  for (const player of results) {
    const fhrAnomaly = boardPercentile(player, baselineSplit)
    const dislocation = boardPercentile(player, rankDislocation)
    const uniquePrice = player.fhrTieSize === 1 ? 1 : 0
    const viableFhrBand = player.fhrRank == null ? 0 : clamp(1 - Math.abs(player.fhrRank - 10) / 10)
    const automaticSupport = player.cashStackSupportScore / 100
    const structural = player.structuralPowerScore / 100
    const lineupOpportunity = clamp((10 - player.battingOrder) / 9)
    const coherentlyWithheld = (player.movement.fhrImpliedPoints ?? 0) <= 0 &&
      (player.movement.hrImpliedPoints ?? 0) <= 0 ? 1 : 0
    player.graphFhrScore = round1(100 * clamp(
      fhrAnomaly * 0.15 + dislocation * 0.20 + uniquePrice * 0.08 +
      viableFhrBand * 0.08 + automaticSupport * 0.08 + structural * 0.08 +
      lineupOpportunity * 0.12 + coherentlyWithheld * 0.16 +
      (1 - player.decoyRiskScore / 100) * 0.05,
    ))
    player.graphAnytimeScore = round1(100 * clamp(
      (player.calibratedAnytimeScore / 100) * 0.22 + structural * 0.19 +
      (player.movement.hiddenPowerContradiction / 100) * 0.13 +
      clusterCamouflage(player) * 0.13 + quietExposureNode(player) * 0.12 +
      (player.publicPattern.redirectedExposureScore ?? 0) / 100 * 0.09 +
      automaticSupport * 0.07 + (1 - player.decoyRiskScore / 100) * 0.05,
    ))
  }

  // The payoff-isolation read answers the practical full-board question that
  // the named lanes cannot: which player is still priced as viable while the
  // public handle and the easier HR-cashing derivatives are being steered
  // elsewhere? Every component is relative to this game's 18 hitters.
  for (const player of results) {
    const publicSilence = quietExposureNode(player)
    const payoffRelease = clamp((player.movement.nonPowerLengthened - player.movement.nonPowerShortened * 0.35) / 12)
    const hrDrift = player.movement.hrImpliedPoints == null ? 0.35 : clamp((-player.movement.hrImpliedPoints + 0.15) / 1.8)
    const fhrHold = player.movement.fhrImpliedPoints == null
      ? 0.4
      : clamp(1 - Math.max(0, player.movement.fhrImpliedPoints) / 1.5 - Math.abs(Math.min(0, player.movement.fhrImpliedPoints)) / 4)
    const contactNode = clamp(
      (boardPercentile(player, candidate => candidate.contactAcceleration) * 0.62) +
      clamp((player.contactAcceleration + 5) / 35) * 0.38,
    )
    const paper = meanRank(player.paperRank)
    const book = meanRank(player.bookRank)
    const paperBookDislocation = paper == null || book == null ? 0.35 : clamp((book - paper + 2) / 10)
    const redirected = (player.publicPattern.redirectedExposureScore ?? 35) / 100
    const baselineRespect = mean([
      player.fhrBaselineDeltaPct == null ? null : clamp(-player.fhrBaselineDeltaPct / 35),
      player.hrBaselineDeltaPct == null ? null : clamp(-player.hrBaselineDeltaPct / 35),
    ].filter((value): value is number => value != null)) ?? 0.35
    const clusterCover = clusterCamouflage(player)
    const publicPromotionPenalty = (1 - publicSilence) * clamp(player.decoyRiskScore / 100)
    const pickPercentile = (market: string) => {
      const value = player.picksByMarket[market]
      const board = results.map(candidate => candidate.picksByMarket[market]).filter((pick): pick is number => pick != null)
      return percentile(value, board) ?? 0.5
    }
    const directLiabilitySilence = 1 - (mean([
      pickPercentile('home_runs'),
      pickPercentile('rbi'),
    ]) ?? 0.5)
    const surroundingExposure = mean([
      pickPercentile('hits_runs_rbi'),
      pickPercentile('bases'),
      pickPercentile('doubles'),
      pickPercentile('runs'),
      pickPercentile('stolen_bases'),
    ]) ?? 0.5
    const exposureCompression = clamp(surroundingExposure - (1 - directLiabilitySilence) + 0.45)
    const splitPressure = player.movement.fhrImpliedPoints == null || player.movement.hrImpliedPoints == null
      ? 0
      : clamp((player.movement.fhrImpliedPoints - player.movement.hrImpliedPoints) / 3)
    const boardBurial = mean([
      player.fhrRank == null ? null : clamp((player.fhrRank - 1) / 17),
      player.hrRank == null ? null : clamp((player.hrRank - 1) / 17),
    ].filter((value): value is number => value != null)) ?? 0.35
    const hrrRbiMismatch = clamp(pickPercentile('hits_runs_rbi') - pickPercentile('rbi') + 0.35)
    const payoffCompression = clamp(
      directLiabilitySilence * 0.18 + surroundingExposure * 0.15 + exposureCompression * 0.15 +
      splitPressure * 0.16 + baselineRespect * 0.10 + boardBurial * 0.07 +
      paperBookDislocation * 0.07 + positiveMm(player) * 0.05 + hrrRbiMismatch * 0.07,
    )
    const isolation = clamp(
      publicSilence * 0.18 + payoffRelease * 0.18 + hrDrift * 0.10 + fhrHold * 0.08 +
      contactNode * 0.14 + paperBookDislocation * 0.11 + redirected * 0.07 +
      clusterCover * 0.05 + baselineRespect * 0.07 + (player.isPowerCandidate ? 0.04 : 0) -
      publicPromotionPenalty * 0.08,
    )
    const fhrViability = player.fhrRank == null ? 0 : clamp((19 - player.fhrRank) / 18)
    const lineupOpportunity = clamp((10 - player.battingOrder) / 9)
    player.payoffIsolationScore = round1(isolation * 100)
    player.payoffCompressionScore = round1(payoffCompression * 100)
    const isolationFhr = clamp(
      isolation * 0.36 + lineupOpportunity * 0.14 + fhrViability * 0.10 +
      (player.graphFhrScore / 100) * 0.08 + (player.crossBookSupportScore / 100) * 0.06 +
      fhrHold * 0.08 + clusterCover * 0.04 + contactNode * 0.08 + (player.isPowerCandidate ? 0.06 : 0),
    )
    const compressedFhr = clamp(payoffCompression * 0.74 + splitPressure * 0.14 + baselineRespect * 0.07 + paperBookDislocation * 0.05)
    player.diagnosticFhrScore = round1(100 * Math.max(isolationFhr, compressedFhr))
    const isolationAnytime = clamp(
      isolation * 0.58 + (player.graphAnytimeScore / 100) * 0.10 +
      (player.structuralPowerScore / 100) * 0.08 + contactNode * 0.10 +
      publicSilence * 0.08 + clusterCover * 0.06,
    )
    const compressedAnytime = clamp(payoffCompression * 0.82 + baselineRespect * 0.10 + paperBookDislocation * 0.08)
    player.diagnosticAnytimeScore = round1(100 * Math.max(isolationAnytime, compressedAnytime))
    player.diagnosticArchetype = payoffCompression >= 0.64 && directLiabilitySilence >= 0.52 && exposureCompression >= 0.52
      ? 'payoff-compressed'
      : publicSilence >= 0.28 && payoffRelease >= 0.42 && isolation >= 0.56
      ? 'payoff-isolated'
      : publicSilence >= 0.45 && contactNode >= 0.68 && paperBookDislocation >= 0.52
        ? 'data-confirmed-hidden'
        : (player.publicRank ?? 99) <= 5 && player.archetypeScores.marketConfirmed >= 62 && player.contactAcceleration >= -5
          ? 'advertised-real'
          : (player.publicPattern.redirectedExposureScore ?? 0) >= 55 && player.publicPattern.loudestMarket !== 'home_runs'
            ? 'alternative-diversion'
            : (player.publicRank ?? 99) <= 4 && player.decoyRiskScore >= 50
              ? 'public-bait'
              : 'unsupported'
    player.evidence.push(
      { key: 'payoff-isolation', label: 'Payoff isolation', value: `${player.payoffIsolationScore}% | ${player.diagnosticArchetype.replaceAll('-', ' ')}`, tone: player.payoffIsolationScore >= 58 ? 'positive' : 'neutral' },
      { key: 'payoff-compression', label: 'Payoff compression', value: `${player.payoffCompressionScore}% | direct ${round1(directLiabilitySilence * 100)} / surrounding ${round1(surroundingExposure * 100)}`, tone: player.payoffCompressionScore >= 64 ? 'positive' : 'neutral' },
      { key: 'board-read', label: 'Board-relative read', value: `FHR ${player.diagnosticFhrScore} | Anytime ${player.diagnosticAnytimeScore}`, tone: Math.max(player.diagnosticFhrScore, player.diagnosticAnytimeScore) >= 62 ? 'positive' : 'neutral' },
    )
  }

  const payoffReleasePct = mean(results.map(player => clamp(
    (player.movement.nonPowerLengthened - player.movement.nonPowerShortened * 0.35) / 12,
  ) * 100)) ?? 0
  const topPublicSharePct = Math.max(0, ...results.map(player => player.publicSharePct ?? 0))
  const powerPromotionPct = mean(results.map(player => clamp(
    (player.movement.powerShortened - player.movement.powerLengthened * 0.35) / Math.max(1, POWER_EXTENSION_MARKETS.length),
  ) * 100)) ?? 0
  const gameRegime: HrIntelGameRegime = noHrPct != null && noHrPct >= 18
    ? 'sparse-coherent'
    : payoffReleasePct >= 24 && topPublicSharePct >= 22
      ? 'concealment-explosion'
      : movementActivityPct >= 50 && powerPromotionPct >= 12
        ? 'advertised-explosion'
        : topPublicSharePct >= 18 || publicConcentrationPct >= 14
          ? 'mixed-concentrated'
          : 'open-board'
  const regimeReasons = [
    `${round1(payoffReleasePct)}% average payoff-market release`,
    `${round1(topPublicSharePct)}% largest HR-pick share`,
    `${round1(movementActivityPct)}% FHR/HR movement activity`,
    noHrPct == null ? 'No-HR price unavailable' : `${round1(noHrPct)}% No-HR implied`,
  ]

  const graphEdgeAffinity = (left: HrIntelPlayerResult, right: HrIntelPlayerResult) => {
    const similarity = (a: number | null, b: number | null, tolerance: number) =>
      a == null || b == null ? null : clamp(1 - Math.abs(a - b) / tolerance)
    const ratioAffinity = mean([
      similarity(left.ratios.paToHr, right.ratios.paToHr, 0.10),
      similarity(left.ratios.hrToRbi, right.ratios.hrToRbi, 0.10),
      similarity(left.ratios.hrToHrr, right.ratios.hrToHrr, 0.32),
      similarity(left.ratios.hrToTb4, right.ratios.hrToTb4, 0.38),
      similarity(left.ratios.hrToMoneyline, right.ratios.hrToMoneyline, 0.35),
      similarity(left.ratios.mgmToFanduel, right.ratios.mgmToFanduel, 0.30),
    ].filter((value): value is number => value != null)) ?? 0
    const exactFhrTie = left.fhr.current != null && left.fhr.current === right.fhr.current ? 1 : 0
    const baselineAffinity = similarity(left.fhrBaselineDeltaPct, right.fhrBaselineDeltaPct, 20) ?? 0
    const derivativeAffinity = mean([
      similarity(left.markets.double?.current ?? null, right.markets.double?.current ?? null, 450),
      similarity(left.markets.single?.current ?? null, right.markets.single?.current ?? null, 250),
      similarity(left.markets.rbi?.current ?? null, right.markets.rbi?.current ?? null, 350),
    ].filter((value): value is number => value != null)) ?? 0
    const complementaryHrMove = left.movement.hrImpliedPoints == null || right.movement.hrImpliedPoints == null
      ? 0 : clamp(Math.abs(left.movement.hrImpliedPoints - right.movement.hrImpliedPoints) / 4)
    const lowJointExposure = clamp(1 - ((left.publicSharePct ?? 0) + (right.publicSharePct ?? 0)) / 18)
    const zeroRbi = left.picksByMarket.rbi === 0 && right.picksByMarket.rbi === 0 ? 1 : 0
    return clamp(
      ratioAffinity * 0.22 + exactFhrTie * 0.20 + baselineAffinity * 0.12 +
      derivativeAffinity * 0.10 + complementaryHrMove * 0.09 +
      lowJointExposure * 0.09 + zeroRbi * 0.07 + (left.team === right.team ? 1 : 0) * 0.11,
    )
  }

  // The publishable two-player reduction has two deliberately different jobs.
  // The first player is the strongest credible market/form anchor. The second
  // is the strongest board-relative dislocation: quiet direct HR/RBI exposure
  // paired with paper/book disagreement, released payoff markets, or a buried
  // derivative ladder. This mirrors how the board is read manually and avoids
  // selecting two near-duplicates from one generic score.
  const boardValues = <T extends number | null>(values: T[]) => values.filter((value): value is Exclude<T, null> => value != null && Number.isFinite(value))
  const boardPickPercentile = (player: HrIntelPlayerResult, key: string, reverse = false) => {
    const values = boardValues(results.map(candidate => candidate.picksByMarket[key] ?? null))
    const value = player.picksByMarket[key] ?? null
    const rank = percentile(value, values)
    return rank == null ? 0.5 : reverse ? 1 - rank : rank
  }
  const reducerProfiles = results.map(player => {
    const paper = meanRank(player.paperRank) ?? 9.5
    const book = meanRank(player.bookRank) ?? 9.5
    const mmValues = player.mm ? boardValues(Object.values(player.mm)) : []
    const mmMean = mmValues.length ? mmValues.reduce((sum, value) => sum + value, 0) / mmValues.length : 0
    const mmPeak = mmValues.length ? Math.max(...mmValues) : 0
    const publicQuiet = player.publicRank == null ? 0.5 : clamp((player.publicRank - 1) / Math.max(1, results.length - 1))
    const market = mean([
      player.fhrRank == null ? null : marketViability(player.fhrRank, results.length),
      player.hrRank == null ? null : marketViability(player.hrRank, results.length),
    ]) ?? 0.35
    const contact = percentile(player.contactAcceleration, results.map(candidate => candidate.contactAcceleration)) ?? 0.5
    const paperStrength = clamp((results.length + 1 - paper) / results.length)
    const bookStrength = clamp((results.length + 1 - book) / results.length)
    const paperBookGap = clamp((book - paper + 1) / 11)
    const mmPositive = clamp((mmMean + 2) / 10)
    const baselineMean = mean([player.fhrBaselineDeltaPct, player.hrBaselineDeltaPct]) ?? 0
    const baselineLong = clamp(baselineMean / 40)
    const baselineShort = clamp(-baselineMean / 40)
    const burial = 1 - market
    const nonPowerRelease = clamp((player.movement.nonPowerLengthened - player.movement.nonPowerShortened * 0.45) / 12)
    const directQuiet = mean([
      boardPickPercentile(player, 'home_runs', true),
      boardPickPercentile(player, 'rbi', true),
    ]) ?? 0.5
    const adjacentLoud = mean(['hits_runs_rbi', 'bases', 'doubles', 'runs', 'stolen_bases']
      .map(key => boardPickPercentile(player, key))) ?? 0.5
    const hrrExposure = boardPickPercentile(player, 'hits_runs_rbi')
    const compression = player.payoffCompressionScore / 100
    const power = player.isPowerCandidate ? 1 : 0
    const publicLoud = 1 - publicQuiet
    const concentrationPenalty = (player.publicRank ?? 99) <= 3 ? publicLoud * 0.09 : 0
    const anchorScore = clamp(
      market * 0.31 + contact * 0.19 + paperStrength * 0.16 + bookStrength * 0.10 + mmPositive * 0.07 +
      player.crossBookSupportScore / 100 * 0.06 + directQuiet * 0.06 + baselineShort * 0.03 + power * 0.02 - concentrationPenalty,
    )
    const compressedScore = compression * 0.42 + directQuiet * 0.16 + adjacentLoud * 0.13 + paperBookGap * 0.10 + mmPositive * 0.08 + market * 0.05 + power * 0.06
    const dislocatedScore = paperBookGap * 0.26 + mmPositive * 0.16 + baselineLong * 0.17 + paperStrength * 0.13 + publicQuiet * 0.10 + nonPowerRelease * 0.09 + contact * 0.05 + power * 0.04
    const buriedScore = burial * 0.20 + directQuiet * 0.18 + nonPowerRelease * 0.17 + adjacentLoud * 0.14 + power * 0.10 + paperBookGap * 0.08 + mmPositive * 0.07 + contact * 0.06
    const laneScores: Array<{ lane: HrIntelReductionLane; score: number }> = [
      ...(paper <= 3 && book - paper >= 5 && mmMean >= 3 && (player.fhrBaselineDeltaPct ?? -99) >= 8 && (player.hrBaselineDeltaPct ?? -99) >= 0
        ? [{ lane: 'paper-book-dislocation' as const, score: 1 + dislocatedScore * 0.1 }] : []),
      ...(market >= 0.58 && contact >= 0.64 && paper <= 3 && book - paper >= 2 && book - paper <= 5 && publicQuiet >= 0.35 &&
          (player.movement.hrImpliedPoints ?? 0) <= -2 && player.movement.nonPowerLengthened >= 9
        ? [{ lane: 'split-market-protection' as const, score: 0.95 + dislocatedScore * 0.1 }] : []),
      ...(power === 1 && compression >= 0.64 && directQuiet >= 0.45
        ? [{ lane: 'payoff-compression' as const, score: 0.90 + compressedScore * 0.1 }] : []),
      ...((player.fhrRank ?? 99) >= 9 && (player.fhrRank ?? 99) <= 15 && (player.hrRank ?? 99) >= 9 && (player.hrRank ?? 99) <= 15 &&
          (player.fhrBaselineDeltaPct ?? -99) >= 12 && (player.hrBaselineDeltaPct ?? -99) >= 8 && (mmMean >= 2 || mmPeak >= 3) &&
          player.movement.powerLengthened >= 2 && ((player.publicPattern.redirectedExposureScore ?? 0) >= 50 || hrrExposure >= 0.65) && directQuiet >= 0.40
        ? [{ lane: 'payoff-redirect' as const, score: 0.86 + buriedScore * 0.1 }] : []),
      ...((player.fhrRank ?? 99) >= 9 && (player.fhrRank ?? 99) <= 15 && (player.hrRank ?? 99) >= 9 && (player.hrRank ?? 99) <= 15 &&
          (player.fhrBaselineDeltaPct ?? -99) >= 12 && (player.hrBaselineDeltaPct ?? -99) >= 8 && (mmMean >= 2 || mmPeak >= 3) &&
          player.movement.powerLengthened >= 2 && adjacentLoud >= 0.42 && directQuiet >= 0.45
        ? [{ lane: 'buried-derivative' as const, score: 0.80 + buriedScore * 0.1 }] : []),
      ...(market >= 0.55 && publicQuiet >= 0.42 && directQuiet >= 0.45 && contact >= 0.42 && (player.movement.powerShortened >= 2 || power === 1)
        ? [{ lane: 'quiet-viable' as const, score: 0.70 + (market * 0.35 + directQuiet * 0.25 + contact * 0.20 + paperStrength * 0.20) * 0.1 }] : []),
      { lane: 'structural-fallback', score: Math.max(compressedScore * 0.55, dislocatedScore * 0.54, buriedScore * 0.53) },
    ]
    const anomaly = laneScores.sort((left, right) => right.score - left.score)[0]
    return { player, anchorScore, anomalyScore: anomaly.score, anomalyLane: anomaly.lane }
  })
  const eligibleProfiles = reducerProfiles.filter(({ player }) => player.fhr.current != null && player.hr.current != null)
  const anchorProfile = [...eligibleProfiles].sort((left, right) =>
    right.anchorScore - left.anchorScore || left.player.battingOrder - right.player.battingOrder,
  )[0] ?? null
  const companionProfile = [...eligibleProfiles].filter(({ player }) => player.mlbId !== anchorProfile?.player.mlbId).sort((left, right) =>
    right.anomalyScore - left.anomalyScore || left.player.battingOrder - right.player.battingOrder,
  )[0] ?? null
  const boardFhr = anchorProfile?.player ?? null
  const boardCompanion = companionProfile?.player ?? null
  boardFhr?.evidence.push({ key: 'reduction-lane', label: 'Two-lane reduction', value: `Market/form anchor | ${round1((anchorProfile?.anchorScore ?? 0) * 100)}`, tone: 'positive' })
  boardCompanion?.evidence.push({ key: 'reduction-lane', label: 'Two-lane reduction', value: `${companionProfile?.anomalyLane.replaceAll('-', ' ')} | ${round1((companionProfile?.anomalyScore ?? 0) * 100)}`, tone: 'positive' })

  const graphPairRanked = pairs.map(pair => {
    const anchor = results.find(player => player.mlbId === pair.anchorMlbId)!
    const companion = results.find(player => player.mlbId === pair.companionMlbId)!
    const affinity = graphEdgeAffinity(anchor, companion)
    return { pair, anchor, companion, affinity, score: anchor.graphFhrScore * 0.38 + companion.graphAnytimeScore * 0.32 + affinity * 30 }
  }).sort((left, right) => right.score - left.score)

  const graphFhrRanked = [...results].sort((left, right) => right.graphFhrScore - left.graphFhrScore)
  const companionEdges = pairs.map(pair => {
    const left = results.find(player => player.mlbId === pair.anchorMlbId)!
    const right = results.find(player => player.mlbId === pair.companionMlbId)!
    const affinity = graphEdgeAffinity(left, right)
    return { left, right, affinity, score: mean([left.graphAnytimeScore, right.graphAnytimeScore])! * 0.35 + affinity * 65 }
  }).sort((left, right) => right.score - left.score)
  const strongestCompanionEdge = companionEdges[0] ?? null
  const connectedCompanions = strongestCompanionEdge
    ? [strongestCompanionEdge.left, strongestCompanionEdge.right]
    : []
  const connectedIds = new Set(connectedCompanions.map(player => player.mlbId))
  const graphAnytimeRanked = [
    ...connectedCompanions,
    ...[...results].filter(player => !connectedIds.has(player.mlbId)).sort((left, right) => {
      const edgeToCluster = (candidate: HrIntelPlayerResult) => connectedCompanions.length
        ? mean(connectedCompanions.map(player => graphEdgeAffinity(candidate, player))) ?? 0
        : 0
      return (right.graphAnytimeScore + edgeToCluster(right) * 30) - (left.graphAnytimeScore + edgeToCluster(left) * 30)
    }),
  ]

  // Reorient and rank every possible relationship from the graph. Candidate
  // lanes remain explanatory metadata only and never suppress a player.
  for (const ranked of graphPairRanked) {
    ranked.pair.anchorMlbId = ranked.anchor.mlbId
    ranked.pair.companionMlbId = ranked.companion.mlbId
    ranked.pair.anchorScore = ranked.anchor.graphFhrScore
    ranked.pair.companionScore = ranked.companion.graphAnytimeScore
    ranked.pair.synergy = round1(ranked.affinity * 100)
    ranked.pair.score = round1(ranked.score)
  }
  pairs.sort((left, right) => right.score - left.score)
  const resultById = new Map(results.map(player => [player.mlbId, player]))
  for (const pair of pairs) {
    const first = resultById.get(pair.anchorMlbId)
    const second = resultById.get(pair.companionMlbId)
    if (!first || !second) continue
    const orientations = [[first, second], [second, first]] as const
    const [anchor, companion] = [...orientations].sort((left, right) => {
      const score = ([candidateAnchor, candidateCompanion]: readonly [HrIntelPlayerResult, HrIntelPlayerResult]) =>
        candidateAnchor.graphFhrScore * 0.38 + candidateCompanion.graphAnytimeScore * 0.32 + graphEdgeAffinity(candidateAnchor, candidateCompanion) * 30
      return score(right) - score(left)
    })[0]
    const graphAffinity = graphEdgeAffinity(anchor, companion)
    pair.anchorMlbId = anchor.mlbId
    pair.companionMlbId = companion.mlbId
    pair.score = round1(anchor.graphFhrScore * 0.38 + companion.graphAnytimeScore * 0.32 + graphAffinity * 30)
    pair.anchorScore = anchor.graphFhrScore
    pair.companionScore = companion.graphAnytimeScore
    pair.synergy = round1(graphAffinity * 100)
  }
  pairs.sort((left, right) => right.score - left.score)
  const selectionRanked = [...results].sort((left, right) => {
    const adjusted = (player: HrIntelPlayerResult) => player.selectionScore -
      (player.candidateArchetype === 'market-confirmed' ? 0.08 : 0.18) * player.decoyRiskScore
    return adjusted(right) - adjusted(left)
  })
  const paperMeanFor = (player: HrIntelPlayerResult) => meanRank(player.paperRank)
  const bookMeanFor = (player: HrIntelPlayerResult) => meanRank(player.bookRank)
  const paperBookGapFor = (player: HrIntelPlayerResult) => {
    const paper = paperMeanFor(player)
    const book = bookMeanFor(player)
    return paper == null || book == null ? null : book - paper
  }
  const markLane = (player: HrIntelPlayerResult, lane: HrIntelQualifiedLane) => {
    if (!player.qualifiedLanes.includes(lane)) player.qualifiedLanes.push(lane)
    return player
  }

  const cashMarketMoves = (player: HrIntelPlayerResult) => GUARANTEED_HR_CASH_MARKETS
    .map(key => impliedMove(player.markets[key] ?? { current: null, open: null }))
    .filter((value): value is number => value != null)
  const cashMean = (player: HrIntelPlayerResult) => mean(cashMarketMoves(player)) ?? 0
  const sortedCashMeans = results.map(cashMean).sort((left, right) => left - right)
  const medianCashMean = sortedCashMeans[Math.floor(sortedCashMeans.length / 2)] ?? 0
  const boardReleaseRegime = medianCashMean < -1
  const relationalPickValues = results.map(player => player.hrPicks ?? 0)
  const contactValues = results.map(player => player.contactAcceleration)
  const hiddenPercentile = (player: HrIntelPlayerResult) => 1 - (percentile(player.hrPicks ?? 0, relationalPickValues) ?? 0.5)
  const contactPercentile = (player: HrIntelPlayerResult) => percentile(player.contactAcceleration, contactValues) ?? 0.5
  const baselineCamouflage = (player: HrIntelPlayerResult) => Math.max(0, 1 - Math.min(1, Math.abs(player.fhrBaselineDeltaPct ?? 0) * 0.03))

  const rankWindows: HrIntelWindow[] = ['l1', 'l3', 'l5', 'l10']
  const ratioPairSimilarity = (
    left: HrIntelPlayerResult,
    right: HrIntelPlayerResult,
    key: keyof HrIntelPlayerResult['ratios'],
    tolerance: number,
  ) => {
    const a = left.ratios[key]
    const b = right.ratios[key]
    if (a == null || b == null) return null
    return clamp(1 - Math.abs(a - b) / tolerance)
  }
  const pairWindowLeadership = (teamPlayers: HrIntelPlayerResult[], left: HrIntelPlayerResult, right: HrIntelPlayerResult) => {
    const scores = rankWindows.map(window => {
      const ranked = teamPlayers
        .filter(player => player.paperRank?.[window] != null)
        .sort((a, b) => (a.paperRank?.[window] ?? 99) - (b.paperRank?.[window] ?? 99))
      if (ranked.length < 2) return null
      const top = new Set(ranked.slice(0, 2).map(player => player.mlbId))
      if (top.has(left.mlbId) && top.has(right.mlbId)) return 1
      if (top.has(left.mlbId) || top.has(right.mlbId)) return 0.45
      return 0
    }).filter(value => value != null) as number[]
    return {
      strength: mean(scores) ?? 0,
      jointLeaderWindows: scores.filter(value => value === 1).length,
    }
  }

  // Resolve all same-team PWR combinations from the exact board. Averages are
  // intentionally not used as a gate: a short-window paper signal can be the
  // part the market is reacting to, and averaging L1/L3/L5/L10 erased it.
  const structuralPowerPairs = [...new Set(results.map(player => player.team))].flatMap(team => {
    const teamPlayers = results.filter(player => player.team === team)
    const powerPlayers = teamPlayers.filter(player => player.isPowerCandidate)
    const candidates: Array<{ players: [HrIntelPlayerResult, HrIntelPlayerResult]; score: number }> = []
    for (let i = 0; i < powerPlayers.length; i += 1) {
      for (let j = i + 1; j < powerPlayers.length; j += 1) {
        const left = powerPlayers[i]
        const right = powerPlayers[j]
        const leadership = pairWindowLeadership(teamPlayers, left, right)
        const ratioSimilarity = mean([
          ratioPairSimilarity(left, right, 'paToHr', 0.08),
          ratioPairSimilarity(left, right, 'hrToRbi', 0.08),
          ratioPairSimilarity(left, right, 'hrToMoneyline', 0.30),
          ratioPairSimilarity(left, right, 'mgmToFanduel', 0.28),
          ratioPairSimilarity(left, right, 'fhrToHr', 0.25),
        ].filter((value): value is number => value != null)) ?? 0
        const fhrRankGap = left.fhrRank == null || right.fhrRank == null ? 99 : Math.abs(left.fhrRank - right.fhrRank)
        const fhrPriceGap = left.fhr.current == null || right.fhr.current == null ? 9999 : Math.abs(left.fhr.current - right.fhr.current)
        const clusterAlignment = mean([
          clamp(1 - fhrRankGap / 4),
          clamp(1 - fhrPriceGap / 700),
        ]) ?? 0
        const zeroRbiExposure = left.picksByMarket.rbi === 0 && right.picksByMarket.rbi === 0
        const combinedShare = (left.publicSharePct ?? 100) + (right.publicSharePct ?? 100)
        const quietExposure = clamp(1 - combinedShare / 12)
        const publicTail = mean([
          left.publicRank == null ? null : clamp((left.publicRank - 6) / 10),
          right.publicRank == null ? null : clamp((right.publicRank - 6) / 10),
        ].filter((value): value is number => value != null)) ?? 0
        const derivativeAlignment = mean([
          ratioPairSimilarity(left, right, 'hrToHrr', 0.30),
          ratioPairSimilarity(left, right, 'hrToTb4', 0.35),
          ratioPairSimilarity(left, right, 'hrToTwoHr', 0.55),
        ].filter((value): value is number => value != null)) ?? 0
        const baselineAlignment = left.fhrBaselineDeltaPct == null || right.fhrBaselineDeltaPct == null
          ? 0.35
          : clamp(1 - Math.abs(left.fhrBaselineDeltaPct - right.fhrBaselineDeltaPct) / 18)
        const intradayCamouflage = mean([left, right].map(player => {
          const fhr = Math.abs(player.movement.fhrImpliedPoints ?? 0)
          const hr = player.movement.hrImpliedPoints ?? 0
          return clamp((1 - fhr / 1.5) * 0.45 + clamp(-hr / 2.5) * 0.55)
        })) ?? 0
        const score = 100 * clamp(
          leadership.strength * 0.05 +
          (leadership.jointLeaderWindows > 0 ? 1 : 0) * 0.03 +
          ratioSimilarity * 0.20 +
          derivativeAlignment * 0.16 +
          clusterAlignment * 0.16 +
          quietExposure * 0.14 +
          publicTail * 0.10 +
          (zeroRbiExposure ? 1 : 0) * 0.10 +
          baselineAlignment * 0.03 +
          intradayCamouflage * 0.03,
        )
        const gate = ratioSimilarity >= 0.58 && derivativeAlignment >= 0.72 &&
          clusterAlignment >= 0.25 && quietExposure >= 0.35 && publicTail >= 0.30 &&
          zeroRbiExposure
        if (gate) candidates.push({ players: [left, right], score: round1(score) })
      }
    }
    return candidates
  }).sort((left, right) => right.score - left.score)
  const structuralPowerPair = structuralPowerPairs[0] ?? null
  const structuralPowerCandidates = structuralPowerPair
    ? structuralPowerPair.players
        .sort((left, right) => left.battingOrder - right.battingOrder)
        .map(player => markLane(player, 'structural-power-pair'))
    : []

  // In a broad board release, generic row scores create false positives. Use
  // complementary game-level roles instead: a quiet unique FHR anchor and a
  // tied companion whose anytime rank improves relative to its FHR rank.
  const concealedAnchors = boardReleaseRegime ? results.filter(player =>
    player.fhrTieSize === 1 && (player.fhrRank ?? 99) >= 5 && (player.fhrRank ?? 99) <= 14 &&
    hiddenPercentile(player) >= 0.40 && baselineCamouflage(player) >= 0.75 &&
    player.contactAcceleration >= 12 && contactPercentile(player) >= 0.75,
  ).sort((left, right) => right.contactAcceleration - left.contactAcceleration)
    .map(player => markLane(player, 'concealed-anchor')) : []
  const tiedCompanions = boardReleaseRegime ? results.filter(player =>
    player.fhrTieSize >= 2 && (player.fhrRank ?? 99) >= 4 && (player.fhrRank ?? 99) <= 14 &&
    ((player.fhrRank ?? 99) - (player.hrRank ?? 99)) >= 1 && baselineCamouflage(player) >= 0.75 &&
    player.contactAcceleration >= 12 && contactPercentile(player) >= 0.75,
  ).sort((left, right) => {
    const leftMigration = (left.fhrRank ?? 99) - (left.hrRank ?? 99)
    const rightMigration = (right.fhrRank ?? 99) - (right.hrRank ?? 99)
    return rightMigration - leftMigration || right.contactAcceleration - left.contactAcceleration
  }).map(player => markLane(player, 'tied-companion')) : []

  // Exact FD ties are a relative decision, never an absolute score. Only a
  // two-player, non-tail, low-exposure cluster can publish, and only when one
  // player's FHR/HR movement diverges materially from the other player's.
  const tieClusterWinners = [...new Set(results.map(player => player.fhr.current).filter((price): price is number => price != null))]
    .map(price => results.filter(player => player.fhr.current === price))
    .filter(cluster => cluster.length === 2 && (cluster[0].fhr.current ?? 99999) <= 1600)
    .flatMap(cluster => {
      const maxShare = Math.max(...cluster.map(player => player.publicSharePct ?? 0))
      if (maxShare > 25) return []
      const scored = cluster.filter(player => player.contactAcceleration >= 0).map((player, index, eligible) => {
        if (eligible.length !== 2) return { player, edge: -99 }
        const peer = eligible[index === 0 ? 1 : 0]
        const playerFhr = player.movement.fhrImpliedPoints ?? 0
        const peerFhr = peer.movement.fhrImpliedPoints ?? 0
        const playerHr = player.movement.hrImpliedPoints ?? 0
        const peerHr = peer.movement.hrImpliedPoints ?? 0
        const edge = (playerFhr - peerFhr) * 0.55 + (peerHr - playerHr) * 0.45
        return { player, edge }
      }).sort((left, right) => right.edge - left.edge)
      const winner = scored[0]
      if (!winner || winner.edge < 0.45 || (winner.player.publicRank ?? 0) < 6) return []
      return [winner]
    })
    .sort((left, right) => {
      const leftQuality = left.edge + (left.player.publicRank ?? 0) / 100 - (left.player.decoyRiskScore / 500)
      const rightQuality = right.edge + (right.player.publicRank ?? 0) / 100 - (right.player.decoyRiskScore / 500)
      return rightQuality - leftQuality
    })
  const tieClusterWinner = tieClusterWinners[0]?.player
    ? markLane(tieClusterWinners[0].player, 'fhr-cluster')
    : null

  const protectedFhrDivergence = results.filter(player => {
    const fhrMove = player.movement.fhrImpliedPoints
    const hrMove = player.movement.hrImpliedPoints
    const baselineFhr = player.fhrBaselineDeltaPct
    const paper = paperMeanFor(player)
    const gap = paperBookGapFor(player)
    const chaseShape = fhrMove != null && Math.abs(fhrMove) <= 0.15 && hrMove != null && hrMove <= -0.8 &&
      baselineFhr != null && Math.abs(baselineFhr) <= 12 && player.contactAcceleration >= 18 &&
      paper != null && paper <= 3 && gap != null && gap >= 4 && (player.publicRank == null || player.publicRank >= 8) &&
      player.decoyRiskScore <= 30
    const bregmanShape = fhrMove != null && Math.abs(fhrMove) <= 0.15 && hrMove != null && hrMove <= -0.2 &&
      baselineFhr != null && baselineFhr >= 10 && player.contactAcceleration >= 20 &&
      positiveMeanMm(player) >= 0.5 && gap != null && gap >= 4 && player.decoyRiskScore <= 40
    return chaseShape || bregmanShape
  }).map(player => markLane(player, 'protected-divergence'))
  const roleResetProtection = results.filter(player =>
    player.contextReset && Math.abs(player.movement.fhrImpliedPoints ?? 99) <= 0.15 &&
    (player.movement.hrImpliedPoints ?? 0) <= -0.7 && Math.abs(player.fhrBaselineDeltaPct ?? 99) <= 5 &&
    player.movement.powerLengthened >= 3 && player.contactAcceleration >= 18,
  ).map(player => markLane(player, 'protected-divergence'))

  // A containment tail is intentionally rare and exclusive. It describes a
  // nearly untouched bottom-of-board player whose baseline and automatic HR
  // payoff markets remain conspicuously viable despite the posted FHR rank.
  const containmentTail = results.filter(player =>
    (player.fhrRank ?? 0) >= 14 && (player.fhrBaselineDeltaPct ?? -99) >= 20 &&
    (player.hrBaselineDeltaPct ?? -99) >= 10 && (player.publicRank ?? 0) >= 16 &&
    (player.hrPicks ?? 999) <= 10 && (player.movement.fhrImpliedPoints ?? 99) <= 0 &&
    player.decoyRiskScore <= 10 && player.cashStackSupportScore >= 80,
  ).sort((left, right) => right.cashStackSupportScore - left.cashStackSupportScore)[0] ?? null
  if (containmentTail) markLane(containmentTail, 'containment-tail')

  const releasedFavorites = results.filter(player =>
    (player.fhrRank ?? 99) <= 3 && (player.movement.fhrImpliedPoints ?? 0) <= -1 &&
    (player.movement.hrImpliedPoints ?? 1) <= 0 && player.contactAcceleration >= 20 &&
    player.crossBookSupportScore >= 90 && (paperMeanFor(player) ?? 99) <= 3 && player.publicRank === 1,
  ).map(player => markLane(player, 'released-favorite'))

  const activeConfirmationPool = noHrPct != null && noHrPct <= 16
    ? results.filter(player =>
        player.archetypeScores.marketConfirmed >= 80 && player.movement.powerShortened >= 3 &&
        player.crossBookSupportScore >= 80 && player.contactAcceleration > -10,
      )
    : []
  // A solitary advertised favorite is not confirmation. This lane only opens
  // when the same game contains a genuine multi-player power-pricing wave.
  const activeConfirmed = activeConfirmationPool.length >= 2 &&
    Math.max(...activeConfirmationPool.map(player => player.cashStackSupportScore)) >= 80
    ? activeConfirmationPool.map(player => markLane(player, 'active-confirmation'))
    : []

  const formBackedPromotion = results.filter(player =>
    player.contactAcceleration >= 20 && (paperMeanFor(player) ?? 99) <= 5 &&
    (bookMeanFor(player) ?? 99) <= 7 && (player.movement.fhrImpliedPoints ?? -99) >= 0.4 &&
    (player.movement.hrImpliedPoints ?? -99) >= 0.8 && (player.publicRank ?? 0) >= 7 &&
    player.decoyRiskScore <= 58,
  ).map(player => markLane(player, 'form-backed-promotion'))

  const hiddenDerivative = results.filter(player =>
    player.movement.powerShortened >= 2 && Math.abs(player.movement.fhrImpliedPoints ?? 99) <= 0.15 &&
    Math.abs(player.movement.hrImpliedPoints ?? 99) <= 0.15 && (player.publicRank ?? 0) >= 14 &&
    (player.publicPattern.redirectedExposureScore ?? 0) >= 50 && player.decoyRiskScore <= 25 &&
    player.battingOrder <= 7,
  ).map(player => markLane(player, 'hidden-derivative'))

  const independentlyQualified = selectDistinct([
    structuralPowerCandidates,
    tieClusterWinner ? [tieClusterWinner] : [],
    protectedFhrDivergence,
    roleResetProtection,
    releasedFavorites,
    activeConfirmed,
    formBackedPromotion,
    hiddenDerivative,
  ], results.length)
  const relationalRoleCandidates = selectDistinct([concealedAnchors, tiedCompanions], results.length)
  // Lanes are independent evidence, not mutually exclusive outcomes. The old
  // resolver stopped as soon as one lane produced a player. That correctly
  // found an anchor such as Chase or Ozzie, but silently discarded Jo/Olson
  // and every other independently qualified companion on the same board.
  const anytimeCandidates = selectDistinct([
    structuralPowerCandidates,
    boardReleaseRegime ? relationalRoleCandidates : [],
    containmentTail ? [containmentTail] : [],
    independentlyQualified,
  ], results.length)
  const diagnosticLeader = anytimeCandidates[0] ?? selectionRanked[0] ?? null
  const secondDiagnostic = anytimeCandidates[1] ?? selectionRanked.find(player => player.mlbId !== diagnosticLeader?.mlbId) ?? null
  const diagnosticRead = { lane: 'relational' as const, player: diagnosticLeader, ranked: selectionRanked }
  const fhrRecipe = structuralPowerCandidates.length
    ? 'Same-team paper leaders with aligned PWR and derivative-market structure'
    : boardReleaseRegime && concealedAnchors.length
    ? 'Concealed FHR anchor in a broad board release'
    : 'Diagnostic tie resolution and protected-divergence hypotheses'
  const companionRecipe = structuralPowerCandidates.length
    ? 'Quiet same-team PWR companion with matched PA/HR, HR/RBI, and HR/ML ratios'
    : boardReleaseRegime && tiedCompanions.length
    ? 'Tied companion with stronger anytime positioning'
    : 'Diagnostic anytime-HR hypotheses; no pair is published without validation'
  const contrarianWatch = selectionRanked.filter(player => !anytimeCandidates.some(candidate => candidate.mlbId === player.mlbId)).slice(0, 2)
  const contradictionWatch = contrarianWatch[0] ?? null
  const crossMarketPicksCoveragePct = results.length
    ? results.reduce((sum, player) => sum + player.publicPattern.marketCoveragePct, 0) / results.length
    : 0
  const dataComplete = lineupComplete && marketCoveragePct >= 80 && picksCoveragePct >= 80 && crossMarketPicksCoveragePct >= 70
  const primaryScore = diagnosticLeader
    ? diagnosticLeader.selectionScore
    : 0
  const secondScore = secondDiagnostic
    ? secondDiagnostic.selectionScore
    : 0
  const anchorGap = primaryScore - secondScore
  const laneAgreement = diagnosticLeader && [contradictionLeader?.mlbId, modelLeader?.mlbId, marketLeader?.mlbId]
    .filter(id => id === diagnosticLeader.mlbId).length > 1 ? 1 : 0
  const baseSignal = diagnosticLeader
    ? primaryScore * 0.56 + Math.min(12, anchorGap * 2) + laneAgreement * 9 + marketCoveragePct * 0.08
    : 0
  const noHrPenalty = noHrImpliedPct == null ? 3 : clamp((noHrImpliedPct * 100 - 15) / 10) * 15
  const confidence = round1(clamp(baseSignal - noHrPenalty - (lineupComplete ? 0 : 20) - (picksCoveragePct >= 80 ? 0 : 7), 0, 82))

  if (!lineupComplete) warnings.push('Both confirmed nine-player lineups are required for a fully qualified game ranking.')
  if (marketCoveragePct < 80) warnings.push('FHR or anytime HR coverage is missing for several lineup players.')
  if (picksCoveragePct < 80 || crossMarketPicksCoveragePct < 70) warnings.push('Public exposure is incomplete. No FHR or companion call will be published.')
  if (noHrImpliedPct != null && noHrImpliedPct >= 0.18) warnings.push('The No Home Run price signals a low-HR environment and caps conviction.')

  // Publication is deliberately separate from diagnostic ranking. A rule can
  // publish only after it is promoted from the chronological audit registry
  // and its board profile and independent lane both match this game.
  const publicationRule = HR_INTELLIGENCE_CALIBRATION.qualifiedRules.find(rule =>
    rule.boardProfiles.includes(boardProfile) &&
    anytimeCandidates.some(player => player.qualifiedLanes.includes(rule.lane)),
  ) ?? null
  const publicationPlayers = publicationRule
    ? anytimeCandidates.filter(player => player.qualifiedLanes.includes(publicationRule.lane)).slice(0, publicationRule.maxCandidates)
    : []
  const publishedFhrCandidates = publicationRule?.target === 'fhr' ? publicationPlayers : []
  const publishedAnytimeCandidates = publicationRule ? publicationPlayers : []
  const publicationEligible = dataComplete && publicationRule != null && publicationPlayers.length > 0
  const publicationTarget = publicationEligible ? publicationRule.target : null
  const publicationRuleId = publicationEligible ? publicationRule.id : null
  const publicationSupport = publicationEligible ? publicationRule.support : null
  const publicationReason = !dataComplete
    ? 'Publication is withheld because the full 18-player market and exposure board is incomplete.'
    : !publicationRule
      ? 'No rule has cleared discovery, calibration, and untouched holdout with the required distinct-game support.'
      : !publicationPlayers.length
        ? `Validated rule ${publicationRule.id} has no matching player on this board.`
        : `Validated rule ${publicationRule.id} cleared the publication gate.`
  const status: HrIntelGameResult['recommendation']['status'] = publicationEligible ? 'qualified' : 'abstain'
  const mode: HrIntelGameResult['recommendation']['mode'] = publicationEligible
    ? publicationTarget === 'fhr' ? 'fhr-read' : 'fhr-watch'
    : 'abstain'
  const confidenceLabel = confidence >= 72 ? 'Strong' : confidence >= 50 ? 'Measured' : 'Low'
  // No tested confidence threshold separated exact FHR calls from misses on
  // the untouched holdout. Keep the exact-call field empty until that gate is
  // proven. Candidate sets and lane leaders remain available for diagnosis.
  const exactCallQualified = publicationEligible && publicationTarget === 'fhr' && publishedFhrCandidates.length === 1
  const distinctCandidateTeams = new Set(anytimeCandidates.map(player => player.team)).size
  const multiHrRead: HrIntelGameResult['recommendation']['multiHrRead'] = boardProfile === 'low-hr'
    ? 'unlikely'
    : anytimeCandidates.length >= 3 && distinctCandidateTeams >= 2 && noHrPct != null && noHrPct <= 14
      ? 'elevated'
      : 'unclear'
  const laneSummary = [...new Set(anytimeCandidates.flatMap(player => player.qualifiedLanes))]
    .map(lane => lane.replaceAll('-', ' '))
    .join(', ')
  const reason = diagnosticLeader
    ? `${diagnosticLeader.name} leads the ${laneSummary || 'relational'} diagnostic, but the board has no validated publishable rule.`
    : 'The board has no diagnostic leader and no validated publishable rule.'

  return {
    ...input,
    players: results.sort((a, b) => Math.max(b.fhrScore, b.anytimeScore) - Math.max(a.fhrScore, a.anytimeScore)),
    pairs,
    recommendation: {
      status,
      mode,
      confidence,
      confidenceLabel,
      primaryLane: diagnosticRead.lane,
      diagnosticLeaderMlbId: diagnosticLeader?.mlbId ?? null,
      boardFhrMlbId: boardFhr?.mlbId ?? null,
      boardCompanionMlbId: boardCompanion?.mlbId ?? null,
      boardFhrScore: anchorProfile == null ? null : round1(anchorProfile.anchorScore * 100),
      boardCompanionScore: companionProfile == null ? null : round1(companionProfile.anomalyScore * 100),
      boardFhrLane: anchorProfile == null ? null : 'market-form-anchor',
      boardCompanionLane: companionProfile?.anomalyLane ?? null,
      fhrAnchorMlbId: exactCallQualified ? publishedFhrCandidates[0]?.mlbId ?? null : null,
      anytimeCompanionMlbId: null,
      fhrCandidateMlbIds: publishedFhrCandidates.map(player => player.mlbId),
      anytimeCandidateMlbIds: publishedAnytimeCandidates.map(player => player.mlbId),
      fhrShortlistMlbIds: boardFhr ? [boardFhr.mlbId] : [],
      calibratedAnytimeShortlistMlbIds: calibratedAnytimeRanked.slice(0, 3).map(player => player.mlbId),
      graphFhrShortlistMlbIds: graphFhrRanked.slice(0, 3).map(player => player.mlbId),
      graphAnytimeShortlistMlbIds: graphAnytimeRanked.slice(0, 4).map(player => player.mlbId),
      companionShortlistMlbIds: boardCompanion ? [boardCompanion.mlbId] : [],
      contradictionWatchMlbId: contradictionWatch?.mlbId ?? null,
      contrarianWatchMlbIds: contrarianWatch.map(player => player.mlbId),
      contradictionLeaderMlbId: contradictionLeader?.mlbId ?? null,
      fhrRecipe,
      companionRecipe,
      modelLeaderMlbId: modelLeader?.mlbId ?? null,
      marketLeaderMlbId: marketLeader?.mlbId ?? null,
      advertisedAlternativeMlbId: advertised?.mlbId ?? null,
      exposureLeaderMlbId: exposureLeader?.mlbId ?? null,
      exactCallQualified,
      multiHrRead,
      calibrationVersion: HR_INTELLIGENCE_CALIBRATION.version,
      dataComplete,
      publicationEligible,
      publicationTarget,
      publicationRuleId,
      publicationReason,
      publicationSupport,
      reason,
    },
    diagnostics: {
      lineupSize: players.length,
      marketCoveragePct: round1(marketCoveragePct),
      picksCoveragePct: round1(picksCoveragePct),
      crossMarketPicksCoveragePct: round1(crossMarketPicksCoveragePct),
      noHrImpliedPct: noHrImpliedPct == null ? null : round1(noHrImpliedPct * 100),
      boardProfile: effectiveProfile,
      gameRegime,
      regimeReasons,
      fhrClusterPct: round1(fhrClusterPct),
      movementActivityPct: round1(movementActivityPct),
      publicConcentrationPct: round1(publicConcentrationPct),
      redirectedExposurePct: round1(redirectedExposurePct),
      powerCandidatePct: round1(powerCandidatePct),
      hiddenPowerPct: round1(hiddenPowerPct),
      automaticCashSupportPct: round1(automaticCashSupportPct),
      payoffReleasePct: round1(payoffReleasePct),
      paperBookDisagreementPct: round1(paperBookDisagreementPct),
      pairCount: pairs.length,
    },
    warnings: [...new Set(warnings)],
  }
}
