import { normName } from '@slipsurge/core/nameNorm'
import { canonGameKey } from '@slipsurge/core/teamAbbr'
import { createAdminClient } from '@/lib/supabase/admin'
import { runFhrClusterDate, type FhrClusterGameResult, type GradedHrCandidate } from '@/lib/fhrClusterBacktest'

export type HrTimelineMarket = 'fhr' | 'teamFhr' | 'hr' | 'rbi' | 'rbi2' | 'rbi3' | 'hrr' | 'tb2' | 'tb3' | 'tb4' | 'tb5' | 'hr2' | 'pa1' | 'laser105' | 'laser110' | 'moonshot' | 'hrMl' | 'hit1' | 'hit2' | 'run1' | 'run2' | 'single' | 'double' | 'triple' | 'sb1' | 'sb2'

export type HrTimelinePoint = {
  label: string
  capturedAt: string
  prices: Record<string, Partial<Record<HrTimelineMarket, number>>>
}

export type HrContextualCandidate = GradedHrCandidate & {
  visibleRank: number
  marketRank: number
  residualRank: number
  fhrContextRank: number
  anytimeContextRank: number
  visibleStrength: number
  marketStrength: number
  derivativeStrength: number
  marketResidual: number
  temporalDistinctiveness: number
  fhrContextScore: number
  anytimeContextScore: number
  role: 'true_anchor' | 'hidden_fhr' | 'anytime_companion' | 'market_residual' | 'public_shell' | 'released_candidate' | 'unresolved'
  ratioPath: Array<{ label: string; capturedAt: string; fhrHr: number | null; fhr: number | null; hr: number | null }>
  survivesBecause: string[]
  losesBecause: string[]
  beats: Array<{ name: string; role: HrContextualCandidate['role']; reasons: string[] }>
}

export type HrLaneRead = {
  status: 'isolated' | 'clustered' | 'no_read' | 'blocked'
  names: string[]
  score: number | null
  separation: number | null
  explanation: string
}

export type HrGameReport = Omit<FhrClusterGameResult, 'candidates' | 'fhrReads' | 'companionReads' | 'selected' | 'marketFavorite'> & {
  timeline: HrTimelinePoint[]
  marketFavorite: HrContextualCandidate | null
  candidates: HrContextualCandidate[]
  story: {
    headline: string
    publicStory: string
    marketStory: string
    eventEnvironment: 'quiet' | 'open' | 'mixed'
    openingFavorite: string | null
    pregameFavorite: string | null
    publicAnchor: string | null
    residualLeader: string | null
    fhr: HrLaneRead
    anytime: HrLaneRead
    noise: string[]
    auditNote: string
  }
}

export type HrGameIntelligenceReport = {
  date: string
  generatedAt: string
  games: HrGameReport[]
  error?: string
}

type CaptureRow = {
  capture_key: string
  game_key: string
  tab_label: string
  scraped_at: string
  raw_sections: Record<string, unknown>
}

