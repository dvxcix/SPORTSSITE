import assert from 'node:assert/strict'
import test from 'node:test'
import { countBetMgmAnytimePrices, needsBetMgmFallback } from '../src/lib/scrapers/mgmCoverage.ts'

function mapWithMgmPrices(count: number) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `player-${index}`,
    { sa: { fanduel: 500 + index, betmgm: 475 + index } },
  ]))
}

test('counts only finite BetMGM anytime-home-run prices', () => {
  assert.equal(countBetMgmAnytimePrices({
    one: { sa: { betmgm: 475 } },
    two: { sa: { betmgm: null } },
    three: { sa: { fanduel: 500 } },
    four: { sa: { betmgm: Number.NaN } },
  }), 1)
})

test('falls back for a vendor-wide or materially incomplete MGM board', () => {
  assert.equal(needsBetMgmFallback({}, 18), true)
  assert.equal(needsBetMgmFallback(mapWithMgmPrices(10), 18), true)
})

test('does not open Browserbase for healthy coverage or unconfirmed lineups', () => {
  assert.equal(needsBetMgmFallback(mapWithMgmPrices(16), 18), false)
  assert.equal(needsBetMgmFallback({}, 0), false)
})
