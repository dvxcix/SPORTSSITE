import assert from 'node:assert/strict'
import test from 'node:test'
import { createNflPausedProjection, packNflPausedProjection, projectNflPausedBoard, separateNflOpenings, unpackNflPausedProjection, visibleNflObservedOdds } from '../src/lib/nflPausedProjection.ts'
import type { NflMarketOffer, SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'
import { findNflPickOffer } from '../src/lib/nflPickOffer.ts'
import { packSidelineBoard, unpackSidelineBoard } from '../src/lib/sidelineWire.ts'
import { BROWSERBASE_SPENDING_PAUSE_EFFECTIVE_AT, nflLegacyPauseNeedsLastSeen } from '../src/lib/browserbaseSpendingPause.ts'
import { nflWatchlistSelection } from '../src/lib/nflWatchlist.ts'
import { nflUnverifiedScoreInputs } from '../src/lib/nflScoreIntegrity.ts'

const offer = (vendor: string, odds: number, updatedAt: string): NflMarketOffer => ({ vendor, line: 1, openingLine: 1, type: 'milestone', current: { odds }, opening: { odds: 200 }, updatedAt })
const board = (offers: NflMarketOffer[], capturedAt: string): SidelineOddsBoard => ({ bdlGameId: 1, status: 'ready', capturedAt, source: 'live', gameLines: [], players: [{ id: 7, name: 'Example', team: 'CHI', position: 'WR', markets: [{ key: 'first_td:1', propType: 'first_td', label: 'First TD', category: 'touchdowns', line: 1, offers }] }] })

test('projected current excludes a paused-only price and retains its exact original in last seen', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const api = offer('draftkings', 350, '2026-11-02T19:38:00.000Z')
  const original = board([direct, api], '2026-11-02T19:38:00.000Z')
  const base = board([api], '2026-11-02T19:38:00.000Z')
  const before = JSON.stringify(original)
  const marker = createNflPausedProjection(original, base, 'CHI-SEA')
  const result = projectNflPausedBoard(original, marker, 'CHI-SEA')
  assert.deepEqual(result.board.players[0].markets[0].offers, [api])
  assert.deepEqual(result.lastSeen[0].offer, direct)
  assert.equal(JSON.stringify(original), before)
  assert.equal(result.board.capturedAt, base.capturedAt)
})

test('projection restores a same-book current offer rather than suppressing the whole book', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const fresh = offer('fanduel', 410, '2026-11-02T19:38:00.000Z')
  const original = board([direct], '2026-11-02T19:38:00.000Z')
  const result = projectNflPausedBoard(original, createNflPausedProjection(original, board([fresh], '2026-11-02T19:38:00.000Z'), 'CHI-SEA'), 'CHI-SEA')
  assert.deepEqual(result.board.players[0].markets[0].offers, [fresh])
  assert.deepEqual(result.lastSeen[0].offer, direct)
})

test('duplicate and missing projection identities fail closed', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const original = board([direct], '2026-11-02T19:38:00.000Z')
  const base = board([], '2026-11-02T19:38:00.000Z')
  assert.throws(() => createNflPausedProjection(board([direct, direct], original.capturedAt!), base, 'CHI-SEA'), /Ambiguous/)
  const marker = createNflPausedProjection(original, base, 'CHI-SEA')
  marker.offers[0].playerId = 99
  assert.throws(() => projectNflPausedBoard(original, marker, 'CHI-SEA'), /Invalid/)
  const missing = { ...base, players: [{ ...base.players[0], id: 99 }] }
  assert.throws(() => createNflPausedProjection(original, missing, 'CHI-SEA'), /Incomplete/)
})

test('game lines retain exact prior observations and restore current-source lines', () => {
  const base = board([], '2026-11-02T19:38:00.000Z')
  const line = { vendor: 'fanduel', spreadHome: -3, spreadHomeOdds: -110, spreadAway: 3, spreadAwayOdds: -110, moneylineHome: -150, moneylineAway: 125, total: 42, totalOverOdds: -110, totalUnderOdds: -110, opening: null, updatedAt: '2026-11-02T14:05:00.000Z' }
  const original = { ...base, gameLines: [line] }
  const result = projectNflPausedBoard(original, createNflPausedProjection(original, base, 'CHI-SEA'), 'CHI-SEA')
  assert.deepEqual(result.board.gameLines, [])
  assert.deepEqual(result.lastSeenLines, [line])
  assert.deepEqual(original.gameLines, [line])
  const replacement = { ...line, total: 43, updatedAt: '2026-11-02T19:38:00.000Z' }
  const marker = createNflPausedProjection(original, { ...base, gameLines: [replacement] }, 'CHI-SEA')
  assert.deepEqual(projectNflPausedBoard(original, marker, 'CHI-SEA').board.gameLines, [replacement])
  marker.lines[0].replacement!.vendor = 'draftkings'
  assert.throws(() => projectNflPausedBoard(original, marker, 'CHI-SEA'), /line replacement/)
})

