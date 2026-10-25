import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url)), ts = require('typescript')
function load(file, mocks, clock = Date) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require','module','exports','Date',code)(id => { assert.ok(id in mocks, id); return mocks[id] },target,target.exports,clock)
  return target.exports
}
const empty = () => ({ claimed:0, attempted:0, checked:0, graded:0, skipped:0, won:0, reasons:{}, issues:[] })
function fixture(picks, opts={}) {
  const calls=[],writes=[],notices=[],checks=[]; let now=0,active=0,maxActive=0
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]))} static now(){return now} }
  const admin={
    rpc:(name,args)=>({abortSignal:async()=>{calls.push({name,args}); if(opts.selectFails)throw Error('private'); assert.equal(name,'pending_sport_settlement');assert.equal(args.p_limit,200);return{data:picks,error:null}}}),
    from:table=>({
      upsert:rows=>({abortSignal:async()=>{checks.push(...rows);return{error:opts.checkpointFails?{message:'private'}:null}}}),
      insert:row=>({abortSignal:async()=>{assert.equal(table,'notifications');notices.push(row);return{error:null}}}),
    }),
  }
  const subject=load('lib/sportSettlement.ts',{
    'server-only':{},'./watchlist':{PROP_META:{}},'./nflPickGrading':{},'@/app/the-sideline/kickoff':{},
    './pickGrading':{
      fetchLiveFeed:async(id,timeout)=>{assert.ok(timeout>0&&timeout<=10000);active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setImmediate(resolve));active--;if(opts.sourceFails)throw Error('private');return{gameData:{status:{abstractGameState:opts.live?'Live':'Final'}}}},
      gradeMlbPick:(p,_f,final)=>{now+=opts.gradeMs??0;return opts.unsupported?{result:null,reason:'unsupported-contract'}:{result:final||opts.early?'win':null,reason:'graded'}},
      applyMlbPickResult:async(_a,p,result,_m,budget)=>{assert.ok(budget>0&&budget<=5000);writes.push(p.id);if(opts.writeThrows)throw Error('uncertain');return opts.duplicate?null:{result,postId:p.post_id,legPlayerName:'Fixture',legHeadshotUrl:null,overallResult:'win'}},
    },
  },Clock)
  return{run:(deadline=55000,live=false)=>subject.settleSportPicks(admin,'MLB',deadline,live),calls,writes,checks,notices,get maxActive(){return maxActive}}
}
const pick=(i,game=String(i))=>({id:String(i),game_pk:game,mlb_id:1,pick_type:'hits',user_id:'user',post_id:'post'})

test('bounded200 selection and four game workers share games, checkpoint real attempts, and grade once',async()=>{
  const h=fixture([...Array.from({length:17},(_,i)=>pick(i)),pick(18,'1')]);const r=await h.run()
  assert.equal(h.maxActive,4);assert.equal(r.graded,18);assert.equal(r.checked,18);assert.equal(h.checks.length,18);assert.equal(h.writes.length,18)
  assert.deepEqual(r.issues,[]);assert.equal(h.notices.length,0)
})
test('unsupported and unavailable facts rotate honestly without writes or raw errors',async()=>{
  for(const options of[{unsupported:true},{sourceFails:true}]){
    const h=fixture([pick(1)],options),r=await h.run();assert.equal(r.graded,0);assert.equal(r.skipped,1);assert.equal(h.checks.length,1);assert.equal(h.writes.length,0);assert.equal(JSON.stringify(r).includes('private'),false);assert.equal(r.issues.length,1)
  }
})
test('uncertain atomic writes are never retried and do not notify',async()=>{
  const h=fixture([pick(1)],{writeThrows:true}),r=await h.run(55000,true)
  assert.deepEqual(h.writes,['1']);assert.equal(r.graded,0);assert.deepEqual(r.issues,['write-failed']);assert.deepEqual(h.notices,[])
})
test('race-lost atomic result does not grade or notify a duplicate outcome',async()=>{
  const h=fixture([pick(1)],{duplicate:true}),r=await h.run(55000,true)
  assert.equal(r.graded,0);assert.equal(r.reasons['already-settled'],1);assert.deepEqual(h.notices,[])
})
test('deadline exhaustion does not write or advance unvisited games, checkpoint errors stay visible',async()=>{
  const h=fixture([pick(1)],{gradeMs:54000}),r=await h.run()
  assert.equal(r.graded,0);assert.deepEqual(h.writes,[]);assert.ok(r.issues.includes('time-budget'));assert.equal(h.checks.length,1)
  const exhausted=fixture([pick(1)]);assert.deepEqual((await exhausted.run(1000)).issues,['time-budget']);assert.deepEqual(exhausted.calls,[])
  assert.ok((await fixture([pick(1)],{checkpointFails:true}).run()).issues.includes('checkpoint-failed'))
})
test('both cron routes enforce auth and concurrently run all three sports on the same finite deadline',async()=>{
  for(const job of['settle-picks','grade-live-picks']){
    const calls=[];let denied=true
    const route=load(`app/api/cron/${job}/route.ts`,{'next/server':{NextResponse:{json:Response.json}},'@/lib/pipelineHealth':{withPipelineHealth:(_j,f)=>f},'@/lib/supabase/admin':{createAdminClient:()=>({})},'@/lib/cron-auth':{requireCronAuth:()=>denied?new Response('',{status:401}):null},'@/lib/nbaSettlement':{settleNbaPicks:async(_a,d)=>{calls.push(['NBA',d]);return{...empty(),graded:1}}},'@/lib/sportSettlement':{settleSportPicks:async(_a,s,d,live)=>{calls.push([s,d,live]);return empty()}}})
    assert.equal((await route.GET(new Request('https://test'))).status,401);assert.equal(calls.length,0);denied=false
    const body=await(await route.GET(new Request('https://test'))).json();assert.equal(body.graded,1);assert.equal(calls.length,3);assert.equal(new Set(calls.map(c=>c[1])).size,1)
    assert.equal(calls.find(c=>c[0]==='MLB')[2],job==='grade-live-picks')
  }
})

