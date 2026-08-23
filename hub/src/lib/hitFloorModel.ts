import type { MatchupEdgeData, PitcherSplitRow } from './dugoutPaperScore'

export type HitWindow = {
  avg: number | null
  kPct: number | null
  pa: number | null
  bbe: number | null
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

export type HitFloorStatus = 'QUALIFIED' | 'WATCH' | 'INSUFFICIENT' | 'PASS'

export type HitFloorInput = {
  mlb_id?: number | null
  name: string
  team: string
  batting_order: number | null
  hits_fd: number | null
  hits2_fd: number | null
  sng_fd: number | null
  hits_open: number | null
  hits2_open: number | null
  recent_pitch_count: number | null
  platoon_ops: number | null
  hit_windows: Partial<Record<'l1' | 'l3' | 'l5' | 'l10', HitWindow>>
  hit_pitch_profile: HitPitchProfile
  hit_score?: number | null
  hit2_score?: number | null
  hit_rank?: number | null
  hit2_rank?: number | null
  hit_value_rank?: number | null
  hit2_value_rank?: number | null
  hit_status?: HitFloorStatus
  hit2_status?: HitFloorStatus
  hit_reasons?: string[]
  hit_warnings?: string[]
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

const implied = (odds: number | null | undefined): number | null => {
  if (odds == null || !Number.isFinite(odds)) return null
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
}

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

const scale = (value: number | null | undefined, poor: number, strong: number, higherIsBetter = true): number | null => {
  if (value == null || !Number.isFinite(value) || poor === strong) return null
  const normalized = higherIsBetter ? (value - poor) / (strong - poor) : (poor - value) / (poor - strong)
  return clamp(normalized)
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

const recentPitchMix = (byPitch: Record<string, { pitches: number }> | null | undefined): Array<[string, number]> => {
  if (!byPitch) return []
  const total = Object.values(byPitch).reduce((sum, bucket) => sum + Math.max(0, Number(bucket?.pitches ?? 0)), 0)
  if (total <= 0) return []
  return Object.entries(byPitch)
    .map(([pitchType, bucket]) => [pitchType, Math.max(0, Number(bucket?.pitches ?? 0)) / total * 100] as [string, number])
    .filter(([, usage]) => usage > 4)
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
  const batterByPitch = batterData?.recentByPitchTypeByHand?.[pitcherHand as 'L' | 'R']
  const pitcherByPitch = pitcherData?.recentByPitchTypeByHand?.[(batterHand || 'R') as 'L' | 'R']
  // The season split table is preferred, but the precomputed pitcher pitch
  // buckets are a complete count-based mix and remain valid when that
  // external table is unavailable. This preserves the evidence gate rather
  // than converting a dependency outage into 18 false red/gray rows.
  const mix = pitchMix(pitcherRow)
  const effectiveMix = mix.length ? mix : recentPitchMix(pitcherByPitch)
  const mixTotal = effectiveMix.reduce((sum, [, usage]) => sum + usage, 0)
  let weightedScore = 0
  let supportedUsage = 0
  let supportedWeight = 0
  let supportedPitches = 0
  const highUsageTraps: string[] = []
  const reasons: string[] = []

  for (const [pitchType, usage] of effectiveMix) {
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
  if (coverage >= 0.70) reasons.push(`${Math.round(coverage * 100)}% of the starter's meaningful pitch mix has supported batter/pitcher samples.`)
  if (score != null && score >= 0.70) reasons.push('The supported pitch mix favors contact more than swing-and-miss.')

  return { score, coverage, supportedPitches, highUsageTraps, reasons }
}

function opportunityScore(order: number | null): number | null {
  if (order == null || order < 1 || order > 9) return null
  return [1, 1.00, 0.97, 0.94, 0.90, 0.84, 0.76, 0.65, 0.54, 0.45][order]
}

function openingMove(current: number | null, opening: number | null): number | null {
  const currentProbability = implied(current)
  const openingProbability = implied(opening)
  return currentProbability == null || openingProbability == null ? null : currentProbability - openingProbability
}

/**
 * Scores a complete two-lineup pool in place. `QUALIFIED` means every hard
 * evidence gate cleared; it is a board-agreement label, never a promise that
 * a hit is certain. Prices never enter the contact score: after the underlying
 * read qualifies, they are used only to rank the highest-paying captured 1+
 * and 2+ hit choices. Missing evidence is distinct from an actual PASS.
 */
export function computeHitFloorReads<T extends HitFloorInput>(rows: T[], boardComplete: boolean): void {
  const windows = ['l1', 'l3', 'l5', 'l10'] as const
  const metrics = ['avg', 'kPct', 'squaredUpPct', 'sweetSpotPct', 'missDistance', 'onTimePct', 'hardHitPct', 'avgEv'] as const
  const pools: Record<string, Array<number | null>> = {}
  for (const window of windows) {
    for (const metric of metrics) pools[`${window}:${metric}`] = rows.map(row => row.hit_windows[window]?.[metric] ?? null)
  }
  const platoonValues = rows.map(row => row.platoon_ops)

  for (const row of rows) {
    const perWindow: Array<{ window: typeof windows[number]; score: number }> = []
    for (const window of windows) {
      const data = row.hit_windows[window]
      if (!data) continue
      const bipRate = data.pa != null && data.pa > 0 && data.bbe != null ? data.bbe / data.pa : null
      const bipPool = rows.map(candidate => {
        const candidateWindow = candidate.hit_windows[window]
        return candidateWindow?.pa != null && candidateWindow.pa > 0 && candidateWindow.bbe != null
          ? candidateWindow.bbe / candidateWindow.pa
          : null
      })
      const relativeScore = weightedAverage([
        [percentile(data.avg, pools[`${window}:avg`]), 0.24],
        [percentile(data.kPct, pools[`${window}:kPct`], false), 0.20],
        [percentile(bipRate, bipPool), 0.14],
        [percentile(data.squaredUpPct, pools[`${window}:squaredUpPct`]), 0.14],
        [percentile(data.missDistance, pools[`${window}:missDistance`], false), 0.10],
        [percentile(data.onTimePct, pools[`${window}:onTimePct`]), 0.08],
        [percentile(data.sweetSpotPct, pools[`${window}:sweetSpotPct`]), 0.05],
        [percentile(data.hardHitPct, pools[`${window}:hardHitPct`]), 0.05],
      ])
      // Relative board rank alone can crown the least-bad hitter in a weak
      // lineup. Blend it with absolute contact bands so qualification still
      // requires a genuinely playable batted-ball/contact shape.
      const absoluteScore = weightedAverage([
        [scale(data.avg, 0.15, 0.35), 0.24],
        [scale(data.kPct, 35, 12, false), 0.20],
        [scale(bipRate, 0.42, 0.72), 0.14],
        [scale(data.squaredUpPct, 0.18, 0.42), 0.14],
        [scale(data.missDistance, 13, 5, false), 0.10],
        [scale(data.onTimePct, 0.28, 0.62), 0.08],
        [scale(data.sweetSpotPct, 10, 32), 0.05],
        [scale(data.hardHitPct, 25, 55), 0.05],
      ])
      const windowScore = weightedAverage([[relativeScore, 0.55], [absoluteScore, 0.45]])
      if (windowScore != null) perWindow.push({ window, score: windowScore })
    }

    // Requiring the floor as well as the mean prevents one explosive L1
    // sample from laundering three weak windows into a "safe" hit label.
    const recencyWeights = { l1: 0.10, l3: 0.20, l5: 0.30, l10: 0.40 }
    const windowAverage = weightedAverage(perWindow.map(item => [item.score, recencyWeights[item.window]]))
    const stableWindows = perWindow.filter(item => item.window !== 'l1').map(item => item.score)
    const windowFloor = stableWindows.length ? Math.min(...stableWindows) : null
    const contactForm = weightedAverage([[windowAverage, 0.84], [windowFloor, 0.16]])
    const platoon = percentile(row.platoon_ops, platoonValues)
    const opportunity = opportunityScore(row.batting_order)
    const pitch = row.hit_pitch_profile.score
    const modelScore = weightedAverage([
      [contactForm, 0.44],
      [pitch, 0.34],
      [opportunity, 0.14],
      [platoon, 0.08],
    ])
    const recentAverage = weightedAverage((['l3', 'l5', 'l10'] as const).map(window => [row.hit_windows[window]?.avg, window === 'l10' ? 0.50 : window === 'l5' ? 0.32 : 0.18]))
    const recentAverageScore = scale(recentAverage, 0.18, 0.38)
    const hit2Score = weightedAverage([
      [recentAverageScore, 0.35],
      [contactForm, 0.27],
      [pitch, 0.18],
      [opportunity, 0.16],
      [platoon, 0.04],
    ])

    const availableCoreParts = [contactForm, pitch, opportunity, platoon].filter(value => value != null).length
    const sampleConfidence = clamp((row.recent_pitch_count ?? 0) / 40)
    const evidenceCoverage = (availableCoreParts / 4) * 0.50 + row.hit_pitch_profile.coverage * 0.30 + sampleConfidence * 0.20
    const severePitchTrap = row.hit_pitch_profile.highUsageTraps.length >= 2
    const missingEvidence: string[] = []
    if (!boardComplete) missingEvidence.push('The complete confirmed 18-player board is unavailable.')
    if (row.batting_order == null) missingEvidence.push('The batting-order opportunity is not confirmed.')
    if (perWindow.length < 3) missingEvidence.push(`Only ${perWindow.length} of four recent contact windows are available.`)
    if (row.hit_pitch_profile.coverage < 0.35) missingEvidence.push('Less than 35% of the starter pitch mix has supported batter/pitcher samples.')
    if ((row.recent_pitch_count ?? 0) < 20) missingEvidence.push('Recent pitch sample is below the 20-pitch publication floor.')
    const contradictions: string[] = []
    if (severePitchTrap) contradictions.push(`Multiple high-usage whiff traps: ${row.hit_pitch_profile.highUsageTraps.join('; ')}.`)

    const score = modelScore == null ? null : Math.round(modelScore * 1000) / 10
    const score2 = hit2Score == null ? null : Math.round(hit2Score * 1000) / 10
    const reasons: string[] = [...row.hit_pitch_profile.reasons]
    const warnings: string[] = [...missingEvidence, ...contradictions]
    if (contactForm != null && contactForm >= 0.64) reasons.push('Squared-up, timing, miss-distance, sweet-spot, and contact-quality form is strong across the recent windows-not just L1.')
    if (opportunity != null && opportunity >= 0.84) reasons.push(`Batting ${row.batting_order} supplies a strong plate-appearance floor.`)
    if (platoon != null && platoon >= 0.65) reasons.push('Platoon production ranks in the upper portion of this game.')
    const hitMove = openingMove(row.hits_fd, row.hits_open)
    const hit2Move = openingMove(row.hits2_fd, row.hits2_open)
    if (hitMove != null && hit2Move != null && hitMove > 0 && hit2Move > 0) reasons.push('Both 1+ and 2+ hit prices shortened from their captured openers.')
    else if (hitMove != null && hit2Move != null && Math.sign(hitMove) !== Math.sign(hit2Move)) warnings.push('1+ and 2+ hit movement disagree; the market branch is not clean confirmation.')
    if (row.hit_pitch_profile.highUsageTraps.length === 1) warnings.push(`One high-usage whiff concern remains: ${row.hit_pitch_profile.highUsageTraps[0]}.`)

    const statusFor = (
      marketCaptured: boolean,
      candidateScore: number | null,
      qualifyAt: number,
      watchAt: number,
    ): HitFloorStatus => {
      if (!marketCaptured || missingEvidence.length > 0 || candidateScore == null || evidenceCoverage < 0.62) return 'INSUFFICIENT'
      if (contradictions.length > 0) return 'PASS'
      if (candidateScore >= qualifyAt && evidenceCoverage >= 0.70) return 'QUALIFIED'
      if (candidateScore >= watchAt) return 'WATCH'
      return 'PASS'
    }
    // Completed-slate replay showed a material precision step only once the
    // 1+ evidence score reached 80. The independent 2+ score is useful for
    // narrowing candidates, but has not earned a green publication state;
    // retain it as an amber watch instead of overstating confidence.
    const status = statusFor(row.hits_fd != null, modelScore, 0.80, 0.72)
    const rawHit2Status = statusFor(row.hits2_fd != null, hit2Score, 1.01, 0.78)
    const hit2Status = rawHit2Status === 'QUALIFIED' ? 'WATCH' : rawHit2Status

    row.hit_score = score
    row.hit2_score = score2
    row.hit_status = status
    row.hit2_status = hit2Status
    row.hit_reasons = reasons
    row.hit_warnings = warnings
    row.hit_rank = null
    row.hit2_rank = null
    row.hit_value_rank = null
    row.hit2_value_rank = null
  }

  const ranked = rows.filter(row => row.hit_score != null).sort((a, b) => (b.hit_score ?? -Infinity) - (a.hit_score ?? -Infinity))
  ranked.forEach((row, index) => { row.hit_rank = index + 1 })
  const ranked2 = rows.filter(row => row.hit2_score != null).sort((a, b) => (b.hit2_score ?? -Infinity) - (a.hit2_score ?? -Infinity))
  ranked2.forEach((row, index) => { row.hit2_rank = index + 1 })

  // American odds sort naturally from the highest payout (+money first,
  // then the least-negative favorite). Only fully qualified reads receive a
  // value rank. For 1+, only QUALIFIED rows rank. The separately labeled
  // amber 2+ WATCH list is ranked below without implying qualification.
  const hitValue = rows
    .filter(row => row.hit_status === 'QUALIFIED' && row.hits_fd != null)
    .sort((a, b) => (b.hits_fd ?? -Infinity) - (a.hits_fd ?? -Infinity))
  hitValue.forEach((row, index) => { row.hit_value_rank = index + 1 })
  const hit2Value = rows
    // 2+ is intentionally an amber candidate list until the independent
    // branch validates. Ranking WATCH rows keeps the useful long-price sort
    // visible without mislabeling it as a qualified floor.
    .filter(row => row.hit2_status === 'WATCH' && row.hits2_fd != null)
    .sort((a, b) => (b.hits2_fd ?? -Infinity) - (a.hits2_fd ?? -Infinity))
  // Keep the board surgical: expose only the three highest-paying 2+ watches.
  // The remaining WATCH rows retain their evidence status but do not receive
  // a displayed value rank.
  hit2Value.slice(0, 3).forEach((row, index) => { row.hit2_value_rank = index + 1 })
}
