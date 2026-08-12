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
  pullAirRate: number | null
}

export type HrIntelMarket = {
  current: number | null
  open: number | null
}

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
}

export type HrIntelEvidence = {
  key: string
  label: string
  value: string
  tone: 'positive' | 'warning' | 'neutral'
}

export type HrIntelPlayerResult = HrIntelPlayerInput & {
  fhrScore: number
  anytimeScore: number
  advertisedScore: number
  fhrRank: number | null
  hrRank: number | null
  fhrTieSize: number
  hrTieSize: number
  publicRank: number | null
  publicSharePct: number | null
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
    confidence: number
    confidenceLabel: 'Low' | 'Measured' | 'Strong'
    fhrAnchorMlbId: number | null
    anytimeCompanionMlbId: number | null
    advertisedAlternativeMlbId: number | null
    reason: string
  }
  diagnostics: {
    lineupSize: number
    marketCoveragePct: number
    picksCoveragePct: number
    noHrImpliedPct: number | null
    pairCount: number
  }
  validation?: {
    actualNoHr: boolean
    firstHrMlbId: number | null
    firstHrName: string | null
    hrMlbIds: number[]
    hrNames: string[]
    anchorHit: boolean
    companionHit: boolean
    pairHit: boolean
  }
  warnings: string[]
}

const POWER_MARKETS = ['hr2', 'laser105', 'laser110', 'moonshot', 'pa1', 'hrMl']
const NON_POWER_MARKETS = ['rbi1', 'rbi2', 'rbi3', 'tb2', 'tb3', 'tb4', 'tb5', 'singles', 'doubles', 'triples', 'hits1', 'hits2', 'runs1', 'runs2', 'sb1', 'sb2']

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const round1 = (value: number) => Math.round(value * 10) / 10

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

function stability(move: number | null) {
  if (move == null) return 0.45
  const magnitude = Math.abs(move)
  if (magnitude <= 0.25) return 1
  if (magnitude <= 0.7) return 0.75
  if (magnitude <= 1.3) return 0.4
  return 0.12
}

