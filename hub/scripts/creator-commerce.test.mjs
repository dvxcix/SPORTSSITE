import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as crypto from 'node:crypto'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
function compile(path, imports = {}, extra = {}) {
 const module = { exports: {} }
 const source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
 new Function('require','module','exports','fetch','process',source)(name => {
  if (name === 'server-only') return {}
  if (name === 'node:crypto') return crypto
  assert.ok(name in imports, 'Unexpected import: ' + name)
  return imports[name]
 },module,module.exports,extra.fetch || fetch,extra.process || process)
 return module.exports
}
const commerce = compile('src/lib/creatorCommerce.ts')
const access = compile('src/lib/whopMembershipAccess.ts')
const membership = compile('src/lib/creatorMembership.ts', { './whopMembershipAccess': access })
const api = compile('src/lib/whopApi.ts')
const business = compile('src/lib/creatorBusiness.ts')
const parent = 'biz_platform', account = 'biz_creator'
const creatorId = '00000000-0000-4000-8000-000000000001', buyerId = '00000000-0000-4000-8000-000000000002', productId = '00000000-0000-4000-8000-000000000003'
const product = { id: productId, creator_id: creatorId, whop_plan_id: 'plan_creator', product_type: 'membership' }
const future = '2099-12-01T00:00:00.000Z'
const member = { id: 'mem_creator', account: { id: account }, variant_id: product.whop_plan_id, status: 'active', updated_at: '2026-11-22T12:00:00Z', current_period_end: future, metadata: { internal_user_id: buyerId } }
function db(resolve) {
 const calls = []
 return { calls, from(table) {
  const call = { table, filters: [], op: 'select', values: null }; calls.push(call)
  const chain = new Proxy({}, { get(_target, key) {
   if (key === 'then') return (yes, no) => Promise.resolve(resolve(call)).then(yes, no)
   return (...args) => { if (['eq','is','in','not'].includes(key)) call.filters.push([key,...args]); if (['insert','update','upsert','delete'].includes(key)) { call.op=key;call.values=args[0] } return chain }
  } }); return chain
 }, async rpc(name, args) { const call = { rpc: name, args }; calls.push(call); return resolve(call) } }
}
test('account readiness requires correct parent, active account and explicit card capability', () => {
 assert.throws(() => commerce.creatorPaymentState({id:account,parent_account:{id:'biz_other'}},parent))
 for (const [status, capability, expected] of [['active','active',true],['active','pending',false],['active','inactive',false],['suspended','active',false]]) {
  const state=commerce.creatorPaymentState({id:account,parent_account:{id:parent},status,capabilities:{accept_card_payments:capability,standard_payout:'inactive'}},parent)
  assert.equal(state.canCharge,expected);assert.equal(state.canPayout,false)
 }
 assert.equal(commerce.creatorPaymentState({id:account,parent_account:{id:parent},status:'active'},parent).state,'unavailable')
})
test('draft offer uses the current variant contract and cannot take payments before publish', () => {
 const payload=commerce.creatorOfferPayload({accountId:account,productId,creatorId,title:'Research club',description:'Notes',price:20,recurring:true,fee:2,returnUrl:'https://www.slipsurge.com/creators/access/complete'})
 assert.equal(payload.account_id,account);assert.equal(payload.variant.billing_type,'renewal');assert.equal(payload.variant.billing_period,30)
 assert.equal(payload.variant.application_fee_amount,2);assert.equal(payload.variant.stock,0);assert.equal(payload.variant.unlimited_stock,false)
 assert.equal(payload.plan,undefined);assert.equal(payload['Idempotency-Key'],undefined)
 const one=commerce.creatorOfferPayload({accountId:account,productId,creatorId,title:'Drop',description:null,price:10,recurring:false,fee:1,returnUrl:'https://www.slipsurge.com'})
 assert.equal(one.variant.billing_period,undefined);assert.equal(one.variant.renewal_price,undefined)
})

