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
  return `Books disagree on ${labelKey(f.key)} — ${Math.round(f.spread * 100)}pt spread across ${f.entries.map(e => e.book).join(', ')}`
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
        flags.push({ key, mlbId: entry.mlbId, bookRank, realRank, consensusProb: entry.prob })
      }
    })
  }
  return flags
}

export function dataMismatchFlagsForPlayer(flags: DataMismatchFlag[], mlbId: number): DataMismatchFlag[] {
  return flags.filter(f => f.mlbId === mlbId)
}

export function describeDataMismatchFlag(f: DataMismatchFlag): string {
  return `${labelKey(f.key)} market favorite ranks him #${f.bookRank} — our own bat-tracking data has him #${f.realRank}`
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

export type ContainmentFlag = {
  narrowKey: string
  broadKey: string
  mlbId: number
  narrowProb: number
  broadProb: number
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
        flags.push({ narrowKey: rule.narrow, broadKey: rule.broad, mlbId, narrowProb, broadProb })
      }
    }
  }
  return flags
}

export function containmentFlagsForPlayer(flags: ContainmentFlag[], mlbId: number): ContainmentFlag[] {
  return flags.filter(f => f.mlbId === mlbId)
}

export function describeContainmentFlag(f: ContainmentFlag): string {
  return `${labelKey(f.narrowKey)} (${(f.narrowProb * 100).toFixed(1)}%) priced above ${labelKey(f.broadKey)} (${(f.broadProb * 100).toFixed(1)}%) — the narrower event can't be more likely than the broader one it's contained in`
}
