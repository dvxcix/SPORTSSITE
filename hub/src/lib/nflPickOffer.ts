import type { NflOddsPlayer } from './nflOddsTypes'

export function findNflPickOffer(player: NflOddsPlayer | undefined, selection: {
  prop_key: string; numeric_line?: number | null; market_side?: 'milestone' | 'over' | 'under'; book: string | null
}) {
  const vendor = (selection.book ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const kind = (selection.market_side ?? 'milestone') === 'milestone' ? 'milestone' : 'over_under'
  for (const market of player?.markets ?? []) {
    if (market.propType !== selection.prop_key) continue
    const offer = market.offers.find(candidate =>
      candidate.vendor.toLowerCase().replace(/[^a-z0-9]/g, '') === vendor &&
      candidate.type === kind && candidate.line === (selection.numeric_line ?? null))
    if (offer) return { market, offer }
  }
  return null
}
