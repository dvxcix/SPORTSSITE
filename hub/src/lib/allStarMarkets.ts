// ─── All-Star Game market board ────────────────────────────────────────────
// A novelty one-night event has no normal per-game import path (nothing in
// the admin FanDuel importer's SECTION_MAP matches ASG-specific market
// titles like "MVP" or team-total props). Real scraped FanDuel/BetMGM/
// Caesars odds live in the `allstar_event_markets` table (not committed
// source — this repo is public on GitHub, so vendor odds data is a DB row,
// not a checked-in file) and are fetched by /api/allstar/data. This module
// holds only the shared type + pure helper functions.

export type Sportsbook = 'fanduel' | 'betmgm' | 'caesars'

export type MarketOption = {
  label: string
  odds: number
  mlbId?: number
  playerName?: string
}

export type Market = {
  id: string
  book: Sportsbook
  section: string   // the book's own tab/category — e.g. "Batter Props", "Innings", "HR"
  title: string     // e.g. "To Record a Hit", "MVP", "First Team to Score"
  options: MarketOption[]
}

// Builds the per-book map the client renders (FD/MGM/Caesars each get their
// own panel) from the flat list /api/allstar/data returns.
export function groupByBook(markets: Market[]): Record<Sportsbook, Market[]> {
  return {
    fanduel: markets.filter(m => m.book === 'fanduel'),
    betmgm: markets.filter(m => m.book === 'betmgm'),
    caesars: markets.filter(m => m.book === 'caesars'),
  }
}

export function impliedProb(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
}

// Normalizes a market's implied probabilities to sum to 100%, stripping the
// book's vig so relative favorite/underdog read reflects FanDuel's real
// lean — same devig math the Derby board used.
export function devig(options: MarketOption[]): (MarketOption & { prob: number })[] {
  const raw = options.map(o => ({ ...o, prob: impliedProb(o.odds) }))
  const sum = raw.reduce((s, o) => s + o.prob, 0)
  if (sum <= 0) return raw.map(o => ({ ...o, prob: 0 }))
  return raw.map(o => ({ ...o, prob: o.prob / sum })).sort((a, b) => b.prob - a.prob)
}

export function marketsForPlayer(markets: Market[], mlbId: number): { market: Market; option: MarketOption }[] {
  const out: { market: Market; option: MarketOption }[] = []
  for (const m of markets) {
    for (const o of m.options) {
      if (o.mlbId === mlbId) out.push({ market: m, option: o })
    }
  }
  return out
}

export function groupBySection(markets: Market[]): Record<string, Market[]> {
  const out: Record<string, Market[]> = {}
  for (const m of markets) (out[m.section] ??= []).push(m)
  return out
}

export function searchMarkets(markets: Market[], query: string): Market[] {
  const q = query.trim().toLowerCase()
  if (!q) return markets
  return markets.filter(m =>
    m.title.toLowerCase().includes(q) ||
    m.section.toLowerCase().includes(q) ||
    m.options.some(o => o.label.toLowerCase().includes(q) || o.playerName?.toLowerCase().includes(q))
  )
}

// ─── Cross-book market bucketing ───────────────────────────────────────────
// FD/MGM/Caesars each phrase the same real prop differently ("Player to hit
// a Home Run" vs "To Hit a Home Run") — this maps a market's title to a
// canonical family + threshold so the same player's price can be compared
// across all three books. Returns null for markets that don't cleanly bucket
// (team spreads/totals, exact-result grids, futures) — those still display,
// they're just outside the cross-book comparison.
export function canonicalizeTitle(title: string): string | null {
  const t = title.toLowerCase().trim()
  // Structurally different shapes that would otherwise false-match a family
  // below (a head-to-head compare, a distance threshold, a combo parlay) —
  // excluded up front rather than silently mis-bucketed.
  if (/^h2h\b/.test(t)) return null
  if (/\bfeet\b/.test(t)) return null
  if (/parlay/.test(t)) return null
  const n = t.match(/(\d+)\+/)?.[1] ?? '1'
  // "First HR"/"First HR of the Game" (the whole-game outright — one real
  // winner among every player, distinct from each player's own independent
  // anytime-HR prop) must be checked before the generic home-run match below.
  if (/first\s+(hr|home run)\b/.test(t) && !/plate appearance/.test(t)) return 'first_hr_of_game'
  if (/first plate appearance/.test(t)) return 'first_pa_hr'
  if (/2\+\s*home runs?/.test(t)) return 'hr_2plus'
  if (/home run/.test(t) || /\bhr\b/.test(t)) return 'anytime_hr'
  if (/hits\s*\+\s*runs\s*\+\s*rbis/.test(t)) return `hrr_${n}plus`
  if (/extra base hit/.test(t)) return 'xbh_1plus'
  if (/total bases/.test(t)) return `tb_${n}plus`
  if (/rbis?/.test(t)) return `rbi_${n}plus`
  if (/\bdouble\b/.test(t)) return 'double'
  if (/\bsingle\b/.test(t)) return 'single'
  if (/\btriple\b/.test(t)) return 'triple'
  if (/record\s+(a\s+|an\s+)?run\b|score\s+a\s+run|run scored/.test(t)) return `run_${n}plus`
  if (/strikeouts?/.test(t)) return `k_${n}plus`
  if (/\bhits?\b/.test(t)) return `hits_${n}plus`
  if (/\bmvp\b/.test(t)) return 'mvp'
  return null
}

// Plain-English name for a canonical family — used only to say WHICH two
// real, publicly-listed markets a flag is comparing (e.g. "First HR of the
// Game" vs "First PA HR"), never the underlying threshold math itself.
const FAMILY_LABELS: Record<string, string> = {
  anytime_hr: 'Anytime HR', first_pa_hr: 'First PA HR', hr_2plus: '2+ HR',
  first_hr_of_game: 'First HR of the Game', xbh_1plus: 'Extra-Base Hit',
  double: 'Double', single: 'Single', triple: 'Triple', mvp: 'MVP',
}
export function labelKey(key: string): string {
  if (FAMILY_LABELS[key]) return FAMILY_LABELS[key]
  const tb = key.match(/^tb_(\d+)plus$/); if (tb) return `${tb[1]}+ Total Bases`
  const hrr = key.match(/^hrr_(\d+)plus$/); if (hrr) return `${hrr[1]}+ Hits+Runs+RBIs`
  const rbi = key.match(/^rbi_(\d+)plus$/); if (rbi) return `${rbi[1]}+ RBI`
  const run = key.match(/^run_(\d+)plus$/); if (run) return `${run[1]}+ Run${run[1] === '1' ? '' : 's'} Scored`
  const hits = key.match(/^hits_(\d+)plus$/); if (hits) return `${hits[1]}+ Hits`
  const k = key.match(/^k_(\d+)plus$/); if (k) return `${k[1]}+ Strikeouts`
  return key
}

