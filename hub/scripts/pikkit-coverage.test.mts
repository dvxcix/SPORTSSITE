import assert from 'node:assert/strict'
import { summarizePikkitPayload, summarizePikkitRows } from '../src/lib/pikkitCoverage'

const sparse = summarizePikkitPayload({ props: {
  hr: { A: 7, B: 2, C: 1, D: 1 },
  hrr: { A: 2, E: 1, F: 1, G: 1 },
} })
assert.equal(sparse.marketCount, 2)
assert.equal(sparse.playerCount, 7)
assert.equal(sparse.complete, false)

const full = summarizePikkitPayload({ props: Object.fromEntries(
  ['hr', 'tb', 'hrr', 'singles', 'doubles', 'hits'].map((market, marketIndex) => [market,
    Object.fromEntries(Array.from({ length: 12 }, (_, playerIndex) => [`Player ${playerIndex}`, playerIndex + marketIndex + 1])),
  ]),
) })
assert.equal(full.marketCount, 6)
assert.equal(full.playerCount, 12)
assert.equal(full.complete, true)

const rows = summarizePikkitRows([
  { prop_type: 'home_runs', player_name: 'A' },
  { prop_type: 'hits', player_name: 'B' },
])
assert.equal(rows.complete, false)

console.log('pikkit coverage: ok')