function positiveMm(player: HrIntelPlayerInput) {
  const values = player.mm ? Object.values(player.mm).filter((value): value is number => value != null) : []
  if (!values.length) return 0.35
  const positive = values.filter(value => value > 0)
  const magnitude = positive.length ? positive.reduce((sum, value) => sum + Math.min(10, value), 0) / positive.length : 0
  return clamp((positive.length / values.length) * 0.55 + (magnitude / 10) * 0.45)
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
    { key: 'fhr', label: 'First HR', value: `${fmtOdds(player.fhr.current)} · rank ${fhrRank ?? '—'}`, tone: 'neutral' },
    { key: 'fhr-baseline', label: 'FHR vs baseline', value: fmtSigned(player.fhrBaselineDeltaPct, '%'), tone: subtleBaseline(player.fhrBaselineDeltaPct) >= 0.7 ? 'positive' : 'warning' },
    { key: 'hr-move', label: 'Anytime move', value: `${fmtOdds(player.hr.open)} → ${fmtOdds(player.hr.current)} · ${fmtSigned(hrMove, ' pp')}`, tone: hrMove != null && hrMove < -0.15 ? 'positive' : 'neutral' },
    { key: 'public', label: 'Public HR exposure', value: `${player.hrPicks ?? 'Missing'} picks · rank ${publicRank ?? '—'}${publicSharePct == null ? '' : ` · ${round1(publicSharePct)}%`}`, tone: publicRank != null && publicRank > 6 ? 'positive' : 'neutral' },
    { key: 'contact', label: 'Contact acceleration', value: fmtSigned(acceleration * 100, '%'), tone: acceleration > 0.12 ? 'positive' : acceleration < -0.12 ? 'warning' : 'neutral' },
    { key: 'power-ladder', label: 'Power ladder', value: `${power.shortened} shorter · ${power.lengthened} longer`, tone: power.shortened > power.lengthened ? 'positive' : 'neutral' },
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
  const publicRanks = rankByPicks(players)
  const pickValues = players.map(player => player.hrPicks).filter((value): value is number => value != null)
  const pickTotal = pickValues.reduce((sum, value) => sum + value, 0)
  const fhrCount = fhrRanks.size
  const hrCount = hrRanks.size

  const results: HrIntelPlayerResult[] = players.map(player => {
    const fhrRank = fhrRanks.get(player.mlbId) ?? null
    const hrRank = hrRanks.get(player.mlbId) ?? null
    const publicRank = publicRanks.get(player.mlbId) ?? null
    const publicPct = percentile(player.hrPicks, pickValues)
    const publicSharePct = player.hrPicks == null || !pickTotal ? null : (player.hrPicks / pickTotal) * 100
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
    const fhrStable = stability(fhrMove)
    const hrLengthened = hrMove == null ? 0.35 : clamp((-hrMove + 0.15) / 1.5)
    const baselineSubtle = subtleBaseline(player.fhrBaselineDeltaPct)
    const divergence = clamp(fhrStable * 0.45 + hrLengthened * 0.35 + baselineSubtle * 0.20)
    const mm = positiveMm(player)
    const acceleration = contactAcceleration(player)
    const power = movementCounts(player, POWER_MARKETS)
    const nonPower = movementCounts(player, NON_POWER_MARKETS)
    const powerSupport = clamp((power.shortened - power.lengthened + 2) / 5)
    const hiddenPowerContradiction = clamp((power.lengthened + nonPower.shortened - power.shortened + 2) / 8)
    const order = clamp((10 - player.battingOrder) / 9)
    const coldHot = player.windows.l10?.hr === 0 && acceleration > 0
      ? clamp(0.55 + acceleration * 0.45)
      : clamp(0.35 + acceleration * 0.45)

    const fhrScore = round1(100 * (
      marketViability(fhrRank, fhrCount) * 0.15 +
      fhrStable * 0.12 +
      divergence * 0.20 +
      mm * 0.18 +
      concealment * 0.12 +
      tieConcealment * 0.11 +
      order * 0.12
    ))
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
    const advertisedScore = round1(100 * (
      (publicPct ?? 0.45) * 0.42 +
      clamp(((player.fhrBaselineDeltaPct == null ? 0 : -player.fhrBaselineDeltaPct) - 5) / 30) * 0.28 +
      clamp(((fhrMove ?? 0) - 0.1) / 1.8) * 0.18 +
      marketViability(fhrRank, fhrCount) * 0.12
    ))

    return {
      ...player,
      fhrScore,
      anytimeScore,
      advertisedScore,
      fhrRank,
      hrRank,
      fhrTieSize,
      hrTieSize,
      publicRank,
      publicSharePct,
      contactAcceleration: round1(acceleration * 100),
      movement: {
        fhrImpliedPoints: fhrMove == null ? null : round1(fhrMove),
        hrImpliedPoints: hrMove == null ? null : round1(hrMove),
        powerShortened: power.shortened,
        powerLengthened: power.lengthened,
        nonPowerShortened: nonPower.shortened,
        nonPowerLengthened: nonPower.lengthened,
        hiddenPowerContradiction: round1(hiddenPowerContradiction * 100),
      },
      evidence: [
        ...playerEvidence(player, fhrRank, publicRank, publicSharePct, acceleration, fhrMove, hrMove, power),
        ...(fhrTieSize > 1 ? [{ key: 'fhr-tie', label: 'FHR price cluster', value: `${fhrTieSize} players tied at ${fmtOdds(player.fhr.current)}`, tone: tieConcealment >= 0.6 ? 'positive' as const : 'neutral' as const }] : []),
        { key: 'hidden-power', label: 'Hidden-power contradiction', value: `${round1(hiddenPowerContradiction * 100)}%`, tone: hiddenPowerContradiction >= 0.6 ? 'positive' : 'neutral' },
      ],
    }
  })

  const resultById = new Map(results.map(player => [player.mlbId, player]))
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
          { key: 'roles', label: 'Role split', value: `${scored.anchor.name} FHR · ${scored.companion.name} anytime`, tone: 'positive' },
          { key: 'exposure', label: 'Combined HR exposure', value: `${round1((scored.anchor.publicSharePct ?? 0) + (scored.companion.publicSharePct ?? 0))}%`, tone: scored.exposurePenalty > 5 ? 'warning' : 'positive' },
          { key: 'teams', label: 'Pair shape', value: scored.anchor.team === scored.companion.team ? 'Same-team pair' : 'Cross-team pair', tone: 'neutral' },
        ],
      })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  const bestPair = pairs[0] ?? null
  const secondPair = pairs[1] ?? null
  const bestAnchor = bestPair ? resultById.get(bestPair.anchorMlbId) ?? null : null
  const bestCompanion = bestPair ? resultById.get(bestPair.companionMlbId) ?? null : null
  const advertised = [...results].sort((a, b) => b.advertisedScore - a.advertisedScore)[0] ?? null
  const lineupComplete = players.length === 18 && input.awayLineupConfirmed && input.homeLineupConfirmed
  const marketCoveragePct = players.length ? (players.filter(player => player.fhr.current != null && player.hr.current != null).length / players.length) * 100 : 0
  const picksCoveragePct = players.length ? (players.filter(player => player.hrPicks != null).length / players.length) * 100 : 0
  const noHrImpliedPct = americanImplied(input.noHr.current)
  const pairGap = bestPair && secondPair ? bestPair.score - secondPair.score : 0
  const baseConfidence = bestPair
    ? bestPair.score * 0.72 + Math.min(10, pairGap * 2.5) + marketCoveragePct * 0.08 + picksCoveragePct * 0.05
    : 0
  const noHrPenalty = noHrImpliedPct == null ? 4 : clamp((noHrImpliedPct * 100 - 15) / 10) * 18
  const confidence = round1(clamp(baseConfidence - noHrPenalty - (lineupComplete ? 0 : 18), 0, 100))

  if (!lineupComplete) warnings.push('Both confirmed nine-player lineups are required for a fully qualified game ranking.')
  if (marketCoveragePct < 80) warnings.push('FHR or anytime HR coverage is missing for several lineup players.')
  if (picksCoveragePct < 80) warnings.push('Public-pick coverage is incomplete, so concealment is downweighted.')
  if (noHrImpliedPct != null && noHrImpliedPct >= 0.18) warnings.push('The No Home Run price signals a low-HR environment and caps conviction.')

  let status: 'qualified' | 'caution' | 'abstain' = 'qualified'
  if (!lineupComplete || marketCoveragePct < 65 || !bestPair || confidence < 42) status = 'abstain'
  else if (confidence < 65 || (noHrImpliedPct != null && noHrImpliedPct >= 0.18)) status = 'caution'
  const confidenceLabel = confidence >= 72 ? 'Strong' : confidence >= 50 ? 'Measured' : 'Low'
  const reason = status === 'abstain'
    ? 'The board does not provide enough clean pregame separation to force a pair.'
    : `${bestAnchor?.name ?? 'The anchor'} has the strongest concealed FHR profile, while ${bestCompanion?.name ?? 'the companion'} supplies the best complementary anytime-power profile.`

  return {
    ...input,
    players: results.sort((a, b) => Math.max(b.fhrScore, b.anytimeScore) - Math.max(a.fhrScore, a.anytimeScore)),
    pairs,
    recommendation: {
      status,
      confidence,
      confidenceLabel,
      fhrAnchorMlbId: bestAnchor?.mlbId ?? null,
      anytimeCompanionMlbId: bestCompanion?.mlbId ?? null,
      advertisedAlternativeMlbId: advertised?.mlbId ?? null,
      reason,
    },
    diagnostics: {
      lineupSize: players.length,
      marketCoveragePct: round1(marketCoveragePct),
      picksCoveragePct: round1(picksCoveragePct),
      noHrImpliedPct: noHrImpliedPct == null ? null : round1(noHrImpliedPct * 100),
      pairCount: pairs.length,
    },
    warnings: [...new Set(warnings)],
  }
}