export function oddsStr(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`
}

// The single real, concrete number a bettor would actually see for a given
// canonical family + player — the shortest (most favorite) odds across
// whichever books list it — used so a flag can point at an exact bet
// instead of an abstract percentage.
export function bestOption(allMarkets: Market[], key: string, mlbId: number): { book: Sportsbook; odds: number; prob: number } | null {
  let best: { book: Sportsbook; odds: number; prob: number } | null = null
  for (const m of allMarkets) {
    if (canonicalizeTitle(m.title) !== key) continue
    for (const o of m.options) {
      if (o.mlbId !== mlbId) continue
      const prob = impliedProb(o.odds)
      if (!best || prob > best.prob) best = { book: m.book, odds: o.odds, prob }
    }
  }
  return best
}

// Same lookup, scoped to one specific book — used to build a real per-book
// column instead of an abstracted single "best" number.
export function bestOptionForBook(allMarkets: Market[], book: Sportsbook, key: string, mlbId: number): { odds: number; prob: number } | null {
  let best: { odds: number; prob: number } | null = null
  for (const m of allMarkets) {
    if (m.book !== book) continue
    if (canonicalizeTitle(m.title) !== key) continue
    for (const o of m.options) {
      if (o.mlbId !== mlbId) continue
      const prob = impliedProb(o.odds)
      if (!best || prob > best.prob) best = { odds: o.odds, prob }
    }
  }
  return best
}

export type CrossBookEntry = { book: Sportsbook; odds: number; prob: number; option: MarketOption }
export type CrossBookFlag = {
  key: string
  mlbId: number
  spread: number
  entries: CrossBookEntry[]
}

// Groups every book's pricing of the "same" real prop by player, then flags
// groups where the books meaningfully disagree on implied probability (one
// book pricing a player as a live threat, another treating him as an
// afterthought) — a real, mechanical signal computed straight off the three
// scraped boards, not a fabricated one.
export function computeCrossBookFlags(allMarkets: Market[], minSpread = 0.08): CrossBookFlag[] {
  const groups = new Map<string, CrossBookEntry[]>()
  for (const m of allMarkets) {
    const key = canonicalizeTitle(m.title)
    if (!key) continue
    for (const o of m.options) {
      if (o.mlbId == null) continue
      const gk = `${key}::${o.mlbId}`
      const arr = groups.get(gk) ?? []
      // One book per market family per player — a duplicate (e.g. a book's
      // starters + reserves split both firing for the same guy) just keeps
      // the shorter-odds (more confident) entry rather than double-counting.
      const existingIdx = arr.findIndex(e => e.book === m.book)
      const entry: CrossBookEntry = { book: m.book, odds: o.odds, prob: impliedProb(o.odds), option: o }
      if (existingIdx >= 0) { if (entry.prob > arr[existingIdx].prob) arr[existingIdx] = entry }
      else arr.push(entry)
      groups.set(gk, arr)
    }
  }
  const flags: CrossBookFlag[] = []
  for (const [gk, entries] of groups) {
    if (entries.length < 2) continue
    const best = entries.reduce((a, b) => (a.prob > b.prob ? a : b))
    const worst = entries.reduce((a, b) => (a.prob < b.prob ? a : b))
    const spread = best.prob - worst.prob
    if (spread >= minSpread) {
      const mlbId = Number(gk.split('::')[1])
      flags.push({ key: gk.split('::')[0], mlbId, spread, entries: entries.sort((a, b) => b.prob - a.prob) })
    }
  }
  return flags.sort((a, b) => b.spread - a.spread)
}

export function crossBookFlagsForPlayer(flags: CrossBookFlag[], mlbId: number): CrossBookFlag[] {
  return flags.filter(f => f.mlbId === mlbId)
}

export function describeCrossBookFlag(f: CrossBookFlag): string {
  const fav = f.entries[0], dog = f.entries[f.entries.length - 1]
  return `${labelKey(f.key)}: ${fav.book} ${oddsStr(fav.odds)} vs ${dog.book} ${oddsStr(dog.odds)}`
}

export function crossBookSeverity(f: CrossBookFlag): number {
  return f.spread
}

// ─── Market price vs our own real data ─────────────────────────────────────
// The actual ask: not just "do the books agree with each other" but "does
// the consensus market price agree with what our own tracked bat-tracking
// data says." Scoped to the HR-family markets specifically — those are the
// only props with a real underlying tracked number (season xHR/HR total)
// on this page; RBI/hits/runs props don't have a real season counting stat
// in the Statcast tables this page reads, so they're deliberately left out
// rather than faking a comparison.
const HR_FAMILY_KEYS = ['anytime_hr', 'hr_2plus', 'first_pa_hr']

export type DataMismatchFlag = {
  key: string
  mlbId: number
  bookRank: number   // 1 = the market's biggest consensus favorite for this prop
  realRank: number    // 1 = our own data's biggest real HR threat
  consensusProb: number
  book: Sportsbook
  odds: number
}

export function computeMarketVsDataFlags(
  allMarkets: Market[],
  realRankByMlbId: Map<number, number>,
  gapThreshold = 6,
): DataMismatchFlag[] {
  const sums = new Map<string, { total: number; count: number; mlbId: number }>()
  for (const m of allMarkets) {
    const key = canonicalizeTitle(m.title)
    if (!key || !HR_FAMILY_KEYS.includes(key)) continue
    for (const o of devig(m.options)) {
      if (o.mlbId == null) continue
      const gk = `${key}::${o.mlbId}`
      const cur = sums.get(gk) ?? { total: 0, count: 0, mlbId: o.mlbId }
      cur.total += o.prob
      cur.count += 1
      sums.set(gk, cur)
    }
  }
  const byKey = new Map<string, { mlbId: number; prob: number }[]>()
  for (const [gk, v] of sums) {
    const key = gk.split('::')[0]
    const arr = byKey.get(key) ?? []
    arr.push({ mlbId: v.mlbId, prob: v.total / v.count })
    byKey.set(key, arr)
  }
  const flags: DataMismatchFlag[] = []
  for (const [key, arr] of byKey) {
    const sorted = [...arr].sort((a, b) => b.prob - a.prob)
    sorted.forEach((entry, idx) => {
      const bookRank = idx + 1
      const realRank = realRankByMlbId.get(entry.mlbId)
      if (realRank == null) return
      if (Math.abs(bookRank - realRank) >= gapThreshold) {
        const opt = bestOption(allMarkets, key, entry.mlbId)
        if (!opt) return
        flags.push({ key, mlbId: entry.mlbId, bookRank, realRank, consensusProb: entry.prob, book: opt.book, odds: opt.odds })
      }
    })
  }
  return flags
}

export function dataMismatchFlagsForPlayer(flags: DataMismatchFlag[], mlbId: number): DataMismatchFlag[] {
  return flags.filter(f => f.mlbId === mlbId)
}

export function describeDataMismatchFlag(f: DataMismatchFlag): string {
  return `${labelKey(f.key)} ${f.book} ${oddsStr(f.odds)}: market has him #${f.bookRank}, our data says #${f.realRank}`
}

export function dataMismatchSeverity(f: DataMismatchFlag): number {
  return Math.abs(f.bookRank - f.realRank)
}

// ─── Cross-market logical containment ──────────────────────────────────────
// Real MLB scoring rules create hard subset relationships between markets
// for the same player: hitting a HR necessarily means he recorded a hit,
// scored a run, drove himself in, and picked up 4 total bases from that
// at-bat alone — so P(narrower event) can never be mispriced ABOVE
// P(broader event it's contained in). Any book (or the cross-book
// consensus) pricing the narrow side higher is a provable contradiction —
// this is arithmetic on the real scraped prices, not a fabricated signal.
function consensusProbByKey(allMarkets: Market[]): Map<string, Map<number, number>> {
  const sums = new Map<string, Map<number, { total: number; count: number }>>()
  for (const m of allMarkets) {
    const key = canonicalizeTitle(m.title)
    if (!key) continue
    let byId = sums.get(key)
    if (!byId) { byId = new Map(); sums.set(key, byId) }
    for (const o of devig(m.options)) {
      if (o.mlbId == null) continue
      const cur = byId.get(o.mlbId) ?? { total: 0, count: 0 }
      cur.total += o.prob
      cur.count += 1
      byId.set(o.mlbId, cur)
    }
  }
  const out = new Map<string, Map<number, number>>()
  for (const [key, byId] of sums) {
    const avg = new Map<number, number>()
    for (const [id, v] of byId) avg.set(id, v.total / v.count)
    out.set(key, avg)
  }
  return out
}

// BetMGM's own "(Reserves)" split (a separate market for bench bats) is a
// real, book-provided signal of who's not a starter tonight — used to scope
// the First-HR-of-Game vs First-PA-HR check the way it was actually asked:
// a reserve's realistic path to "first HR of the game" IS his first PA
// (that's the only at-bat he gets before it's already been claimed by
// someone earlier in the lineup), so pricing him shorter to get the whole
// game's first HR than to simply homer in his own first trip is backwards.
export function computeReserveMlbIds(allMarkets: Market[]): Set<number> {
  const ids = new Set<number>()
  for (const m of allMarkets) {
    if (!/\(reserves?\)/i.test(m.title)) continue
    if (!/\b(hit|home run|hr)\b/i.test(m.title)) continue
    for (const o of m.options) if (o.mlbId != null) ids.add(o.mlbId)
  }
  return ids
}