const WANTED_TABS = ['Same Game Parlay™', 'Batter Props', 'Popular', 'Quick Bets', 'Lasers', 'Moonshots', 'Plate Appearance', 'Player Combos']
const BOOKS = ['fanduel', 'caesars', 'betmgm', 'betrivers', 'fanatics'] as const
const DERIVATIVE_MARKETS: HrTimelineMarket[] = [
  'teamFhr', 'rbi', 'rbi2', 'rbi3', 'hrr', 'tb2', 'tb3', 'tb4', 'tb5', 'hr2', 'pa1',
  'laser105', 'laser110', 'moonshot', 'hrMl', 'hit1', 'hit2', 'run1', 'run2',
  'single', 'double', 'triple', 'sb1', 'sb2',
]
const TEMPORAL_MARKETS: HrTimelineMarket[] = ['fhr', 'hr', ...DERIVATIVE_MARKETS]
const VISIBLE_METRICS = [
  'avgEv', 'hardHitPct', 'barrelPct', 'sweetSpotPct', 'pullAirRate', 'fbRate',
  'avgBatSpeed', 'squaredUpPct', 'blastPct', 'idealAttackAngleRate',
] as const
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const implied = (odds: number | null | undefined) => odds == null ? null : odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
const mean = (values: Array<number | null | undefined>) => {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const rankPercentiles = (values: Array<number | null>, higher = true) => {
  const valid = values.map((value, index) => ({ value, index })).filter((entry): entry is { value: number; index: number } => entry.value != null)
  return values.map(value => {
    if (value == null || valid.length < 2) return 0.5
    const below = valid.filter(entry => entry.value < value).length
    const tied = valid.filter(entry => entry.value === value).length
    const percentile = (below + Math.max(0, tied - 1) / 2) / (valid.length - 1)
    return higher ? percentile : 1 - percentile
  })
}
const ordinalRanks = (values: number[], higher = true) => values.map(value => 1 + values.filter(other => higher ? other > value : other < value).length)
const weighted = (parts: Array<[number | null | undefined, number]>) => {
  let value = 0
  let weight = 0
  for (const [part, partWeight] of parts) {
    if (part == null || !Number.isFinite(part)) continue
    value += part * partWeight
    weight += partWeight
  }
  return weight ? value / weight : 0.5
}
const american = (value: number | null) => value == null ? 'unavailable' : `${value > 0 ? '+' : ''}${value}`

function parseOdds(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (/^even$/i.test(raw)) return 100
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function cleanSelection(value: unknown): string {
  return String(value ?? '').split('|')[0].split('/')[0].trim()
}

function sectionMarket(section: string): HrTimelineMarket | null {
  const value = section.toLowerCase().replace(/\s+/g, ' ').trim()
  const exact: Record<string, HrTimelineMarket> = {
    'to hit first home run': 'fhr', 'to hit a home run': 'hr', 'to hit 2+ home runs': 'hr2',
    'to hit a single': 'single', 'to hit a double': 'double', 'to hit a triple': 'triple',
    'to record a hit': 'hit1', 'to record 2+ hits': 'hit2', 'to record a run': 'run1', 'to record 2+ runs': 'run2',
    'to record an rbi': 'rbi', 'to record 2+ rbis': 'rbi2', 'to record 3+ rbis': 'rbi3',
    'to record 2+ total bases': 'tb2', 'to record 3+ total bases': 'tb3', 'to record 4+ total bases': 'tb4', 'to record 5+ total bases': 'tb5',
    'home run / moneyline parlay': 'hrMl', 'player to record 1+ hits + runs + rbis': 'hrr',
    'to record a stolen base': 'sb1', 'to record 2+ stolen bases': 'sb2',
  }
  if (exact[value]) return exact[value]
  if (value.includes('laser') && value.includes('110')) return 'laser110'
  if (value.includes('laser') && value.includes('105')) return 'laser105'
  if (value.includes('moonshot')) return 'moonshot'
  return null
}

function clonePrices(state: Map<string, Partial<Record<HrTimelineMarket, number>>>) {
  return Object.fromEntries([...state].map(([name, prices]) => [name, { ...prices }]))
}

function parseCaptureIntoState(capture: CaptureRow, state: Map<string, Partial<Record<HrTimelineMarket, number>>>) {
  for (const [section, rawOutcomes] of Object.entries(capture.raw_sections ?? {})) {
    const outcomes = Array.isArray(rawOutcomes) ? rawOutcomes as Array<Record<string, unknown>> : []
    if (/^first home run - /i.test(section)) {
      for (const outcome of outcomes) {
        const name = normName(cleanSelection(outcome.selection))
        const odds = parseOdds(outcome.odds)
        if (!name || odds == null) continue
        state.set(name, { ...(state.get(name) ?? {}), teamFhr: odds })
      }
      continue
    }
    if (/^1st pa - /i.test(section)) {
      const name = normName(section.replace(/^1st pa - /i, '').trim())
      const homeRun = outcomes.find(outcome => /home run/i.test(String(outcome.selection ?? '')))
      const odds = parseOdds(homeRun?.odds)
      if (name && odds != null) state.set(name, { ...(state.get(name) ?? {}), pa1: odds })
      continue
    }
    const market = sectionMarket(section)
    if (!market) continue
    for (const outcome of outcomes) {
      const selection = cleanSelection(outcome.selection)
      const name = normName(selection)
      const odds = parseOdds(outcome.odds)
      if (!name || odds == null || /^no home run$/i.test(selection)) continue
      state.set(name, { ...(state.get(name) ?? {}), [market]: odds })
    }
  }
}

function etMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0) % 24
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function displayTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function selectTimelinePoints(points: HrTimelinePoint[], startsAt: string, current: HrTimelinePoint): HrTimelinePoint[] {
  if (!points.length) return [current]
  const usable = points.filter(point => Object.values(point.prices).filter(prices => prices.fhr != null || prices.hr != null).length >= 8)
  const pool = usable.length ? usable : points
  const selected: HrTimelinePoint[] = []
  const add = (point: HrTimelinePoint | undefined, label: string) => {
    if (!point || selected.some(row => row.capturedAt === point.capturedAt)) return
    selected.push({ ...point, label: `${label} · ${displayTime(point.capturedAt)}` })
  }
  add(pool[0], 'Open')
  const beforeMinute = (target: number) => [...pool].reverse().find(point => etMinutes(point.capturedAt) <= target)
  add(beforeMinute(9 * 60), '9 AM')
  add(beforeMinute(12 * 60), 'Noon')
  const lateTarget = new Date(new Date(startsAt).getTime() - 60 * 60 * 1000).toISOString()
  add([...pool].reverse().find(point => point.capturedAt <= lateTarget), 'Late')
  add(pool.at(-1), 'Pregame')
  add(current, 'Current board')
  return selected.sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
}

async function loadCaptureTimelines(date: string, games: FhrClusterGameResult[]): Promise<Map<string, HrTimelinePoint[]>> {
  const db = createAdminClient()
  const meta: Array<Omit<CaptureRow, 'raw_sections'>> = []
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await db.from('fanduel_market_captures')
      .select('capture_key,game_key,tab_label,scraped_at')
      .eq('game_date', date)
      .in('tab_label', WANTED_TABS)
      .order('scraped_at', { ascending: true })
      .range(offset, offset + 999)
    if (error) throw error
    meta.push(...((data ?? []) as Array<Omit<CaptureRow, 'raw_sections'>>))
    if ((data?.length ?? 0) < 1000) break
  }
  const starts = new Map(games.map(game => [canonGameKey(game.gameKey), new Date(game.startsAt).getTime()]))
  const eligible = meta.filter(row => {
    const start = starts.get(canonGameKey(row.game_key))
    return start != null && new Date(row.scraped_at).getTime() < start
  })
  const rows: CaptureRow[] = []
  for (let index = 0; index < eligible.length; index += 40) {
    const keys = eligible.slice(index, index + 40).map(row => row.capture_key)
    const { data, error } = await db.from('fanduel_market_captures')
      .select('capture_key,game_key,tab_label,scraped_at,raw_sections')
      .in('capture_key', keys)
    if (error) throw error
    rows.push(...((data ?? []) as CaptureRow[]))
  }
  rows.sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime())
  const grouped = new Map<string, CaptureRow[]>()
  for (const row of rows) {
    const key = canonGameKey(row.game_key)
    const list = grouped.get(key) ?? []
    list.push(row)
    grouped.set(key, list)
  }
  const output = new Map<string, HrTimelinePoint[]>()
  for (const [gameKey, captures] of grouped) {
    const state = new Map<string, Partial<Record<HrTimelineMarket, number>>>()
    const points: HrTimelinePoint[] = []
    for (const capture of captures) {
      parseCaptureIntoState(capture, state)
      points.push({ label: '', capturedAt: capture.scraped_at, prices: clonePrices(state) })
    }
    output.set(gameKey, points)
  }
  return output
}

