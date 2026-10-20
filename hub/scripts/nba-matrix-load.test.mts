import test from 'node:test'
import assert from 'node:assert/strict'
import { loadNbaMatrixGames } from '../src/lib/nbaMatrixGames'

test('an account without enabled matrices makes one request for a full slate', async () => {
  const requests: number[] = []
  const data = await loadNbaMatrixGames(Array.from({ length: 14 }, (_, i) => i + 1), async id => {
    requests.push(id)
    return { matrices: [], matches: [] }
  })
  assert.deepEqual(requests, [1])
  assert.equal(data.failed, 0)
})

test('enabled matrices evaluate every game with bounded concurrency', async () => {
  const requests: number[] = []
  let active = 0, peak = 0
  const data = await loadNbaMatrixGames(Array.from({ length: 14 }, (_, i) => i + 1), async id => {
    requests.push(id)
    peak = Math.max(peak, ++active)
    await new Promise(resolve => setTimeout(resolve, 1))
    active--
    return { matrices: [{ id: 'private-matrix' }], gameId: id }
  })
  assert.equal(data.results.length, 14)
  assert.equal(new Set(requests).size, 14)
  assert.equal(peak, 3)
})

test('one unavailable game does not hide results from the rest of the slate', async () => {
  const data = await loadNbaMatrixGames([1, 2, 3], async id => {
    if (id === 1) throw new Error('unavailable game')
    return { matrices: [{ id: 'private-matrix' }], gameId: id }
  })
  assert.equal(data.failed, 1)
  assert.deepEqual(data.results.map(result => result.gameId), [2, 3])
})