// ─── HR race odds, one column per book ─────────────────────────────────────
// Every player who's raced by at least 2 of the 3 books on "how early does
// he homer" — Caesars/FanDuel/BetMGM each get their own column, showing
// whichever real market that specific book quotes for it (First HR of the
// Game > First PA HR > Anytime HR, most specific/relevant first), ranked by
// the biggest spread between whatever real prices exist for that player —
// not filtered down to only players who happen to have one specific pair of
// markets. A player with only 1 book's price is left out (nothing to
// compare); everyone else shows up, missing cells included.
const RACE_KEYS = ['first_hr_of_game', 'first_pa_hr', 'anytime_hr']
const RACE_BOOKS: Sportsbook[] = ['caesars', 'fanduel', 'betmgm']

export type HrRaceCell = { key: string; odds: number; prob: number } | null
export type HrRaceRow = {
  mlbId: number
  cells: Record<Sportsbook, HrRaceCell>
  spread: number
  isReserve: boolean
}

function bestRaceCellForBook(allMarkets: Market[], book: Sportsbook, mlbId: number): HrRaceCell {
  for (const key of RACE_KEYS) {
    const opt = bestOptionForBook(allMarkets, book, key, mlbId)
    if (opt) return { key, odds: opt.odds, prob: opt.prob }
  }
  return null
}

export function computeHrRaceBoard(allMarkets: Market[], reserveMlbIds: Set<number>): HrRaceRow[] {
  const ids = new Set<number>()
  for (const m of allMarkets) {
    const key = canonicalizeTitle(m.title)
    if (!key || !RACE_KEYS.includes(key)) continue
    for (const o of m.options) if (o.mlbId != null) ids.add(o.mlbId)
  }
  const rows: HrRaceRow[] = []
  for (const mlbId of ids) {
    const cells = {} as Record<Sportsbook, HrRaceCell>
    for (const book of RACE_BOOKS) cells[book] = bestRaceCellForBook(allMarkets, book, mlbId)
    const probs = RACE_BOOKS.map(b => cells[b]?.prob).filter((p): p is number => p != null)
    if (probs.length < 2) continue
    const spread = Math.max(...probs) - Math.min(...probs)
    rows.push({ mlbId, cells, spread, isReserve: reserveMlbIds.has(mlbId) })
  }
  return rows.sort((a, b) => b.spread - a.spread)
}

export type ContainmentFlag = {
  narrowKey: string
  broadKey: string
  mlbId: number
  narrowProb: number
  broadProb: number
  narrowBook: Sportsbook
  narrowOdds: number
  broadBook: Sportsbook
  broadOdds: number
}

export function computeContainmentFlags(
  allMarkets: Market[],
  reserveMlbIds: Set<number>,
  minGap = 0.01,
): ContainmentFlag[] {
  const probs = consensusProbByKey(allMarkets)

  const rules: { narrow: string; broad: string; scope?: 'reserves' }[] = [
    { narrow: 'first_pa_hr', broad: 'anytime_hr' },
    { narrow: 'hr_2plus', broad: 'anytime_hr' },
    { narrow: 'anytime_hr', broad: 'xbh_1plus' },
    { narrow: 'anytime_hr', broad: 'rbi_1plus' },
    { narrow: 'anytime_hr', broad: 'run_1plus' },
    { narrow: 'anytime_hr', broad: 'hits_1plus' },
    { narrow: 'first_hr_of_game', broad: 'anytime_hr' },
    { narrow: 'first_hr_of_game', broad: 'first_pa_hr', scope: 'reserves' },
  ]
  // A bare solo HR guarantees exactly 4 total bases and at least 3 combined
  // Hits+Runs+RBIs (1 hit + 1 run + minimum 1 RBI, himself) from that at-bat
  // — only wire in the thresholds a HR alone actually clears.
  for (const key of probs.keys()) {
    const tb = key.match(/^tb_(\d+)plus$/)
    if (tb && Number(tb[1]) <= 4) rules.push({ narrow: 'anytime_hr', broad: key })
    const hrr = key.match(/^hrr_(\d+)plus$/)
    if (hrr && Number(hrr[1]) <= 3) rules.push({ narrow: 'anytime_hr', broad: key })
  }

  const flags: ContainmentFlag[] = []
  for (const rule of rules) {
    const narrowMap = probs.get(rule.narrow)
    const broadMap = probs.get(rule.broad)
    if (!narrowMap || !broadMap) continue
    for (const [mlbId, narrowProb] of narrowMap) {
      if (rule.scope === 'reserves' && !reserveMlbIds.has(mlbId)) continue
      const broadProb = broadMap.get(mlbId)
      if (broadProb == null) continue
      if (narrowProb > broadProb + minGap) {
        const narrowOpt = bestOption(allMarkets, rule.narrow, mlbId)
        const broadOpt = bestOption(allMarkets, rule.broad, mlbId)
        if (!narrowOpt || !broadOpt) continue
        flags.push({
          narrowKey: rule.narrow, broadKey: rule.broad, mlbId, narrowProb, broadProb,
          narrowBook: narrowOpt.book, narrowOdds: narrowOpt.odds, broadBook: broadOpt.book, broadOdds: broadOpt.odds,
        })
      }
    }
  }
  return flags
}

export function containmentFlagsForPlayer(flags: ContainmentFlag[], mlbId: number): ContainmentFlag[] {
  return flags.filter(f => f.mlbId === mlbId)
}

export function describeContainmentFlag(f: ContainmentFlag): string {
  return `${labelKey(f.narrowKey)} ${f.narrowBook} ${oddsStr(f.narrowOdds)} vs ${labelKey(f.broadKey)} ${f.broadBook} ${oddsStr(f.broadOdds)}`
}

export function containmentSeverity(f: ContainmentFlag): number {
  return f.narrowProb - f.broadProb
}

// ─── Single worst flag per player, across all three flag types ────────────
// The actual ask: not a wall of every derived consequence, just the one
// bet that looks most wrong, ranked so the biggest edges surface first.
// Cross-book spread and containment gap are both real probability-point
// deltas (directly comparable); data-mismatch is a rank gap, normalized by
// roster size so it lands on roughly the same 0-1 scale for sorting only.
export type TopFlag =
  | { kind: 'cross-book'; flag: CrossBookFlag; severity: number }
  | { kind: 'data-mismatch'; flag: DataMismatchFlag; severity: number }
  | { kind: 'containment'; flag: ContainmentFlag; severity: number }

export function describeTopFlag(t: TopFlag): string {
  if (t.kind === 'cross-book') return describeCrossBookFlag(t.flag)
  if (t.kind === 'data-mismatch') return describeDataMismatchFlag(t.flag)
  return describeContainmentFlag(t.flag)
}

export function topFlagForPlayer(
  mlbId: number,
  crossBook: CrossBookFlag[],
  dataMismatch: DataMismatchFlag[],
  containment: ContainmentFlag[],
  rosterSize: number,
): { top: TopFlag; extraCount: number } | null {
  const candidates: TopFlag[] = [
    ...crossBookFlagsForPlayer(crossBook, mlbId).map(f => ({ kind: 'cross-book' as const, flag: f, severity: crossBookSeverity(f) })),
    ...dataMismatchFlagsForPlayer(dataMismatch, mlbId).map(f => ({ kind: 'data-mismatch' as const, flag: f, severity: dataMismatchSeverity(f) / Math.max(1, rosterSize) })),
    ...containmentFlagsForPlayer(containment, mlbId).map(f => ({ kind: 'containment' as const, flag: f, severity: containmentSeverity(f) })),
  ]
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.severity - a.severity)
  return { top: candidates[0], extraCount: candidates.length - 1 }
}