test('legacy company suffix normalizes to the current account ID without changing explicit platform identity',()=>{
 const platform=env=>compile('src/lib/whopPlatform.ts',{'@whop/sdk':{},'./whopApi':api,'./creatorBusiness':business,'@/lib/platform':{PLATFORM_URL:'https://www.slipsurge.com'}},{process:{env}}).getWhopPlatformCompanyId()
 assert.equal(platform({WHOP_COMPANY_ID:'lQsa02bB46YIlL'}),'biz_lQsa02bB46YIlL')
 assert.equal(platform({WHOP_COMPANY_ID:'biz_lQsa02bB46YIlL'}),'biz_lQsa02bB46YIlL')
 assert.equal(platform({WHOP_PLATFORM_COMPANY_ID:parent,WHOP_COMPANY_ID:'other'}),parent)
 assert.throws(()=>platform({WHOP_PLATFORM_COMPANY_ID:'unprefixed',WHOP_COMPANY_ID:'legacy'}),/invalid/)
 assert.throws(()=>platform({WHOP_COMPANY_ID:'bad/path'}),/invalid/)
})
test('provider requests pin the current API, keep idempotency in headers and abort the actual fetch', async () => {
 let call
 const whop=compile('src/lib/creatorWhop.ts',{'./whopApi':api,'./whopPlatform':{getWhopPlatformCompanyId:()=>parent},'./creatorCommerce':commerce},{
  process:{env:{WHOP_API_KEY:'fixture-only-key'}},fetch:async(url,init)=>{call={url,init};return Response.json({id:'cfg_fixture'})}
 })
 await whop.creatorWhop('/checkout_configurations',{account_id:account},'offer-retry')
 assert.equal(call.url,'https://api.whop.com/api/v1/checkout_configurations')
 assert.equal(call.init.headers['Api-Version-Date'],api.WHOP_API_VERSION)
 assert.equal(call.init.headers['Idempotency-Key'],'offer-retry')
 assert.equal(call.init.cache,'no-store');assert.ok(call.init.signal instanceof AbortSignal)
 assert.equal(JSON.parse(call.init.body)['Idempotency-Key'],undefined)
})
test('provider failures never expose a provider body', async () => {
 const whop=compile('src/lib/creatorWhop.ts',{'./whopApi':api,'./whopPlatform':{getWhopPlatformCompanyId:()=>parent},'./creatorCommerce':commerce},{process:{env:{WHOP_API_KEY:'fixture'}},fetch:async()=>new Response('private customer email and API key',{status:403})})
 await assert.rejects(whop.creatorWhop('/accounts/me'),error=>error.status===403&&!error.message.includes('private'))
})
test('access expires at the paid-through date and a recurring membership cannot be open ended', () => {
 assert.equal(commerce.hasCurrentCreatorAccess({status:'active',current_period_end:'2020-01-01'}),false)
 assert.equal(commerce.hasCurrentCreatorAccess({status:'expired',current_period_end:future}),false)
 assert.equal(membership.creatorMembershipState({...member,current_period_end:'2020-01-01'},true).status,'expired')
 assert.throws(()=>membership.creatorMembershipState({...member,current_period_end:null},true))
 assert.equal(membership.creatorMembershipState({...member,status:'completed',current_period_end:null},false).status,'active')
 assert.throws(()=>membership.creatorMembershipState({...member,updated_at:'invalid'},true))
})
test('Money is parsed in major units without losing its currency', () => {
 assert.deepEqual(membership.creatorMoney({amount:'19.99',currency:'usd'}),{amount:19.99,currency:'usd'})
 assert.equal(membership.creatorMoney({amount:'NaN',currency:'usd'}),null)
})
async function hookFixture({record=member,entitlement=null,rpcError=null}={}) {
 const admin=db(call=>{
  if(call.rpc)return {error:rpcError}
  if(call.table==='creator_products')return {data:product,error:null}
  if(call.table==='creator_entitlements')return {data:entitlement,error:null}
  if(call.table==='users')return {data:{whop_connected_company_id:account},error:null}
  throw new Error('Unexpected table '+call.table)
 })
 const handler=compile('src/lib/creatorWebhook.ts',{'./creatorWhop':{creatorWhop:async()=>record,getCreatorPaymentState:async()=>({state:'ready'})},'./creatorMembership':membership})
 return {admin,handler}
}
test('signed creator checkout resolves to one atomic access transaction with trusted account and plan', async () => {
 const {admin,handler}=await hookFixture()
 assert.equal(await handler.handleCreatorWebhook(admin,'evt_one','payment.succeeded',{id:'pay_one',membership_id:member.id,variant_id:product.whop_plan_id,metadata:{internal_user_id:buyerId,slipsurge_product_id:productId,slipsurge_creator_id:creatorId},subtotal:{amount:'20.00',currency:'usd'}}),true)
 const transaction=admin.calls.find(call=>call.rpc)
 assert.equal(transaction.rpc,'apply_creator_membership');assert.equal(transaction.args.p_user_id,buyerId);assert.equal(transaction.args.p_membership_id,'mem_creator')
 assert.equal(transaction.args.p_status,'active');assert.equal(transaction.args.p_amount,20)
 assert.equal(admin.calls.some(call=>call.table==='users'&&call.op!=='select'),false,'creator events cannot change SlipSurge tier')
})
test('renewals without checkout metadata use the existing membership binding', async () => {
 const {admin,handler}=await hookFixture({record:{...member,metadata:{}},entitlement:{user_id:buyerId,product_id:productId,creator_id:creatorId}})
 await handler.handleCreatorWebhook(admin,'evt_renewal','membership.updated',{id:member.id,status:'active'})
 assert.equal(admin.calls.find(call=>call.rpc).args.p_user_id,buyerId)
})
test('late activation events use current provider expiry, not the stale event state', async () => {
 const {admin,handler}=await hookFixture({record:{...member,status:'expired'}})
 await handler.handleCreatorWebhook(admin,'evt_late','membership.activated',{id:member.id,variant_id:product.whop_plan_id,status:'active'})
 assert.equal(admin.calls.find(call=>call.rpc).args.p_status,'expired')
})
test('wrong account, wrong variant and buyer reassignment cannot grant creator access', async () => {
 for(const record of [{...member,account:{id:'biz_intruder'}},{...member,variant_id:'plan_intruder'}]) {
  const {admin,handler}=await hookFixture({record})
  await assert.rejects(handler.handleCreatorWebhook(admin,'evt_bad','membership.activated',{id:member.id,variant_id:product.whop_plan_id}))
  assert.equal(admin.calls.some(call=>call.rpc),false)
 }
 const {admin,handler}=await hookFixture({entitlement:{user_id:buyerId,product_id:productId,creator_id:creatorId}})
 await assert.rejects(handler.handleCreatorWebhook(admin,'evt_reassign','membership.updated',{id:member.id,variant_id:product.whop_plan_id,metadata:{internal_user_id:creatorId}}))
})
test('a failed access transaction is retried instead of acknowledged as success', async () => {
 const {admin,handler}=await hookFixture({rpcError:{code:'40001'}})
 await assert.rejects(handler.handleCreatorWebhook(admin,'evt_retry','membership.activated',{id:member.id,variant_id:product.whop_plan_id}))
})
test('webhook secrets are encrypted and unavailable to browser roles', async () => {
 let saved,testStatus=200,creates=0
 const admin=db(call=>call.op==='upsert'?(saved=call.values,{error:null}):call.op==='update'?(Object.assign(saved,call.values),{error:null}):({data:saved||null,error:null}))
 const config=compile('src/lib/creatorWebhookConfig.ts',{'./creatorWhop':{creatorWhop:async(path,body)=>{
  if(path==='/accounts/me')return {id:parent}
  if(path==='/webhooks'){creates++;return {id:'hook_fixture',url:body.url,webhook_secret:'fixture-signing-secret'}}
  if(path.endsWith('/test'))return {success:testStatus===200,status:testStatus}
  return {id:'hook_fixture',url:'https://www.slipsurge.com/api/webhooks/whop-creator',enabled:true,child_resource_events:true,resource_id:parent,events:config.CREATOR_EVENTS,api_version_date:api.WHOP_API_VERSION}
 }},'./whopPlatform':{getWhopPlatformCompanyId:()=>parent,PLATFORM_URL:'https://www.slipsurge.com'},'./whopApi':api},{process:{env:{WHOP_API_KEY:'fixture-key'}}})
 await config.configureCreatorDelivery(admin)
 assert.equal(saved.secret_ciphertext.includes('fixture-signing-secret'),false)
 assert.equal(await config.getCreatorWebhookSecret(admin),'fixture-signing-secret')
 assert.equal(await config.creatorDeliveryReady(admin),false,'Configuration alone does not enable paid offers')
 assert.equal((await config.testCreatorDelivery(admin)).success,true)
 assert.equal(await config.creatorDeliveryReady(admin),true)
 testStatus=401
 assert.equal((await config.testCreatorDelivery(admin)).success,false)
 assert.equal(await config.creatorDeliveryReady(admin),false,'A failed transport test closes paid publication')
 await config.configureCreatorDelivery(admin)
 assert.equal(creates,1,'Retrying delivery reuses the configured hook')
 const sql=read('supabase/migrations/20261122142312_creator_self_service_communities.sql')
 assert.match(sql,/revoke all on public.creator_provider_connections from public,anon,authenticated/)
 assert.match(sql,/alter table public.creator_provider_connections enable row level security/)
})
test('self-service community RPC stays invoker-only and paid content retains entitlement gates', () => {
 const sql=read('supabase/migrations/20261122142312_creator_self_service_communities.sql')
 const rpc=sql.split('create or replace function public.create_community_group')[1].split('revoke all on function public.create_community_group')[0]
 assert.equal(rpc.includes('security definer'),false)
 assert.equal(rpc.includes('creator access required'),false)
 assert.match(sql,/create policy "Community posts require current group access"/)
 assert.match(sql,/private\.can_view_group\(p_group_id,p_user_id\)/)
 assert.match(sql,/revoke all on function public.apply_creator_membership[^;]+from public,anon,authenticated/)
})

