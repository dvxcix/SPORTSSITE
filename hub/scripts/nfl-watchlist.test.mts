import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nflWatchlistSelection, watchlistPickPayload } from '../src/lib/nflWatchlist'
import { findNflPickOffer } from '../src/lib/nflPickOffer'
import { postBetToFeed, type WatchlistItem } from '../src/lib/watchlist'
import type { NflOddsPlayer, NflPlayerMarket, NflMarketOffer } from '../src/lib/nflOddsTypes'

const offer: NflMarketOffer = { vendor: 'fanduel', line: 60, openingLine: 60, type: 'milestone', current: { odds: 270 }, opening: { odds: 320 }, updatedAt: null }
const market: NflPlayerMarket = { key: 'receiving_yards:milestone:60', propType: 'receiving_yards', label: 'Receiving yards', category: 'receiving', line: 60, offers: [offer] }
const player: NflOddsPlayer = { id: 123, gsisId: '00-123', name: 'Test Player', team: 'ATL', position: 'WR', markets: [market] }
const game = { id: '2026_04_ATL_GB', gameday: '2026-10-01' }

test('NFL ladder save retains player, exact rung, book and price through posting', () => {
  const saved = nflWatchlistSelection(player, market, offer, 'over', game)
  assert.equal(saved.prop_label, '60+ Receiving Yards')
  assert.deepEqual(watchlistPickPayload(saved), { sport: 'NFL', mlb_id: null, player_name: player.name, team: 'ATL', headshot_url: undefined, game_pk: game.id, game_date: game.gameday, prop_key: 'receiving_yards', prop_label: '60+ Receiving Yards', line: '60', book: 'fanduel', odds: 270, player_id: '00-123', numeric_line: 60, market_side: 'milestone' })
})
test('NFL under and over remain distinct saves and contracts', () => {
  const ou = { ...offer, type: 'over_under' as const, line: 59.5, current: { over: -110, under: -115 } }
  const over = nflWatchlistSelection(player, market, ou, 'over', game)
  const under = nflWatchlistSelection(player, market, ou, 'under', game)
  assert.notEqual(over.prop_key, under.prop_key)
  assert.equal(under.odds, -115)
  assert.equal(under.prop_label, 'Under 59.5 Receiving Yards')
  assert.equal(watchlistPickPayload(under).market_side, 'under')
})
test('BDL identity is preserved when GSIS is absent', () => {
  assert.equal(nflWatchlistSelection({ ...player, gsisId: null }, market, offer, 'over', game).nfl_selection?.player_id, 'bdl:123')
})
test('missing quote cannot be saved as a zero price', () => {
  assert.throws(() => nflWatchlistSelection(player, market, { ...offer, current: {} }, 'over', game), /unavailable/)
})
test('legacy NFL saves fail clearly instead of posting as MLB', () => {
  assert.throws(() => watchlistPickPayload({ sport: 'nfl', player_name: 'Player', prop_key: 'nfl:anytime_td', prop_label: 'TD' }), /re-save/)
})
test('MLB payload remains MLB', () => {
  assert.equal(watchlistPickPayload({ sport: 'mlb', player_name: 'Player', prop_key: 'hr', prop_label: 'HR', mlb_id: 12 }).sport, 'MLB')
})
test('same-number over/under cannot shadow a milestone or vice versa', () => {
  const ou = { ...market, key: 'receiving_yards:over_under:60', offers: [{ ...offer, type: 'over_under' as const, current: { over: -110, under: -110 } }] }
  const boardPlayer = { ...player, markets: [ou, market] }
  assert.equal(findNflPickOffer(boardPlayer, { prop_key: 'receiving_yards', numeric_line: 60, book: 'FanDuel', market_side: 'milestone' })?.offer.current.odds, 270)
  assert.equal(findNflPickOffer(boardPlayer, { prop_key: 'receiving_yards', numeric_line: 60, book: 'FanDuel', market_side: 'under' })?.offer.current.under, -110)
})
test('missing threshold or wrong sportsbook does not pick arbitrary first rung', () => {
  assert.equal(findNflPickOffer(player, { prop_key: 'receiving_yards', book: 'fanduel' }), null)
  assert.equal(findNflPickOffer(player, { prop_key: 'receiving_yards', numeric_line: 60, book: 'draftkings' }), null)
})

test('shared watchlist posting sends NFL metadata to the guarded pick API', async () => {
  const oldFetch = globalThis.fetch
  let sent: any
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, '/api/posts/pick')
    sent = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ id: 'test-post' }), { status: 200 })
  }) as typeof fetch
  try {
    const saved = { ...nflWatchlistSelection(player, market, offer, 'over', game), id: 'test', status: 'pending' } as WatchlistItem
    await postBetToFeed('test-user', [saved])
    assert.equal(sent.sport, 'NFL')
    assert.equal(sent.legs[0].player_id, '00-123')
    assert.equal(sent.legs[0].prop_key, 'receiving_yards')
    assert.equal(sent.legs[0].numeric_line, 60)
    await assert.rejects(postBetToFeed('test-user', [saved, { ...saved, sport: 'mlb' }]), /cannot mix sports/)
  } finally { globalThis.fetch = oldFetch }
})
