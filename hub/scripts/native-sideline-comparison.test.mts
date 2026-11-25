import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeSidelineComparison } from '../src/lib/nativeSidelineComparison'
import { EMPTY_SIDELINE_ODDS, type NflOddsPlayer, type NflPlayerMarket } from '../src/lib/nflOddsTypes'
import type { NflPublicResult } from '../src/lib/nflPublicResults'

const capturedAt = '2026-11-08T23:01:00.000Z'
const yards = (line: number, current: { over?: number; under?: number; odds?: number }, type: 'over_under' | 'milestone'): NflPlayerMarket => ({
  key: `receiving_yards:${line}`, propType: 'receiving_yards', label: 'Receiving yards', category: 'receiving', line,
  offers: [{ vendor: 'fanduel', type, line, current, opening: { under: 110 }, openingLine: line, updatedAt: capturedAt }],
})
const firstTouchdown: NflPlayerMarket = {
  key: 'first_td', propType: 'first_td', label: 'First touchdown', category: 'touchdowns', line: null,
  offers: [{ vendor: 'fanduel', type: 'over_under', line: null, current: { over: 800, under: -1200 }, opening: null,
    openingLine: null, updatedAt: capturedAt }],
}
const receiver: NflOddsPlayer = {
  id: 10, name: 'Fixture Receiver', team: 'TB', position: 'WR',
  markets: [firstTouchdown, yards(42.5, { over: -115, under: -105 }, 'over_under'), yards(60, { odds: 175 }, 'milestone')],
}
const other = { ...receiver, id: 11, name: 'Fixture Tight End', team: 'CHI', position: 'TE' }
const board = { ...EMPTY_SIDELINE_ODDS, source: 'snapshot' as const, capturedAt, players: [receiver, other] }
const final: NflPublicResult = { status: 'final', updatedAt: '2026-11-09T03:00:00.000Z', firstTdKnown: true,
  firstTd: { id: 10, gsisId: null, name: receiver.name, team: receiver.team },
  players: [{ id: 10, name: receiver.name, team: receiver.team, stats: { receiving_yards: 39 } },
    { id: 11, name: other.name, team: 'TB', stats: { receiving_yards: 90 } }] }

test('native NFL comparison scopes athlete identity and ports the primary lines and recorded alternatives', () => {
  const compact = nativeSidelineComparison(board, [11, 10, 99], 'receiving_yards', false, final, 2026)
  assert.deepEqual(compact.rows.map(row => row.id), [11, 10])
  assert.equal(compact.rows[0].finals.length, 0)
  const offers = compact.rows[1].books[0].values
  assert.deepEqual(offers.map(offer => [offer.line, offer.side, offer.price, offer.result?.state]),
    [[42.5, 'over', -115, 'miss'], [42.5, 'under', -105, 'hit']])
  assert.equal(offers[1].opening, 110)
  assert.equal(offers[1].observedAt, capturedAt)
  const full = nativeSidelineComparison(board, [10], 'receiving_yards', true, { ...final, status: 'in_progress' }, 2026)
  assert.deepEqual(full.rows[0].books[0].values.map(offer => offer.line), [42.5, 42.5, 60])
  assert.ok(full.rows[0].books[0].values.every(offer => offer.result === null))
})

test('native NFL comparison grades first touchdown Yes and No separately and suppresses unverified quotes', () => {
  const played = nativeSidelineComparison(board, [10, 11], 'first_td', false, final, 2026)
  assert.deepEqual(played.rows.map(row => row.books[0].values.map(offer => offer.result?.state)), [['hit', 'miss'], ['miss', 'hit']])
  const stale = nativeSidelineComparison({ ...board, availabilityStale: true }, [10], 'first_td', true, final, 2026)
  assert.equal(stale.rows[0].books.length, 0)
  assert.equal(stale.rows[0].first, null)
  const ambiguous = nativeSidelineComparison({ ...board, players: [receiver, { ...other, id: receiver.id }] }, [10], 'first_td', true, final, 2026)
  assert.equal(ambiguous.rows.length, 0)
})
