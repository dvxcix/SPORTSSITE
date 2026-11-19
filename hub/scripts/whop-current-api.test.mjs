import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as api from '../src/lib/whopApi.ts'
import * as access from '../src/lib/whopMembershipAccess.ts'
import * as tiers from '../packages/core/src/tiers.ts'

async function compile(path, imports = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  new Function('require','exports','module','fetch','process','setTimeout',output)(name => {
    if (name === './whopApi') return api
    if (name === 'crypto') return crypto
    assert.ok(name in imports, name)
    return imports[name]
  },mod.exports,mod,globals.fetch ?? fetch,globals.process ?? process,callback => { callback(); return 0 })
  return mod.exports
}
const plan = 'plan_2uISqRWL3Re5v'
const ownerId = '123e4567-e89b-42d3-a456-426614174000'
const member = {id:'mem_fixture',variant_id:plan,user_id:'user_test',status:'active',current_period_end:'2099-12-01T00:00:00Z',cancel_at_period_end:false,metadata:{internal_user_id:ownerId}}

test('current membership requests pin v1, validate identity and follow every cursor with exact filters',async()=>{
  const calls=[]
  const helper=await compile('../src/lib/whopMembershipsFetch.ts',{}, {fetch:async(input,init)=>{
    const url=new URL(input);calls.push({url,init})
    assert.equal(init.headers['Api-Version-Date'],api.WHOP_API_VERSION)
    assert.equal(init.cache,'no-store')
    if(url.pathname.endsWith('/'+member.id))return Response.json(member)
    assert.deepEqual(url.searchParams.getAll('variant_ids'),[plan])
    assert.equal(url.searchParams.get('user_id'),'user_test')
    assert.deepEqual(url.searchParams.getAll('statuses'),['active','canceling'])
    assert.equal(url.searchParams.has('page'),false)
    const second=url.searchParams.get('after')==='cursor-1'
    return Response.json({data:[{...member,id:second?'mem_second':member.id}],page_info:{has_next_page:!second,end_cursor:second?null:'cursor-1'}})
  }})
  assert.deepEqual(await helper.fetchWhopMembershipById('key',member.id),{membership:member})
  const result=await helper.fetchAllWhopMemberships('key',plan,{userId:'user_test',statuses:['active','canceling']})
  assert.equal(result.pagesFetched,2)
  assert.equal(result.memberships.length,2)
  assert.ok(calls.every(call=>call.url.pathname.startsWith('/api/v1/')))
  assert.equal(access.whopMembershipPeriodEnd(member),'2099-12-01T00:00:00.000Z')
})

test('malformed pagination, repeating cursors, foreign plans and wrong direct IDs cannot masquerade as success',async()=>{
  for(const mode of ['missing-page-info','same-cursor','foreign-plan','wrong-id']){
    const helper=await compile('../src/lib/whopMembershipsFetch.ts',{}, {fetch:async input=>{
      if(mode==='wrong-id')return Response.json({...member,id:'mem_wrong'})
      return Response.json({data:[mode==='foreign-plan'?{...member,variant_id:'plan_other'}:member],...(mode==='missing-page-info'?{}:{page_info:{has_next_page:true,end_cursor:'same'}})})
    }})
    const result=mode==='wrong-id'?await helper.fetchWhopMembershipById('key',member.id):await helper.fetchAllWhopMemberships('key',plan)
    assert.equal(typeof result.error,'string',mode)
  }
})

test('a retired endpoint failure is not treated as a missing membership',async()=>{
  const helper=await compile('../src/lib/whopMembershipsFetch.ts',{}, {fetch:async()=>new Response('',{status:410})})
  assert.match((await helper.fetchWhopMembershipById('key',member.id)).error,/410/)
  const missing=await compile('../src/lib/whopMembershipsFetch.ts',{}, {fetch:async()=>new Response('',{status:404})})
  assert.deepEqual(await missing.fetchWhopMembershipById('key',member.id),{missing:true})
})