function currentTimeline(game: FhrClusterGameResult): HrTimelinePoint {
  const prices: HrTimelinePoint['prices'] = {}
  for (const candidate of game.candidates) {
    prices[normName(candidate.name)] = {
      fhr: candidate.fhr,
      hr: candidate.anytimeHr ?? undefined,
      rbi: candidate.prices.rbi ?? undefined,
      rbi2: candidate.prices.rbi2 ?? undefined,
      rbi3: candidate.prices.rbi3 ?? undefined,
      hrr: candidate.prices.hrr ?? undefined,
      tb2: candidate.prices.tb2 ?? undefined,
      tb3: candidate.prices.tb3 ?? undefined,
      tb4: candidate.prices.tb4 ?? undefined,
      tb5: candidate.prices.tb5 ?? undefined,
      single: candidate.prices.singles ?? undefined,
      double: candidate.prices.doubles ?? undefined,
      triple: candidate.prices.triples ?? undefined,
      hit1: candidate.prices.hits ?? undefined,
      hit2: candidate.prices.hits2 ?? undefined,
      run1: candidate.prices.runs ?? undefined,
      run2: candidate.prices.runs2 ?? undefined,
      sb1: candidate.prices.sb ?? undefined,
      sb2: candidate.prices.sb2 ?? undefined,
      hr2: candidate.prices.hr2 ?? undefined,
      pa1: candidate.prices.pa1 ?? undefined,
      laser105: candidate.prices.laser105 ?? undefined,
      laser110: candidate.prices.laser110 ?? undefined,
      moonshot: candidate.prices.moonshot ?? undefined,
      hrMl: candidate.prices.hrMl ?? undefined,
    }
  }
  return { label: 'Current board', capturedAt: new Date(Math.min(Date.now(), new Date(game.startsAt).getTime() - 1)).toISOString(), prices }
}

