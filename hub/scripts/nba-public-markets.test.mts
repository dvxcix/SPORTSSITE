import assert from 'node:assert/strict'
import test from 'node:test'
import { NBA_PUBLIC_MARKETS, NBA_PUBLIC_VERSION, nbaPublicMarket, nbaPublicPaintMarket, nbaPublicPrevious, nbaPublicRowAt, normalizeNbaPublic, type NbaPublicCapture } from '../src/lib/nbaPublic.ts'
import { nbaBuildMarketContext } from '../src/lib/nbaMarketSignal.ts'
import { nbaDivergences } from '../src/lib/nbaDivergence.ts'
import type { PaintProp, PaintRoster } from '../src/lib/nbaPaint.ts'
import type { NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'

const roster=[{id:1,first_name:'Chet',last_name:'Holmgren'},{id:2,first_name:'Wendell',last_name:'Carter Jr.'}] as PaintRoster[]

test('observed Ron Holland II public labels preserve verified zero counts across all five affected markets',()=>{
  const holland={id:1028026508,first_name:'Ronald',last_name:'Holland II'} as PaintRoster
  // Retained 2026-10-25 22:42 UTC source rows, not invented historical observations.
  const props={Points:{'Ron Holland II Points':0},Rebounds:{'Ron Holland II Rebounds':0},Combos:{'Ron Holland II PR (Points + Rebounds)':0},'Double Double':{'Ron Holland II Double Double':0},'First Basket':{'Ron Holland II First Field Goal':0}}
  const result=normalizeNbaPublic(props,[holland])
  assert.equal(result.unmatched,0)
  assert.deepEqual(result.rows.map(row=>[row.playerId,row.market,row.picks]),['double_double','first_field_goal','points','points_rebounds','rebounds'].map(market=>[holland.id,market,0]))
  for(const roster of [[],[{...holland,id:999}],[{...holland,first_name:'Other'}],[holland,{...holland,id:999,first_name:'Ron'}]]){
    const rejected=normalizeNbaPublic(props,roster)
    assert.deepEqual(rejected.rows,[]);assert.equal(rejected.unmatched,5)
  }
})

test('verified display aliases require the exact roster ID and canonical name',()=>{
  // Primary identity evidence: NBA /player/1642259/alexandre-sarr (Alex Sarr),
  // Rutgers /sports/mens-basketball/roster/airious--ace--bailey/14341,
  // NBA /player/1641713/gg-jackson/bio (first name Gregory). Ousmane is the
  // observed short label in the exact MIL roster, pinned to Dieng's provider ID.
  const identities=[
    {id:38017716,first_name:'Ousmane',last_name:'Dieng',alias:'Ousmane'},
    {id:1028028405,first_name:'Alexandre',last_name:'Sarr',alias:'Alex Sarr'},
    {id:1057260888,first_name:'Airious',last_name:'Bailey',alias:'Ace Bailey'},
    {id:56677830,first_name:'GG',last_name:'Jackson',alias:'Gregory Jackson'},
  ]
  const props={Points:Object.fromEntries(identities.map((p,i)=>[`${p.alias} Points`,i])), 'First Basket':Object.fromEntries(identities.map((p,i)=>[`${p.alias} First Field Goal`,i]))}
  const matched=normalizeNbaPublic(props,identities as unknown as PaintRoster[])
  assert.equal(matched.rows.length,8);assert.equal(matched.unmatched,0)
  assert.deepEqual(new Set(matched.rows.map(row=>row.playerId)),new Set(identities.map(row=>row.id)))
  for(const invalid of [identities.map(p=>({...p,id:p.id+1})),identities.map(p=>({...p,first_name:'Different'})),[]]){
    const result=normalizeNbaPublic(props,invalid as unknown as PaintRoster[])
    assert.equal(result.rows.length,0);assert.equal(result.unmatched,8)
  }
  const shortCollision=[...identities,{id:999,first_name:'Ousmane',last_name:'Other'}] as unknown as PaintRoster[]
  assert.equal(normalizeNbaPublic({Points:{'Ousmane Points':8}},shortCollision).unmatched,1)
  const fullCollision=[...identities,{id:999,first_name:'Alex',last_name:'Sarr'}] as unknown as PaintRoster[]
  assert.equal(normalizeNbaPublic({Points:{'Alex Sarr Points':8}},fullCollision).unmatched,1)
  assert.equal(normalizeNbaPublic({Points:{'Greg Jackson Points':8}},identities as unknown as PaintRoster[]).unmatched,1)
})

test('binary affirmative suffixes and prefixes import without adding negative-side counts',()=>{
  const result=normalizeNbaPublic({'Double Double':{'Chet Holmgren Double Double Yes':7,'Chet Holmgren Double Double No':90},'Triple Double':{'Yes · Chet Holmgren Triple Double':2,'No · Chet Holmgren Triple Double':99}},roster)
  assert.deepEqual(result.rows,[{playerId:1,market:'double_double',picks:7},{playerId:1,market:'triple_double',picks:2}])
  assert.equal(result.unmatched,0)
  assert.equal(normalizeNbaPublic({'Double Double No':{'Chet Holmgren':90}},roster).rows.length,0)
  assert.equal(normalizeNbaPublic({'Points':{'Chet Holmgren Points Yes':7}},roster).rows.length,0)
})

test('Combos resolves exact combined-stat suffixes and rejects bare or unrelated rows',()=>{
  const result=normalizeNbaPublic({Combos:{'Chet Holmgren Points + Rebounds + Assists':40,'Chet Holmgren Pts + Reb':30,'Chet Holmgren Points + Assists':20,'Chet Holmgren Reb + Ast':10,'Chet Holmgren':90,'Chet Holmgren Points':80}},roster)
  assert.deepEqual(result.rows.map(row=>[row.market,row.picks]),[['points_assists',20],['points_rebounds',30],['points_rebounds_assists',40],['rebounds_assists',10]])
  assert.equal(result.unmatched,2)
})

test('live captured combo abbreviations resolve all five exact markets, retaining a zero SB count',()=>{
  const result=normalizeNbaPublic({Combos:{
    'Chet Holmgren PRA (Points + Rebounds + Assists)':41,
    'Chet Holmgren PR (Points + Rebounds)':31,
    'Chet Holmgren PA (Points + Assists)':21,
    'Chet Holmgren RA (Rebounds + Assists)':11,
    'Chet Holmgren SB (Steals + Blocks)':0,
    'Chet Holmgren PA (Points + Rebounds)':999,
  }},roster)
  assert.deepEqual(result.rows.map(row=>[row.market,row.picks]),[['points_assists',21],['points_rebounds',31],['points_rebounds_assists',41],['rebounds_assists',11],['steals_blocks',0]])
  assert.equal(result.unmatched,1,'mismatched abbreviation must not be guessed')
  assert.equal(nbaPublicPaintMarket('steals_blocks'),undefined)
  assert.equal(nbaPublicMarket('Steals + Blocks'),'steals_blocks')
  assert.equal(NBA_PUBLIC_MARKETS.find(row=>row.key==='steals_blocks')?.label,'Steals + Blocks')
})

test('First Basket identities stay distinct and bare group totals never become player counts',()=>{
  const result=normalizeNbaPublic({'First Basket':{'Wendell Carter Jr. · First Basket (Incl. FT)':380,'Chet Holmgren First Basket':4,'Chet Holmgren First Field Goal':77,'First Field Goal':1000,'First Basket (Incl. FT)':2000}},roster)
  assert.deepEqual(result.rows,[{playerId:1,market:'first_basket',picks:4},{playerId:1,market:'first_field_goal',picks:77},{playerId:2,market:'first_basket_including_ft',picks:380}])
  assert.equal(result.unmatched,2,'group totals without a player never become player counts')
  assert.equal(nbaPublicMarket('First Basket (Incl. FT)'),'first_basket_including_ft')
  assert.equal(nbaPublicMarket('First Field Goal'),'first_field_goal')
  assert.equal(nbaPublicPaintMarket('first_basket'),undefined)
  assert.equal(nbaPublicPaintMarket('first_field_goal'),undefined)
  assert.equal(NBA_PUBLIC_MARKETS.find(row=>row.key==='first_basket_including_ft')?.label,'First basket · Incl. FT')
})

test('zero, missing baseline and carried exact-market baseline remain distinct',()=>{
  assert.deepEqual(normalizeNbaPublic({Points:{'Chet Holmgren':0}},roster).rows,[{playerId:1,market:'points',picks:0}])
  const previous={rows:[{playerId:1,market:'points' as const,picks:90}]}
  const first={playerId:1,market:'points' as const,picks:0,previous:null,capturedAt:'2026-10-24T10:00:00Z'}
  assert.equal(nbaPublicPrevious(first,previous),null,'explicit first baseline must not fall back to an unrelated frame')
  const carried={...first,picks:12,previous:0,previousAt:'2026-10-24T09:00:00Z'}
  assert.equal(nbaPublicPrevious(carried,previous),0)
  assert.equal(carried.picks-nbaPublicPrevious(carried,previous)!,12)
  assert.equal(nbaPublicRowAt(carried,{capturedAt:'2026-10-24T11:00:00Z'}),first.capturedAt)
  assert.equal(nbaPublicPrevious({playerId:2,market:'points',picks:4},previous),null)
  assert.equal(nbaPublicPrevious({playerId:1,market:'points',picks:0},previous),90)
})

const firstAt='2026-10-24T10:00:00Z',latestAt='2026-10-24T12:00:00Z'
const points:PaintProp={id:1,game_id:42,player_id:1,vendor:'fanduel',prop_type:'points',line_value:'20.5',market:{type:'over_under',over_odds:130,under_odds:-150},updated_at:latestAt}
const assists:PaintProp={...points,id:2,prop_type:'assists',line_value:'5.5',market:{type:'over_under',over_odds:-150,under_odds:130}}
const openings=[{...points,odds:-120},{...assists,odds:130}].map((quote):NbaQuoteOpeningRow=>({game_id:42,player_id:1,vendor:quote.vendor,market:quote.prop_type,market_type:'over_under',line:Number(quote.line_value),side:'over',odds:quote.odds,observed_at:firstAt}))
const publicCapture:NbaPublicCapture={gameId:42,capturedAt:'2026-10-24T11:59:00Z',sourceUrl:'private',normalizationVersion:NBA_PUBLIC_VERSION,unmatched:0,markets:['points','assists'],rows:[{playerId:1,market:'points',picks:20,capturedAt:'2026-10-24T11:59:00Z'},{playerId:1,market:'assists',picks:80,capturedAt:'2026-10-24T11:30:00Z'}]}
const contextInput={gameId:42,asOf:'2026-10-24T12:10:00Z',tipAt:'2026-10-24T13:00:00Z',frame:{captured_at:latestAt,props:[points,assists]},openings,publicCapture,publicVerifiedAt:'2026-10-24T12:00:00Z'}

test('fresh sibling captures cannot freshen stale, future or wrong-phase public signal rows',()=>{
  const valid=nbaBuildMarketContext(contextInput)
  assert.equal(valid.signals.length,1)
  assert.equal(valid.publicObservedAt,'2026-10-24T11:30:00Z')
  for(const capturedAt of ['2026-10-24T10:00:00Z','2026-10-24T12:01:00Z','2026-10-24T13:01:00Z','bad']){
    const changed={...publicCapture,rows:publicCapture.rows.map(row=>row.market==='assists'?{...row,capturedAt}:row)}
    assert.equal(nbaBuildMarketContext({...contextInput,publicCapture:changed}).signals.length,0,capturedAt)
  }
  const unknown={...publicCapture,rows:publicCapture.rows.map(row=>({...row,normalizationVersion:'unknown'}))}
  assert.equal(nbaBuildMarketContext({...contextInput,publicCapture:unknown}).signals.length,0)
})

test('cross-market counts retain their own timestamps and do not inherit a sibling capture window',()=>{
  const frames=[{captured_at:firstAt,props:[{...points,market:{...points.market,over_odds:-120}},{...assists,market:{...assists.market,over_odds:130}}]},{captured_at:latestAt,props:[points,assists]}]
  const valid=nbaDivergences(frames,[publicCapture])[0]
  assert.equal(valid.otherPublicCapturedAt,'2026-10-24T11:30:00Z')
  assert.equal(valid.publicCapturedAt,'2026-10-24T11:30:00Z')
  for(const capturedAt of ['2026-10-24T09:00:00Z','2026-10-24T12:01:00Z','bad']){
    const changed={...publicCapture,rows:publicCapture.rows.map(row=>row.market==='assists'?{...row,capturedAt}:row)}
    const result=nbaDivergences(frames,[changed])[0]
    assert.equal(result.primaryPicks,20)
    assert.equal(result.otherPicks,null)
    assert.equal(result.publicHeavierElsewhere,null)
  }
})
