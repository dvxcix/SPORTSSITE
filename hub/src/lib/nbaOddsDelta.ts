import { impliedProbability } from './nbaMarketMetrics'

/** Probability points are continuous across -100/+100; raw American subtraction isn't. */
export function nbaOddsDelta(open: number | null | undefined, current: number | null | undefined) {
  const first = impliedProbability(open), now = impliedProbability(current)
  if (first == null || now == null) return null
  const pp = (now - first) * 100
  return { pp: Math.abs(pp) < 1e-8 ? 0 : pp, direction: Math.abs(pp) < 1e-8 ? 'flat' as const : pp > 0 ? 'shorter' as const : 'longer' as const }
}