function crossBookStrength(candidate: GradedHrCandidate, market: 'fhr' | 'hr') {
  return mean(BOOKS.map(book => implied(candidate.books[market][book])))
}

function ratioAt(point: HrTimelinePoint, name: string) {
  const prices = point.prices[normName(name)]
  const fhr = prices?.fhr ?? null
  const hr = prices?.hr ?? null
  const fhrProbability = implied(fhr)
  const hrProbability = implied(hr)
  return fhrProbability == null || hrProbability == null || hrProbability === 0 ? null : fhrProbability / hrProbability
}

function visibleStrengths(candidates: GradedHrCandidate[]): number[] {
  const windows = ['l1', 'l3', 'l5', 'l10'] as const
  const windowWeights = { l1: 0.12, l3: 0.34, l5: 0.31, l10: 0.23 }
  const metricWeights: Record<(typeof VISIBLE_METRICS)[number], number> = {
    avgEv: 0.15, hardHitPct: 0.12, barrelPct: 0.17, sweetSpotPct: 0.12,
    pullAirRate: 0.12, fbRate: 0.05, avgBatSpeed: 0.08, squaredUpPct: 0.08,
    blastPct: 0.07, idealAttackAngleRate: 0.04,
  }
  const scores = candidates.map(() => [] as Array<[number | null, number]>)
  for (const window of windows) {
    for (const metric of VISIBLE_METRICS) {
      const values = candidates.map(candidate => candidate.windows[window][metric])
      const percentiles = rankPercentiles(values)
      for (let index = 0; index < candidates.length; index += 1) {
        if (values[index] != null) scores[index].push([percentiles[index], windowWeights[window] * metricWeights[metric]])
      }
    }
    const paperValues = candidates.map(candidate => candidate.windows[window].paperRank)
    const paperPercentiles = rankPercentiles(paperValues, false)
    for (let index = 0; index < candidates.length; index += 1) {
      if (paperValues[index] != null) scores[index].push([paperPercentiles[index], windowWeights[window] * 0.28])
    }
  }
  return scores.map(parts => weighted(parts))
}

