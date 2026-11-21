import assert from 'node:assert/strict'
import test from 'node:test'
import { watchlistPlayerHref } from '../src/lib/watchlistPlayerHref'

test('saved NBA selections open NBA profiles without relying on the legacy MLB id', () => {
  assert.equal(watchlistPlayerHref({ sport: 'NBA', prop_key: 'nba:434:rebounds:over_under:8.5:under', mlb_id: null }), '/nba/players/434')
  assert.equal(watchlistPlayerHref({ sport: 'nba', prop_key: 'nba:434:points:milestone:25:milestone', mlb_id: 123 }), '/nba/players/434')
  assert.equal(watchlistPlayerHref({ sport: 'NBA', prop_key: 'old-selection', mlb_id: 123 }), null)
  assert.equal(watchlistPlayerHref({ sport: 'mlb', prop_key: 'hr', mlb_id: 123 }), '/players/123')
  assert.equal(watchlistPlayerHref({ sport: 'NFL', prop_key: 'nfl:anytime_td', mlb_id: 123 }), null)
})
