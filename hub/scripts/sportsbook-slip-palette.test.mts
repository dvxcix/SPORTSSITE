import assert from 'node:assert/strict'
import test from 'node:test'
import { darkSportsbookSlipGradient, normalizeVendor, pickSlipBook, sportsbookSlipPalette } from '../src/lib/sportsbookSlip'

test('pick slips use recognized sportsbook aliases and preserve the legacy book fallback', () => {
  assert.deepEqual(sportsbookSlipPalette(' Fanatics '), ['#DA1927', '#34333D'])
  assert.deepEqual(sportsbookSlipPalette('FD'), ['#1493FF', '#164AA8'])
  assert.equal(normalizeVendor('William Hill US'), 'caesars')
  assert.equal(sportsbookSlipPalette('constructor'), undefined)
  assert.equal(pickSlipBook(' ', ' Fanatics '), 'Fanatics')
  assert.equal(pickSlipBook('fanduel', 'fanatics'), 'fanduel')
  assert.equal(pickSlipBook(undefined, undefined), null)
  assert.equal(darkSportsbookSlipGradient(null, '#0C0E13'), '#0C0E13')
  assert.match(darkSportsbookSlipGradient('fanatics', '#0C0E13'), /#DA192759.*#34333D38/)
})