// ─── Live in-game settlement ────────────────────────────────────────────────
// Real counting stats straight from MLB's own live boxscore + linescore (see
// /api/allstar/live) compared against the real scraped odds — the same
// "grade it as the real game happens" pattern the HR Derby page used. Player
// props, innings props, and team-total props all settle here; H2H
// comparisons, MVP, whole-game Exact Result grids, Caesars' ambiguous
// "1st 3/5 Innings" and "Inning Money Line" formats, and pitch-level markets
// (First Pitch Result) have no clean, verifiable real data source on this
// page and stay unhighlighted rather than being guessed.
export type LivePlayerStats = {
  hits: number; hr: number; doubles: number; triples: number
  rbi: number; runs: number; totalBases: number; pa: number
}
export type LiveInning = { num: number; awayRuns: number | null; homeRuns: number | null; awayHits: number | null; homeHits: number | null }
export type LiveTeamTotals = { awayRuns: number; homeRuns: number; awayHits: number; homeHits: number }
export type LiveScorePoint = { away: number; home: number }
export type LiveFirstPitch = {
  isBall: boolean; isStrike: boolean; isInPlay: boolean; isHbp: boolean
  startSpeed: number | null; resultEvent: string | null; pitcherName: string | null
} | null
export type LivePitcherStats = { name: string; strikeOuts: number; battersFaced: number; hits: number; runs: number; earnedRuns: number }
export type FirstInningPitcherStats = { mlbId: number; strikeouts: number; battersFaced: number; threeUpThreeDown: boolean; struckOutTheSide: boolean }
export type LiveGameState = {
  gameState: string | null
  players: Record<number, LivePlayerStats>
  firstPaResult: Record<number, 'hr' | 'other'>
  firstPaOutcome: Record<number, 'single' | 'xbh' | 'walk_hbp' | 'strikeout' | 'other'>
  firstHrMlbId: number | null
  innings: LiveInning[]
  teamTotals: LiveTeamTotals
  scoreProgression: LiveScorePoint[]
  firstPitch: { top: LiveFirstPitch; bottom: LiveFirstPitch }
  playerStatus: Record<number, 'in' | 'not_played' | 'done'>
  currentBatterId: number | null
  onDeckBatterId: number | null
  currentPitcherId: number | null
  pitchers: Record<number, LivePitcherStats>
  firstInningPitcher: { top: FirstInningPitcherStats | null; bottom: FirstInningPitcherStats | null }
  teamTotalStrikeouts: { away: number; home: number }
  bothTeamsDouble: boolean
  bothTeamsTriple: boolean
  hrDistances: { mlbId: number; distance: number }[]
  doublePlayRecorded: boolean
}
export type MarketOutcome = 'won' | 'lost' | 'void'

export function computeLiveSettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out
  const isFinal = live.gameState === 'Final'

  for (const m of allMarkets) {
    const key = canonicalizeTitle(m.title)
    if (!key) continue

    for (const o of m.options) {
      const rowKey = `${m.id}::${o.label}`

      if (key === 'first_hr_of_game') {
        if (o.mlbId == null) {
          // The "No HR Hit" field option — only real once the whole game is over.
          if (isFinal) out.set(rowKey, live.firstHrMlbId == null ? 'won' : 'lost')
          continue
        }
        if (live.firstHrMlbId != null) out.set(rowKey, live.firstHrMlbId === o.mlbId ? 'won' : 'lost')
        else if (isFinal) out.set(rowKey, 'lost')
        continue
      }

      if (o.mlbId == null) continue
      const p = live.players[o.mlbId]

      if (key === 'first_pa_hr') {
        const r = live.firstPaResult[o.mlbId]
        if (r === 'hr') out.set(rowKey, 'won')
        else if (r === 'other') out.set(rowKey, 'lost')
        else if (isFinal) out.set(rowKey, 'void') // never got a plate appearance tonight
        continue
      }

      if (!p) { if (isFinal) out.set(rowKey, 'lost'); continue }

      let value: number | null = null
      let threshold = Number(key.match(/_(\d+)plus$/)?.[1] ?? '1')
      if (key === 'anytime_hr') { value = p.hr; threshold = 1 }
      else if (key === 'hr_2plus') { value = p.hr; threshold = 2 }
      else if (key.startsWith('hits_')) value = p.hits
      else if (key.startsWith('rbi_')) value = p.rbi
      else if (key.startsWith('run_')) value = p.runs
      else if (key.startsWith('tb_')) value = p.totalBases
      else if (key === 'xbh_1plus') { value = p.doubles + p.triples + p.hr; threshold = 1 }
      else if (key === 'double') { value = p.doubles; threshold = 1 }
      else if (key === 'single') { value = p.hits - p.doubles - p.triples - p.hr; threshold = 1 }
      else if (key === 'triple') { value = p.triples; threshold = 1 }
      else if (key.startsWith('hrr_')) value = p.hits + p.runs + p.rbi
      if (value == null) continue

      if (value >= threshold) out.set(rowKey, 'won')
      else if (isFinal) out.set(rowKey, 'lost')
    }
  }
  return out
}

// This game is AL (away) vs NL (home) — real, confirmed team assignment
// (see /api/allstar/data's own comment). Hardcoded since this is a one-off
// event page, not a general team-agnostic import path.
const AWAY_LABEL = 'American League'
const HOME_LABEL = 'National League'

function sumInningsWindow(innings: LiveInning[], n: number): { awayRuns: number; homeRuns: number; complete: boolean } {
  let awayRuns = 0, homeRuns = 0, complete = true
  for (let i = 0; i < n; i++) {
    const inn = innings[i]
    if (!inn || inn.awayRuns == null || inn.homeRuns == null) complete = false
    awayRuns += inn?.awayRuns ?? 0
    homeRuns += inn?.homeRuns ?? 0
  }
  return { awayRuns, homeRuns, complete }
}

// Team+signed-number run-line label, e.g. "American League -1.5" or (First-N
// -Innings format) "National League | -0.5" — sign is sometimes omitted for
// the positive side in the real scraped data, so it defaults to +.
function parseRunLine(label: string): { team: string; line: number } | null {
  const m = label.match(/^(American League|National League)\s*\|?\s*([+-]?[\d.]+)$/)
  if (!m) return null
  return { team: m[1], line: Number(m[2]) }
}

