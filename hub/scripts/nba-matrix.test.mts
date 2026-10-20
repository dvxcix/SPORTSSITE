import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateNbaMatrix, nbaMatrixCandidates, nbaMatrixFactorMatches, nbaMatrixOffer, validateNbaMatrixDefinition, NBA_MATRIX_FIELDS, NBA_MATRIX_PROP_TYPES, type NbaMatrix, type NbaMatrixFactor, type NbaMatrixPipelineStep } from '../src/lib/nbaMatrix.ts'
import type { PaintBoard, PaintPlayer, PaintProp, PaintStat } from '../src/lib/nbaPaint.ts'

const home = { id: 1, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, away = { id: 2, abbreviation: 'DET', full_name: 'Detroit Pistons', name: 'Pistons' }
const factor = (patch: Partial<NbaMatrixFactor> = {}): NbaMatrixFactor => ({ id:'f', category:'market', field:'market', operator:'up', value:null, window:'l10', vendor:'fanduel', propType:'points', marketValue:'probability_move', marketLine:15, marketKind:'milestone', marketSide:'over', location:'all', ...patch })
const quote = (patch: Partial<PaintProp> = {}): PaintProp => ({ id:1, game_id:9, player_id:1, vendor:'fanduel', prop_type:'points', line_value:'15', market:{type:'milestone',odds:150}, opening:{over:{odds:200,at:'2026-10-20T10:00:00Z'}}, updated_at:'2026-10-20T11:00:00Z', ...patch })
const log = (id: number, pts: number, homeGame = true): PaintStat => ({ id, player:{id:1},team:{id:1}, game:{id,status:'Final',date:`2026-10-${String(id).padStart(2,'0')}`,home_team_id:homeGame?1:2,visitor_team_id:homeGame?2:1}, min:'30:00', pts,reb:8,ast:4,fg3m:2,stl:1,blk:1,turnover:2,fga:15,fgm:8,fg3a:6,fta:5,ftm:4 })
const player = (patch: Partial<PaintPlayer> = {}): PaintPlayer => ({ id:1,first_name:'Test',last_name:'Player',team:home,position:'G',headshot:null,injury:null,average:{pts:18,min:30},logs:[log(10,10),log(11,20,false),log(12,30)],props:[quote()], ...patch })
const board = (players = [player()]): PaintBoard => ({game:{id:9,date:'2026-10-20',season:2026,status:'Scheduled',datetime:'2026-10-20T23:00:00Z',period:0,home_team:home,visitor_team:away,home_team_score:0,visitor_team_score:0},players,sampleSeason:2026,historical:false,sampleEnd:'2026-10-19',fetchedAt:'2026-10-20T11:00:00Z',issues:[],statsComplete:true})
const matrix = (patch: Partial<NbaMatrix> = {}): NbaMatrix => ({id:'m',name:'NBA',color:'#a7ff3f',priority:0,enabled:true,matrix_type:'classic',match_mode:'all',match_any_count:1,pipeline_scope:'team',definition:{factors:[factor()]},element_code:'NBA-12345678',...patch})
const step = (patch: Partial<NbaMatrixPipelineStep> = {}): NbaMatrixPipelineStep => ({...factor(),kind:'filter',join:'and',direction:'highest',scope:'team',keep:1,...patch})

test('NBA matrices use the exact milestone and sportsbook for signed probability movement',()=>{
  const p=player({props:[quote(),quote({id:2,line_value:'20',market:{type:'milestone',odds:900}}),quote({id:3,vendor:'draftkings',market:{type:'milestone',odds:100}})]})
  const c=nbaMatrixCandidates(board([p]))[0]
  assert.ok(Math.abs(c.values(factor())!-6.6666667)<.00001)
  assert.equal(nbaMatrixOffer(p,factor())?.id,1)
  assert.equal(nbaMatrixOffer(p,factor({marketLine:25})),null)
  assert.equal(c.values(factor({marketValue:'move'})),-50)
})
test('unknown, same-observation and withdrawn prices never become flat movement',()=>{
  for(const props of [[],[quote({opening:undefined})],[quote({opening:{over:{odds:150,at:'2026-10-20T11:00:00Z'}}})]]){
    const c=nbaMatrixCandidates(board([player({props})]))[0]
    assert.equal(c.values(factor()),null)
    assert.equal(nbaMatrixFactorMatches(c,factor({operator:'flat'})),false)
  }
})
test('best available compares payouts only within the exact selected target',()=>{
  const p=player({props:[quote({market:{type:'milestone',odds:140}}),quote({id:2,vendor:'draftkings',market:{type:'milestone',odds:200}}),quote({id:3,line_value:'20',market:{type:'milestone',odds:600}})]})
  assert.equal(nbaMatrixOffer(p,factor({vendor:null}))?.id,2)
})
test('score criteria requiring an exact market cannot match a player without that quote',()=>{
  const c=nbaMatrixCandidates(board())[0]
  assert.equal(c.values(factor({category:'score',field:'index',marketLine:25})),null)
  assert.equal(c.values(factor({category:'score',field:'mm',marketLine:25})),null)
})
test('first basket, first FG and first method remain distinct exact binary contracts',()=>{
  const props=['first_score','first_field_goal','first_score_dunk'].map((type,i)=>quote({id:i+1,prop_type:type,line_value:'.5',market:{type:'over_under',over_odds:500+i*100}}))
  const p=player({props}),f=factor({propType:'first_score_dunk',marketKind:'over_under',marketLine:.5,marketValue:'current'})
  assert.equal(nbaMatrixOffer(p,f)?.id,3)
  assert.equal(nbaMatrixCandidates(board([p]))[0].values(f),700)
  assert.equal(nbaMatrixCandidates(board([p]))[0].values({...f,marketSide:'under'}),null)
})
test('all posted first-three-minute markets can be selected without using box-score totals',()=>{
  for(const key of ['points_first3min','rebounds_first3min','assists_first3min']){
    assert.ok(NBA_MATRIX_PROP_TYPES.some(m=>m[0]===key))
    assert.ok(!NBA_MATRIX_FIELDS.some(m=>m.category==='stats'&&m.field===key))
    const c=nbaMatrixCandidates(board([player({props:[quote({prop_type:key,line_value:'2'})]})]))[0]
    assert.equal(c.values(factor({propType:key,marketLine:2,marketValue:'current'})),150)
    assert.equal(c.values(factor({propType:key,marketLine:2,marketValue:'hit_rate'})),null)
  }
})
test('classic ALL/ANY combines across different markets and keeps unknowns unmatched',()=>{
  const candidates=[{id:'a',team:'BOS',values:(f:NbaMatrixFactor)=>f.propType==='points'?8:-4},{id:'b',team:'BOS',values:(f:NbaMatrixFactor)=>f.propType==='points'?2:3},{id:'c',team:'DET',values:()=>null}]
  const factors=[factor(),factor({propType:'rebounds',marketLine:6,operator:'down'})]
  assert.deepEqual([...evaluateNbaMatrix(matrix({definition:{factors}}),candidates)],['a'])
  assert.deepEqual([...evaluateNbaMatrix(matrix({definition:{factors},match_mode:'any'}),candidates)],['a','b'])
  assert.deepEqual([...evaluateNbaMatrix(matrix({definition:{factors},match_mode:'any',match_any_count:2}),candidates)],['a'])
})
test('pipelines support ordered filters, OR, per-team ranking and lengthened sorting',()=>{
  const candidates=[{id:'a',team:'BOS',values:()=>8},{id:'b',team:'BOS',values:()=>-9},{id:'c',team:'DET',values:()=>-4}]
  const steps=[step({operator:'up'}),step({operator:'down',join:'or'}),step({kind:'rank',direction:'lowest',scope:'team'})]
  assert.deepEqual([...evaluateNbaMatrix(matrix({matrix_type:'pipeline',definition:{steps}}),candidates)],['b','c'])
  assert.deepEqual([...evaluateNbaMatrix(matrix({matrix_type:'pipeline',definition:{steps:[...steps.slice(0,2),{...steps[2],scope:'game'}]}}),candidates)],['b'])
})
test('Group and Unless suppress only the scoped surviving pool; subsequent OR cannot resurrect removed players',()=>{
  const candidates=[{id:'a',team:'BOS',values:()=>8},{id:'b',team:'BOS',values:()=>-9},{id:'c',team:'DET',values:()=>-4}]
  const steps=[step({kind:'group',scope:'team'}),step({kind:'unless',operator:'up'}),step({operator:'is_available',join:'or'})]
  assert.deepEqual([...evaluateNbaMatrix(matrix({matrix_type:'pipeline',definition:{steps}}),candidates)],['c'])
  assert.deepEqual([...evaluateNbaMatrix(matrix({enabled:false,matrix_type:'pipeline',definition:{steps}}),candidates)],[])
})
test('stat windows and home/away splits exclude the current game and future samples',()=>{
  const p=player({logs:[log(10,10),log(11,20,false),log(12,30),log(20,100),log(21,100)]}),c=nbaMatrixCandidates(board([p]))[0]
  assert.equal(c.values(factor({category:'stats',field:'points',window:'l1'})),30)
  assert.equal(c.values(factor({category:'stats',field:'points',window:'l3',location:'home'})),20)
  assert.equal(c.values(factor({category:'stats',field:'points',window:'l3',location:'away'})),20)
  assert.equal(c.values(factor({category:'stats',field:'minutes',window:'l1'})),30)
})
test('available tracking metrics preserve zero and percentages while missing data stays null',()=>{
  const c=nbaMatrixCandidates(board(),{tracking:[{id:1,gameId:12,playerId:1,teamId:1,values:{usage_percentage:.25,deflections:0}}]})[0]
  assert.equal(c.values(factor({category:'tracking',field:'usage_percentage',window:'l1'})),25)
  assert.equal(c.values(factor({category:'tracking',field:'deflections',window:'l1'})),0)
  assert.equal(c.values(factor({category:'tracking',field:'not_loaded',window:'l1'})),null)
})
test('server validation rejects cross-sport fields, malformed binary contracts, nonfinite values and impossible sides',()=>{
  for(const f of [factor({propType:'anytime_td'}),factor({category:'stats',field:'barrelPct'}),factor({value:Infinity,operator:'gte'}),factor({marketSide:'under'}),factor({propType:'first_score',marketLine:15}),factor({category:'tracking',field:'__proto__'})]){
    assert.equal(validateNbaMatrixDefinition('classic',{factors:[f]}),null)
  }
  assert.ok(validateNbaMatrixDefinition('classic',{factors:[factor({propType:'first_score',marketLine:.5,marketKind:'over_under'})]}))
  assert.ok(validateNbaMatrixDefinition('classic',{factors:[factor({category:'tracking',field:'deflections'})]}))
})
