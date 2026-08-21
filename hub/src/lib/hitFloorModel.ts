import type { MatchupEdgeData, PitcherSplitRow } from './dugoutPaperScore'

export type HitWindow = {
  squaredUpPct: number | null
  sweetSpotPct: number | null
  missDistance: number | null
  onTimePct: number | null
  hardHitPct: number | null
  avgEv: number | null
}

export type HitPitchProfile = {
  score: number | null
  coverage: number
  supportedPitches: number
  highUsageTraps: string[]
  reasons: string[]
}

export type HitFloorStatus = 'QUALIFIED' | 'WATCH' | 'PASS' | 'NO_READ'

export type HitFloorInput = {
  name: string
  team: string
  batting_order: number | null
  hits_fd: number | null
  hits2_fd: number | null
  sng_fd: number | null
  hits_open: number | null
  hits2_open: number | null
  hit_pick_count?: number | null
  single_pick_count?: number | null
  total_market_pick_count?: number | null
  recent_pitch_count: number | null
  platoon_ops: number | null
  hit_windows: Partial<Record<'l1' | 'l3' | 'l5' | 'l10', HitWindow>>
  hit_pitch_profile: HitPitchProfile
  hit_score?: number | null
  hit_rank?: number | null
  hit_status?: HitFloorStatus
  hit_reasons?: string[]
  hit_warnings?: string[]
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

const percentile = (value: number | null | undefined, values: Array<number | null | undefined>, higherIsBetter = true): number | null => {
  if (value == null || !Number.isFinite(value)) return null
  const valid = values.filter((item): item is number => item != null && Number.isFinite(item)).sort((a, b) => a - b)
  if (valid.length < 2) return null
  const rank = valid.filter(item => item <= value).length / valid.length
  return higherIsBetter ? rank : 1 - rank + (1 / valid.length)
}

const weightedAverage = (parts: Array<[number | null | undefined, number]>): number | null => {
  let sum = 0
  let weight = 0
  for (const [value, partWeight] of parts) {
    if (value == null || !Number.isFinite(value)) continue
    sum += value * partWeight
    weight += partWeight
  }
  return weight > 0 ? sum / weight : null
}

const pitchMix = (row: PitcherSplitRow | null): Array<[string, number]> => {
  if (!row) return []
  return ([
    ['FF', row.pct_fastball || 0],
    ['SI', row.pct_sinker || 0],
    ['FC', row.pct_cutter || 0],
    ['SL', row.pct_slider || 0],
    ['CU', row.pct_curveball || 0],
    ['CH', row.pct_changeup || 0],
    ['FS', row.pct_splitter || 0],
  ] as Array<[string, number]>).filter(([, usage]) => usage > 4)
}

// A hit matchup is intentionally different from the HR matchup score. It
// rewards making contact against the pitches that will actually be thrown;
// hard contact matters, but cannot compensate for a high-usage whiff hole.
export function computeHitPitchProfile(
  pitcherHand: string,
  batterHand: string,
  pitcherRow: PitcherSplitRow | null,
  batterData: MatchupEdgeData,
  pitcherData: MatchupEdgeData,
): HitPitchProfile {
  const mix = pitchMix(pitcherRow)
  const mixTotal = mix.reduce((sum, [, usage]) => sum + usage, 0)
  const batterByPitch = batterData?.recentByPitchTypeByHand?.[pitcherHand as 'L' | 'R']
  const pitcherByPitch = pitcherData?.recentByPitchTypeByHand?.[(batterHand || 'R') as 'L' | 'R']
  let weightedScore = 0
  let supportedUsage = 0
  let supportedWeight = 0
  let supportedPitches = 0
  const highUsageTraps: string[] = []
  const reasons: string[] = []

  for (const [pitchType, usage] of mix) {
    const batter = batterByPitch?.[pitchType]
    const pitcher = pitcherByPitch?.[pitchType]
    if (!batter || !pitcher || batter.pitches < 8 || pitcher.pitches < 8) continue

    const batterWhiff = batter.whiffPct ?? 25
    const pitcherWhiff = pitcher.whiffPct ?? 22
    const batterContact = clamp(1 - batterWhiff / 100)
    const pitcherContactAllowed = clamp(1 - pitcherWhiff / 100)
    const contactQuality = clamp(((batter.hardHitPct ?? 30) + (pitcher.hardHitPct ?? 30)) / 200)
    const sampleConfidence = Math.min(1, Math.min(batter.pitches, pitcher.pitches) / 24)
    const weight = usage * sampleConfidence
    const score = batterContact * 0.50 + pitcherContactAllowed * 0.32 + contactQuality * 0.18

    weightedScore += score * weight
    supportedUsage += usage
    supportedWeight += weight
    supportedPitches += 1

    if (usage >= 15 && batterWhiff >= 35 && pitcherWhiff >= 25) {
      highUsageTraps.push(`${pitchType} (${usage.toFixed(0)}% usage, ${batterWhiff.toFixed(0)}% batter whiff)`)
    }
  }

  const coverage = mixTotal > 0 ? clamp(supportedUsage / mixTotal) : 0
  const score = supportedWeight > 0 ? weightedScore / supportedWeight : null
  if (coverage >= 0.70) reasons.push(`${Math.round(coverage * 100)}% of the starter's meaningful pitch mix is covered by usable samples. Coverage only; this is not a positive-match percentage.`)
  if (score != null && score >= 0.70) reasons.push('The supported pitch mix favors contact more than swing-and-miss.')

  return { score, coverage, supportedPitches, highUsageTraps, reasons }
}

function opportunityScore(order: number | null): number | null {
  if (order == null || order < 1 || order > 9) return null
  return [1, 1.00, 0.97, 0.94, 0.90, 0.84, 0.76, 0.65, 0.54, 0.45][order]
}

function marketMove(current: number | null, opening: number | null): number | null {
  if (current == null || opening == null || !Number.isFinite(current) || !Number.isFinite(opening)) return null
  return current - opening
}

/**
 * Scores a complete two-lineup pool in place from baseball evidence only.
 * Sportsbook prices and public picks are market-positioning/handle context;
 * they are deliberately excluded from the grade and cannot promote or bury a
 * player. `QUALIFIED` is an evidence-agreement label, never a certainty.
 */
export function computeHitFloorReads<T extends HitFloorInput>(rows: T[], boardComplete: boolean): void {
  const windows = ['l1', 'l3', 'l5', 'l10'] as const
  const metrics = ['squaredUpPct', 'sweetSpotPct', 'missDistance', 'onTimePct', 'hardHitPct', 'avgEv'] as const
  const pools: Record<string, Array<number | null>> = {}
  for (const window of windows) {
    for (const metric of metrics) pools[`${window}:${metric}`] = rows.map(row => row.hit_windows[window]?.[metric] ?? null)
  }
  const platoonValues = rows.map(row => row.platoon_ops)

  for (const row of rows) {
    const perWindow: number[] = []
    for (const window of windows) {
      const data = row.hit_windows[window]
      if (!data) continue
      const windowScore = weightedAverage([
        [percentile(data.squaredUpPct, pools[`${window}:squaredUpPct`]), 0.25],
        [percentile(data.missDistance, pools[`${window}:missDistance`], false), 0.23],
        [percentile(data.onTimePct, pools[`${window}:onTimePct`]), 0.18],
        [percentile(data.sweetSpotPct, pools[`${window}:sweetSpotPct`]), 0.14],
        [percentile(data.hardHitPct, pools[`${window}:hardHitPct`]), 0.10],
        [percentile(data.avgEv, pools[`${window}:avgEv`]), 0.10],
      ])
      if (windowScore != null) perWindow.push(windowScore)
    }

    // Requiring the floor as well as the mean prevents one explosive L1
    // sample from laundering three weak windows into a "safe" hit label.
    const windowAverage = perWindow.length ? perWindow.reduce((sum, value) => sum + value, 0) / perWindow.length : null
    const windowFloor = perWindow.length ? Math.min(...perWindow) : null
    const contactForm = weightedAverage([[windowAverage, 0.72], [windowFloor, 0.28]])
    const platoon = percentile(row.platoon_ops, platoonValues)
    const opportunity = opportunityScore(row.batting_order)
    const pitch = row.hit_pitch_profile.score
    const modelScore = weightedAverage([
      [contactForm, 0.46],
      [pitch, 0.34],
      [opportunity, 0.12],
      [platoon, 0.08],
    ])

    const availableCoreParts = [contactForm, pitch, opportunity, platoon].filter(value => value != null).length
    const sampleConfidence = clamp((row.recent_pitch_count ?? 0) / 40)
    const evidenceCoverage = (availableCoreParts / 4) * 0.55 + row.hit_pitch_profile.coverage * 0.30 + sampleConfidence * 0.15
    const severePitchTrap = row.hit_pitch_profile.highUsageTraps.length >= 2
    const missingEvidence: string[] = []
    if (!boardComplete) missingEvidence.push('The complete confirmed 18-player board is unavailable.')
    if (row.batting_order == null) missingEvidence.push('The batting-order opportunity is not confirmed.')
    if (perWindow.length < 3) missingEvidence.push(`Only ${perWindow.length} of four recent contact windows are available.`)
    if (row.hit_pitch_profile.coverage < 0.35) missingEvidence.push('Less than 35% of the starter pitch mix has supported batter/pitcher samples.')
    if ((row.recent_pitch_count ?? 0) < 20) missingEvidence.push('Recent pitch sample is below the 20-pitch publication floor.')

    const score = modelScore == null ? null : Math.round(modelScore * 1000) / 10
    const reasons: string[] = [...row.hit_pitch_profile.reasons]
    const warnings: string[] = [...missingEvidence]
    const componentScore = (value: number | null) => value == null ? '-' : (value * 100).toFixed(1)
    reasons.unshift(`Underlying components — recent contact: ${componentScore(contactForm)}, starter-pitch contact: ${componentScore(pitch)}, opportunity: ${componentScore(opportunity)}, platoon: ${componentScore(platoon)}. Odds excluded.`)
    if (contactForm != null && contactForm >= 0.64) reasons.push('Squared-up, timing, miss-distance, sweet-spot, and contact-quality form is strong across the recent windows-not just L1.')
    if (opportunity != null && opportunity >= 0.84) reasons.push(`Batting ${row.batting_order} supplies a strong plate-appearance floor.`)
    if (platoon != null && platoon >= 0.65) reasons.push('Platoon production ranks in the upper portion of this game.')
    if (severePitchTrap) warnings.push(`Underlying whiff veto: multiple high-usage traps (${row.hit_pitch_profile.highUsageTraps.join('; ')}).`)
    if (row.hit_pitch_profile.highUsageTraps.length === 1) warnings.push(`One high-usage whiff concern remains: ${row.hit_pitch_profile.highUsageTraps[0]}.`)

    let status: HitFloorStatus
    if (missingEvidence.length > 0 || modelScore == null || evidenceCoverage < 0.62) {
      status = 'NO_READ'
      if (missingEvidence.length === 0 && evidenceCoverage < 0.62) warnings.push(`Underlying evidence coverage ${(evidenceCoverage * 100).toFixed(1)}% is below the 62.0% publication floor.`)
    } else if (severePitchTrap || modelScore < 0.55) {
      status = 'PASS'
      if (modelScore < 0.55) warnings.push(`Underlying contact/matchup score ${score?.toFixed(1) ?? '-'} is below the 55.0 watch floor.`)
    } else if (modelScore >= 0.64 && evidenceCoverage >= 0.70) {
      status = 'QUALIFIED'
    } else {
      status = 'WATCH'
    }

    // Markets are an adversarial positioning layer, not probability truth.
    // Report observable price/handle facts without allowing them to change
    // the score, rank, or status.
    const hitMove = marketMove(row.hits_fd, row.hits_open)
    const hit2Move = marketMove(row.hits2_fd, row.hits2_open)
    const marketFacts: string[] = []
    if (hitMove != null && hitMove !== 0) marketFacts.push(`1+ Hit moved ${hitMove > 0 ? 'out' : 'in'} ${Math.abs(hitMove)} odds points from the captured opener.`)
    if (hit2Move != null && hit2Move !== 0) marketFacts.push(`2+ Hits moved ${hit2Move > 0 ? 'out' : 'in'} ${Math.abs(hit2Move)} odds points from the captured opener.`)
    if (row.hit_pick_count != null) marketFacts.push(`Public 1+ Hit handle: ${row.hit_pick_count.toLocaleString()} picks = $${(row.hit_pick_count * 100).toLocaleString()} staked.`)
    if (row.single_pick_count != null) marketFacts.push(`Public Single handle: ${row.single_pick_count.toLocaleString()} picks = $${(row.single_pick_count * 100).toLocaleString()} staked.`)
    if (row.total_market_pick_count != null) marketFacts.push(`Public handle across captured player markets: ${row.total_market_pick_count.toLocaleString()} picks = $${(row.total_market_pick_count * 100).toLocaleString()} staked.`)
    if (marketFacts.length) warnings.push('Market context only (excluded from underlying grade):', ...marketFacts)

    row.hit_score = score
    row.hit_status = status
    row.hit_reasons = reasons
    row.hit_warnings = warnings
  }

  const ranked = rows.filter(row => row.hit_score != null).sort((a, b) => (b.hit_score ?? -Infinity) - (a.hit_score ?? -Infinity))
  ranked.forEach((row, index) => { row.hit_rank = index + 1 })
}