// Real per-inning, first-N-innings, and whole-game team-total markets —
// covers every "Nth Inning ___" / "First N Innings ___" / team season-total
// title this page's real scraped odds actually use. Grades live as soon as
// a window (a single inning, an innings range, or the whole game) is
// mathematically decided — a completed inning's totals can never change, so
// its markets settle immediately rather than waiting for the whole game.
export function computeTeamAndInningsSettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out
  const isFinal = live.gameState === 'Final'
  const { innings, teamTotals } = live

  // THE bug this replaced: a single `grade(won, decidable)` helper treated
  // any "currently true" condition as safe to commit as 'won' immediately,
  // which only holds for a monotonically-increasing "at least N" check
  // (Over/N+ — once crossed, permanent). For everything else — Under
  // thresholds, Result, Run Line, Correct Score, Odd/Even, Bands, Margin,
  // Money Line — "currently true" can still flip before the window (that
  // inning / that innings range / the whole game) actually closes, so it
  // must NOT be marked 'won' early. Three explicit helpers instead of one
  // ambiguous one:
  //   gradeOver  — "at least N" checks: safe to grade 'won' the instant
  //                it's true (can never un-happen); 'lost' only once decided.
  //   gradeUnder — "fewer than N" checks: safe to grade 'lost' the instant
  //                the threshold is breached (Under can never recover);
  //                'won' only once the window is actually closed.
  //   gradeAtClose — anything else (exact match / parity / margin / who's
  //                  currently ahead): not safe to call either way until
  //                  the window is fully decided.
  const gradeOver = (rowKey: string, metNow: boolean, decidable: boolean) => {
    if (metNow) out.set(rowKey, 'won')
    else if (decidable) out.set(rowKey, 'lost')
  }
  const gradeUnder = (rowKey: string, stillUnderNow: boolean, decidable: boolean) => {
    if (!stillUnderNow) out.set(rowKey, 'lost')
    else if (decidable) out.set(rowKey, 'won')
  }
  const gradeAtClose = (rowKey: string, won: boolean, decidable: boolean) => {
    if (decidable) out.set(rowKey, won ? 'won' : 'lost')
  }

  for (const m of allMarkets) {
    const title = m.title.trim()
    if (/parlay/i.test(title)) continue
    // "Inning Money Line" bundles 3 identical AL/NL pairs with no inning
    // number attached to tell them apart — genuinely ambiguous, stays
    // ungraded rather than guessing which pair is which inning. Caesars'
    // "Winning Margin" has the same problem (two identically-labeled "By
    // Exactly N Runs" options per margin, no team name on either) — its
    // team-name regex below already naturally excludes it; no special case
    // needed.
    if (title === 'Inning Money Line') continue

    // ── Caesars "1st 3/5 Innings" combo card ─────────────────────────────
    // Bundles a real run line (signed, e.g. "(+0.5)") and a real moneyline
    // (bare team name) with a third, genuinely ambiguous bare-number option
    // ("American League (2.5)") that could be a mislabeled combined total —
    // grade the two unambiguous parts, leave the bare-number one alone.
    const combo3Or5 = title === '1st 3 Innings' ? 3 : title === '1st 5 Innings' ? 5 : null
    if (combo3Or5 != null) {
      const { awayRuns, homeRuns, complete } = sumInningsWindow(innings, combo3Or5)
      for (const o of m.options) {
        const rowKey = `${m.id}::${o.label}`
        const rl = o.label.match(/^(American League|National League)\s*\(([+-][\d.]+)\)$/)
        const ml = o.label.match(/^(American League|National League)$/)
        if (rl) {
          const diff = rl[1] === AWAY_LABEL ? awayRuns - homeRuns : homeRuns - awayRuns
          gradeAtClose(rowKey, diff + Number(rl[2]) > 0, complete)
        } else if (ml) {
          gradeAtClose(rowKey, awayRuns === homeRuns ? false : (ml[1] === AWAY_LABEL ? awayRuns > homeRuns : homeRuns > awayRuns), complete)
        }
      }
      continue
    }

    // ── Whole-game core markets (Caesars) ────────────────────────────────
    if (title === 'To Lift The Trophy') {
      for (const o of m.options) {
        const isAway = o.label === AWAY_LABEL, isHome = o.label === HOME_LABEL
        if (!isAway && !isHome) continue
        gradeAtClose(`${m.id}::${o.label}`, teamTotals.awayRuns === teamTotals.homeRuns ? false : (isAway ? teamTotals.awayRuns > teamTotals.homeRuns : teamTotals.homeRuns > teamTotals.awayRuns), isFinal)
      }
      continue
    }
    if (title === 'Spread') {
      for (const o of m.options) {
        const m2 = o.label.match(/^(American League|National League)\s*\(([+-][\d.]+)\)$/)
        if (!m2) continue
        const diff = m2[1] === AWAY_LABEL ? teamTotals.awayRuns - teamTotals.homeRuns : teamTotals.homeRuns - teamTotals.awayRuns
        gradeAtClose(`${m.id}::${o.label}`, diff + Number(m2[2]) > 0, isFinal)
      }
      continue
    }
    if (title === 'Total') {
      const total = teamTotals.awayRuns + teamTotals.homeRuns
      for (const o of m.options) {
        const m2 = o.label.match(/^(Over|Under)\s*\(([\d.]+)\)$/)
        if (!m2) continue
        if (m2[1] === 'Over') gradeOver(`${m.id}::${o.label}`, total > Number(m2[2]), isFinal)
        else gradeUnder(`${m.id}::${o.label}`, total < Number(m2[2]), isFinal)
      }
      continue
    }
    if (title === '1st Team To Score') {
      const first = live.scoreProgression.find(p => p.away > 0 || p.home > 0)
      for (const o of m.options) {
        const isAway = o.label === AWAY_LABEL, isHome = o.label === HOME_LABEL
        if (!isAway && !isHome) continue
        if (first) gradeAtClose(`${m.id}::${o.label}`, isAway ? first.away > 0 : first.home > 0, true)
        else gradeAtClose(`${m.id}::${o.label}`, false, isFinal) // nobody ever scored
      }
      continue
    }
    if (title === 'Run In 1st Inning') {
      const inn1 = innings[0]
      const complete = inn1?.awayRuns != null && inn1?.homeRuns != null
      const ranIn1st = (inn1?.awayRuns ?? 0) + (inn1?.homeRuns ?? 0) > 0
      for (const o of m.options) {
        if (o.label === 'Yes') gradeOver(`${m.id}::${o.label}`, ranIn1st, complete)
        else if (o.label === 'No') gradeUnder(`${m.id}::${o.label}`, !ranIn1st, complete)
      }
      continue
    }
    if (title === 'Quality Pitching?') {
      const { awayRuns, homeRuns, complete } = sumInningsWindow(innings, 6)
      for (const o of m.options) {
        const m2 = o.label.match(/^(American League|National League) - (\d+) or (less|more) runs conceded after \d+ Innings$/i)
        if (!m2) continue
        // "Team X runs conceded" = the OPPONENT's runs (X's pitching allowed them).
        const conceded = m2[1] === AWAY_LABEL ? homeRuns : awayRuns
        const threshold = Number(m2[2])
        const won = m2[3].toLowerCase() === 'less' ? conceded <= threshold : conceded >= threshold
        gradeAtClose(`${m.id}::${o.label}`, won, complete)
      }
      continue
    }
    if (title === 'Shutout Pitching?') {
      for (const o of m.options) {
        const m2 = o.label.match(/^(American League|National League) - 0 runs conceded after \d+ Innings$/i)
        if (!m2) continue
        const conceded = m2[1] === AWAY_LABEL ? teamTotals.homeRuns : teamTotals.awayRuns
        gradeAtClose(`${m.id}::${o.label}`, conceded === 0, isFinal)
      }
      continue
    }

    // ── Single inning N ──────────────────────────────────────────────────
    const inningMatch = title.match(/^(\d+)(?:st|nd|rd|th) Inning\s+(.+)$/)
    if (inningMatch) {
      const n = Number(inningMatch[1])
      const rest = inningMatch[2].trim()
      const inn = innings[n - 1]
      if (!inn) continue
      const complete = inn.awayRuns != null && inn.homeRuns != null
      const awayR = inn.awayRuns ?? 0, homeR = inn.homeRuns ?? 0
      const totalR = awayR + homeR
      const totalH = (inn.awayHits ?? 0) + (inn.homeHits ?? 0)
      const runsMatch = rest.match(/^(?:Over\/Under\s*)?([\d.]+)\s*Runs$/)

      for (const o of m.options) {
        const rowKey = `${m.id}::${o.label}`
        const label = o.label
        if (rest === 'Result') {
          gradeAtClose(rowKey, label === 'Tie' ? awayR === homeR : label === AWAY_LABEL ? awayR > homeR : label === HOME_LABEL ? homeR > awayR : false, complete)
        } else if (rest === 'Run Line') {
          const rl = parseRunLine(label)
          if (rl) { const diff = rl.team === AWAY_LABEL ? awayR - homeR : homeR - awayR; gradeAtClose(rowKey, diff + rl.line > 0, complete) }
        } else if (rest === 'Total Runs') {
          const orMore = label.match(/^(\d+)\s*Runs?\s*Or More$/i)
          const exact = label.match(/^(\d+)\s*Runs?$/i)
          if (orMore) gradeOver(rowKey, totalR >= Number(orMore[1]), complete)
          else if (exact) gradeAtClose(rowKey, totalR === Number(exact[1]), complete)
        } else if (runsMatch && (label === 'Over' || label === 'Under')) {
          const threshold = Number(runsMatch[1])
          if (label === 'Over') gradeOver(rowKey, totalR > threshold, complete)
          else gradeUnder(rowKey, totalR < threshold, complete)
        } else if (rest === 'Hits') {
          const plus = label.match(/^(\d+)\+\s*Hits Recorded$/)
          if (label === '0-1 Hits Recorded') gradeUnder(rowKey, totalH <= 1, complete)
          else if (plus) gradeOver(rowKey, totalH >= Number(plus[1]), complete)
        } else if (rest === 'Runs Odd/Even') {
          gradeAtClose(rowKey, label === 'Odd' ? totalR % 2 === 1 : label === 'Even' ? totalR % 2 === 0 : false, complete)
        } else if (rest === 'Correct Score') {
          const tie = label.match(/^Tie (\d+)-(\d+)$/)
          const side = label.match(/^(American League|National League) (\d+)-(\d+)$/)
          if (tie) gradeAtClose(rowKey, awayR === homeR && awayR === Number(tie[1]), complete)
          else if (side) {
            const teamR = Number(side[2]), oppR = Number(side[3])
            gradeAtClose(rowKey, side[1] === AWAY_LABEL ? (awayR === teamR && homeR === oppR) : (homeR === teamR && awayR === oppR), complete)
          } else if (label === 'Any Other Score' && complete) {
            const matchesAny = m.options.some(o2 => {
              if (o2.label === label) return false
              const t2 = o2.label.match(/^Tie (\d+)-(\d+)$/)
              if (t2) return awayR === homeR && awayR === Number(t2[1])
              const s2 = o2.label.match(/^(American League|National League) (\d+)-(\d+)$/)
              if (!s2) return false
              const teamR2 = Number(s2[2]), oppR2 = Number(s2[3])
              return s2[1] === AWAY_LABEL ? (awayR === teamR2 && homeR === oppR2) : (homeR === teamR2 && awayR === oppR2)
            })
            out.set(rowKey, matchesAny ? 'lost' : 'won')
          }
        }
      }
      continue
    }

    // ── First N Innings aggregate ────────────────────────────────────────
    const firstNMatch = title.match(/^First (\d+) Innings?(?:\s+(.+))?$/)
    if (firstNMatch) {
      const n = Number(firstNMatch[1])
      const rest = (firstNMatch[2] ?? '').trim()
      const { awayRuns, homeRuns, complete } = sumInningsWindow(innings, n)

      for (const o of m.options) {
        const rowKey = `${m.id}::${o.label}`
        const label = o.label
        if (rest === 'Result') {
          gradeAtClose(rowKey, label === 'Tie' ? awayRuns === homeRuns : label === AWAY_LABEL ? awayRuns > homeRuns : label === HOME_LABEL ? homeRuns > awayRuns : false, complete)
        } else if (rest === 'Run Line' || rest === 'Alternate Run Lines') {
          const rl = parseRunLine(label)
          if (rl) { const diff = rl.team === AWAY_LABEL ? awayRuns - homeRuns : homeRuns - awayRuns; gradeAtClose(rowKey, diff + rl.line > 0, complete) }
        } else if (rest === 'Total Runs' || rest === 'Alternate Total Runs') {
          const total = awayRuns + homeRuns
          const num = label.match(/(Over|Under)\s*([\d.]+)/)
          if (num) {
            if (num[1] === 'Over') gradeOver(rowKey, total > Number(num[2]), complete)
            else gradeUnder(rowKey, total < Number(num[2]), complete)
          }
        } else if (rest === 'Money Line') {
          const isAway = /American League/.test(label), isHome = /National League/.test(label)
          if (complete) {
            if (awayRuns === homeRuns) out.set(rowKey, 'void')
            else out.set(rowKey, (isAway ? awayRuns > homeRuns : isHome ? homeRuns > awayRuns : false) ? 'won' : 'lost')
          }
        } else if (rest.startsWith('Winning Margin')) {
          if (label === 'Tie') { gradeAtClose(rowKey, awayRuns === homeRuns, complete); continue }
          const teamM = label.match(/^(American League|National League) Win By/)
          if (!teamM) continue
          const margin = teamM[1] === AWAY_LABEL ? awayRuns - homeRuns : homeRuns - awayRuns
          const plus = label.match(/Win By (\d+)\+ Runs?/)
          const range = label.match(/Win By (\d+)\s*-\s*(\d+) Runs?/)
          const exact = label.match(/Win By (\d+) Runs?$/)
          const won = plus ? margin >= Number(plus[1]) : range ? margin >= Number(range[1]) && margin <= Number(range[2]) : exact ? margin === Number(exact[1]) : false
          gradeAtClose(rowKey, won, complete)
        }
      }
      continue
    }

    // ── Whole-game team season totals ────────────────────────────────────
    const teamTotalMatch = title.match(/^(American League|National League) (?:Alt\.?\s*)?Total Runs$/)
    if (teamTotalMatch) {
      const value = teamTotalMatch[1] === AWAY_LABEL ? teamTotals.awayRuns : teamTotals.homeRuns
      for (const o of m.options) {
        const num = o.label.match(/(Over|Under)\s*([\d.]+)/)
        if (!num) continue
        if (num[1] === 'Over') gradeOver(`${m.id}::${o.label}`, value > Number(num[2]), isFinal)
        else gradeUnder(`${m.id}::${o.label}`, value < Number(num[2]), isFinal)
      }
      continue
    }
    if (title === 'American League Total Runs Odd/Even' || title === 'National League Total Runs Odd/Even') {
      const value = title.startsWith(AWAY_LABEL) ? teamTotals.awayRuns : teamTotals.homeRuns
      for (const o of m.options) gradeAtClose(`${m.id}::${o.label}`, o.label === 'Odd' ? value % 2 === 1 : o.label === 'Even' ? value % 2 === 0 : false, isFinal)
      continue
    }
    if (title === 'Total Runs Odd/Even') {
      const total = teamTotals.awayRuns + teamTotals.homeRuns
      for (const o of m.options) gradeAtClose(`${m.id}::${o.label}`, o.label === 'Odd' ? total % 2 === 1 : o.label === 'Even' ? total % 2 === 0 : false, isFinal)
      continue
    }
    if (title === 'Total Runs (Bands)') {
      const total = teamTotals.awayRuns + teamTotals.homeRuns
      for (const o of m.options) {
        const range = o.label.match(/^(\d+)-(\d+)$/)
        const plus = o.label.match(/^(\d+)\+$/)
        const won = range ? total >= Number(range[1]) && total <= Number(range[2]) : plus ? total >= Number(plus[1]) : false
        gradeAtClose(`${m.id}::${o.label}`, won, isFinal)
      }
      continue
    }
    if (title === 'Away Total Runs' || title === 'Home Total Runs') {
      for (const o of m.options) {
        const team = o.label.match(/,\s*(American League|National League)$/)
        const num = o.label.match(/(Over|Under)\s*([\d.]+)/)
        if (!team || !num) continue
        const value = team[1] === AWAY_LABEL ? teamTotals.awayRuns : teamTotals.homeRuns
        if (num[1] === 'Over') gradeOver(`${m.id}::${o.label}`, value > Number(num[2]), isFinal)
        else gradeUnder(`${m.id}::${o.label}`, value < Number(num[2]), isFinal)
      }
      continue
    }
    if (title === 'Winning Margin') {
      const margin = Math.abs(teamTotals.awayRuns - teamTotals.homeRuns)
      for (const o of m.options) {
        const exact = o.label.match(/^By Exactly (\d+) Runs?$/)
        const plus = o.label.match(/^By (\d+) Or More Runs?$/)
        const won = exact ? margin === Number(exact[1]) : plus ? margin >= Number(plus[1]) : false
        gradeAtClose(`${m.id}::${o.label}`, won, isFinal)
      }
      continue
    }
    const raceMatch = title.match(/^Race To (\d+) Runs$/)
    if (raceMatch) {
      const n = Number(raceMatch[1])
      let winner: 'away' | 'home' | null = null
      for (const pt of live.scoreProgression) {
        if (pt.away >= n) { winner = 'away'; break }
        if (pt.home >= n) { winner = 'home'; break }
      }
      for (const o of m.options) {
        const rowKey = `${m.id}::${o.label}`
        if (o.label === 'Neither') {
          if (isFinal && winner == null) out.set(rowKey, 'won')
          else if (winner != null) out.set(rowKey, 'lost')
        } else if (o.label === AWAY_LABEL) {
          if (winner === 'away') out.set(rowKey, 'won')
          else if (winner === 'home' || (isFinal && winner == null)) out.set(rowKey, 'lost')
        } else if (o.label === HOME_LABEL) {
          if (winner === 'home') out.set(rowKey, 'won')
          else if (winner === 'away' || (isFinal && winner == null)) out.set(rowKey, 'lost')
        }
      }
      continue
    }
  }
  return out
}

