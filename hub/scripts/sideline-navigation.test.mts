import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduledDate, scheduleWeekKey, scheduleWeekLabel } from '../src/app/the-sideline/scheduleNavigation'
import { normalizeNflPlayerName } from '../src/lib/nflPlayerName'

const days = [
  { date: '2026-09-09', season: 2026, week: 1, gameType: 'REG' },
  { date: '2026-09-13', season: 2026, week: 1, gameType: 'REG' },
  { date: '2026-09-17', season: 2026, week: 2, gameType: 'REG' },
]
test('non-game dates resolve to the next actual game day, not an empty slate', () => {
  assert.equal(scheduledDate(days, '2026-09-15'), '2026-09-17')
  assert.equal(scheduledDate(days, '2026-09-09'), '2026-09-09')
  assert.equal(scheduledDate(days, '2026-12-31'), '2026-09-17')
  assert.equal(scheduledDate([], '2026-09-09'), undefined)
})
test('week identity separates seasons and preseason', () => {
  assert.equal(scheduleWeekKey(days[0]), scheduleWeekKey(days[1]))
  assert.notEqual(scheduleWeekKey(days[0]), scheduleWeekKey({ ...days[0], gameType: 'PRE' }))
  assert.equal(scheduleWeekLabel(days[2]), '2026 · Week 2')
})
test('board and directory normalize accents, suffixes, initials and apostrophes consistently', () => {
  assert.equal(normalizeNflPlayerName('Odell Beckham Jr.'), normalizeNflPlayerName('Odell Beckham'))
  assert.equal(normalizeNflPlayerName('A.J. Brówn'), normalizeNflPlayerName('AJ Brown'))
  assert.equal(normalizeNflPlayerName('D’Andre Swift'), normalizeNflPlayerName("D'Andre Swift"))
  assert.notEqual(normalizeNflPlayerName('Josh Allen'), normalizeNflPlayerName('Kyle Allen'))
})
