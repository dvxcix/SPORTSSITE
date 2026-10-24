import type { PaintProp } from './nbaPaint'
import { nbaValidOdds } from './nbaOddsHistory'

/** BetMGM's five half-point points quotes verified on its O/U board on
 * 2026-10-24 arrive from the primary feed as one-sided milestones. Correct
 * only that proven shape at provider ingress, never while reading archives. */
export function nbaNormalizePrimaryProp(offer: PaintProp): PaintProp {
  const line = Number(offer.line_value)
  if (offer.vendor !== 'betmgm' || offer.prop_type !== 'points' || offer.market.type !== 'milestone'
    || !Number.isFinite(line) || line <= 0 || line % 1 !== .5
    || !nbaValidOdds(offer.market.odds) || offer.market.over_odds != null || offer.market.under_odds != null) return offer
  const normalized: PaintProp = { ...offer, market: { type: 'over_under', over_odds: offer.market.odds } }
  // Type is part of the immutable opening/save identity. A former milestone
  // opening cannot become the opening of this corrected O/U contract.
  delete normalized.opening
  return normalized
}

export function nbaNormalizePrimaryProps(props: PaintProp[]): PaintProp[] {
  return props.map(nbaNormalizePrimaryProp)
}
