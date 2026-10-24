import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaOddsDelta } from '../src/lib/nbaOddsDelta.ts'
import { nbaMovement } from '../src/lib/nbaMovement.ts'
import type { PaintProp } from '../src/lib/nbaPaint.ts'
import { nbaPrice, nbaTarget, nbaSelectionKey, parseNbaSelection } from '../src/lib/nbaPaint.ts'
import { nbaNormalizePrimaryProp, nbaNormalizePrimaryProps } from '../src/lib/nbaPrimaryProps.ts'
import { nbaAttachOpenings, type NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'
import { nbaSelectedProps } from '../src/lib/nbaMarketSelection.ts'

const quote = (vendor: string, line: string, over = -110, under = -110): PaintProp => ({ id: Number(line) * 10, game_id: 123, player_id: 1, vendor, prop_type: 'points', line_value: line, market: { type: 'over_under', over_odds: over, under_odds: under }, updated_at: '2026-10-19T00:00:00Z' })

test('verified BetMGM half-point points quotes retain their actual Over lines and prices, never invented Under offers',()=>{
  const samples=[[17896038,'9.5',-135],[375,'21.5',-111],[9,'13.5',-105],[38017721,'13.5',-105],[322,'26.5',-105]] as const
  const raw=samples.map(([player_id,line,odds])=>({...quote('betmgm',line),game_id:21717947,player_id,market:{type:'milestone' as const,odds}}))
  const before=structuredClone(raw),normalized=nbaNormalizePrimaryProps(raw)
  assert.deepEqual(raw,before,'raw provider inputs remain unchanged')
  for(const [index,offer] of normalized.entries()){
    const [id,line,odds]=samples[index]
    assert.equal(offer.player_id,id);assert.equal(offer.line_value,line)
    assert.deepEqual(offer.market,{type:'over_under',over_odds:odds})
    assert.equal(nbaPrice(offer,'over'),odds);assert.equal(nbaPrice(offer,'under'),undefined)
    assert.equal(nbaTarget(offer),`O ${line}`)
    assert.equal(nbaSelectedProps([offer],'points',{type:'milestone'}).length,0)
    assert.equal(nbaSelectedProps([offer],'points',{type:'over_under',line:Number(line)})[0],offer)
    assert.deepEqual(parseNbaSelection(nbaSelectionKey(id,offer,'over')),{player_id:`bdl:${id}`,prop_key:'points',numeric_line:Number(line),market_side:'over',type:'over_under'})
    assert.equal(nbaNormalizePrimaryProp(offer),offer,'normalization is idempotent')
  }
})

test('the BetMGM correction never guesses another book, stat, integer milestone or conflicting price shape',()=>{
  const raw:PaintProp={...quote('betmgm','9.5'),market:{type:'milestone',odds:-135}}
  const untouched:PaintProp[]=[
    {...raw,vendor:'draftkings'},{...raw,vendor:'fanduel'},
    ...['rebounds','assists','points_1q','points_rebounds','first_score','double_double'].map(prop_type=>({...raw,prop_type})),
    ...['10','9.25','0','-1.5','not-a-line'].map(line_value=>({...raw,line_value})),
    {...raw,market:{type:'over_under',over_odds:-135,under_odds:115}},
    {...raw,market:{type:'milestone',odds:-135,over_odds:-125}},
    {...raw,market:{type:'milestone',odds:-135,under_odds:115}},
    {...raw,market:{type:'milestone',odds:50}},
  ]
  for(const offer of untouched)assert.equal(nbaNormalizePrimaryProp(offer),offer)
})

test('corrected BetMGM O/U contracts cannot inherit old milestone openings or price movement',()=>{
  const old:PaintProp={...quote('betmgm','9.5'),market:{type:'milestone',odds:-135},opening:{over:{odds:150,at:'2026-10-18T23:00:00Z'}}}
  const corrected=nbaNormalizePrimaryProp(old),previousKey=nbaSelectionKey(old.player_id,old,'over')
  assert.equal(corrected.opening,undefined)
  assert.notEqual(nbaSelectionKey(corrected.player_id,corrected,'over'),previousKey)
  const opening:NbaQuoteOpeningRow={game_id:123,player_id:1,vendor:'betmgm',market:'points',market_type:'milestone',line:9.5,side:'over',odds:150,observed_at:'2026-10-18T23:00:00Z'}
  assert.equal(nbaAttachOpenings(123,[corrected],[],[opening]).props[0].opening,undefined)
  const frames=[{captured_at:'2026-10-19T00:00:00Z',props:[old]},{captured_at:'2026-10-19T01:00:00Z',props:[corrected]}]
  const first=nbaMovement(frames,1,'points','betmgm','over',[opening])
  assert.equal(first.latest?.type,'over_under');assert.equal(first.priceChange,null);assert.equal(first.priceOpeningKnown,false)
  const next={...corrected,market:{type:'over_under' as const,over_odds:-150}}
  const ownOpening={...opening,market_type:'over_under',odds:-135,observed_at:'2026-10-19T01:00:00Z'}
  const moved=nbaMovement([...frames,{captured_at:'2026-10-19T02:00:00Z',props:[next]}],1,'points','betmgm','over',[opening,ownOpening])
  assert.equal(moved.priceFirstOdds,-135);assert.equal(moved.priceFirstAt,ownOpening.observed_at);assert.ok(moved.priceChange!>0)
  assert.equal(old.market.type,'milestone','existing archived input remains unchanged')
})

test('NBA odds delta handles shortening, lengthening, even-money crossing and unknowns', () => {
  assert.equal(nbaOddsDelta(120, -120)?.direction, 'shorter')
  assert.ok(Math.abs(nbaOddsDelta(120, -120)!.pp - 9.09090909) < 1e-6)
  assert.equal(nbaOddsDelta(-120, 120)?.direction, 'longer')
  assert.equal(nbaOddsDelta(-110, -120)?.direction, 'shorter')
  assert.equal(nbaOddsDelta(300, 400)?.direction, 'longer')
  assert.deepEqual(nbaOddsDelta(-100, 100), { pp: 0, direction: 'flat' })
  assert.deepEqual(nbaOddsDelta(-110, -110), { pp: 0, direction: 'flat' })
  for (const unknown of [null, undefined, NaN, Infinity, 0, 50]) {
    assert.equal(nbaOddsDelta(unknown, -110), null)
    assert.equal(nbaOddsDelta(-110, unknown), null)
  }
})

test('another sportsbook cannot manufacture NBA reference-line movement', () => {
  const own = [quote('fanduel', '20.5'), quote('fanduel', '21.5', 120, -140)]
  const result = nbaMovement([
    { captured_at: '2026-10-19T01:00:00Z', props: [...own, quote('draftkings', '20.5'), quote('betmgm', '20.5')] },
    { captured_at: '2026-10-19T02:00:00Z', props: [...own, quote('draftkings', '21.5'), quote('betmgm', '21.5')] },
  ], 1, 'points', 'fanduel')
  assert.equal(result.lineChange, 0)
  assert.equal(result.priceChange, 0)
  assert.deepEqual(result.points.map(point => point.line), [20.5, 20.5])
})

test('NBA line movement and same-threshold price movement stay independent', () => {
  const frames = [
    { captured_at: '2026-10-19T01:00:00Z', props: [quote('fanduel', '20.5')] },
    { captured_at: '2026-10-19T02:00:00Z', props: [quote('fanduel', '21.5', -120, 100)] },
  ]
  const result = nbaMovement(frames, 1, 'points', 'fanduel')
  assert.equal(result.lineChange, 1)
  assert.equal(result.priceChange, null, 'a new threshold has no earlier comparable price')
  assert.equal(nbaMovement([...frames, { captured_at: '2026-10-19T03:00:00Z', props: [] }], 1, 'points', 'fanduel').latest, null, 'removed markets are not presented as current')
})

test('quarter milestone history remains available with book-local reference selection', () => {
  const first = { ...quote('fanduel', '5'), prop_type: 'points_1q', market: { type: 'milestone' as const, odds: 120 } }
  const result = nbaMovement([
    { captured_at: '2026-10-19T01:00:00Z', props: [first] },
    { captured_at: '2026-10-19T02:00:00Z', props: [{ ...first, market: { ...first.market, odds: 150 } }] },
  ], 1, 'points_1q', 'fanduel')
  assert.equal(result.latest?.line, 5)
  assert.equal(result.lineChange, 0)
  assert.equal(result.priceFirstOdds, 120)
  assert.equal(result.priceLatestOdds, 150)
  assert.ok(result.priceChange! < 0)
})