// ─── First-pitch markets ────────────────────────────────────────────────
// Real pitch-level detail (same playEvents-filtered-by-type-'pitch' data
// the site's own /sports live game page already reads) for the very first
// pitch of each half of the 1st inning. Once that one pitch has actually
// been thrown, the whole market is known — no need to wait for the at-bat
// (or the game) to finish.
function classifyFirstPitchResult(fp: LiveFirstPitch): 'strike' | 'ball_hbp' | 'single' | 'xbh' | 'other' | null {
  if (!fp) return null
  if (fp.isInPlay) {
    const ev = (fp.resultEvent ?? '').toLowerCase()
    if (ev === 'single') return 'single'
    if (ev === 'double' || ev === 'triple' || ev === 'home run') return 'xbh'
    return 'other'
  }
  if (fp.isBall || fp.isHbp) return 'ball_hbp'
  if (fp.isStrike) return 'strike'
  return null
}

const FIRST_PITCH_RESULT_LABEL: Record<string, string> = {
  strike: 'Taken Strike/Swinging Strike/Foul',
  ball_hbp: 'Ball/HBP',
  single: 'Single',
  xbh: 'Extra Base Hit (Double/Triple/Home Run)',
  other: 'Any Other Out/Outcome',
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function computeFirstPitchSettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out

  for (const m of allMarkets) {
    const resultMatch = m.title.match(/^First Pitch Result - (Top|Bottom) 1st$/)
    if (resultMatch) {
      const fp = resultMatch[1] === 'Top' ? live.firstPitch.top : live.firstPitch.bottom
      const cls = classifyFirstPitchResult(fp)
      if (!cls) continue
      const winningLabel = FIRST_PITCH_RESULT_LABEL[cls]
      for (const o of m.options) out.set(`${m.id}::${o.label}`, o.label === winningLabel ? 'won' : 'lost')
      continue
    }

    const veloMatch = m.title.match(/^(.+) Velocity of First Pitch$/)
    if (veloMatch) {
      const nameInTitle = stripAccents(veloMatch[1].trim())
      const candidates = [live.firstPitch.top, live.firstPitch.bottom].filter((c): c is NonNullable<LiveFirstPitch> => c != null)
      const fp = candidates.find(c => c.pitcherName && nameInTitle.includes(stripAccents(c.pitcherName.split(' ').pop() ?? '')))
      if (!fp || fp.startSpeed == null) continue
      const speed = fp.startSpeed
      for (const o of m.options) {
        const faster = o.label.match(/([\d.]+)\s*MPH or Faster/)
        const slower = o.label.match(/([\d.]+)\s*MPH or Slower/)
        const range = o.label.match(/([\d.]+)\s*-\s*([\d.]+)\s*MPH/)
        let won = false
        if (faster) won = speed >= Number(faster[1])
        else if (slower) won = speed <= Number(slower[1])
        else if (range) won = speed >= Number(range[1]) && speed <= Number(range[2])
        out.set(`${m.id}::${o.label}`, won ? 'won' : 'lost')
      }
      continue
    }
  }
  return out
}

