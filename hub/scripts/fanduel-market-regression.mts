import assert from 'node:assert/strict'
import { isFanduelFirstPaHrSection } from '../src/lib/scrapers/fanduelMarkets.ts'

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

console.log('FanDuel market label regression checks passed')