const next = { NextResponse: { json: (body, init) => Response.json(body, init) } }
const safeApi = { safeApiError: (_scope,_cause,message='Request failed',status=500) => Response.json({error:message},{status}) }
test('a regular signed-in member can start paid setup without an application or admin approval', async () => {
 let linked=null;let creates=0;const calls=[]
 const admin=db(call=>call.op==='update'?(linked=call.values,{error:null}):({data:{id:creatorId,email:'profile@fixture.invalid',username:'creator-fixture',display_name:'Fixture club',account_type:'user',whop_connected_company_id:null},error:null}))
 const session={auth:{getUser:async()=>({data:{user:{id:creatorId,email:'verified@fixture.invalid'}}})}}
 const route=compile('src/app/api/creator/whop-onboard/route.ts',{
  'next/server':next,'@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/whopPlatform':{getWhopPlatformCompanyId:()=>parent,PLATFORM_URL:'https://www.slipsurge.com'},
  '@/lib/creatorWhop':{creatorWhop:async(path,body,key)=>{
    calls.push({path,body,key})
    if(path==='/accounts/me')return {id:parent}
    if(path.startsWith('/accounts?'))return {data:[]}
    if(path==='/accounts'){creates++;return {id:account,parent_account:{id:parent}}}
    throw new Error('Unexpected provider request')
  },getCreatorPaymentState:async()=>({state:'onboarding'}),creatorAccountLink:async(id,useCase,returnUrl)=>{assert.equal(id,account);assert.equal(useCase,'account_onboarding');assert.ok(returnUrl.endsWith('/creators/studio?onboarding=return'));return {url:'https://whop.com/onboard/fixture'}}},
  '@/lib/whopUrl':{isTrustedWhopUrl:url=>url.startsWith('https://whop.com/')},
  '@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({available:true,allowed:true})},'@/lib/safeApiError':safeApi,
 })
 const response=await route.POST()
 assert.equal(response.status,200);assert.equal(creates,1);assert.equal(linked.account_type,'creator')
 assert.equal(linked.whop_connected_company_id,account);assert.equal(linked.tier,undefined)
 const creation=calls.find(call=>call.path==='/accounts')
 assert.equal(creation.body.external_id,'slipsurge:'+creatorId);assert.equal(creation.body.email,'verified@fixture.invalid')
 assert.equal(creation.key,'slipsurge-account-'+creatorId)
 assert.equal(admin.calls.some(call=>call.table==='creator_applications'),false)
})
test('restarting onboarding recovers the same subaccount using the stable external ID', async () => {
 const admin=db(()=>({data:{id:creatorId,username:'fixture',account_type:'admin',whop_connected_company_id:null},error:null}))
 let creates=0;let saved
 admin.from = db(call=>call.op==='update'?(saved=call.values,{error:null}):({data:{id:creatorId,username:'fixture',account_type:'admin',whop_connected_company_id:null},error:null})).from
 const route=compile('src/app/api/creator/whop-onboard/route.ts',{
  'next/server':next,'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:creatorId,email:'fixture@fixture.invalid'}}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/whopPlatform':{getWhopPlatformCompanyId:()=>parent,PLATFORM_URL:'https://www.slipsurge.com'},
  '@/lib/creatorWhop':{creatorWhop:async(path)=>{if(path==='/accounts/me')return{id:parent};if(path.startsWith('/accounts?'))return{data:[{id:account,parent_account:{id:parent}}]};creates++;throw new Error('Duplicate account create')},getCreatorPaymentState:async()=>({state:'onboarding'}),creatorAccountLink:async()=>({url:'https://whop.com/onboard/fixture'})},
  '@/lib/whopUrl':{isTrustedWhopUrl:()=>true},'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({available:true,allowed:true})},'@/lib/safeApiError':safeApi,
 })
 assert.equal((await route.POST()).status,200);assert.equal(creates,0);assert.equal(saved.account_type,undefined,'admin role is preserved')
})
test('checkout requires a real session before it reads an offer or talks to Whop', async () => {
 const route=compile('src/app/api/creator/products/[productId]/checkout/route.ts',{
  'next/server':next,'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>{throw new Error('Unexpected admin read')}},
  '@/lib/platform':{PLATFORM_URL:'https://www.slipsurge.com'},'@/lib/creatorWhop':{},'@/lib/creatorCommerce':commerce,
  '@/lib/serverRateLimit':{},'@/lib/safeApiError':safeApi,'@/lib/whopUrl':{},'@/lib/creatorWebhookConfig':{},
 })
 assert.equal((await route.POST(new Request('https://www.slipsurge.com'),{params:Promise.resolve({productId})})).status,401)
})