// ─── Pitcher strikeout props (starters, relief "Reserves", 1st-inning Specials) ─
// Free-text market titles here (BetMGM's starter cards, Caesars' "Pitcher
// Strikeouts"/"Specials") name a pitcher in prose with no mlbId on the
// option — matched against MLB's own real per-pitcher boxscore names by
// surname (accent-stripped, so "Cristopher Sánchez" matches "Sanchez" in
// scraped text) rather than guessed.
function pitcherIdByName(text: string, pitchers: Record<number, LivePitcherStats>): number | null {
  const t = stripAccents(text)
  for (const [id, p] of Object.entries(pitchers)) {
    const surname = stripAccents(p.name).trim().split(/\s+/).pop() ?? ''
    if (surname.length >= 3 && t.includes(surname)) return Number(id)
  }
  return null
}

export function computePitcherPropSettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out
  const isFinal = live.gameState === 'Final'
  const { pitchers, firstInningPitcher, teamTotalStrikeouts } = live

  for (const m of allMarkets) {
    const title = m.title.trim()

    // BetMGM starter cards: "<Pitcher> (<Team>): Starting pitcher props
    // (Void if pitcher does not start)" — options "Have N+ Strikeouts".
    const starterMatch = title.match(/^(.+?)\s*\([A-Z]{2,3}\)\s*:?\s*Starting pitcher props/)
    if (starterMatch) {
      const pid = pitcherIdByName(starterMatch[1], pitchers)
      for (const o of m.options) {
        const rowKey = `${m.id}::${o.label}`
        const n = o.label.match(/^Have (\d+)\+ Strikeouts$/)
        if (!n) continue
        if (pid == null) { if (isFinal) out.set(rowKey, 'void'); continue }
        if (pitchers[pid].strikeOuts >= Number(n[1])) out.set(rowKey, 'won')
        else if (isFinal) out.set(rowKey, 'lost')
      }
      continue
    }

    // BetMGM reserves: "Player to record N+ strikeout(s) (Reserves)" — real mlbId on each option.
    if (/^Player to record \d\+ strikeouts? \(Reserves\)$/.test(title)) {
      for (const o of m.options) {
        if (o.mlbId == null) continue
        const rowKey = `${m.id}::${o.label}`
        const n = title.match(/(\d)\+/)?.[1] ?? '1'
        const p = pitchers[o.mlbId]
        if (!p) { if (isFinal) out.set(rowKey, 'void'); continue } // never actually pitched tonight
        if (p.strikeOuts >= Number(n)) out.set(rowKey, 'won')
        else if (isFinal) out.set(rowKey, 'lost')
      }
      continue
    }

    // Caesars "Pitcher Strikeouts": "<Pitcher> - Alternate Pitching Strikeouts, N+"
    if (title === 'Pitcher Strikeouts') {
      for (const o of m.options) {
        const rowKey = `${m.id}::${o.label}`
        const m2 = o.label.match(/^(.+?) - Alternate Pitching Strikeouts,\s*(\d+)\+$/)
        if (!m2) continue
        const pid = pitcherIdByName(m2[1], pitchers)
        if (pid == null) { if (isFinal) out.set(rowKey, 'void'); continue }
        if (pitchers[pid].strikeOuts >= Number(m2[2])) out.set(rowKey, 'won')
        else if (isFinal) out.set(rowKey, 'lost')
      }
      continue
    }

    // Caesars "Specials" grab-bag — several distinct, precisely-worded real props.
    if (title === 'Specials') {
      for (const o of m.options) {
        const rowKey = `${m.id}::${o.label}`
        const label = o.label

        const kProp = label.match(/^(.+?) To Record (\d+)\+ Strikeouts$/)
        if (kProp) {
          const pid = pitcherIdByName(kProp[1], pitchers)
          if (pid == null) { if (isFinal) out.set(rowKey, 'void'); continue }
          gradeVal(out, rowKey, pitchers[pid].strikeOuts, Number(kProp[2]), isFinal)
          continue
        }
        if (label === 'Both Teams to Record a Double') { if (isFinal) out.set(rowKey, live.bothTeamsDouble ? 'won' : 'lost'); continue }
        if (label === 'Both Teams to Record a Triple') { if (isFinal) out.set(rowKey, live.bothTeamsTriple ? 'won' : 'lost'); continue }
        if (label === 'Double Play Recorded with the Bases Loaded') {
          // Zero double plays this game makes this trivially false — a
          // real DP would need runner-state reconstruction we don't have,
          // but "none happened at all" already settles it either way.
          if (!live.doublePlayRecorded && isFinal) out.set(rowKey, 'lost')
          continue
        }

        const tud = label.match(/^(.+?) to go 3 Up 3 Down in the 1st Inning$/)
        if (tud) {
          const pid = pitcherIdByName(tud[1], pitchers)
          const half = firstInningPitcher.top?.mlbId === pid ? firstInningPitcher.top : firstInningPitcher.bottom?.mlbId === pid ? firstInningPitcher.bottom : null
          if (half && isFinal) out.set(rowKey, half.threeUpThreeDown ? 'won' : 'lost')
          continue
        }
        const kSide = label.match(/^(.+?) to Strike Out the Side in the 1st Inning$/)
        if (kSide) {
          const pid = pitcherIdByName(kSide[1], pitchers)
          const half = firstInningPitcher.top?.mlbId === pid ? firstInningPitcher.top : firstInningPitcher.bottom?.mlbId === pid ? firstInningPitcher.bottom : null
          if (half && isFinal) out.set(rowKey, half.struckOutTheSide ? 'won' : 'lost')
          continue
        }
        const bothTud = label.match(/^(.+?) and (.+?) Both go 3 up 3 down in the 1st Inning$/)
        if (bothTud) {
          if (isFinal && firstInningPitcher.top && firstInningPitcher.bottom) {
            out.set(rowKey, firstInningPitcher.top.threeUpThreeDown && firstInningPitcher.bottom.threeUpThreeDown ? 'won' : 'lost')
          }
          continue
        }
        const combine = label.match(/^(.+?) and (.+?) to Combine for (\d+)\+ Strikeouts in the 1st Inning$/)
        if (combine) {
          if (firstInningPitcher.top && firstInningPitcher.bottom) {
            gradeVal(out, rowKey, firstInningPitcher.top.strikeouts + firstInningPitcher.bottom.strikeouts, Number(combine[3]), isFinal)
          }
          continue
        }
        const teamK = label.match(/^(American League|National League) Pitchers Record (\d+)\+ Strikeouts$/)
        if (teamK) {
          const value = teamK[1] === 'American League' ? teamTotalStrikeouts.away : teamTotalStrikeouts.home
          gradeVal(out, rowKey, value, Number(teamK[2]), isFinal)
          continue
        }
      }
      continue
    }
  }
  return out
}

