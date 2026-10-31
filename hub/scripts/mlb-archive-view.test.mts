import test from 'node:test'
import assert from 'node:assert/strict'
import { isArchiveDate, isBeforeSavedCutoff, savedMlbQuotes } from '../src/lib/mlbArchiveView'

test('archive date and observation require a real date and a genuine pregame boundary', () => {
  assert.equal(isArchiveDate('2026-10-27'), true)
  assert.equal(isArchiveDate('2026-02-30'), false)
  assert.equal(isArchiveDate('2026-1-01'), false)
  assert.equal(isBeforeSavedCutoff('2026-10-27T23:59:59.999Z', '2026-10-28T00:00:00Z', Date.parse('2026-11-01')), true)
  assert.equal(isBeforeSavedCutoff('2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z', Date.parse('2026-11-01')), false)
  assert.equal(isBeforeSavedCutoff('2026-10-27T23:59:59Z', null), false)
})

test('saved market values retain player, line key, book, and exact value without inventing missing prices', () => {
  const result = savedMlbQuotes({ '58': { name: 'Jonathan Aranda', hr: { fanduel: 980, caesars: null }, hrr_line: { fanduel: 3.5 }, source_player_id: 58 } })
  assert.deepEqual(result.rows, [
    { player: 'Jonathan Aranda', playerKey: '58', market: 'hr', book: 'fanduel', value: '980' },
    { player: 'Jonathan Aranda', playerKey: '58', market: 'hrr_line', book: 'fanduel', value: '3.5' },
  ])
  assert.equal(result.truncated, false)
  assert.equal(savedMlbQuotes({ p: { x: { a: 1, b: 2 } } }, 1).truncated, true)
  assert.deepEqual(savedMlbQuotes(null), { rows: [], truncated: false })
})