test('NFL catch-up uses only exact-game final facts and holds query errors or capped play streams',async()=>{
  const gameId='2026_01_MIA_LV'
  for(const mode of ['ready','stats-error','capped','not-final']){
    const queries=[],writes=[],checks=[]
    const p={id:'nfl-pick',post_id:null,game_pk:gameId,player_id:'p',pick_type:'rushing_yards_1q',market_side:'milestone',numeric_line:10}
    const admin={
      rpc:()=>({abortSignal:async()=>({data:[p],error:null})}),
      from:table=>{
        if(table==='sport_settlement_attempts')return{upsert:rows=>({abortSignal:async()=>{checks.push(...rows);return{error:null}}})}
        const query={table,filters:[]};queries.push(query)
        const result=()=>table==='nfl_schedule'?{data:{home_score:mode==='not-final'?null:20,away_score:10},error:null}:table==='nfl_player_stats'?{data:[{player_id:'p',rushing_yards:4}],error:mode==='stats-error'?{}:null}:{data:Array.from({length:mode==='capped'?1000:2},(_,i)=>({play_id:i,qtr:i?4:1})),error:null}
        const chain={select:()=>chain,eq:(k,v)=>{query.filters.push([k,v]);return chain},order:()=>chain,range:(a,b)=>{query.range=[a,b];return chain},abortSignal:()=>chain,maybeSingle:async()=>result(),then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)}
        return chain
      },
    }
    const subject=load('lib/sportSettlement.ts',{'server-only':{},'./watchlist':{PROP_META:{}},'./pickGrading':{},'@/app/the-sideline/kickoff':{nflKickoffAt:()=>new Date(0)},'./nflPickGrading':{supportsNflPick:()=>true,gradeNflPick:(_p,stats,plays)=>{assert.equal(stats[0].rushing_yards,4);assert.equal(plays.length,2);return'loss'},applyNflPickResult:async(_a,p)=>{writes.push(p.id);return{overallResult:null}}}})
    const report=await subject.settleSportPicks(admin,'NFL')
    assert.equal(report.graded,mode==='ready'?1:0)
    assert.equal(writes.length,mode==='ready'?1:0)
    assert.equal(checks.length,1)
    assert.ok(queries.every(q=>JSON.stringify(q.filters)===JSON.stringify([['game_id',gameId]])))
    if(mode!=='not-final')assert.deepEqual(queries.find(q=>q.table==='nfl_pbp').range,[0,999])
    if(mode==='stats-error'||mode==='capped')assert.deepEqual(report.issues,['source-unavailable'])
  }
})

test('new pick API rejects unsupported/ambiguous MLB and NFL contracts before posting',async()=>{
  const contracts=load('lib/memberPickContract.ts',{})
  const mlb=load('lib/pickGrading.ts',{'./memberPickContract':contracts}),nfl=load('lib/nflPickGrading.ts',{'@/lib/nflPlayerName':{normalizeNflPlayerName:s=>s},'./nflPeriodResults':{},'./memberPickContract':contracts})
  let writes=0
  const route=load('app/api/posts/pick/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})}})},'@/lib/supabase/admin':{createAdminClient:()=>{writes++;throw Error('unexpected')}},'@slipsurge/core/mlbSchedule':{},'@slipsurge/core/parlayCalc':{},'@/lib/watchlist':{PROP_META:{}},'@/lib/mentions':{},'@/lib/notify':{},'@/app/the-sideline/data':{},'@/app/the-sideline/kickoff':{},'@/lib/nflPickOffer':{},'@/lib/nbaPickValidation':{},'@/lib/paintAccess':{},'@/lib/pickGrading':mlb,'@/lib/nflPickGrading':nfl,'@/lib/mlbCaptureWindow':{}})
  for(const[sport,prop_key,numeric_line]of[['MLB','moonshot',null],['MLB','pitcher_strikeouts',null],['MLB','unknown',null],['NFL','rushing_yards',null],['NFL','unknown',10]]){
    const res=await route.POST(new Request('https://test',{method:'POST',body:JSON.stringify({sport,legs:[{sport,game_pk:'1',mlb_id:1,player_id:'p',prop_key,numeric_line,odds:100}]})}));assert.equal(res.status,400)
  }
  assert.equal(writes,0)
})
