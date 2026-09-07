type PropEntry = {
  sa?: Record<string, unknown> | null
}

export function countBetMgmAnytimePrices(propMap: unknown): number {
  if (!propMap || typeof propMap !== 'object' || Array.isArray(propMap)) return 0

  return Object.values(propMap as Record<string, PropEntry>).reduce((count, entry) => {
    const price = entry?.sa?.betmgm
    return count + (typeof price === 'number' && Number.isFinite(price) ? 1 : 0)
  }, 0)
}

// A healthy vendor feed normally prices almost the whole confirmed lineup.
// Allow two legitimate omissions (late scratches / book exclusions), then
// use the direct collector when BDL's BetMGM slice is materially incomplete.
export function needsBetMgmFallback(propMap: unknown, confirmedBatterCount: number): boolean {
  const expected = Math.max(0, confirmedBatterCount - 2)
  return expected > 0 && countBetMgmAnytimePrices(propMap) < expected
}