test('archived original remains intact and only snapshot-bound metadata drives projection', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const api = offer('draftkings', 350, '2026-11-02T19:38:00.000Z')
  const original = board([direct, api], '2026-11-02T19:38:00.000Z')
  const projection = createNflPausedProjection(original, board([api], original.capturedAt!), 'CHI-SEA')
  const saved = JSON.parse(JSON.stringify({ ...original, pausedProjection: packNflPausedProjection(projection) }))
  const frozen = visibleNflObservedOdds(saved, 'CHI-SEA')
  assert.equal('pausedProjection' in frozen, false)
  assert.deepEqual(frozen.players[0].markets[0].offers, [api])
  assert.deepEqual(frozen.lastSeen?.offers[0].offer, direct)
  assert.deepEqual(saved.players[0].markets[0].offers, [direct, api])
  assert.deepEqual(visibleNflObservedOdds(saved, 'CHI-SEA'), frozen)
  assert.deepEqual(visibleNflObservedOdds(original, 'CHI-SEA'), { ...original, legacyUnverified: true })
})

test('a paused source cannot manufacture current availability', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const original = board([direct], '2026-11-02T14:05:00.000Z')
  const empty = { ...board([], '2026-11-02T19:38:00.000Z'), status: 'unavailable' as const }
  const result = projectNflPausedBoard(original, createNflPausedProjection(original, empty, 'CHI-SEA'), 'CHI-SEA')
  assert.equal(result.board.status, 'unavailable')
  assert.equal(result.board.players[0].markets.length, 0)
  assert.equal(result.lastSeen[0].offer.updatedAt, direct.updatedAt)
})

test('unmarked open fallback is last seen until a marked capture recovers, while frozen history stays exact', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const api = offer('draftkings', 350, '2026-11-02T19:38:00.000Z')
  const old = board([direct, api], '2026-11-02T19:38:00.000Z')
  const unavailable = visibleNflObservedOdds(old, 'CHI-SEA', true)
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(unavailable.players[0].markets.length, 0)
  assert.equal(unavailable.lastSeen?.offers.length, 2)
  assert.deepEqual(visibleNflObservedOdds(old, 'CHI-SEA'), { ...old, legacyUnverified: true })
  const marker = createNflPausedProjection(old, board([api], old.capturedAt!), 'CHI-SEA')
  const recovered = visibleNflObservedOdds({ ...old, pausedProjection: packNflPausedProjection(marker) }, 'CHI-SEA', true)
  assert.equal(recovered.status, 'ready')
  assert.deepEqual(recovered.players[0].markets[0].offers, [api])
  assert.deepEqual(visibleNflObservedOdds({ ...old, pausedProjection: packNflPausedProjection(marker) }, 'CHI-SEA'), recovered)
})

test('a projection cannot cross a game, contract type, line, side or timestamp boundary', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const original = board([direct], '2026-11-02T19:38:00.000Z')
  const marker = createNflPausedProjection(original, board([], original.capturedAt!), 'CHI-SEA')
  assert.throws(() => projectNflPausedBoard(original, marker, 'DEN-CAR'), /game/)
  for (const mutation of [
    { ...direct, type: 'over_under' as const }, { ...direct, line: 2 },
    { ...direct, current: { over: 400 } }, { ...direct, updatedAt: '2026-11-02T14:06:00.000Z' },
  ]) assert.throws(() => projectNflPausedBoard(board([mutation], original.capturedAt!), marker, 'CHI-SEA'), /Invalid/)
})

