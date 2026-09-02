import { computeDugoutSpecsValue, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'

export type HrGameRegime =
  | 'concealment_explosion'
  | 'advertised_explosion'
  | 'mixed_concentrated'
  | 'sparse_coherent'

export type HrArchetype =
  | 'advertised_real'
  | 'power_isolated'
  | 'alternative_diversion'
  | 'data_confirmed_hidden'
  | 'public_bait'
  | 'unsupported'

export type HrMarketMove = {
  key: string
  label: string
  current: number | null
  open: number | null
  probabilityMove: number | null
}

export type HrPlayerInput = {
  name: string
  team: string
  bundle: FieldBundle
}

export type HrCandidateRead = {
  name: string
  team: string
  battingOrder: number | null
  fhr: number
  anytimeHr: number | null
  fhrOpen: number | null
  anytimeOpen: number | null
  fhrMove: number | null
  anytimeMove: number | null
  fhrProbabilityMove: number | null
  anytimeProbabilityMove: number | null
  fhrPct: number | null
  anytimePct: number | null
  picks: number
  publicHrRank: number
  publicHrShare: number
  alternativePicks: number
  leadingAlternativeMarket: string | null
  leadingAlternativePicks: number
  precisionScore: number | null
  archetype: HrArchetype
  fhrScore: number
  anytimeScore: number
  evidenceScore: number
  components: {
    baselineContext: number
    marketStructure: number
    automaticSettlement: number
    alternativeSettlement: number
    recentDamage: number
    publicDistribution: number
    powerStructure: number
    pitchMatchup: number
    underlyingPower: number
  }
  marketMoves: HrMarketMove[]
  automaticMarketsLonger: number
  automaticMarketsShorter: number
  alternativeMarketsLonger: number
  alternativeMarketsShorter: number
  recent: {
    avgEvL3: number | null
    avgEvL5: number | null
    hardHitL3: number | null
    hardHitL5: number | null
    barrelL10: number | null
    pullAirL5: number | null
    batSpeedL5: number | null
  }
  prices: Record<string, number | null>
  books: {
    fhr: Record<string, number | null>
    hr: Record<string, number | null>
  }
  windows: Record<'l1' | 'l3' | 'l5' | 'l10', {
    paperRank: number | null
    marketMismatch: number | null
    avgEv: number | null
    hardHitPct: number | null
    barrelPct: number | null
    sweetSpotPct: number | null
    pullAirRate: number | null
    fbRate: number | null
    avgBatSpeed: number | null
    squaredUpPct: number | null
    blastPct: number | null
    idealAttackAngleRate: number | null
  }>
  reasons: string[]
  warnings: string[]
}

export type HrGameIntelligence = {
  audit: {
    expectedHitters: 18
    receivedHitters: number
    pricedHitters: number
    pitchMatchupHitters: number
    teams: { team: string; hitters: number; battingOrders: number[] }[]
    publicTelemetryAvailable: boolean
    complete: boolean
    issues: string[]
    warnings: string[]
  }
  regime: HrGameRegime
  regimeConfidence: number
  regimeReasons: string[]
  noHr: { current: number | null; open: number | null; probabilityMove: number | null }
  aggregate: {
    averageHrProbabilityMove: number
    averageFhrProbabilityMove: number
    playersHrLonger: number
    playersHrShorter: number
    deepBaselineDiscounts: number
    publicConcentration: number
  }
  fhrReads: HrCandidateRead[]
  companionReads: HrCandidateRead[]
  candidates: HrCandidateRead[]
}

type MarketSpec = { key: string; label: string; market: string; open: string; automatic?: boolean; alternative?: boolean }

const MARKET_SPECS: MarketSpec[] = [
  { key: 'hrr', label: 'H+R+RBI', market: 'hrr', open: 'hrrFd', automatic: true },
  { key: 'rbi', label: '1+ RBI', market: 'rbi', open: 'rbiFd', automatic: true },
  { key: 'tb2', label: '2+ bases', market: 'tb', open: 'tbFd', automatic: true },
  { key: 'tb3', label: '3+ bases', market: 'tb3', open: 'tb3Fd', automatic: true },
  { key: 'tb4', label: '4+ bases', market: 'tb4', open: 'tb4Fd', automatic: true },
  { key: 'hits', label: '1+ hit', market: 'hits', open: 'hits', automatic: true },
  { key: 'runs', label: '1+ run', market: 'runs', open: 'runs', automatic: true },
  { key: 'single', label: 'single', market: 'singles', open: 'sngFd', alternative: true },
  { key: 'double', label: 'double', market: 'doubles', open: 'dblFd', alternative: true },
  { key: 'triple', label: 'triple', market: 'triples', open: 'triFd', alternative: true },
  { key: 'sb', label: 'stolen base', market: 'stolen_bases', open: 'stolenBases', alternative: true },
  { key: 'sb2', label: '2+ stolen bases', market: 'stolen_bases2', open: 'stolenBases2', alternative: true },
  { key: 'rbi2', label: '2+ RBI', market: 'rbi2', open: 'rbi2Fd' },
  { key: 'rbi3', label: '3+ RBI', market: 'rbi3', open: 'rbi3Fd' },
  { key: 'hits2', label: '2+ hits', market: 'hits2', open: 'hits2' },
  { key: 'runs2', label: '2+ runs', market: 'runs2', open: 'runs2' },
  { key: 'tb5', label: '5+ bases', market: 'tb5', open: 'tb5Fd' },
  { key: 'hr2', label: '2+ HR', market: 'hr2', open: 'hr2Fd' },
  { key: 'pa1', label: 'first PA HR', market: 'pa1', open: 'pa1' },
  { key: 'laser105', label: '105+ HR', market: 'laser105', open: 'laser105' },
  { key: 'laser110', label: '110+ HR', market: 'laser110', open: 'laser110' },
  { key: 'moonshot', label: 'moonshot', market: 'moonshot', open: 'moonshot' },
  { key: 'hrMl', label: 'HR + team win', market: 'hrMl', open: 'hrMl' },
]

const PICK_MARKETS = ['hits', 'runs', 'stolen_bases', 'singles', 'doubles', 'triples', 'rbi', 'hits_runs_rbi', 'bases'] as const

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const average = (values: Array<number | null | undefined>) => {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0
}
const averageOrNull = (values: Array<number | null | undefined>) => {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}
const median = (values: Array<number | null | undefined>) => {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b)
  if (!valid.length) return 0
  const middle = Math.floor(valid.length / 2)
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2
}
const implied = (odds: number | null | undefined) => odds == null ? null : odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
const probabilityMove = (current: number | null, open: number | null) => {
  const currentProbability = implied(current)
  const openProbability = implied(open)
  return currentProbability == null || openProbability == null ? null : (currentProbability - openProbability) * 100
}
const percentile = (value: number | null, values: Array<number | null>, higherIsBetter = true) => {
  if (value == null) return 0.5
  const valid = values.filter((item): item is number => item != null).sort((a, b) => a - b)
  if (valid.length < 2) return 0.5
  const rank = valid.filter(item => item <= value).length / valid.length
  return higherIsBetter ? rank : 1 - rank + (1 / valid.length)
}
const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`

export function selectQualifiedHrReads(
  ranked: HrCandidateRead[],
  scoreKey: 'fhrScore' | 'anytimeScore',
  regime: HrGameRegime,
  boardComplete: boolean,
): HrCandidateRead[] {
  if (!boardComplete || !ranked.length) return []
  const floor = regime === 'concealment_explosion' ? 0.64 : 0.67
  const scores = ranked.map(candidate => candidate[scoreKey])
  const center = median(scores)
  const mad = median(scores.map(score => Math.abs(score - center)))
  const separatedFloor = Math.max(floor, center + Math.max(0.055, mad * 1.35))
  const eligible = ranked.filter(candidate =>
    candidate[scoreKey] >= separatedFloor
    && candidate.evidenceScore >= 0.62
    && candidate.components.underlyingPower >= 0.60
    && candidate.components.pitchMatchup >= 0.50,
  )
  if (!eligible.length) return []

  const tier: HrCandidateRead[] = [eligible[0]]
  for (let index = 1; index < eligible.length; index += 1) {
    const gap = eligible[index - 1][scoreKey] - eligible[index][scoreKey]
    if (gap >= 0.03) break
    tier.push(eligible[index])
  }
  const firstExcluded = ranked.find(candidate => !tier.includes(candidate))
  const boundaryGap = firstExcluded ? tier[tier.length - 1][scoreKey] - firstExcluded[scoreKey] : 1
  if (tier.length > 1 && boundaryGap < 0.025) return []
  if (tier[0][scoreKey] - center < 0.07) return []
  return tier
}

function currentPrice(props: OddsProps | null | undefined, market: string): number | null {
  return numberOrNull(props?.[market]?.fanduel)
}

function openingPrice(props: OddsProps | null | undefined, field: string): number | null {
  return numberOrNull(props?.open?.[field])
}

function marketMoves(props: OddsProps | null | undefined): HrMarketMove[] {
  return MARKET_SPECS.map(spec => {
    const current = currentPrice(props, spec.market)
    const open = openingPrice(props, spec.open)
    return { key: spec.key, label: spec.label, current, open, probabilityMove: probabilityMove(current, open) }
  })
}

function stat(bundle: FieldBundle, window: 'l3' | 'l5' | 'l10', field: 'avgEv' | 'hardHitPct' | 'barrelPct' | 'pullAirRate' | 'avgBatSpeed') {
  return numberOrNull(bundle.statcastWindows?.[window]?.[field])
}

function intelligenceWindow(bundle: FieldBundle, window: 'l1' | 'l3' | 'l5' | 'l10') {
  const row = bundle.statcastWindows?.[window]
  return {
    paperRank: numberOrNull(bundle.ppRkByWindow?.[window]),
    marketMismatch: numberOrNull(bundle.mmByWindow?.[window]),
    avgEv: numberOrNull(row?.avgEv),
    hardHitPct: numberOrNull(row?.hardHitPct),
    barrelPct: numberOrNull(row?.barrelPct),
    sweetSpotPct: numberOrNull(row?.sweetSpotPct),
    pullAirRate: numberOrNull(row?.pullAirRate),
    fbRate: numberOrNull(row?.fbRate),
    avgBatSpeed: numberOrNull(row?.avgBatSpeed),
    squaredUpPct: numberOrNull(row?.squaredUpPct),
    blastPct: numberOrNull(row?.blastPct),
    idealAttackAngleRate: numberOrNull(row?.idealAttackAngleRate),
  }
}

function picks(bundle: FieldBundle, market: string): number {
  return numberOrNull(bundle.pikkitEntry?.[market]?.picks) ?? 0
}

function buildRaw(input: HrPlayerInput) {
  const { bundle } = input
  const props = bundle.props
  const fhr = currentPrice(props, 'fhr')
  if (fhr == null) return null
  const anytimeHr = currentPrice(props, 'sa')
  const fhrOpen = openingPrice(props, 'fhr')
  const anytimeOpen = openingPrice(props, 'saFd')
  const moves = marketMoves(props)
  const alternativeByMarket = PICK_MARKETS.map(key => ({ key, picks: picks(bundle, key) }))
  const leadingAlternative = [...alternativeByMarket].sort((a, b) => b.picks - a.picks)[0]
  return {
    ...input,
    fhr,
    anytimeHr,
    fhrOpen,
    anytimeOpen,
    fhrProbabilityMove: probabilityMove(fhr, fhrOpen),
    anytimeProbabilityMove: probabilityMove(anytimeHr, anytimeOpen),
    fhrPct: computeDugoutSpecsValue('fhr_pct', props, bundle.fhrAvg, bundle.saAvg),
    anytimePct: computeDugoutSpecsValue('sa_pct', props, bundle.fhrAvg, bundle.saAvg),
    hrPicks: picks(bundle, 'home_runs'),
    alternativePicks: alternativeByMarket.reduce((sum, row) => sum + row.picks, 0),
    leadingAlternativeMarket: leadingAlternative?.picks ? leadingAlternative.key : null,
    leadingAlternativePicks: leadingAlternative?.picks ?? 0,
    precisionScore: numberOrNull(bundle.precisionHrScore),
    paperRank: averageOrNull([
      numberOrNull(bundle.ppRkByWindow?.l1), numberOrNull(bundle.ppRkByWindow?.l3),
      numberOrNull(bundle.ppRkByWindow?.l5), numberOrNull(bundle.ppRkByWindow?.l10),
    ]),
    marketMismatch: averageOrNull([
      numberOrNull(bundle.mmByWindow?.l1), numberOrNull(bundle.mmByWindow?.l3),
      numberOrNull(bundle.mmByWindow?.l5), numberOrNull(bundle.mmByWindow?.l10),
    ]),
    moves,
    recent: {
      avgEvL3: stat(bundle, 'l3', 'avgEv'),
      avgEvL5: stat(bundle, 'l5', 'avgEv'),
      hardHitL3: stat(bundle, 'l3', 'hardHitPct'),
      hardHitL5: stat(bundle, 'l5', 'hardHitPct'),
      barrelL10: stat(bundle, 'l10', 'barrelPct'),
      pullAirL5: stat(bundle, 'l5', 'pullAirRate'),
      batSpeedL5: stat(bundle, 'l5', 'avgBatSpeed'),
    },
  }
}

export function buildHrGameIntelligence(
  inputs: HrPlayerInput[],
  noHr: { current: number | null; open: number | null },
  sourceIssues: string[] = [],
): HrGameIntelligence {
  const raw = inputs.map(buildRaw).filter((row): row is NonNullable<ReturnType<typeof buildRaw>> => row != null)
  const hrPicksTotal = raw.reduce((sum, row) => sum + row.hrPicks, 0)
  const alternativePicksTotal = raw.reduce((sum, row) => sum + row.alternativePicks, 0)
  const publicDataAvailable = hrPicksTotal > 0 || alternativePicksTotal > 0
  const teamMap = new Map<string, { hitters: number; battingOrders: number[] }>()
  for (const input of inputs) {
    const team = teamMap.get(input.team) ?? { hitters: 0, battingOrders: [] }
    team.hitters += 1
    const order = input.bundle.battingOrder
    if (typeof order === 'number' && Number.isFinite(order)) team.battingOrders.push(order)
    teamMap.set(input.team, team)
  }
  const teams = [...teamMap.entries()].map(([team, value]) => ({
    team,
    hitters: value.hitters,
    battingOrders: [...value.battingOrders].sort((a, b) => a - b),
  }))
  const issues: string[] = [...sourceIssues]
  const warnings: string[] = []
  if (inputs.length !== 18) issues.push(`Expected 18 hitters but received ${inputs.length}.`)
  if (raw.length !== 18) issues.push(`Only ${raw.length} of 18 hitters have a captured FHR price.`)
  const pitchMatchupHitters = raw.filter(row => row.paperRank != null).length
  if (pitchMatchupHitters !== 18) warnings.push(`Pitch-matchup/paper rank coverage is ${pitchMatchupHitters} of 18 hitters; missing ranks remain neutral instead of eliminating those hitters.`)
  if (teams.length !== 2) issues.push(`Expected two teams but received ${teams.length}.`)
  for (const team of teams) {
    if (team.hitters !== 9) issues.push(`${team.team} has ${team.hitters} hitters instead of nine.`)
    const orders = new Set(team.battingOrders)
    if (orders.size !== 9 || [...orders].some(order => order < 1 || order > 9)) {
      issues.push(`${team.team} does not have one confirmed hitter in every batting-order slot.`)
    }
  }
  const audit = {
    expectedHitters: 18 as const,
    receivedHitters: inputs.length,
    pricedHitters: raw.length,
    pitchMatchupHitters,
    teams,
    publicTelemetryAvailable: publicDataAvailable,
    complete: issues.length === 0,
    issues,
    warnings,
  }
  const sortedPicks = [...raw].sort((a, b) => b.hrPicks - a.hrPicks)
  const statValues = {
    avgEvL3: raw.map(row => row.recent.avgEvL3), avgEvL5: raw.map(row => row.recent.avgEvL5),
    hardHitL3: raw.map(row => row.recent.hardHitL3), hardHitL5: raw.map(row => row.recent.hardHitL5),
    barrelL10: raw.map(row => row.recent.barrelL10), pullAirL5: raw.map(row => row.recent.pullAirL5),
    batSpeedL5: raw.map(row => row.recent.batSpeedL5),
  }
  const fhrImplied = raw.map(row => implied(row.fhr))
  const hrImplied = raw.map(row => implied(row.anytimeHr))
  const precisionValues = raw.map(row => row.precisionScore)
  const paperRankValues = raw.map(row => row.paperRank)
  const marketMismatchValues = raw.map(row => row.marketMismatch)
  const fhrMoveMedian = median(raw.map(row => row.fhrProbabilityMove))
  const anytimeMoveMedian = median(raw.map(row => row.anytimeProbabilityMove))

  const preliminary = raw.map(row => {
    const automaticMoves = row.moves.filter(move => MARKET_SPECS.find(spec => spec.key === move.key)?.automatic && move.probabilityMove != null)
    const alternativeMoves = row.moves.filter(move => MARKET_SPECS.find(spec => spec.key === move.key)?.alternative && move.probabilityMove != null)
    const automaticLonger = automaticMoves.filter(move => move.probabilityMove! < -0.15).length
    const automaticShorter = automaticMoves.filter(move => move.probabilityMove! > 0.15).length
    const alternativeLonger = alternativeMoves.filter(move => move.probabilityMove! < -0.15).length
    const alternativeShorter = alternativeMoves.filter(move => move.probabilityMove! > 0.15).length
    const automaticMedianMove = median(automaticMoves.map(move => move.probabilityMove))
    // Direction is deliberately neutral. A shorter, longer, or flat line only
    // becomes evidence after comparison with the other 17 hitters.
    const baselineContext = clamp(average([
      row.fhrPct == null ? null : Math.abs(row.fhrPct) / 30,
      row.anytimePct == null ? null : Math.abs(row.anytimePct) / 30,
    ]))
    const priceStrength = average([
      percentile(implied(row.fhr), fhrImplied),
      percentile(implied(row.anytimeHr), hrImplied),
    ])
    const movementContext = average([
      row.fhrProbabilityMove == null ? null : clamp(Math.abs(row.fhrProbabilityMove - fhrMoveMedian) / 3),
      row.anytimeProbabilityMove == null ? null : clamp(Math.abs(row.anytimeProbabilityMove - anytimeMoveMedian) / 3),
      row.fhrProbabilityMove == null || row.anytimeProbabilityMove == null
        ? null
        : clamp(Math.abs(row.fhrProbabilityMove - row.anytimeProbabilityMove) / 3),
    ])
    const mismatchContext = percentile(row.marketMismatch, marketMismatchValues)
    const marketStructure = clamp(priceStrength * 0.48 + movementContext * 0.22 + baselineContext * 0.15 + mismatchContext * 0.15)
    const hrMove = row.anytimeProbabilityMove ?? 0
    const automaticDispersion = average(automaticMoves.map(move => Math.abs((move.probabilityMove ?? hrMove) - hrMove)))
    const automaticSettlement = clamp(
      clamp(automaticDispersion / 3) * 0.65
      + clamp(Math.abs(hrMove - automaticMedianMove) / 3) * 0.35,
    )
    const alternativePickRatio = row.alternativePicks / Math.max(1, row.hrPicks)
    const alternativeMovementDispersion = average(alternativeMoves.map(move => Math.abs((move.probabilityMove ?? hrMove) - hrMove)))
    const alternativeSettlement = clamp(
      clamp(Math.log1p(alternativePickRatio) / 3) * 0.65
      + clamp(alternativeMovementDispersion / 3) * 0.35,
    )
    const recentDamage = average([
      percentile(row.recent.avgEvL3, statValues.avgEvL3), percentile(row.recent.avgEvL5, statValues.avgEvL5),
      percentile(row.recent.hardHitL3, statValues.hardHitL3), percentile(row.recent.hardHitL5, statValues.hardHitL5),
      percentile(row.recent.barrelL10, statValues.barrelL10), percentile(row.recent.pullAirL5, statValues.pullAirL5),
      percentile(row.recent.batSpeedL5, statValues.batSpeedL5), percentile(row.precisionScore, precisionValues),
    ])
    const pickPercentile = publicDataAvailable ? percentile(row.hrPicks, raw.map(item => item.hrPicks)) : 0.5
    const publicDistribution = publicDataAvailable
      ? clamp(Math.abs(pickPercentile - 0.5) * 1.3 + clamp(Math.log1p(alternativePickRatio) / 4) * 0.35)
      : 0.5
    const props = row.bundle.props
    const paHr = implied(currentPrice(props, 'pa1'))
    const hr = implied(row.anytimeHr)
    const hrMl = implied(currentPrice(props, 'hrMl'))
    const laser = implied(currentPrice(props, 'laser105'))
    const moonshot = implied(currentPrice(props, 'moonshot'))
    const powerStructure = average([
      paHr != null && hr != null ? clamp((paHr / Math.max(hr, 0.001) - 0.15) / 0.5) : null,
      hrMl != null && hr != null ? clamp((hrMl / Math.max(hr, 0.001) - 0.35) / 0.65) : null,
      laser == null ? 0.58 : percentile(laser, raw.map(item => implied(currentPrice(item.bundle.props, 'laser105')))),
      moonshot == null ? 0.5 : percentile(moonshot, raw.map(item => implied(currentPrice(item.bundle.props, 'moonshot')))),
    ])
    const pitchMatchup = percentile(row.paperRank, paperRankValues, false)
    const underlyingPower = clamp(recentDamage * 0.52 + pitchMatchup * 0.30 + powerStructure * 0.18)
    return {
      row, automaticLonger, automaticShorter, alternativeLonger, alternativeShorter,
      baselineContext, marketStructure, automaticSettlement, alternativeSettlement,
      recentDamage, publicDistribution, powerStructure, pitchMatchup, underlyingPower, pickPercentile,
    }
  })

  const averageHrProbabilityMove = average(raw.map(row => row.anytimeProbabilityMove))
  const averageFhrProbabilityMove = average(raw.map(row => row.fhrProbabilityMove))
  const noHrProbabilityMove = probabilityMove(noHr.current, noHr.open)
  const playersHrLonger = raw.filter(row => (row.anytimeProbabilityMove ?? 0) < -0.15).length
  const playersHrShorter = raw.filter(row => (row.anytimeProbabilityMove ?? 0) > 0.15).length
  const deepBaselineDiscounts = raw.filter(row => (row.anytimePct ?? 0) <= -12 || (row.fhrPct ?? 0) <= -15).length
  const topThreePicks = [...raw].sort((a, b) => b.hrPicks - a.hrPicks).slice(0, 3).reduce((sum, row) => sum + row.hrPicks, 0)
  const publicConcentration = publicDataAvailable ? topThreePicks / Math.max(1, hrPicksTotal) : 0
  const conflict = (noHrProbabilityMove ?? 0) > 1.2 && (playersHrLonger >= Math.ceil(raw.length * 0.35) || averageHrProbabilityMove < -0.2)
  const advertised = playersHrShorter >= Math.ceil(raw.length * 0.28) || deepBaselineDiscounts >= 6
  const hiddenStrengths = preliminary.map(item => item.automaticSettlement + item.publicDistribution + item.recentDamage).sort((a, b) => b - a)
  const concentrated = hiddenStrengths.length > 2 && hiddenStrengths[1] - hiddenStrengths[2] > 0.22
  const regime: HrGameRegime = conflict
    ? 'concealment_explosion'
    : advertised && playersHrShorter >= playersHrLonger
      ? 'advertised_explosion'
      : concentrated || deepBaselineDiscounts >= 3
        ? 'mixed_concentrated'
        : 'sparse_coherent'
  const regimeConfidence = clamp(0.5
    + (conflict ? Math.min(0.25, ((noHrProbabilityMove ?? 0) - 1) / 8) : 0)
    + (concentrated ? 0.12 : 0)
    + Math.min(0.13, Math.abs(playersHrLonger - playersHrShorter) / Math.max(1, raw.length)))
  const regimeReasons = [
    audit.complete
      ? 'The complete 18-player board passed lineup and FHR coverage checks.'
      : `Publication blocked: ${audit.issues.join(' ')}`,
    noHrProbabilityMove == null ? 'No-HR opener is unavailable.' : `No-HR probability moved ${signed(noHrProbabilityMove)} points.`,
    `${playersHrLonger} hitter HR prices lengthened and ${playersHrShorter} shortened.`,
    `${deepBaselineDiscounts} hitters retain a deep FHR or HR discount versus their own baseline.`,
    publicDataAvailable
      ? `The top three public HR targets hold ${(publicConcentration * 100).toFixed(0)}% of recorded HR picks.`
      : 'Public-pick telemetry is unavailable, so public displacement is neutral rather than scored as zero exposure.',
  ]

  const candidates = preliminary.map(item => {
    const { row } = item
    const hidden = item.underlyingPower * 0.55 + item.automaticSettlement * 0.15 + item.publicDistribution * 0.12 + item.marketStructure * 0.10 + item.baselineContext * 0.08
    const advertisedReal = item.underlyingPower * 0.55 + item.marketStructure * 0.25 + item.automaticSettlement * 0.08 + item.baselineContext * 0.07 + item.publicDistribution * 0.05
    const fhrOrder = clamp((10 - (row.bundle.battingOrder ?? 9)) / 9)
    const regimeHiddenWeight = regime === 'concealment_explosion' ? 0.72 : regime === 'mixed_concentrated' ? 0.56 : 0.38
    const evidenceScore = Math.max(hidden, advertisedReal)
    const fhrScore = clamp(
      item.underlyingPower * 0.50 + fhrOrder * 0.10 + item.publicDistribution * 0.08
      + item.marketStructure * (0.18 - regimeHiddenWeight * 0.07)
      + item.automaticSettlement * (0.08 + regimeHiddenWeight * 0.08) + item.baselineContext * 0.07,
    )
    const anytimeScore = clamp(
      item.underlyingPower * 0.56 + item.publicDistribution * 0.10
      + item.automaticSettlement * (0.08 + regimeHiddenWeight * 0.06)
      + item.marketStructure * (0.19 - regimeHiddenWeight * 0.05) + item.baselineContext * 0.07,
    )
    const bait = publicDataAvailable && item.pickPercentile >= 0.78 && item.marketStructure >= 0.62 && item.underlyingPower < 0.50 && item.automaticSettlement < 0.46
    const archetype: HrArchetype = bait
      ? 'public_bait'
      : item.alternativeSettlement >= 0.66 && item.publicDistribution >= 0.58
        ? 'alternative_diversion'
        : item.automaticSettlement >= 0.62 && item.publicDistribution >= 0.52
          ? 'power_isolated'
          : item.underlyingPower >= 0.68 && item.publicDistribution >= 0.55
            ? 'data_confirmed_hidden'
            : advertisedReal >= 0.65 && item.recentDamage >= 0.52
              ? 'advertised_real'
              : evidenceScore >= 0.56 ? 'power_isolated' : 'unsupported'
    const reasons: string[] = []
    const warnings: string[] = []
    if (item.baselineContext >= 0.62) reasons.push('FHR/HR pricing differs meaningfully from this hitter’s own baseline; direction is interpreted within this game.')
    if (item.automaticSettlement >= 0.62) reasons.push('The automatic one-swing settlement markets diverge materially from the core HR line versus this game.')
    if (item.alternativeSettlement >= 0.62 && row.leadingAlternativeMarket) reasons.push(`${row.leadingAlternativeMarket.replaceAll('_', ' ')} absorbed ${row.leadingAlternativePicks} picks and forms a distinct alternative-outcome branch.`)
    if (item.recentDamage >= 0.68) reasons.push('Recent exit velocity, hard-hit, barrel, pull-air, and bat-speed windows rank near the top of this game.')
    if (item.publicDistribution >= 0.68) reasons.push('This hitter sits at an extreme of the game-specific public and cross-market distribution; that is context, not automatic confirmation or rejection.')
    if (item.powerStructure >= 0.64) reasons.push('First-PA, HR/team-win, laser, or moonshot pricing supports the power branch.')
    if (item.pitchMatchup >= 0.68) reasons.push('Whole-game PP rank confirms the batter/pitcher pitch-mix and recent contact-quality matchup.')
    if (bait) warnings.push('Heavy public HR exposure is paired with weaker recent damage and little protected-stack evidence.')
    if (item.recentDamage < 0.38) warnings.push('Recent contact-quality windows do not confirm the power read.')
    if (item.pitchMatchup < 0.45) warnings.push('The exact pitch-mix/paper matchup ranks in the bottom half of this game.')
    if (item.baselineContext < 0.32 && item.marketStructure < 0.42) warnings.push('Neither baseline divergence nor the current full-game market structure separates this read.')
    if (row.hrPicks >= sortedPicks[0]?.hrPicks && publicConcentration > 0.55) warnings.push('This is the game’s dominant public HR target.')
    return {
      name: row.name, team: row.team, battingOrder: row.bundle.battingOrder ?? null,
      fhr: row.fhr, anytimeHr: row.anytimeHr, fhrOpen: row.fhrOpen, anytimeOpen: row.anytimeOpen,
      fhrMove: row.fhrOpen == null ? null : row.fhr - row.fhrOpen,
      anytimeMove: row.anytimeHr == null || row.anytimeOpen == null ? null : row.anytimeHr - row.anytimeOpen,
      fhrProbabilityMove: row.fhrProbabilityMove, anytimeProbabilityMove: row.anytimeProbabilityMove,
      fhrPct: row.fhrPct, anytimePct: row.anytimePct, picks: row.hrPicks,
      publicHrRank: sortedPicks.findIndex(candidate => candidate.name === row.name && candidate.team === row.team) + 1,
      publicHrShare: row.hrPicks / Math.max(1, hrPicksTotal), alternativePicks: row.alternativePicks,
      leadingAlternativeMarket: row.leadingAlternativeMarket, leadingAlternativePicks: row.leadingAlternativePicks,
      precisionScore: row.precisionScore, archetype, fhrScore, anytimeScore, evidenceScore,
      components: {
        baselineContext: item.baselineContext, marketStructure: item.marketStructure,
        automaticSettlement: item.automaticSettlement, alternativeSettlement: item.alternativeSettlement,
        recentDamage: item.recentDamage, publicDistribution: item.publicDistribution, powerStructure: item.powerStructure,
        pitchMatchup: item.pitchMatchup, underlyingPower: item.underlyingPower,
      },
      marketMoves: row.moves, automaticMarketsLonger: item.automaticLonger, automaticMarketsShorter: item.automaticShorter,
      alternativeMarketsLonger: item.alternativeLonger, alternativeMarketsShorter: item.alternativeShorter,
      recent: row.recent,
      prices: {
        rbi: currentPrice(row.bundle.props, 'rbi'), hrr: currentPrice(row.bundle.props, 'hrr'),
        tb2: currentPrice(row.bundle.props, 'tb'), tb3: currentPrice(row.bundle.props, 'tb3'),
        tb4: currentPrice(row.bundle.props, 'tb4'), tb5: currentPrice(row.bundle.props, 'tb5'),
        rbi2: currentPrice(row.bundle.props, 'rbi2'), rbi3: currentPrice(row.bundle.props, 'rbi3'),
        singles: currentPrice(row.bundle.props, 'singles'),
        doubles: currentPrice(row.bundle.props, 'doubles'), triples: currentPrice(row.bundle.props, 'triples'),
        hits: currentPrice(row.bundle.props, 'hits'), hits2: currentPrice(row.bundle.props, 'hits2'),
        runs: currentPrice(row.bundle.props, 'runs'), runs2: currentPrice(row.bundle.props, 'runs2'),
        sb: currentPrice(row.bundle.props, 'stolen_bases'), sb2: currentPrice(row.bundle.props, 'stolen_bases2'),
        hr2: currentPrice(row.bundle.props, 'hr2'),
        pa1: currentPrice(row.bundle.props, 'pa1'), laser105: currentPrice(row.bundle.props, 'laser105'),
        laser110: currentPrice(row.bundle.props, 'laser110'), moonshot: currentPrice(row.bundle.props, 'moonshot'),
        hrMl: currentPrice(row.bundle.props, 'hrMl'),
      },
      books: {
        fhr: {
          fanduel: numberOrNull(row.bundle.props?.fhr?.fanduel),
          caesars: numberOrNull(row.bundle.props?.fhr?.caesars),
          fanatics: numberOrNull(row.bundle.props?.fhr?.fanatics),
        },
        hr: {
          fanduel: numberOrNull(row.bundle.props?.sa?.fanduel),
          caesars: numberOrNull(row.bundle.props?.sa?.caesars),
          betmgm: numberOrNull(row.bundle.props?.sa?.betmgm),
          betrivers: numberOrNull(row.bundle.props?.sa?.betrivers),
          fanatics: numberOrNull(row.bundle.props?.sa?.fanatics),
        },
      },
      windows: {
        l1: intelligenceWindow(row.bundle, 'l1'),
        l3: intelligenceWindow(row.bundle, 'l3'),
        l5: intelligenceWindow(row.bundle, 'l5'),
        l10: intelligenceWindow(row.bundle, 'l10'),
      },
      reasons, warnings,
    } satisfies HrCandidateRead
  }).sort((a, b) => b.anytimeScore - a.anytimeScore || b.fhrScore - a.fhrScore)

  // Popularity is never a veto by itself. Only unsupported reads are removed.
  const clean = candidates.filter(candidate => candidate.archetype !== 'unsupported')
  const fhrRanked = [...clean].sort((a, b) => b.fhrScore - a.fhrScore)
  const companionRanked = [...clean].sort((a, b) => b.anytimeScore - a.anytimeScore)
  const fhrReads = selectQualifiedHrReads(fhrRanked, 'fhrScore', regime, audit.complete)
  const companionReads = selectQualifiedHrReads(companionRanked, 'anytimeScore', regime, audit.complete)
  const selectedKeys = new Set([...fhrReads, ...companionReads].map(candidate => `${candidate.team}:${candidate.name}`))
  const closestExcluded = candidates.find(candidate => !selectedKeys.has(`${candidate.team}:${candidate.name}`))
  if (closestExcluded) {
    const selectedCandidates = candidates.filter(candidate => selectedKeys.has(`${candidate.team}:${candidate.name}`))
    for (const candidate of selectedCandidates) {
      candidate.reasons.push(`Survives the complete-board threshold; closest excluded alternative is ${closestExcluded.name}.`)
    }
  }

  return {
    audit, regime, regimeConfidence, regimeReasons,
    noHr: { ...noHr, probabilityMove: noHrProbabilityMove },
    aggregate: { averageHrProbabilityMove, averageFhrProbabilityMove, playersHrLonger, playersHrShorter, deepBaselineDiscounts, publicConcentration },
    fhrReads,
    companionReads,
    candidates,
  }
}
