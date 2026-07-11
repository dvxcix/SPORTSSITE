// American <-> decimal odds conversion + parlay combining, matching
// standard sportsbook math (same approach as Action Network's calculator).

export function americanToDecimal(odds: number): number {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds)
}

export function decimalToAmerican(dec: number): number {
  if (dec >= 2) return Math.round((dec - 1) * 100)
  return Math.round(-100 / (dec - 1))
}

export function combinedDecimal(legOdds: number[]): number {
  return legOdds.reduce((acc, o) => acc * americanToDecimal(o), 1)
}

// Combined American odds for a parlay of 2+ legs. For a single leg, just
// returns that leg's own odds (decimal round-trip is a no-op).
export function combineOdds(legOdds: number[]): number {
  return decimalToAmerican(combinedDecimal(legOdds))
}

export function calcPayout(wager: number, americanOdds: number): { payout: number; profit: number } {
  const payout = wager * americanToDecimal(americanOdds)
  return { payout, profit: payout - wager }
}

export function formatOdds(odds: number | null | undefined): string {
  if (odds == null) return '—'
  return odds > 0 ? `+${odds}` : String(odds)
}

export function fmtUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
