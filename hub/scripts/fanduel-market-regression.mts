import assert from 'node:assert/strict'
import { isFanduelFirstPaHrSection } from '../src/lib/scrapers/fanduelMarkets.ts'
import { missingCoreMarkets, missingOpeningMarkets } from '../src/lib/scrapers/retryMarkets.ts'

for (const label of [
  'To Hit a Home Run in First Plate Appearance',
  'To Hit a Home Run in 1st Plate Appearance',
  'Home Run in First PA',
  'Home Run in 1st PA',
]) {
  assert.equal(isFanduelFirstPaHrSection(label), true, `Expected FanDuel 1st PA market: ${label}`)
}

assert.equal(isFanduelFirstPaHrSection('To Hit First Home Run'), false)
assert.equal(isFanduelFirstPaHrSection('To Hit a Home Run'), false)
assert.equal(isFanduelFirstPaHrSection('Result of 1st Plate Appearance'), false)
assert.equal(isFanduelFirstPaHrSection('1st Plate Appearance Result'), false)
assert.equal(isFanduelFirstPaHrSection('Player Result in First PA'), false)

const completeCore = { rbi3_fd: 9, laser105_fd: 6, moonshot_fd: 8 }
assert.deepEqual(missingCoreMarkets(completeCore), [])
assert.deepEqual(missingOpeningMarkets(completeCore), ['fhr_fd'])
assert.deepEqual(missingCoreMarkets({ ...completeCore, laser105_fd: 0 }), ['laser105_fd'])
assert.deepEqual(missingOpeningMarkets({ ...completeCore, fhr_fd: 18 }), [])

// Optional or discontinued markets must never double a full Browserbase
// event scrape. They remain captured whenever offered, but are not health
// gates for an otherwise complete event.
assert.deepEqual(missingCoreMarkets({
  ...completeCore,
  combo1_min: 0,
  combo2_min: 0,
  laser110_fd: 0,
  pa1_fd: 0,
}), [])

console.log('FanDuel market label regression checks passed')