async function creatorReceiver(existing,fail=false) {
 const admin=db(call=>call.op==='select'?{data:existing,error:null}:{data:null,error:null})
 const receiver=compile('src/lib/whopWebhook.ts',{
  'next/server':{...next,after:()=>{}},crypto,'@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@slipsurge/core/tiers':{WHOP_PLANS:{},TIER_RANK:{}},'@/lib/tierBadges':{},'@/lib/xConversion':{},'@/lib/discord':{},'@/lib/billingAlert':{},
  '@/lib/whopMembershipAccess':access,'@/lib/whopRepricedUltimate':{},'@/lib/whopConcurrentUpgrade':{},
  '@/lib/creatorWebhook':{handleCreatorWebhook:async()=>{if(fail)throw new Error('Fixture transaction failure');return true}},
 })
 const body=JSON.stringify({type:'account.updated',data:{id:'biz_fixture'}}), timestamp=String(Math.floor(Date.now()/1000)), id='evt_fixture_receiver', secret='ws_fixture_receiver'
 const signature=crypto.createHmac('sha256',Buffer.from(secret)).update(id+'.'+timestamp+'.'+body).digest('base64')
 const request=signatureValue=>new Request('https://www.slipsurge.com/api/webhooks/whop-creator',{method:'POST',headers:{'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':signatureValue??'v1,'+signature},body})
 return {admin,receiver,request,secret}
}
test('creator delivery validates signatures before processing a receipt',async()=>{
 const {admin,receiver,request,secret}=await creatorReceiver(null)
 assert.equal((await receiver.handleWhopWebhookRequest(request('v1,invalid'),secret,'creator')).status,400)
 assert.equal(admin.calls.length,0)
 assert.equal((await receiver.handleWhopWebhookRequest(request(),secret,'creator')).status,200)
 assert.equal(admin.calls.findLast(call=>call.op==='update').values.status,'succeeded')
})
test('an in-flight creator delivery asks Whop to retry instead of acknowledging unfinished access',async()=>{
 const {receiver,request,secret}=await creatorReceiver({id:'receipt_fixture',status:'processing',updated_at:new Date().toISOString(),attempt_count:1})
 assert.equal((await receiver.handleWhopWebhookRequest(request(),secret,'creator')).status,503)
})
test('a failed creator access transaction records failure and requests provider retry',async()=>{
 const {admin,receiver,request,secret}=await creatorReceiver(null,true)
 assert.equal((await receiver.handleWhopWebhookRequest(request(),secret,'creator')).status,500)
 assert.equal(admin.calls.findLast(call=>call.op==='update').values.status,'failed')
})

