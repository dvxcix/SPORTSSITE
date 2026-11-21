import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaPlayerMarketGroups } from '../src/lib/nbaPlayerMarketGroups.ts'
import type { PaintPlayer } from '../src/lib/nbaPaint.ts'
const player = (id: number, status: string | null, price = true, book = 'fanduel'): PaintPlayer => ({
  id, first_name: 'Test', last_name: String(id), position: 'G', team: { id: 1, abbreviation: 'ATL', name: 'Hawks', full_name: 'Atlanta Hawks' }, headshot: null,
  average: { pts: 100 - id }, logs: [], injury: status ? { status, description: '' } : null,
  props: price ? [{ id, game_id: 1, player_id: id, vendor: book, prop_type: 'points', line_value: '10', updated_at: '2030-01-01T00:00:00Z', market: { type: 'milestone', odds: 100 } }] : [],
})
test('priced players precede unpriced and unavailable players without changing the selected order within each section', () => {
  const rows = [player(1, 'Out'), player(2, null, false), player(3, 'Questionable'), player(4, null), player(5, 'Suspended')]
  const groups = nbaPlayerMarketGroups(rows, 'points', 'fanduel', 'over')
  assert.deepEqual(groups.priced.map(p => p.id), [3, 4])
  assert.deepEqual(groups.unpriced.map(p => p.id), [2])
  assert.deepEqual(groups.unavailable.map(p => p.id), [1, 5])
  assert.deepEqual(nbaPlayerMarketGroups([...rows].reverse(), 'points', 'fanduel', 'over').priced.map(p => p.id), [4, 3])
})
test('a different book, market or unavailable side never qualifies a player as priced', () => {
  const rows = [player(1, null), player(2, null, true, 'draftkings')]
  assert.deepEqual(nbaPlayerMarketGroups(rows, 'points', 'draftkings', 'over').priced.map(p => p.id), [2])
  assert.equal(nbaPlayerMarketGroups(rows, 'rebounds', 'all', 'over').priced.length, 0)
  assert.equal(nbaPlayerMarketGroups(rows, 'points', 'all', 'under').priced.length, 0)
})
test('source updates move Out to Questionable/available and restore priced rows immediately, without deleting research', () => {
  const out = player(1, 'Out'), unpriced = player(2, null, false)
  assert.equal(nbaPlayerMarketGroups([out, unpriced], 'points', 'all', 'over').priced.length, 0)
  const recovered = { ...out, injury: { status: 'Questionable', description: '' } }, posted = player(2, null)
  const groups = nbaPlayerMarketGroups([recovered, posted], 'points', 'all', 'over')
  assert.equal(groups.priced.length, 2)
  assert.equal(out.injury?.status, 'Out')
  assert.equal(groups.priced.length + groups.unpriced.length + groups.unavailable.length, 2)
})