async function reconciliation({localTier='free',outage=false,conflict=false}={}){
  const local={id:ownerId,username:'fixture',tier:localTier,tier_status:'canceling',whop_membership_id:member.id,whop_plan_id:'plan_tCrVAX62uKyEq',whop_user_id:'user_test',tier_current_period_end:'2026-10-06T00:00:00Z',tier_purchased_at:'2026-09-01T00:00:00Z',tier_cancel_at_period_end:true}
  const writes=[],calls=[],notices=[]
  const admin={from(table){
    const filters=[];let patch=null
    const query={
      select(){return query},eq(k,v){filters.push(row=>row[k]===v);return query},neq(k,v){filters.push(row=>row[k]!==v);return query},
      in(k,values){filters.push(row=>values.includes(row[k]));return query},update(value){patch=value;return query},
      upsert(value){writes.push({table,value});return Promise.resolve({error:null})},
      async maybeSingle(){return {data:table==='users'?local:null,error:null}},
      single(){return query.then(result=>({...result,data:result.data[0]}))},
      then(resolve,reject){return Promise.resolve().then(()=>{
        const data=table==='users'?[local].filter(row=>filters.every(filter=>filter(row))):[]
        if(patch&&data.length){writes.push(patch);Object.assign(local,patch)}
        return {data,error:null}
      }).then(resolve,reject)}
    }
    return query
  }}
  const fetching=await compile('../src/lib/whopMembershipsFetch.ts')
  const helper=await compile('../src/lib/whopMainReconcile.ts',{
    'next/server':{after:callback=>notices.push(callback)},'@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@slipsurge/core/tiers':tiers,'@/lib/tierBadges':{syncTierBadge:async()=>{}},'@/lib/discord':{syncDiscordRoleForUser:async()=>{}},
    '@/lib/xConversion':{sendXConversion:async()=>{}},'@/lib/whopMembershipAccess':access,
    '@/lib/whopRepricedUltimate':{resolveRepricedUltimatePlan:async()=>null},
    '@/lib/whopMembershipsFetch':{...fetching,
      fetchWhopMembershipById:async(_key,id)=>{calls.push(id);return outage?{error:'410'}:{membership:{...member,metadata:{internal_user_id:conflict?'another-owner':ownerId}}}},
      fetchAllWhopMemberships:async(key,plans,options)=>{calls.push({key,plans,options});return{memberships:key==='addon'?[]:[member],pagesFetched:1}}
    }
  },{process:{env:{WHOP_API_KEY:'main',ADDON_WHOP_KEY:'addon'}}})
  return {helper,local,writes,calls,notices}
}

test('support reconciliation repairs a locally free selected member without consuming the global batch',async()=>{
  const h=await reconciliation(),result=await h.helper.reconcileWhopMain({userId:ownerId})
  assert.equal(result.error,undefined)
  assert.equal(h.local.tier,'ultimate')
  assert.equal(h.local.whop_plan_id,plan)
  assert.equal(h.local.tier_current_period_end,'2099-12-01T00:00:00.000Z')
  assert.ok(result.results.some(row=>row.internalUserId===ownerId&&row.granted==='ultimate'))
  assert.ok(h.calls.some(call=>call.options?.userId==='user_test'))
  assert.ok(!h.writes.some(write=>write.table==='integration_reconcile_state'))
  assert.equal(h.notices.length,0)
})

test('dry runs and conflicting ownership cannot mutate members or cursors',async()=>{
  for(const options of [{},{outage:true},{conflict:true}]){
    const h=await reconciliation(options),result=await h.helper.reconcileWhopMain({userId:ownerId,dryRun:true})
    assert.equal(h.writes.length,0)
    assert.equal(h.local.tier,'free')
    if(options.outage||options.conflict)assert.equal(typeof result.error,'string')
    else assert.ok(result.results.some(row=>row.wouldGrant==='ultimate'))
  }
})

test('normal scheduled discovery also restores free members that the prior batch excluded',async()=>{
  const h=await reconciliation(),result=await h.helper.reconcileWhopMain()
  assert.equal(result.error,undefined)
  assert.equal(h.local.tier,'ultimate')
  assert.ok(h.calls.some(call=>call.options?.statuses.includes('active')&&!call.options.userId))
})

test('member cancellation uses current API and preserves paid time, with immediate trial cancellation',async()=>{
  for(const status of ['active','trialing']){
    const calls=[]
    const helper=await compile('../src/lib/whop.ts',{}, {fetch:async(url,init)=>{
      calls.push({url,init})
      assert.ok(url.startsWith(api.WHOP_API_URL))
      assert.equal(init.headers['Api-Version-Date'],api.WHOP_API_VERSION)
      return Response.json({...member,status})
    }})
    assert.deepEqual(await helper.cancelWhopMembership(member.id,'key'),{ok:true})
    assert.equal(calls.length,2)
    assert.deepEqual(JSON.parse(calls[1].init.body),{cancel_at_period_end:status==='active'})
  }
  let calls=0
  const helper=await compile('../src/lib/whop.ts',{}, {fetch:async()=>{calls++;return new Response('',{status:503})}})
  assert.equal((await helper.cancelWhopMembership(member.id,'key')).ok,false)
  assert.equal(calls,1,'unverified trial state cannot issue cancellation')
})
