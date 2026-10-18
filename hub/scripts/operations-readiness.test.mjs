import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
function load(file, mocks) {
  const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? new Proxy({}, { get: (_, key) => () => { throw Error(`Unexpected dependency ${id}.${String(key)}`) } }), module, module.exports)
  return module.exports
}
const next = { NextResponse: { json: (data, init) => Response.json(data, init) } }
const pipeline = { withPipelineHealth: (_, handler) => handler }

test('model fitting uses prior-date archives without fetching today’s Pikkit board', async () => {
  const writes = [], filters = []
  const prior = Array.from({length:900}, (_,i)=>({game_date:'2026-10-16',game_pk:1,mlb_id:i,feature_vector:{},updated_at:'2026-10-17T00:00:00Z'}))
  const admin = { from(table) {
    return { select(){return this}, lt(key,value){filters.push([table,key,value]);return this}, order(){return this},
      range(){return Promise.resolve({data:prior,error:null})}, eq(){return this}, maybeSingle(){return Promise.resolve({data:null,error:null})},
      upsert(row){writes.push(row);return Promise.resolve({error:null})} }
  } }
  const model = load('lib/marketDna.ts', {
    '@/lib/supabase/admin': {createAdminClient:()=>admin},
    '@/lib/marketDnaRanker': {trainMarketDnaRanker:(rows,date)=>{
      assert.equal(rows.length,900);assert.equal(date,'2026-10-17')
      return {version:'game-first-gbdt-v5',trainingRows:900,trainedThrough:'2026-10-16'}
    }},
  })
  const result = await model.fitMarketDnaModel('2026-10-17')
  assert.equal(result.trainedThrough,'2026-10-16')
  assert.deepEqual(filters,[['market_dna_profile_archive','game_date','2026-10-17']])
  assert.equal(writes[0].target_date,'2026-10-17')
})

test('model cron fits archives and reports missing training evidence as deferred', async () => {
  let artifact=null
  const route=load('app/api/cron/market-dna-maintenance/route.ts', {
    'next/server':next,'@/lib/pipelineHealth':pipeline,'@/lib/cron-auth':{requireCronAuth:()=>null},
    '@/lib/marketDna':{fitMarketDnaModel:async()=>artifact},
  })
  const request=new Request('https://fixture.test/api/cron/market-dna-maintenance?fitOnly=1')
  const deferred=await route.GET(request);assert.equal(deferred.status,425)
  artifact={version:'game-first-gbdt-v5',trainingRows:900,trainedThrough:'2026-10-16',validation:null}
  const fitted=await route.GET(request);assert.equal(fitted.status,200)
  assert.equal((await fitted.json()).trainingRows,900)
})

test('daily slate queues one digest and never invokes Discord directly', async () => {
  const originalFetch=globalThis.fetch,queued=[]
  let duplicate=false
  globalThis.fetch=async (url,init)=>{
    assert.match(String(url),/statsapi\.mlb\.com\/api\/v1\/schedule/)
    assert.ok(init.signal)
    return Response.json({dates:[{games:[{gameDate:'2026-10-17T23:00:00Z',teams:{away:{team:{name:'Away'},probablePitcher:{fullName:'Away Pitcher'}},home:{team:{name:'Home'}}}}]}]})
  }
  try {
    const route=load('app/api/cron/slate-drop/route.ts',{
      'next/server':next,'@/lib/pipelineHealth':pipeline,'@/lib/cron-auth':{requireCronAuth:()=>null},
      '@/lib/platform':{PLATFORM_URL:'https://fixture.test'},
      '@/lib/discord':{getDiscordConfig:async()=>({enabled:true,alert_channels:{slate:'123456789'}})},
      '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{assert.equal(name,'queue_daily_slate_alert');queued.push(args);return{data:!duplicate,error:null}}})},
    })
    const first=await(await route.GET(new Request('https://fixture.test/slate'))).json()
    assert.equal(first.queued,true);assert.match(queued[0].p_payload.embeds[0].description,/Away Pitcher vs TBD/)
    duplicate=true
    const second=await(await route.GET(new Request('https://fixture.test/slate'))).json()
    assert.equal(second.alreadyQueued,true)
  } finally {globalThis.fetch=originalFetch}
})