// "At least N" grading shared by the pitcher-prop helpers above — safe to
// grade 'won' the moment the real value clears the bar, 'lost' only once
// the game (or window) is actually decided.
function gradeVal(out: Map<string, MarketOutcome>, rowKey: string, value: number, threshold: number, decidable: boolean) {
  if (value >= threshold) out.set(rowKey, 'won')
  else if (decidable) out.set(rowKey, 'lost')
}

// ─── Head-to-head player props (Caesars) ───────────────────────────────────
// Caesars' "H2H Total Bases" flattens what are really N separate 2-player
// matchups into one option array with no explicit pairing — but consecutive
// pairs devig to ~100% combined (a real, verifiable structural signal, not a
// guess), confirming the array order IS the pairing: [0]v[1], [2]v[3], etc.
export function computeH2HSettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out
  const isFinal = live.gameState === 'Final'
  if (!isFinal) return out

  for (const m of allMarkets) {
    if (m.title !== 'H2H Total Bases') continue
    for (let i = 0; i + 1 < m.options.length; i += 2) {
      const a = m.options[i], b = m.options[i + 1]
      if (a.mlbId == null || b.mlbId == null) continue
      const aTb = live.players[a.mlbId]?.totalBases ?? 0
      const bTb = live.players[b.mlbId]?.totalBases ?? 0
      const aKey = `${m.id}::${a.label}`, bKey = `${m.id}::${b.label}`
      if (aTb === bTb) { out.set(aKey, 'void'); out.set(bKey, 'void'); continue }
      out.set(aKey, aTb > bTb ? 'won' : 'lost')
      out.set(bKey, bTb > aTb ? 'won' : 'lost')
    }
  }
  return out
}

// ─── Exact first-plate-appearance outcome (FanDuel) ────────────────────────
// "1st PA - <Player>" markets ask what specifically happened in a player's
// very first trip, not just a binary. Matched by the option's own real
// mlbId against the live feed's real per-play classification (single / XBH
// / walk-HBP / strikeout / any other out) — no name parsing needed.
const FIRST_PA_LABEL: Record<string, string> = {
  single: 'Single', xbh: 'Extra Base Hit (Double/Triple/Home Run)',
  walk_hbp: 'Walk / HBP', strikeout: 'Strikeout', other: 'Any Other Out / Outcome',
}
export function computeFirstPaOutcomeSettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out
  const isFinal = live.gameState === 'Final'

  for (const m of allMarkets) {
    if (!m.title.startsWith('1st PA - ')) continue
    for (const o of m.options) {
      if (o.mlbId == null) continue
      const rowKey = `${m.id}::${o.label}`
      const outcome = live.firstPaOutcome[o.mlbId]
      if (!outcome) { if (isFinal) out.set(rowKey, 'void'); continue } // never got a PA tonight
      const matches = o.label.includes(FIRST_PA_LABEL[outcome])
      out.set(rowKey, matches ? 'won' : 'lost')
    }
  }
  return out
}

// ─── Real HR distance (FanDuel) ────────────────────────────────────────────
// Real Statcast hitData.totalDistance off the live feed's own play-by-play
// for every actual HR hit tonight — not season averages.
export function computeHrDistanceSettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out
  const isFinal = live.gameState === 'Final'
  if (!isFinal) return out
  const maxDistance = live.hrDistances.length ? Math.max(...live.hrDistances.map(h => h.distance)) : 0

  for (const m of allMarkets) {
    if (m.title !== 'Any Player to Hit a Home Run X+ Feet') continue
    for (const o of m.options) {
      const n = o.label.match(/(\d+)\+\s*Feet/)
      if (!n) continue
      out.set(`${m.id}::${o.label}`, maxDistance >= Number(n[1]) ? 'won' : 'lost')
    }
  }
  return out
}

// ─── HR / Moneyline parlay (FanDuel) ───────────────────────────────────────
// A well-defined 2-leg combo ("PlayerName/TeamName" = that player hits any
// HR at all tonight AND that team wins the whole game) — both real,
// independently-verifiable facts, unlike the continuous-line parlays
// (run line + total runs) elsewhere on this page that stay unbuilt because
// their joint distribution genuinely isn't derivable from final box totals.
export function computeHrMoneylineParlaySettlement(allMarkets: Market[], live: LiveGameState | null): Map<string, MarketOutcome> {
  const out = new Map<string, MarketOutcome>()
  if (!live) return out
  const isFinal = live.gameState === 'Final'
  if (!isFinal) return out
  const awayWon = live.teamTotals.awayRuns > live.teamTotals.homeRuns
  const homeWon = live.teamTotals.homeRuns > live.teamTotals.awayRuns

  for (const m of allMarkets) {
    if (m.title !== 'Home Run / Moneyline Parlay') continue
    for (const o of m.options) {
      const m2 = o.label.match(/^(.+)\/(American League|National League)$/)
      if (!m2 || o.mlbId == null) continue
      const teamWon = m2[2] === AWAY_LABEL ? awayWon : homeWon
      const hit = (live.players[o.mlbId]?.hr ?? 0) > 0
      out.set(`${m.id}::${o.label}`, hit && teamWon ? 'won' : 'lost')
    }
  }
  return out
}

export function outcomeBg(o: MarketOutcome | undefined): string | undefined {
  if (o === 'won') return 'rgba(34,197,94,0.16)'
  if (o === 'lost') return 'rgba(248,113,113,0.10)'
  if (o === 'void') return 'rgba(234,179,8,0.14)'
  return undefined
}
export function outcomeMark(o: MarketOutcome | undefined): string | null {
  if (o === 'won') return '✅'
  if (o === 'lost') return '❌'
  if (o === 'void') return '⚠️ VOID'
  return null
}
