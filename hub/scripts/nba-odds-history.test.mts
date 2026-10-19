import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaAttachOpenings, nbaGameEconomicSnapshot, nbaGameQuote, type NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'
import type { PaintGameOdds, PaintProp } from '../src/lib/nbaPaint.ts'
import { nbaMovement } from '../src/lib/nbaMovement.ts'
import { nbaDivergences } from '../src/lib/nbaDivergence.ts'

const prop: PaintProp = { id: 1, game_id: 123, player_id: 434, vendor: 'fanduel', prop_type: 'points', line_value: '20.5', market: { type: 'over_under', over_odds: -110, under_odds: 100 }, updated_at: '2026-10-19T12:00:00Z' }
const opening: NbaQuoteOpeningRow = { game_id: 123, player_id: 434, vendor: 'fanduel', market: 'points', market_type: 'over_under', line: 20.5, side: 'over', odds: 110, observed_at: '2026-10-18T12:00:00Z' }
const game: PaintGameOdds = { id: 2, game_id: 123, vendor: 'fanduel', spread_home_value: '-4.5', spread_away_value: '4.5', spread_home_odds: -110, spread_away_odds: -110, moneyline_home_odds: -170, moneyline_away_odds: 145, total_value: '215.5', total_over_odds: 105, total_under_odds: -120, updated_at: prop.updated_at }

test('first-observed price attaches only to exact game/player/book/market/type/threshold/side', () => {
  const right = nbaAttachOpenings(123, [prop], [], [opening, { ...opening, side: 'under', odds: -125 }]).props[0]
  assert.deepEqual(right.opening, { over: { odds: 110, at: opening.observed_at }, under: { odds: -125, at: opening.observed_at } })
  for (const mismatch of [{ game_id: 124 }, { player_id: 435 }, { vendor: 'draftkings' }, { market: 'points_1q' }, { market_type: 'milestone' }, { line: 21.5 }]) {
    assert.equal(nbaAttachOpenings(123, [prop], [], [{ ...opening, ...mismatch }]).props[0].opening, undefined)
  }
  const unavailable = nbaAttachOpenings(123, [{ ...prop, opening: right.opening }], [], []).props[0]
  assert.equal(unavailable.opening, undefined, 'cannot carry an obsolete enriched opening into another quote')
  assert.equal(nbaAttachOpenings(124, [prop], [], [opening]).props[0].opening, undefined)
  assert.equal(nbaAttachOpenings(123, [prop], [], [{ ...opening, odds: 0 }]).props[0].opening, undefined)
})

test('milestone prices have no invented under and numeric threshold serialization is canonical', () => {
  const milestone = { ...prop, line_value: '20.000', market: { type: 'milestone' as const, odds: 150 } }
  const result = nbaAttachOpenings(123, [milestone], [], [{ ...opening, line: 20, market_type: 'milestone', odds: 170 }, { ...opening, line: 20, market_type: 'milestone', side: 'under' }]).props[0]
  assert.equal(result.opening?.over?.odds, 170)
  assert.equal(result.opening?.under, undefined)
  const earliest = nbaAttachOpenings(123, [prop], [], [{ ...opening, odds: 130, observed_at: '2026-10-19T00:00:00Z' }, opening]).props[0]
  assert.equal(earliest.opening?.over?.odds, 110)
})

test('game prices preserve home/away and over/under identity, exclude changed-threshold price comparisons', () => {
  const rows: NbaQuoteOpeningRow[] = [
    { ...opening, player_id: 0, market_type: 'game', market: 'spread_home', line: -4.5, odds: 100 },
    { ...opening, player_id: 0, market_type: 'game', market: 'spread_away', line: 4.5, odds: -120 },
    { ...opening, player_id: 0, market_type: 'game', market: 'total_over', line: 215.5, odds: -110 },
    { ...opening, player_id: 0, market_type: 'game', market: 'moneyline_home', line: 0, odds: -160 },
  ]
  const attached = nbaAttachOpenings(123, [], [game], rows).gameOdds[0]
  assert.equal(attached.opening?.spread_home?.odds, 100)
  assert.equal(attached.opening?.spread_away?.odds, -120)
  assert.equal(attached.opening?.total_over?.odds, -110)
  assert.equal(attached.opening?.total_under, undefined)
  assert.equal(attached.opening?.moneyline_home?.line, null)
  const movedLine = nbaAttachOpenings(123, [], [{ ...game, spread_home_value: '-5.5', total_value: '217.5' }], rows).gameOdds[0]
  assert.equal(movedLine.opening?.spread_home, undefined)
  assert.equal(movedLine.opening?.total_over, undefined)
  assert.equal(nbaAttachOpenings(123, [], [{ ...game, game_id: 999 }], rows).gameOdds[0].opening, undefined)
  assert.equal(nbaGameQuote({ ...game, total_value: null }, 'total_over').line, null)
})

