import test from 'node:test'
import assert from 'node:assert/strict'
import { nflSampleReference, parseNflSample } from '../src/lib/nflSample.ts'
import { nflPrimaryMarket } from '../src/lib/nflPrimaryMarket.ts'
import { americanImpliedProbability, hiddenProbabilityPoints, nflPriceChange } from '../src/lib/nflMarketMath.ts'
import type { NflOddsPlayer } from '../src/lib/nflOddsTypes.ts'

test('TD price percentages do not jump at even money', () => {
  assert.equal(nflPriceChange(-100, 100), 0)
  assert.equal(nflPriceChange(100, -100), 0)
  assert.equal(nflPriceChange(200, 400), -0.5)
  assert.equal(nflPriceChange(1.5, 100), null)
  assert.ok(Math.abs(nflPriceChange(-150, 150)! + 5 / 9) < 1e-10)
})

test('season selections never mix preseason and regular-season references', () => {
  assert.deepEqual(nflSampleReference(2026, 'previous'), {season:2025,phase:'REG',bdlPhase:2,label:'2025 regular season'})
  assert.deepEqual(nflSampleReference(2026, 'preseason'), {season:2026,phase:'PRE',bdlPhase:1,label:'2026 preseason'})
  assert.deepEqual(nflSampleReference(2026, 'regular'), {season:2026,phase:'REG',bdlPhase:2,label:'2026 regular season'})
  assert.equal(parseNflSample('invalid'), 'previous')
})
test('primary anytime TD ignores earlier multi-TD alternates and respects the sportsbook', () => {
  const player: NflOddsPlayer = {id:1,name:'Runner',team:'NE',position:'RB',markets:[]}
  for (const [line, odds, vendor] of [[2,2500,'fanduel'],[0.5,120,'draftkings'],[0.5,140,'fanduel']] as const) {
    player.markets.push({key:vendor+line,propType:'anytime_td',label:'TD',category:'touchdowns',line,offers:[{vendor,type:'milestone',line,openingLine:line,opening:null,current:{odds},updatedAt:null}]})
  }
  assert.equal(nflPrimaryMarket(player,'anytime_td','fanduel')?.offers[0].current.odds,140)
  player.markets = player.markets.filter(m=>m.line===2)
  assert.equal(nflPrimaryMarket(player,'anytime_td','fanduel'),null)
})
test('invalid fractional/zero American prices cannot become exaggerated probabilities', () => {
  for (const price of [0,1.5,-0.5,99,NaN,Infinity]) assert.equal(americanImpliedProbability(price),null)
  assert.equal(americanImpliedProbability(100),0.5)
  assert.equal(americanImpliedProbability(-100),0.5)
  assert.equal(hiddenProbabilityPoints(NaN,0.5),null)
  assert.equal(hiddenProbabilityPoints(50,0.5),null)
})
