import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8')
function compile(path,imports={}) {
 const module={exports:{}}
 const source=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports',source)(name=>{if(name==='server-only')return {};assert.ok(name in imports,'Unexpected import '+name);return imports[name]},module,module.exports)
 return module.exports
}
function db(resolve){const calls=[];return{calls,from(table){const call={table,op:'select',filters:[]};calls.push(call);const q=new Proxy({}, {get:(_,key)=>key==='then'?(yes,no)=>Promise.resolve(resolve(call)).then(yes,no):(...args)=>{if(['insert','update','upsert','delete'].includes(key)){call.op=key;call.values=args[0]}else if(key==='select')call.columns=args[0];else call.filters.push([key,...args]);return q}});return q},rpc(name,args){const call={rpc:name,args};calls.push(call);return Promise.resolve(resolve(call))}}}
const business=compile('src/lib/creatorBusiness.ts'),commerce=compile('src/lib/creatorCommerce.ts')
const userId='00000000-0000-4000-8000-000000000001',productId='00000000-0000-4000-8000-000000000002'
const json={NextResponse:{json:(value,options)=>Response.json(value,options)}}
test('default fees accept zero and two decimals while blank, strings, null and invalid rates fail',()=>{
 for(const value of[null,'',undefined,'10',100,-1,NaN,Infinity,10.123])assert.equal(business.creatorFeePercentage(value),null)
 for(const value of[0,10,12.5,99.99])assert.equal(business.creatorFeePercentage(value),value)
 assert.equal(business.creatorFeeAmount(20,0),0);assert.equal(business.creatorFeeAmount(20,12.5),2.5);assert.equal(business.creatorFeeAmount(1,99.99),.99)
 assert.throws(()=>business.creatorFeeAmount(20,100))
})
test('receipts include only successful payments and keep currencies separate',()=>{
 assert.equal(business.recentCreatorReceipts([{event_type:'payment.succeeded',amount:20,currency:'usd'},{event_type:'refund.created',amount:10,currency:'usd'},{event_type:'payment.failed',amount:50,currency:'usd'},{event_type:'payment.succeeded',amount:4,currency:'eur'}]),'USD 20.00 · EUR 4.00')
 assert.equal(business.recentCreatorReceipts([]),'—')
})
test('expired active memberships are excluded from current access and admin counts',()=>{
 assert.equal(commerce.hasCurrentCreatorAccess({status:'active',current_period_end:'2020-01-01'}),false)
 assert.equal(commerce.hasCurrentCreatorAccess({status:'revoked',current_period_end:'2099-01-01'}),false)
})
test('admin service client is unavailable until real role and configured MFA pass',async()=>{
 for(const scenario of['guest','member','mfa','ready']){
  let services=0
  const client=db(()=>({data:{account_type:scenario==='member'?'user':'admin'}}))
  client.auth={getUser:async()=>({data:{user:scenario==='guest'?null:{id:userId}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:scenario==='mfa'?'aal1':'aal2',nextLevel:'aal2'},error:null})}}
  const auth=compile('src/lib/creatorAdminAuth.ts',{'./supabase/server':{createClient:async()=>client},'./supabase/admin':{createAdminClient:()=>{services++;return {}}}})
  const result=await auth.creatorAdminAuth();assert.equal(services,scenario==='ready'?1:0);assert.equal('user' in result,scenario==='ready')
 }
})
function offerFixture({ready=true,delivery=true,linked=true,providerFailure=false,saveFailure=false,missing=false,ownerFilter}={}){
 const admin=db(call=>{
  if(call.table==='creator_products'&&call.op==='select')return {data:missing?null:{id:productId,creator_id:userId,whop_plan_id:'plan_fixture',status:'draft'},error:null}
  if(call.table==='users')return {data:{username:'creator',whop_connected_company_id:'biz_fixture'},error:null}
  if(call.table==='groups')return {data:linked?{id:'group'}:null,error:null}
  return {error:saveFailure&&call.values?.status==='active'?{code:'unavailable'}:null}
 })
 const provider=[]
 const module=compile('src/lib/creatorOfferStatus.ts',{'./creatorWhop':{getCreatorPaymentState:async()=>({canCharge:ready}),creatorWhop:async(path,body)=>{provider.push({path,body,localPaused:admin.calls.some(c=>c.values?.status==='paused')});if(providerFailure)throw Error('provider unavailable')}},'./creatorWebhookConfig':{creatorDeliveryReady:async()=>delivery}})
 return {admin,provider,run:status=>module.setCreatorOfferStatus(admin,productId,status,ownerFilter)}
}
test('owner and admin publication cannot bypass provider readiness, delivery or a member community',async()=>{
 for(const options of[{ready:false},{delivery:false},{linked:false}]){const fixture=offerFixture(options);await assert.rejects(fixture.run('active'));assert.equal(fixture.provider.length,0)}
 const fixture=offerFixture({ownerFilter:userId});await fixture.run('active');assert.equal(fixture.provider[0].body.unlimited_stock,true)
 assert.ok(fixture.admin.calls[0].filters.some(f=>f[0]==='eq'&&f[1]==='creator_id'&&f[2]===userId))
})
test('pausing gates SlipSurge before closing external links and survives provider failure',async()=>{
 const fixture=offerFixture({providerFailure:true});await assert.rejects(fixture.run('paused'))
 assert.equal(fixture.provider[0].localPaused,true);assert.equal(fixture.provider[0].body.stock,0)
 assert.ok(fixture.admin.calls.some(c=>c.values?.status==='paused'))
})
test('a failed local publish compensates by closing provider stock',async()=>{
 const fixture=offerFixture({saveFailure:true});await assert.rejects(fixture.run('active'))
 assert.equal(fixture.provider.length,2);assert.equal(fixture.provider[1].body.unlimited_stock,false);assert.equal(fixture.provider[1].body.stock,0)
})
test('missing offers cannot return a successful update',async()=>{await assert.rejects(offerFixture({missing:true}).run('active'),error=>error.status===404)})
test('retired local fee endpoint cannot add a second platform percentage',async()=>{
 const admin=db(()=>{throw new Error('No local fee writes allowed')})
 const route=compile('src/app/api/admin/platform-settings/route.ts',{'next/server':json,'@/lib/creatorAdminAuth':{creatorAdminAuth:async()=>({user:{id:userId},admin})}})
 assert.equal((await route.PATCH()).status,410);assert.equal(admin.calls.length,0)
})
test('fee and access management are service-only invokers, with persisted holds and atomic audit writes',()=>{
 const sql=read('supabase/migrations/20261122164203_creator_business_journey_controls.sql')
 assert.doesNotMatch(sql,/security definer/i)
 for(const name of['creator_admin_update_fee','creator_admin_access_hold','respond_to_creator_group_invite'])assert.match(sql,new RegExp('revoke all on function public\\.'+name+'[^;]+from public,anon,authenticated'))
 assert.match(sql,/if new.admin_revoked_at is not null then new.status:='revoked'/)
 assert.match(sql,/v_setting.updated_at<>p_expected_updated_at/)
 assert.match(sql,/creator\.platform_fee_changed/)
 assert.doesNotMatch(sql,/update public\.creator_products set.*platform_fee_amount/i)
})
test('group feed uses the exact group and stable cursor; picks never disappear behind a client-only filter',async()=>{
 const pagination=compile('src/lib/feedPagination.ts')
 const rows=Array.from({length:21},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+100).padStart(12,'0'),created_at:'2026-11-22T12:00:00Z',author_id:userId,author:{username:'fixture'},post_type:'pick'}))
 const client=db(()=>({data:rows,error:null}))
 const module=compile('src/lib/groupFeed.ts',{'./feedQuery':{POST_WITH_AUTHOR:'*,author:users(username)'},'./feedPagination':pagination,'./blocks':{getBlockedEitherWayIds:async()=>[]},'./queries':{attachUserReactions:async value=>value},'./visiblePickRecords':{hydrateVisibleAuthorRecords:async(_client,value)=>({posts:value})}})
 const page=await module.groupFeedPage(client,productId,{picks:true,userId,hideMlb:true})
 assert.equal(page.posts.length,20);assert.equal(page.hasMore,true)
 assert.equal(JSON.parse(page.nextCursor).posts.id,rows[19].id)
 assert.ok(client.calls[0].filters.some(f=>f[0]==='eq'&&f[1]==='group_id'&&f[2]===productId))
 assert.ok(client.calls[0].filters.some(f=>f[0]==='in'&&f[1]==='post_type'))
 await module.groupFeedPage(client,productId,{picks:true,userId,hideMlb:true,cursor:page.nextCursor})
 assert.ok(client.calls[1].filters.some(f=>f[0]==='or'&&f[1].includes('id.lt.')))
 await assert.rejects(module.groupFeedPage(client,productId,{picks:false,hideMlb:false,cursor:'injected'}))
})