function scheduleFixture(ownsDestination=true) {
 const admin=db(call=>{
  if(call.table==='users')return{data:{account_type:'user'},error:null}
  if(call.table==='groups')return{data:ownsDestination?{id:productId}:null,error:null}
  return{data:{id:productId,...call.values},error:null}
 })
 const client={auth:{getUser:async()=>({data:{user:{id:creatorId}}})},from:()=>db(()=>({data:{id:productId},error:null})).from('groups')}
 const route=compile('src/app/api/creator/scheduled-posts/route.ts',{
  'next/server':next,'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/creator':{hasApprovedCreatorAccess:async()=>{throw new Error('Free group owners need no application')}},
  '@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({available:true,allowed:true})},
  '@/lib/safeApiError':safeApi,'@/lib/mlbOffseason':{MLB_HIBERNATING:true},
 })
 const request=body=>new Request('https://www.slipsurge.com/api/creator/scheduled-posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
 return{route,admin,request}
}
test('ordinary free community owners can save member drafts without creator approval',async()=>{
 const {route,admin,request}=scheduleFixture()
 assert.equal((await route.POST(request({content:'Member research',groupId:productId,draft:true,visibility:'public'}))).status,201)
 const save=admin.calls.find(call=>call.op==='insert')
 assert.equal(save.values.group_id,productId);assert.equal(save.values.creator_id,creatorId);assert.equal(save.values.status,'draft')
})
test('scheduling rejects another creator’s community and unbound premium content',async()=>{
 const other=scheduleFixture(false)
 assert.equal((await other.route.POST(other.request({content:'Wrong destination',groupId:productId,draft:true}))).status,403)
 assert.equal(other.admin.calls.some(call=>call.op==='insert'),false)
 const own=scheduleFixture()
 assert.equal((await own.route.POST(own.request({content:'Unbound premium',visibility:'premium',draft:true}))).status,400)
 assert.equal(own.admin.calls.some(call=>call.op==='insert'),false)
})
test('scheduled edits retain the owned community and restrict the update to the signed-in creator',async()=>{
 const {route,admin,request}=scheduleFixture()
 assert.equal((await route.PATCH(request({id:productId,action:'edit',content:'Revised research',groupId:productId,draft:true}))).status,200)
 const save=admin.calls.find(call=>call.op==='update')
 assert.equal(save.values.group_id,productId)
 assert.ok(save.filters.some(([op,column,value])=>op==='eq'&&column==='creator_id'&&value===creatorId))
})
test('the existing publisher keeps community destinations and blocks legacy unbound premium posts',async()=>{
 const due=[{id:productId,creator_id:creatorId,group_id:buyerId,content:'Member only',visibility:'public',attempts:0},{id:buyerId,creator_id:creatorId,group_id:null,content:'Legacy private',visibility:'premium',attempts:0}]
 const admin=db(call=>call.table==='creator_scheduled_posts'&&call.op==='select'?{data:due,error:null}:call.table==='posts'?{data:{id:productId},error:null}:{data:{id:productId},error:null})
 const route=compile('src/app/api/cron/publish-scheduled-posts/route.ts',{
  'next/server':next,'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/cron-auth':{requireCronAuth:()=>null},
  '@/lib/pipelineHealth':{withPipelineHealth:(_name,run)=>run},'@/lib/safeApiError':safeApi,'@/lib/mlbOffseason':{MLB_HIBERNATING:true},
 })
 assert.equal((await route.GET(new Request('https://www.slipsurge.com/api/cron/publish-scheduled-posts'))).status,503)
 const published=admin.calls.filter(call=>call.table==='posts'&&call.op==='insert')
 assert.equal(published.length,1);assert.equal(published[0].values.group_id,buyerId)
 assert.ok(admin.calls.some(call=>call.values?.status==='failed'&&call.values?.last_error?.includes('member community')))
})