test('slate upstream failure cannot masquerade as an empty successful schedule', async () => {
  const originalFetch=globalThis.fetch
  globalThis.fetch=async()=>new Response('',{status:503})
  try {
    const route=load('app/api/cron/slate-drop/route.ts',{
      'next/server':next,'@/lib/pipelineHealth':pipeline,'@/lib/cron-auth':{requireCronAuth:()=>null},
      '@/lib/supabase/admin':{createAdminClient:()=>({})},
      '@/lib/discord':{getDiscordConfig:async()=>({enabled:true,alert_channels:{slate:'123456789'}})},
    })
    await assert.rejects(route.GET(new Request('https://fixture.test/slate')),/HTTP 503/)
  } finally {globalThis.fetch=originalFetch}
})

test('incomplete NFL captures cannot produce a successful dispatcher status',()=>{
  const helper=load('lib/nflCaptureDispatch.ts',{})
  assert.equal(helper.nflCaptureResultStatus([{ok:true,incomplete:true}]),502)
  assert.equal(helper.nflCaptureResultStatus([{ok:false,deferred:true}]),425)
  assert.equal(helper.nflCaptureResultStatus([{ok:true}]),200)
  assert.equal(helper.nflCaptureIsIncomplete([{incomplete:true}]),true)
  assert.equal(helper.nflCaptureIsIncomplete([{incomplete:false}]),false)
})

test('NFL Pikkit accepts a flat single-game success and matches batch results by identity',async()=>{
  const originalFetch=globalThis.fetch
  let games=[{gameId:'a',gameDate:'2026-11-01',gameTime:'13:00'}]
  let payload={gameId:'a',marketCount:8},status=200
  globalThis.fetch=async()=>Response.json(payload,{status})
  try {
    const route=load('app/api/cron/poll-pikkit-nfl-picks/route.ts',{
      'next/server':next,'@/lib/pipelineHealth':pipeline,'@/lib/cron-auth':{requireBrowserbaseCronAuth:()=>null},
      '@/lib/platform':{PLATFORM_URL:'https://fixture.test'},
      '@/lib/nflPikkitSchedule':{getUpcomingNflPikkitGames:async()=>games},
      '@/lib/pikkitCaptureSchedule':{pikkitCaptureDecision:()=>({due:true})},
      '@/lib/browserbaseRefresh':{easternKickoff:()=>new Date(Date.now()+86400000)},
      '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select(){return this},in:async()=>({data:[],error:null})})})},
    })
    let response=await route.GET(new Request('https://fixture.test/poll'))
    assert.equal(response.status,200);assert.equal((await response.json()).succeeded,1)
    games=[...games,{gameId:'b',gameDate:'2026-11-01',gameTime:'16:00'}]
    payload={results:[{gameId:'b',error:'upstream failed'},{gameId:'a',marketCount:8}]};status=502
    response=await route.GET(new Request('https://fixture.test/poll'))
    const summary=await response.json()
    assert.equal(response.status,502);assert.equal(summary.succeeded,1);assert.equal(summary.failed,1)
    assert.equal(summary.results[0].gameId,'a');assert.equal(summary.results[0].ok,true)
  } finally {globalThis.fetch=originalFetch}
})