function derivativeStrengths(candidates: GradedHrCandidate[], current: HrTimelinePoint): number[] {
  const byCandidate = candidates.map(() => [] as number[])
  for (const market of DERIVATIVE_MARKETS) {
    const values = candidates.map(candidate => implied(current.prices[normName(candidate.name)]?.[market]))
    const percentiles = rankPercentiles(values)
    for (let index = 0; index < candidates.length; index += 1) {
      if (values[index] != null) byCandidate[index].push(percentiles[index])
    }
  }
  return byCandidate.map(values => mean(values) ?? 0.5)
}

function temporalRaw(candidate: GradedHrCandidate, timeline: HrTimelinePoint[]) {
  const marketPaths: number[] = []
  for (const market of TEMPORAL_MARKETS) {
    const path = timeline
      .map(point => implied(point.prices[normName(candidate.name)]?.[market]))
      .filter((value): value is number => value != null)
    if (path.length < 2) continue
    let travel = 0
    let reversals = 0
    for (let index = 1; index < path.length; index += 1) {
      travel += Math.abs(path[index] - path[index - 1])
      if (index > 1 && Math.sign(path[index] - path[index - 1]) !== Math.sign(path[index - 1] - path[index - 2])) reversals += 1
    }
    marketPaths.push(travel + Math.abs(path.at(-1)! - path[0]) * 0.75 + reversals * 0.0025)
  }
  const ratioPath = timeline.map(point => ratioAt(point, candidate.name)).filter((value): value is number => value != null)
  let ratioTravel = 0
  for (let index = 1; index < ratioPath.length; index += 1) ratioTravel += Math.abs(ratioPath[index] - ratioPath[index - 1])
  return (mean(marketPaths) ?? 0) + ratioTravel * 0.15
}

function pairwiseWhy(winner: HrContextualCandidate, alternative: HrContextualCandidate, lane: 'fhr' | 'anytime'): string {
  const points: string[] = []
  if (winner.marketResidual > alternative.marketResidual + 0.04) points.push('larger unexplained market premium')
  if (winner.marketStrength > alternative.marketStrength + 0.05) points.push('stronger cross-book/derivative support')
  if (winner.temporalDistinctiveness > alternative.temporalDistinctiveness + 0.08) points.push('more distinctive open-to-pregame path')
  if (winner.visibleStrength > alternative.visibleStrength + 0.08) points.push('better pitch/contact confirmation')
  if (lane === 'fhr' && (winner.battingOrder ?? 9) < (alternative.battingOrder ?? 9)) points.push('earlier opportunity order')
  return points.length
    ? `${winner.name} beats ${alternative.name}: ${points.slice(0, 3).join(', ')}.`
    : `${winner.name} only narrowly clears ${alternative.name}; treat the separation as weak.`
}

function pairwiseReasons(winner: HrContextualCandidate, alternative: HrContextualCandidate, lane: 'fhr' | 'anytime'): string[] {
  const reasons: string[] = []
  const laneScore = lane === 'fhr' ? 'fhrContextScore' : 'anytimeContextScore'
  const laneRank = lane === 'fhr' ? 'fhrContextRank' : 'anytimeContextRank'
  reasons.push(`${lane === 'fhr' ? 'FHR' : 'Anytime'} score ${(winner[laneScore] * 100).toFixed(0)}% (#${winner[laneRank]}) vs ${(alternative[laneScore] * 100).toFixed(0)}% (#${alternative[laneRank]}).`)
  if (winner.marketResidual > alternative.marketResidual + 0.025) reasons.push(`Unexplained market premium ${winner.marketResidual >= 0 ? '+' : ''}${winner.marketResidual.toFixed(2)} vs ${alternative.marketResidual >= 0 ? '+' : ''}${alternative.marketResidual.toFixed(2)}.`)
  if (winner.marketStrength > alternative.marketStrength + 0.035) reasons.push(`Full-tree market support ranks #${winner.marketRank} vs #${alternative.marketRank}.`)
  if (winner.derivativeStrength > alternative.derivativeStrength + 0.04) reasons.push('Derivative HR-settlement markets provide the stronger relative confirmation.')
  if (winner.temporalDistinctiveness > alternative.temporalDistinctiveness + 0.06) reasons.push('Open-to-pregame path is more distinctive across the complete market tree.')
  if (winner.visibleStrength > alternative.visibleStrength + 0.06) reasons.push(`Pitch/contact profile ranks #${winner.visibleRank} vs #${alternative.visibleRank}.`)
  if (winner.publicHrRank > alternative.publicHrRank && winner.marketResidual > alternative.marketResidual) reasons.push('Retains stronger unexplained price support with less recorded public concentration.')
  if (lane === 'fhr' && (winner.battingOrder ?? 9) < (alternative.battingOrder ?? 9)) reasons.push(`Earlier lineup opportunity: #${winner.battingOrder} vs #${alternative.battingOrder}.`)
  if (reasons.length === 1) reasons.push('The edge is aggregate rather than one dominant component; separation should be treated as narrow.')
  return reasons.slice(0, 4)
}