test('legacy cutoff policy uses the verified immutable pause boundary and rejects unknown cutoff', () => {
  const boundary = Date.parse(BROWSERBASE_SPENDING_PAUSE_EFFECTIVE_AT)
  assert.equal(nflLegacyPauseNeedsLastSeen(boundary - 1), false)
  assert.equal(nflLegacyPauseNeedsLastSeen(boundary), true)
  assert.equal(nflLegacyPauseNeedsLastSeen(boundary + 1), true)
  assert.equal(nflLegacyPauseNeedsLastSeen(NaN), true)
})

test('replacement contracts keep their own type, line, sides and timestamp and reject corrupted metadata', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const fresh = { ...direct, type: 'over_under' as const, line: 1, current: { over: 110, under: -130 }, updatedAt:'2026-11-02T19:38:00.000Z' }
  const original = board([direct], '2026-11-02T19:38:00.000Z')
  const marker = createNflPausedProjection(original, board([fresh], original.capturedAt!), 'CHI-SEA')
  assert.deepEqual(projectNflPausedBoard(original, marker, 'CHI-SEA').board.players[0].markets[0].offers[0], fresh)
  for (const mutation of [
    { ...fresh, vendor:'draftkings' }, { ...fresh, type:'other' },
    { ...fresh, line:NaN }, { ...fresh, line:2.5 }, { ...fresh, current:{ odds:110 } }, { ...fresh, updatedAt:'invalid' },
  ]) {
    const corrupted = structuredClone(marker)
    corrupted.offers[0].replacement = mutation as NflMarketOffer
    assert.throws(() => projectNflPausedBoard(original, corrupted, 'CHI-SEA'), /replacement/)
  }
  const wrongMarket = structuredClone(marker)
  wrongMarket.offers[0].market = { key:'first_td:1',propType:'receiving_yards',label:'First TD',category:'touchdowns',line:1 }
  assert.throws(() => projectNflPausedBoard(original, wrongMarket, 'CHI-SEA'), /replacement/)
})

test('a changed line remains under its own market while the old line is last seen', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const fresh = { ...direct, type: 'over_under' as const, line: 2.5, current: { over: 110, under: -130 }, updatedAt:'2026-11-02T19:38:00.000Z' }
  const original = board([direct], '2026-11-02T19:38:00.000Z')
  const differentMarket = { key:'receiving_yards:2.5',propType:'receiving_yards',label:'Receiving yards',category:'receiving' as const,line:2.5,offers:[fresh] }
  original.players[0].markets.push(differentMarket)
  const current = board([], original.capturedAt!)
  current.players[0].markets = [differentMarket]
  const result = projectNflPausedBoard(original, createNflPausedProjection(original, current, 'CHI-SEA'), 'CHI-SEA')
  assert.deepEqual(result.board.players[0].markets, [differentMarket])
  assert.equal(result.lastSeen[0].offer.line, 1)
})

test('exact pick validation sees current offers, while saved history retains original contracts', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const api = offer('draftkings', 350, '2026-11-02T19:38:00.000Z')
  const original = board([direct, api], '2026-11-02T19:38:00.000Z')
  const saved = { ...original, pausedProjection: packNflPausedProjection(createNflPausedProjection(original, board([api], original.capturedAt!), 'CHI-SEA')) }
  const visible = unpackSidelineBoard(packSidelineBoard(visibleNflObservedOdds(saved, 'CHI-SEA')))
  const pick = { prop_key:'first_td',numeric_line:1,market_side:'milestone' as const,book:'fanduel' }
  assert.ok(findNflPickOffer(saved.players[0], pick))
  assert.equal(findNflPickOffer(visible.players[0], pick), null)
  assert.ok(findNflPickOffer(visible.players[0], { ...pick, book:'draftkings' }))
  assert.equal('pausedProjection' in visible, false)
  assert.equal(visible.lastSeen?.offers[0].offer.updatedAt, direct.updatedAt)
})

