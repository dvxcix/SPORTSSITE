export function americanImpliedProbability(odds: number | null | undefined): number | null {
  if (odds == null || !Number.isFinite(odds) || Math.abs(odds) < 100) return null
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100)
}

export function probabilityToAmerican(probability: number | null | undefined): number | null {
  if (probability == null || !Number.isFinite(probability) || probability <= 0 || probability >= 1) return null
  return probability >= 0.5
    ? -100 * probability / (1 - probability)
    : 100 * (1 - probability) / probability
}

/** Relative profit-price movement, continuous across +100 / -100 (even money). */
export function nflPriceChange(current: number | null, reference: number | null): number | null {
  if (americanImpliedProbability(current) == null || americanImpliedProbability(reference) == null) return null
  const profit = (odds: number) => odds > 0 ? odds / 100 : 100 / -odds
  return Math.round((profit(current!) / profit(reference!) - 1) * 1e12) / 1e12
}

/**
 * Positive points mean the current price implies less probability than the
 * reference (a quieter/longer market). Negative points mean the current price
 * implies more probability than the reference (a louder/shorter market).
 */
export function hiddenProbabilityPoints(reference: number | null, current: number | null): number | null {
  if (reference == null || current == null || !Number.isFinite(reference) || !Number.isFinite(current) || reference <= 0 || reference >= 1 || current <= 0 || current >= 1) return null
  return Math.round((reference - current) * 1000) / 10
}

export function impliedProbabilityRatio(numeratorOdds: number | null, denominatorOdds: number | null): number | null {
  const numerator = americanImpliedProbability(numeratorOdds)
  const denominator = americanImpliedProbability(denominatorOdds)
  if (numerator == null || denominator == null || denominator === 0) return null
  return Math.round((numerator / denominator) * 100) / 100
}
