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
assert.equal(isFanduelFirstPaHrSection('Result of 1st Plate Appearance'), false)
assert.equal(isFanduelFirstPaHrSection('1st Plate Appearance Result'), false)
assert.equal(isFanduelFirstPaHrSection('Player Result in First PA'), false)

console.log('FanDuel market label regression checks passed')