function laneRead(candidates: HrContextualCandidate[], lane: 'fhr' | 'anytime', complete: boolean): HrLaneRead {
  if (!complete) return { status: 'blocked', names: [], score: null, separation: null, explanation: 'Blocked because the 18-player board did not pass coverage checks.' }
  const key = lane === 'fhr' ? 'fhrContextScore' : 'anytimeContextScore'
  const sorted = [...candidates].sort((a, b) => b[key] - a[key])
  const center = median(sorted.map(candidate => candidate[key]))
  const top = sorted[0]
  const second = sorted[1]
  if (!top || top[key] < 0.61 || top[key] - center < 0.07) {
    return { status: 'no_read', names: [], score: top?.[key] ?? null, separation: top ? top[key] - center : null, explanation: `No ${lane === 'fhr' ? 'first-HR' : 'anytime-HR'} candidate separates from this game's full board.` }
  }
  const gap = second ? top[key] - second[key] : 1
  if (second && second[key] >= 0.61 && gap < 0.025) {
    const tied = sorted.filter(candidate => top[key] - candidate[key] < 0.025).slice(0, 3)
    return { status: 'clustered', names: tied.map(candidate => candidate.name), score: top[key], separation: gap, explanation: `The board supports a ${lane} cluster; it does not honestly isolate one name.` }
  }
  return { status: 'isolated', names: [top.name], score: top[key], separation: gap, explanation: `${top.name} is the only ${lane} read with both full-board separation and adequate evidence.` }
}