test('opening-only player and game prices remain visible as openings, never as current or pickable', () => {
  const opening = { ...offer('fanduel', 400, '2026-11-02T14:05:00.000Z'), isOpeningOnly:true }
  const original = board([opening], '2026-11-02T14:05:00.000Z')
  original.gameLines = [{ vendor:'fanduel',spreadHome:-3,spreadHomeOdds:-110,spreadAway:3,spreadAwayOdds:-110,moneylineHome:-150,moneylineAway:125,total:42,totalOverOdds:-110,totalUnderOdds:-110,opening:null,updatedAt:opening.updatedAt,isOpeningOnly:true }]
  const separated = separateNflOpenings(original)
  assert.equal(separated.players[0].markets.length, 0)
  assert.equal(separated.gameLines.length, 0)
  assert.deepEqual(separated.openingOnly?.offers[0].offer, opening)
  assert.deepEqual(separated.openingOnly?.lines, original.gameLines)
  assert.equal(findNflPickOffer(original.players[0], { prop_key:'first_td',numeric_line:1,market_side:'milestone',book:'fanduel' }), null)
  assert.throws(() => nflWatchlistSelection(original.players[0], original.players[0].markets[0], opening, 'over', {id:'g',gameday:'2026-11-02'}), /unavailable/)
  assert.equal(original.players[0].markets[0].offers[0].current.odds, 400)
})

test('base opening stays visible even when a paused quote had overwritten the same book and contract', () => {
  const direct = offer('fanduel', 400, '2026-11-02T14:05:00.000Z')
  const opening = { ...offer('fanduel', 200, '2026-11-02T12:00:00.000Z'), isOpeningOnly:true }
  const merged = board([direct], '2026-11-02T19:38:00.000Z')
  const base = separateNflOpenings(board([opening], '2026-11-02T19:38:00.000Z'))
  const visible = visibleNflObservedOdds({ ...merged, pausedProjection: packNflPausedProjection(createNflPausedProjection(merged, base, 'CHI-SEA')) }, 'CHI-SEA')
  assert.equal(visible.players[0].markets.length, 0)
  assert.deepEqual(visible.lastSeen?.offers[0].offer, direct)
  assert.deepEqual(visible.openingOnly?.offers[0].offer, opening)
  assert.equal(merged.players[0].markets[0].offers[0], direct)
})

test('compact marker round-trips exact values and rejects malformed references', () => {
  const original = board([offer('fanduel',400,'2026-11-02T14:05:00.000Z')], '2026-11-02T19:38:00.000Z')
  const marker = createNflPausedProjection(original, board([], original.capturedAt!), 'CHI-SEA')
  const packed = packNflPausedProjection(marker)
  assert.deepEqual(unpackNflPausedProjection(packed), { ...marker, openingOnly: undefined })
  const bad = structuredClone(packed);bad.offers[0][1] = 999
  assert.throws(() => unpackNflPausedProjection(bad), /dictionary/)
  const malformedOpening = { ...packed, openingOnly: { offers:[null], lines:[] } }
  assert.throws(() => unpackNflPausedProjection(malformedOpening as unknown as typeof packed), /envelope/)
  const malformedBaseline = { ...packed, baselines: [{ playerId:1,value:[null] }] }
  assert.throws(() => unpackNflPausedProjection(malformedBaseline as unknown as typeof packed), /envelope/)
})

test('missing paused game and player prices cannot produce dependent scores or market ranks', () => {
  const direct=offer('fanduel',400,'2026-11-02T14:05:00.000Z')
  const original=board([direct],'2026-11-02T19:38:00.000Z'), base=board([],original.capturedAt!)
  const line={vendor:'fanduel',spreadHome:-3,spreadHomeOdds:-110,spreadAway:3,spreadAwayOdds:-110,moneylineHome:-150,moneylineAway:125,total:42,totalOverOdds:-110,totalUnderOdds:-110,opening:null,updatedAt:direct.updatedAt}
  original.gameLines=[line]
  const marker=packNflPausedProjection(createNflPausedProjection(original,base,'CHI-SEA'))
  const visible=visibleNflObservedOdds({...original,pausedProjection:marker},'CHI-SEA')
  const missing=nflUnverifiedScoreInputs(visible)
  assert.equal(missing.environment,true);assert.ok(missing.markets.has('first_td'))
  const changed={...direct,current:{odds:410},updatedAt:'2026-11-02T19:38:00.000Z'}
  const refreshed=board([changed],base.capturedAt!);refreshed.gameLines=[{...line,updatedAt:changed.updatedAt}]
  const available=visibleNflObservedOdds({...original,pausedProjection:packNflPausedProjection(createNflPausedProjection(original,refreshed,'CHI-SEA'))},'CHI-SEA')
  assert.equal(nflUnverifiedScoreInputs(available).environment,false)
  assert.equal(nflUnverifiedScoreInputs(available).markets.size,0)
})