test('an unconfirmed daily slate send is not blindly retried beyond its nonce window',async()=>{
  const updates=[],recoveryCutoffs=[]
  const item={id:'fixture',provider:'discord',operation:'post_channel_message',attempts:0,max_attempts:5,payload:{channelId:'123456789',payload:{nonce:'slate-2026-10-17',embeds:[]}}}
  const admin={from(table){
    let updating=false
    const q={update(value){updates.push(value);updating=true;return this},select(){return this},eq(){return this},lt(key,value){if(table==='operational_retry_queue'&&key==='updated_at')recoveryCutoffs.push(value);return this},like(){return this},neq(){return this},lte(){return this},order(){return this},limit(){return this},
      maybeSingle:async()=>({data:{id:'fixture'},error:null}),
      then(resolve,reject){return Promise.resolve({data:!updating&&table==='operational_retry_queue'?[item]:null,error:null,count:0}).then(resolve,reject)}}
    return q
  }}
  const route=load('app/api/cron/replay-operational-retries/route.ts',{
    'next/server':next,'@/lib/pipelineHealth':pipeline,'@/lib/cron-auth':{requireCronAuth:()=>null},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/discord':{postToChannelChecked:async()=>({ok:false,error:'Request failed'})},
  })
  const result=await(await route.GET(new Request('https://fixture.test/retry'))).json()
  assert.equal(result.failed,1)
  assert.equal(updates.at(-1).status,'failed')
  assert.match(updates.at(-1).last_error,/inspect Discord before manual retry/)
  assert.equal(recoveryCutoffs.length,2)
  assert.equal(recoveryCutoffs[0],recoveryCutoffs[1],'uncertain daily items cannot fall through a recovery cutoff gap')
})

test('the tracked-pick API forwards a strict spoiler boolean into the atomic transaction',async()=>{
  const flags=[]
  const route=load('app/api/posts/pick/route.ts',{
    'next/server':next,
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'fixture-user'}}})}})},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{
      assert.equal(name,'create_tracked_pick_post');flags.push(args.p_post.is_spoiler)
      return {data:{id:'fixture-post',picksTracked:true},error:null}
    }})},
    '@slipsurge/core/mlbSchedule':{getTodaysMatchups:async()=>[{gamePk:1,status:'Preview'}],isPregame:()=>true},
    '@/lib/watchlist':{PROP_META:{}},
    '@/lib/mentions':{notifyMentions:async()=>{}},'@/lib/notify':{notifyFollowers:async()=>{}},
  })
  for(const isSpoiler of [true,undefined,'true']) {
    const request=new Request('https://fixture.test/api/posts/pick',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({isSpoiler,legs:[{game_pk:'1',game_date:'2026-10-17',mlb_id:1,prop_key:'hits1',odds:-110,player_name:'Fixture'}]})})
    assert.equal((await route.POST(request)).status,200)
  }
  assert.deepEqual(flags,[true,false,false])
})

test('NFL session override is bounded, other sessions keep five minutes, and teardown releases billing',async()=>{
  const oldKey=process.env.BROWSERBASE_API_KEY,oldProject=process.env.BROWSERBASE_PROJECT_ID
  process.env.BROWSERBASE_API_KEY='fixture';process.env.BROWSERBASE_PROJECT_ID='fixture-project'
  const requests=[],releases=[]
  try {
    const bb=load('lib/browserbase.ts',{
      '@browserbasehq/sdk':{default:class {sessions={create:async(params)=>{requests.push(params);return{id:'fixture-session',connectUrl:'fixture-connect'}},update:async(...args)=>{releases.push(args)}}}},
      'playwright-core':{chromium:{connectOverCDP:async()=>({contexts:()=>[{pages:()=>[{}]}],close:async()=>{}})}},
    })
    const regular=await bb.openSession();await regular.close()
    const nfl=await bb.openSession({timeoutSeconds:450});await nfl.close();await nfl.close()
    assert.deepEqual(requests.map(r=>r.timeout),[300,450])
    assert.equal(releases.length,2)
    assert.equal(releases[1][1].status,'REQUEST_RELEASE')
    await assert.rejects(bb.openSession({timeoutSeconds:451}),/between 60 and 450/)
    await assert.rejects(bb.openSession({timeoutSeconds:0}),/between 60 and 450/)
  } finally {
    if(oldKey===undefined)delete process.env.BROWSERBASE_API_KEY;else process.env.BROWSERBASE_API_KEY=oldKey
    if(oldProject===undefined)delete process.env.BROWSERBASE_PROJECT_ID;else process.env.BROWSERBASE_PROJECT_ID=oldProject
  }
})