function buildContextualGame(game: FhrClusterGameResult, rawTimeline: HrTimelinePoint[]): HrGameReport {
  const current = currentTimeline(game)
  const timeline = selectTimelinePoints(rawTimeline, game.startsAt, current)
  const visible = visibleStrengths(game.candidates)
  const crossBookHr = game.candidates.map(candidate => crossBookStrength(candidate, 'hr'))
  const crossBookFhr = game.candidates.map(candidate => crossBookStrength(candidate, 'fhr'))
  const hrPct = rankPercentiles(crossBookHr)
  const fhrPct = rankPercentiles(crossBookFhr)
  const derivativePct = derivativeStrengths(game.candidates, current)
  const temporal = game.candidates.map(candidate => temporalRaw(candidate, timeline))
  const temporalPct = rankPercentiles(temporal)
  const marketStrengths = game.candidates.map((_, index) => weighted([[hrPct[index], 0.5], [fhrPct[index], 0.2], [derivativePct[index], 0.3]]))
  const residuals = marketStrengths.map((value, index) => value - visible[index])
  const residualPct = rankPercentiles(residuals)
  const visibleRanks = ordinalRanks(visible)
  const marketRanks = ordinalRanks(marketStrengths)
  const residualRanks = ordinalRanks(residuals)
  const fhrScores = game.candidates.map((candidate, index) => clamp(weighted([
    [candidate.fhrScore, 0.20], [marketStrengths[index], 0.24], [residualPct[index], 0.24],
    [temporalPct[index], 0.14], [visible[index], 0.14], [1 - ((candidate.battingOrder ?? 9) - 1) / 8, 0.04],
  ])))
  const anytimeScores = game.candidates.map((candidate, index) => clamp(weighted([
    [candidate.anytimeScore, 0.19], [marketStrengths[index], 0.27], [residualPct[index], 0.26],
    [temporalPct[index], 0.12], [visible[index], 0.16],
  ])))
  const fhrRanks = ordinalRanks(fhrScores)
  const anytimeRanks = ordinalRanks(anytimeScores)

  let candidates = game.candidates.map((candidate, index): HrContextualCandidate => {
    const survivesBecause: string[] = []
    if (residualRanks[index] <= 3) survivesBecause.push(`Market residual ranks #${residualRanks[index]} despite visible-data rank #${visibleRanks[index]}.`)
    if (marketRanks[index] <= 3) survivesBecause.push(`Cross-book plus derivative market rank is #${marketRanks[index]}.`)
    if (temporalPct[index] >= 0.75) survivesBecause.push('Open-to-pregame movement is among the game’s most distinctive paths.')
    if (visibleRanks[index] <= 3) survivesBecause.push('Pitch-mix and recent contact windows independently confirm the market.')
    if (candidate.publicHrRank > 6 && residualRanks[index] <= 3) survivesBecause.push(`Only public-pick rank #${candidate.publicHrRank}; price support is not explained by public concentration.`)
    if (!survivesBecause.length) survivesBecause.push('Remains in the full 18-player audit, but does not own a separating signal.')
    const ratioPath = timeline.map(point => ({
      label: point.label, capturedAt: point.capturedAt, fhrHr: ratioAt(point, candidate.name),
      fhr: point.prices[normName(candidate.name)]?.fhr ?? null,
      hr: point.prices[normName(candidate.name)]?.hr ?? null,
    }))
    return {
      ...candidate,
      visibleRank: visibleRanks[index], marketRank: marketRanks[index], residualRank: residualRanks[index],
      fhrContextRank: fhrRanks[index], anytimeContextRank: anytimeRanks[index],
      visibleStrength: visible[index], marketStrength: marketStrengths[index], derivativeStrength: derivativePct[index],
      marketResidual: residuals[index], temporalDistinctiveness: temporalPct[index],
      fhrContextScore: fhrScores[index], anytimeContextScore: anytimeScores[index],
      role: 'unresolved', ratioPath, survivesBecause, losesBecause: [], beats: [],
    }
  })
  const fhr = laneRead(candidates, 'fhr', game.intelligence.audit.complete)
  const anytime = laneRead(candidates, 'anytime', game.intelligence.audit.complete)
  const fhrNames = new Set(fhr.names)
  const anytimeNames = new Set(anytime.names)
  const publicAnchor = [...candidates].sort((a, b) => a.publicHrRank - b.publicHrRank)[0] ?? null
  candidates = candidates.map(candidate => {
    let role: HrContextualCandidate['role'] = 'unresolved'
    if (fhrNames.has(candidate.name) && candidate.residualRank <= 4) role = 'hidden_fhr'
    else if (anytimeNames.has(candidate.name) && !fhrNames.has(candidate.name)) role = 'anytime_companion'
    else if (candidate.marketRank <= 3 && candidate.visibleRank <= 4) role = 'true_anchor'
    else if (candidate.residualRank <= 3) role = 'market_residual'
    else if (candidate.publicHrRank <= 3 && candidate.marketRank > 6) role = 'public_shell'
    else if (candidate.marketRank > 12 && candidate.visibleRank > 9) role = 'released_candidate'
    return { ...candidate, role }
  })
  const fhrLeader = fhr.names.length ? candidates.find(candidate => candidate.name === fhr.names[0]) ?? null : null
  const anytimeLeader = anytime.names.length ? candidates.find(candidate => candidate.name === anytime.names[0]) ?? null : null
  for (const candidate of candidates) {
    const leader = candidate.name === fhrLeader?.name ? anytimeLeader : fhrLeader ?? anytimeLeader
    if (leader && leader.name !== candidate.name) candidate.losesBecause.push(pairwiseWhy(leader, candidate, fhrLeader ? 'fhr' : 'anytime'))
  }
  const overallOrder = [...candidates].sort((a, b) => Math.max(b.fhrContextScore, b.anytimeContextScore) - Math.max(a.fhrContextScore, a.anytimeContextScore))
  candidates = candidates.map(candidate => {
    const lane: 'fhr' | 'anytime' = candidate.fhrContextScore >= candidate.anytimeContextScore ? 'fhr' : 'anytime'
    const alternatives = overallOrder
      .filter(alternative => alternative.name !== candidate.name)
      .slice(0, 5)
      .map(alternative => ({ name: alternative.name, role: alternative.role, reasons: pairwiseReasons(candidate, alternative, lane) }))
    return { ...candidate, beats: alternatives }
  })
  const openingFavorite = [...candidates].filter(candidate => candidate.fhrOpen != null).sort((a, b) => a.fhrOpen! - b.fhrOpen!)[0] ?? null
  const pregameFavorite = [...candidates].sort((a, b) => a.fhr - b.fhr)[0] ?? null
  const residualLeader = [...candidates].sort((a, b) => b.marketResidual - a.marketResidual)[0] ?? null
  const noise = candidates.filter(candidate => candidate.role === 'public_shell').slice(0, 4).map(candidate => candidate.name)
  const eventEnvironment: HrGameReport['story']['eventEnvironment'] = game.noHr.probabilityMove == null
    ? 'mixed' : game.noHr.probabilityMove > 0.75 ? 'quiet' : game.noHr.probabilityMove < -0.75 ? 'open' : 'mixed'
  const headline = fhr.status === 'isolated'
    ? `${fhr.names[0]} isolates in the FHR lane${anytime.status === 'isolated' && anytime.names[0] !== fhr.names[0] ? `; ${anytime.names[0]} is the distinct anytime lane` : ''}.`
    : fhr.status === 'clustered' ? `FHR remains clustered: ${fhr.names.join(', ')}.` : 'The complete board does not isolate an FHR name.'
  return {
    ...game,
    marketFavorite: pregameFavorite,
    candidates: [...candidates].sort((a, b) => b.anytimeContextScore - a.anytimeContextScore),
    timeline,
    story: {
      headline,
      publicStory: publicAnchor ? `${publicAnchor.name} holds public HR rank #1 with ${publicAnchor.picks} recorded picks.` : 'Public-pick telemetry is unavailable.',
      marketStory: openingFavorite && pregameFavorite
        ? `The FHR favorite moved from ${openingFavorite.name} (${american(openingFavorite.fhrOpen)}) at open to ${pregameFavorite.name} (${american(pregameFavorite.fhr)}) pregame.`
        : 'The opening-to-pregame favorite transition is incomplete.',
      eventEnvironment,
      openingFavorite: openingFavorite?.name ?? null,
      pregameFavorite: pregameFavorite?.name ?? null,
      publicAnchor: publicAnchor?.name ?? null,
      residualLeader: residualLeader?.name ?? null,
      fhr, anytime, noise,
      auditNote: game.intelligence.audit.complete
        ? `Pregame analysis passed the complete 18-player market audit. Outcomes are displayed only for postgame review and never enter the ranking.${game.intelligence.audit.warnings.length ? ` Coverage note: ${game.intelligence.audit.warnings.join(' ')}` : ''}`
        : game.intelligence.audit.issues.join(' '),
    },
  }
}

export async function buildHrGameIntelligenceReport(date: string): Promise<HrGameIntelligenceReport> {
  const base = await runFhrClusterDate(date)
  if (base.error) return { date, generatedAt: new Date().toISOString(), games: [], error: base.error }
  try {
    const timelines = await loadCaptureTimelines(date, base.games)
    return {
      date,
      generatedAt: new Date().toISOString(),
      games: base.games.map(game => buildContextualGame(game, timelines.get(canonGameKey(game.gameKey)) ?? [])),
    }
  } catch (error: unknown) {
    return {
      date,
      generatedAt: new Date().toISOString(),
      games: base.games.map(game => buildContextualGame(game, [])),
      error: `Capture timeline unavailable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