test('game capture identity ignores provider metadata while preserving every actual quote change', () => {
  const economic = nbaGameEconomicSnapshot(123, [game])
  assert.deepEqual(economic, nbaGameEconomicSnapshot(123, [{ ...game, id: 999, updated_at: '2026-10-20T00:00:00Z', spread_home_value: '-4.50' }]))
  assert.notDeepEqual(economic, nbaGameEconomicSnapshot(123, [{ ...game, total_under_odds: -125 }]))
  assert.notDeepEqual(economic, nbaGameEconomicSnapshot(123, [{ ...game, total_value: '216.5' }]))
  assert.deepEqual(nbaGameEconomicSnapshot(123, [{ ...game, game_id: 999 }]), [])
})

test('Market Story recovers late-listed exact alt opening outside the replay window', () => {
  const frames = [
    { captured_at: '2026-10-18T09:00:00Z', props: [{ ...prop, line_value: '19.5' }] },
    { captured_at: '2026-10-19T12:00:00Z', props: [prop] },
  ]
  const movement = nbaMovement(frames, prop.player_id, 'points', 'fanduel', 'over', [opening])
  assert.equal(movement.points.length, 2)
  assert.equal(movement.priceFirstOdds, 110)
  assert.equal(movement.priceLatestOdds, -110)
  assert.equal(movement.priceFirstAt, opening.observed_at)
  assert.equal(movement.priceOpeningKnown, true)
  assert.ok(movement.priceChange! > 0)
  assert.equal(movement.lineChange, 1)
  assert.equal(nbaMovement(frames.slice(1), prop.player_id, 'points', 'fanduel', 'over', [opening]).priceChange, movement.priceChange, 'one visible point can compare to a genuine earlier opening')
  const earliest = nbaMovement(frames, prop.player_id, 'points', 'fanduel', 'over', [{ ...opening, odds: 130, observed_at: '2026-10-19T10:00:00Z' }, opening])
  assert.equal(earliest.priceFirstOdds, 110)
})

test('replay openings cannot leak future captures or cross exact identity and unavailable latest quotes', () => {
  const frames = [{ captured_at: '2026-10-18T11:00:00Z', props: [prop] }]
  assert.equal(nbaMovement(frames, prop.player_id, 'points', 'fanduel', 'over', [opening]).priceChange, null, 'opening is later than replay position')
  const current = [{ captured_at: '2026-10-19T12:00:00Z', props: [prop] }]
  for (const mismatch of [{ game_id: 124 }, { player_id: 435 }, { vendor: 'draftkings' }, { market: 'points_1q' }, { market_type: 'milestone' }, { line: 21.5 }, { side: 'under' as const }, { odds: 0 }, { observed_at: 'invalid' }]) {
    assert.equal(nbaMovement(current, prop.player_id, 'points', 'fanduel', 'over', [{ ...opening, ...mismatch }]).priceChange, null)
  }
  assert.equal(nbaMovement([...current, { captured_at: '2026-10-19T13:00:00Z', props: [] }], prop.player_id, 'points', 'fanduel', 'over', [opening]).latest, null)
  const window = [{ captured_at: '2026-10-19T10:00:00Z', props: [{ ...prop, market: { ...prop.market, over_odds: 105 } }] }, ...current]
  const fallback = nbaMovement(window, prop.player_id, 'points', 'fanduel')
  assert.equal(fallback.priceFirstOdds, 105)
  assert.equal(fallback.priceOpeningKnown, false)
  assert.equal(fallback.priceFirstAt, window[0].captured_at)
})

test('cross-market scan includes real opposing moves for contracts listed after the first game snapshot', () => {
  const assists = { ...prop, id: 2, prop_type: 'assists', line_value: '5.5', market: { type: 'over_under' as const, over_odds: -140, under_odds: 120 } }
  const frames = [{ captured_at: '2026-10-18T09:00:00Z', props: [] }, { captured_at: '2026-10-19T12:00:00Z', props: [{ ...prop, market: { ...prop.market, over_odds: 150 } }, assists] }]
  const openers: NbaQuoteOpeningRow[] = [{ ...opening, odds: -110 }, { ...opening, market: 'assists', line: 5.5, odds: 120 }]
  const rows = nbaDivergences(frames, [], openers)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'price')
  assert.equal(rows[0].primary, 'points')
  assert.equal(rows[0].other, 'assists')
  assert.equal(rows[0].primaryMovement.priceOpeningKnown, true)
  assert.equal(rows[0].primaryPicks, null)
  assert.equal(nbaDivergences(frames, [], openers.map(row => ({ ...row, observed_at: '2026-10-19T13:00:00Z' }))).length, 0)
})
