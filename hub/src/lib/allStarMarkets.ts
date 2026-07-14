// ─── All-Star Game FanDuel market board ────────────────────────────────────
// Same reasoning as the (now-removed) HR Derby's hrDerbyOdds.ts: a novelty
// one-night event has no normal per-game import path (nothing in the admin
// FanDuel importer's SECTION_MAP matches ASG-specific market titles like
// "MVP" or team-total props), so real scraped odds get hand-transcribed
// here as plain data instead of fabricated. This file starts empty — real
// markets get added once the actual FanDuel board is pasted in, exactly the
// same iterative real-data-only workflow used to build out the Derby page.

export type MarketOption = {
  label: string
  odds: number
  mlbId?: number
  playerName?: string
}

export type Market = {
  id: string
  section: string   // e.g. "Player Props", "Team Props", "Futures", "Game Props", "Inning Props"
  title: string     // e.g. "To Record a Hit", "MVP", "First Team to Score"
  options: MarketOption[]
}

export const ALLSTAR_MARKETS: Market[] = []

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
