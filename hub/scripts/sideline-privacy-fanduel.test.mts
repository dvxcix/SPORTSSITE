import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sidelinePublicBoard } from '../src/lib/sidelinePublicBoard'
import { nflFdMarket, parseNflFanduel } from '../src/lib/scrapers/nflFanduelMarkets'
import { EMPTY_SIDELINE_ODDS } from '../src/lib/nflOddsTypes'

test('legacy source metadata never reaches browser payloads', () => {
  const raw = { ...EMPTY_SIDELINE_ODDS, pikkitCapturedAt: 'today', sourceUrl: 'https://app.pikkit.com', picksCapturedAt: 'today' }
  const clean = sidelinePublicBoard(raw)
  assert.doesNotMatch(JSON.stringify(clean), /pikkit|sourceUrl/i)
  assert.equal(clean.picksCapturedAt, 'today')
  for (const name of ['SidelineBoardClient.tsx', 'useSidelineMarket.ts', 'sidelineBoard.module.css']) assert.doesNotMatch(readFileSync(new URL(`../src/app/the-sideline/${name}`, import.meta.url), 'utf8'), /pikkit/i)
})
test('NFL touchdown and period categories remain distinct', () => {
  assert.equal(nflFdMarket('First Touchdown Scorer')?.prop, 'first_td')
  assert.equal(nflFdMarket('To Score 2+ Touchdowns')?.prop, 'two_plus_td')
  assert.equal(nflFdMarket('First Half Anytime Touchdown')?.prop, 'anytime_td_1h')
  assert.equal(nflFdMarket('Second Half Passing Yards'), null)
  assert.equal(nflFdMarket('Both Players To Score A Touchdown'), null)
  assert.equal(nflFdMarket('Anytime 1st Half TD Scorer')?.prop, 'anytime_td_1h')
  assert.equal(nflFdMarket('1st Team Touchdown Scorer'), null)
  assert.equal(nflFdMarket('Jadarian Price Drive 1 Rushing Yds SEA Seahawks'), null)
  assert.equal(nflFdMarket('Sam Darnold - Passing TDs')?.prop, 'passing_tds')
  assert.equal(nflFdMarket('Hunter Henry - Receiving Yds')?.prop, 'receiving_yards')
})
test('canonical NFL identity, sides, odds and opening prices import without zero filling', () => {
  const base = { ...EMPTY_SIDELINE_ODDS, players: [{ id: 1, name: 'Hunter Henry', team: 'NE', position: 'TE', markets: [] }] }
  const result = parseNflFanduel([{ scraped_at: '2026-09-09T17:00:00Z', event: { title: 'Patriots @ Seahawks' }, sections: {
    'First Touchdown Scorer': [{ parts: ['First Touchdown Scorer', 'Hunter Henry'], odds: '+1200' }],
    'Receiving Yards': [{ parts: ['Receiving Yards', 'Hunter Henry', 'Over 35.5'], odds: '-110' }, { parts: ['Receiving Yards', 'Hunter Henry', 'Under 35.5'], odds: '-115' }],
  } }], base)
  assert.equal(result.board.players.length, 1)
  const markets = result.board.players[0].markets
  assert.equal(markets[0].offers[0].current.odds, 1200)
  assert.equal(markets[0].key, 'first_td:0.5')
  assert.deepEqual(markets[1].offers[0].current, { over: -110, under: -115 })
  assert.deepEqual(markets[1].offers[0].opening, { over: -110, under: -115 })
})
