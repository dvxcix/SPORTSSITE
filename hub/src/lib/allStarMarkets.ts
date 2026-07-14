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
  const t = title.toLowerCase()
  const n = t.match(/(\d+)\+/)?.[1] ?? '1'
  if (/first plate appearance/.test(t)) return 'first_pa_hr'
  if (/2\+\s*home runs?/.test(t)) return 'hr_2plus'
  if (/home run/.test(t)) return 'anytime_hr'
  if (/hits\s*\+\s*runs\s*\+\s*rbis/.test(t)) return `hrr_${n}plus`
  if (/extra base hit/.test(t)) return 'xbh_1plus'
  if (/total bases/.test(t)) return `tb_${n}plus`
  if (/rbis?/.test(t)) return `rbi_${n}plus`
  if (/\bdouble\b/.test(t)) return 'double'
  if (/\bsingle\b/.test(t)) return 'single'
  if (/\btriple\b/.test(t)) return 'triple'
  if (/run scored|runs? scored/.test(t)) return `run_${n}plus`
  if (/strikeouts?/.test(t)) return `k_${n}plus`
  if (/\bhits?\b/.test(t)) return `hits_${n}plus`
  if (/\bmvp\b/.test(t)) return 'mvp'
  return null
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
