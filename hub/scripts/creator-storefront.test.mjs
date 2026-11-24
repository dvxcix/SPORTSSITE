import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
function compile(path,imports={},extra={}){
 const module={exports:{}}
 const source=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports','fetch','process',source)(name=>{if(name==='server-only')return {};assert.ok(name in imports,'Unexpected import '+name);return imports[name]},module,module.exports,extra.fetch||fetch,extra.process||process)
 return module.exports
}
function db(resolve){const calls=[];return{calls,from(table){const call={table,filters:[]};calls.push(call);const query=new Proxy({},{get:(_,key)=>key==='then'?(yes,no)=>Promise.resolve(resolve(call)).then(yes,no):(...args)=>{if(['insert','update'].includes(key))call.values=args[0];else if(key==='select')call.columns=args[0];else call.filters.push([key,...args]);return query}});return query},rpc(name,args){const call={rpc:name,args};calls.push(call);return Promise.resolve(resolve(call))}}}
const commerce=compile('src/lib/creatorCommerce.ts')
const access=compile('src/lib/whopMembershipAccess.ts')
const membership=compile('src/lib/creatorMembership.ts',{'./whopMembershipAccess':access})
const policy=compile('src/lib/creatorDiscordPolicy.ts')
const ids={user:'00000000-0000-4000-8000-000000000001',creator:'00000000-0000-4000-8000-000000000002',product:'00000000-0000-4000-8000-000000000003'}
const sample={id:'mem_owned',user_id:'user_verified',account:{id:'biz_creator'},variant_id:'plan_owned',status:'active',updated_at:'2026-11-22T12:00:00Z',current_period_end:'2099-01-01T00:00:00Z'}
function restoration(options={}){
 let providerCalls=[]
 const admin=db(call=>{
  if(call.rpc)return {error:null}
  if(call.table==='creator_products')return {data:{id:ids.product,creator_id:ids.creator,whop_plan_id:'plan_owned',product_type:'membership'},error:null}
  if(call.table==='creator_entitlements')return {data:{status:options.hold?'revoked':'active',admin_revoked_at:options.hold?'2026-11-22':null},error:null}
  return {data:call.columns==='whop_user_id'?{whop_user_id:options.unlinked?null:'user_verified'}:{whop_connected_company_id:'biz_creator'},error:null}
 })
 const module=compile('src/lib/creatorAccessRestore.ts',{'./creatorMembership':membership,'./creatorWhop':{getCreatorPaymentState:async()=>{if(options.wrongParent)throw Error('Wrong parent');return {canCharge:false}},creatorWhop:async path=>{providerCalls.push(path);if(options.outage)throw Error('Provider down');return path.startsWith('/memberships?')?{data:options.candidates??[sample],page_info:{has_next_page:false,end_cursor:null}}:options.canonical??sample}}})
 return {admin,module,providerCalls,run:()=>module.restoreCreatorAccess(admin,ids.user,ids.product)}
}
test('new products inherit Whop fees without adding a second application fee',()=>{
 for(const recurring of [true,false])for(const days of [7,30,90,365]){
  const value=commerce.creatorOfferPayload({accountId:'biz_creator',productId:ids.product,creatorId:ids.creator,title:'Club',description:'Research',price:24,recurring,billingDays:days,returnUrl:'https://www.slipsurge.com'})
  assert.equal(Object.hasOwn(value.variant,'application_fee_amount'),false)
  assert.equal(recurring?value.variant.billing_period:value.variant.expiration_days,days)
  assert.equal(value.variant.stock,0);assert.equal(value.variant.unlimited_stock,false)
 }
})
test('restore requires a linked Whop identity and never trusts supplied email',async()=>{
 const f=restoration({unlinked:true});assert.equal((await f.run()).state,'link_required');assert.equal(f.providerCalls.length,0);assert.equal(f.admin.calls.some(c=>c.rpc),false)
})
test('restore scopes the provider request to exact account, buyer and product',async()=>{
 const f=restoration();assert.equal((await f.run()).state,'active')
 const q=new URLSearchParams(f.providerCalls[0].split('?')[1]);assert.equal(q.get('user_id'),'user_verified');assert.equal(q.get('account_id'),'biz_creator');assert.equal(q.get('variant_id'),'plan_owned')
 const write=f.admin.calls.find(c=>c.rpc);assert.equal(write.rpc,'apply_creator_membership');assert.equal(write.args.p_user_id,ids.user);assert.equal(write.args.p_event_type,'membership.restored')
})
test('cross-account, cross-product and cross-buyer memberships cannot be restored',async()=>{
 for(const value of [{...sample,account:{id:'biz_other'}},{...sample,variant_id:'plan_other'},{...sample,user_id:'user_other'}]){
  const f=restoration({candidates:[value]});assert.equal((await f.run()).state,'not_found');assert.equal(f.admin.calls.some(c=>c.rpc),false)
 }
})
test('canonical membership ownership is checked again after listing',async()=>{
 const f=restoration({canonical:{...sample,user_id:'user_other'}});await assert.rejects(f.run());assert.equal(f.admin.calls.some(c=>c.rpc),false)
})
test('expired subscriptions, wrong parent and provider failures never grant or revoke access',async()=>{
 const expired=restoration({canonical:{...sample,current_period_end:'2020-01-01T00:00:00Z'}});assert.equal((await expired.run()).state,'not_found');assert.equal(expired.admin.calls.some(c=>c.rpc),false)
 for(const options of [{wrongParent:true},{outage:true}]){const f=restoration(options);await assert.rejects(f.run());assert.equal(f.admin.calls.some(c=>c.rpc),false)}
})
test('an admin access hold survives a successful Whop identity restoration',async()=>{assert.equal((await restoration({hold:true}).run()).state,'support_required')})
test('one-time access respects provider expiration and completed status',()=>{
 const value={...sample,status:'completed',current_period_end:null,expires_at:'2020-01-01T00:00:00Z'}
 assert.equal(membership.creatorMembershipState(value,false).status,'expired')
 assert.equal(membership.creatorMembershipState({...value,expires_at:'2099-01-01T00:00:00Z'},false).status,'active')
})
test('Discord guild management requires verified owner or real management permissions',()=>{
 const guild='123456789012345678';const roles=[{id:guild,name:'Everyone',position:0,permissions:'0'},{id:'manager',position:4,permissions:'32'}]
 assert.equal(policy.managesDiscordGuild('owner','owner',[],roles,guild),true)
 assert.equal(policy.managesDiscordGuild('owner','member',[],roles,guild),false)
 assert.equal(policy.managesDiscordGuild('owner','member',['manager'],roles,guild),true)
})
test('only safe membership roles beneath the bot can be mapped',()=>{
 const guild='123456789012345678',bot='bot';const role=(id,position,permissions='0',managed=false)=>({id,name:id,position,permissions,managed})
 const roles=[role(guild,0),role(bot,5,'268435456'),role('member',2),role('admin',2,'8'),role('moderator',2,'8192'),role('voice mod',2,'4194304'),role('thread mod',2,'17179869184'),role('pins',2,'2251799813685248'),role('higher',8),role('equal',5),role('managed',2,'0',true)]
 assert.deepEqual(policy.assignableCreatorRoles(guild,roles,[bot]).map(r=>r.id),['member'])
 assert.deepEqual(policy.assignableCreatorRoles(guild,roles,[]),[])
})
test('fee display preserves provider percentage units and fixed currency without guessing a total',()=>{
 const fees=compile('src/lib/creatorFees.ts')
 assert.deepEqual(fees.whopFeeRows({card_processing:{percentage:2.4,fixed:{amount:'0.30',currency:'usd'},source:'custom',default:{percentage:9,fixed:null}}}),[{label:'card processing',percentage:2.4,fixed:'0.30 USD',source:'custom'}])
})
test('platform configuration follows the working shared-key and legacy-account fallback',()=>{
 const module=compile('src/lib/whopPlatform.ts',{'@whop/sdk':{},'./whopApi':{},'@/lib/platform':{}},{process:{env:{WHOP_API_KEY:'fixture-not-a-key',WHOP_COMPANY_ID:'platform'}}})
 assert.deepEqual(module.whopPlatformConfiguration(),{apiConfigured:true,companyConfigured:true});assert.equal(module.getWhopPlatformCompanyId(),'biz_platform')
})
test('product API saves zero extra fee and carries the selected billing period to Whop',async()=>{
 let saved=null,provider=null
 const admin=db(call=>{
  if(call.table==='users')return {data:{username:'fixture-creator',whop_connected_company_id:'biz_creator'},error:null}
  assert.notEqual(call.table,'platform_settings','Local percentage must not affect products')
  if(call.values?.creator_id){saved=call.values;return {data:saved,error:null}}
  return {data:null,error:null}
 })
 const route=compile('src/app/api/creator/products/route.ts',{
  'next/server':{NextResponse:{json:(value,options)=>Response.json(value,options)}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:ids.creator}}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/whopPlatform':{PLATFORM_URL:'https://www.slipsurge.com'},
  '@/lib/creatorWhop':{getCreatorPaymentState:async()=>({canCharge:true}),creatorWhop:async(path,body)=>{provider={path,body};return {id:'ch_fixture',variant:{id:'plan_fixture',product_id:'prod_fixture'}}}},
  '@/lib/creatorCommerce':commerce,'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:true,available:true})},
  '@/lib/creatorWebhookConfig':{creatorDeliveryReady:async()=>true},'@/lib/safeApiError':{safeApiError:()=>Response.json({error:'Failed'},{status:502})},'@/lib/creatorOfferStatus':{},
 })
 const request=new Request('https://www.slipsurge.com/api/creator/products',{method:'POST',body:JSON.stringify({requestId:ids.product,title:'Research club',description:'Weekly research',price:29,productType:'membership',billingDays:7,fee:10})})
 const response=await route.POST(request)
 assert.equal(response.status,200);assert.equal(saved.platform_fee_amount,0);assert.equal(saved.billing_period_days,7)
 assert.equal(provider.body.variant.billing_period,7);assert.equal(Object.hasOwn(provider.body.variant,'application_fee_amount'),false)
})
test('direct Whop purchases can bind only through the verified Whop buyer identity',async()=>{
 const member={...sample,metadata:{}}
 const admin=db(call=>{
  if(call.rpc)return {error:null}
  if(call.table==='creator_products')return {data:{id:ids.product,creator_id:ids.creator,whop_plan_id:'plan_owned',product_type:'membership'},error:null}
  if(call.table==='creator_entitlements')return {data:null,error:null}
  return {data:call.columns==='id'?{id:ids.user}:{whop_connected_company_id:'biz_creator'},error:null}
 })
 const webhook=compile('src/lib/creatorWebhook.ts',{'./creatorWhop':{creatorWhop:async()=>member},'./creatorMembership':membership})
 assert.equal(await webhook.handleCreatorWebhook(admin,'event_direct','membership.activated',{id:member.id,variant_id:member.variant_id}),true)
 const identity=admin.calls.find(call=>call.table==='users'&&call.columns==='id');assert.deepEqual(identity.filters[0],['eq','whop_user_id','user_verified'])
 assert.equal(admin.calls.find(call=>call.rpc).args.p_user_id,ids.user)
})
function discordVerification(options={}){
 const provider=[]
 const admin=db(call=>{
  if(call.rpc==='claim_creator_discord_jobs')return {data:[{id:'job',integration_id:'integration',user_id:ids.user,version:1}],error:null}
  if(call.rpc)return {data:{allowed:true,discord_id:'123456789012345677',guild_id:'123456789012345678',role_id:'123456789012345679'},error:null}
  if(call.table==='creator_discord_integrations')return {data:{group_id:'group',enabled:true},error:null}
  if(call.table==='groups')return {data:{owner_id:ids.creator,access_type:options.free?'free':'paid',creator_product_id:ids.product},error:null}
  if(call.table==='creator_entitlements')return {data:{whop_membership_id:'mem_owned',admin_revoked_at:options.hold?'2026-11-22':null,status:options.expired?'expired':'active',current_period_end:options.expired?'2020-01-01':'2099-01-01'},error:null}
  return {error:null}
 })
 admin.auth={admin:{getUserById:async()=>({data:{user:{identities:[{provider:'discord',identity_data:{sub:'123456789012345677'}}]}},error:null})}}
 const module=compile('src/lib/creatorDiscord.ts',{'./creatorDiscordPolicy':policy,'./creatorCommerce':commerce,'./creatorWebhook':{handleCreatorWebhook:async(...args)=>{provider.push(args);if(options.outage)throw Error('Provider unavailable');return true}}},{fetch:async()=>{throw Error('Discord role must not be assigned without provider verification')}})
 return {admin,module,provider}
}
test('paid Discord claims verify the bound Whop membership with server-owned buyer metadata',async()=>{
 const f=discordVerification();await f.module.verifyCreatorDiscordMembership(f.admin,'integration',ids.user)
 assert.equal(f.provider.length,1);assert.equal(f.provider[0][1],'discord-check:mem_owned');assert.equal(f.provider[0][3].metadata.internal_user_id,ids.user)
})
test('free community roles and admin-held memberships do not require a payment lookup',async()=>{
 for(const options of [{free:true},{hold:true}]){const f=discordVerification(options);await f.module.verifyCreatorDiscordMembership(f.admin,'integration',ids.user);assert.equal(f.provider.length,0)}
})
test('a Whop outage blocks new paid role delivery and retains its retry',async()=>{
 const f=discordVerification({outage:true});assert.deepEqual(await f.module.processCreatorDiscordQueue(f.admin,1),{completed:0,failed:1})
 assert.equal(f.admin.calls.find(call=>call.rpc==='finish_creator_discord_job').args.p_success,false)
 assert.equal(f.admin.calls.some(call=>call.rpc==='creator_discord_access'),true,'Local revocation is checked before a provider outage can block delivery')
})
test('a provider outage cannot extend a locally expired membership',async()=>{
 const f=discordVerification({outage:true,expired:true});await f.module.verifyCreatorDiscordMembership(f.admin,'integration',ids.user)
 assert.equal(f.provider.length,1)
 assert.equal(commerce.hasCurrentCreatorAccess({status:'expired',current_period_end:'2020-01-01'}),false)
})

function embeddedCheckout(options={}){
 const providerCalls=[]
 const admin=db(call=>{
  if(call.table==='creator_products')return {data:{id:ids.product,creator_id:options.owner?ids.user:ids.creator,status:options.paused?'paused':'active',whop_plan_id:'plan_owned'},error:null}
  if(call.table==='creator_entitlements')return {data:options.entitled?{status:'active',current_period_end:'2099-01-01'}:null,error:null}
  return {data:{whop_connected_company_id:'biz_creator'},error:null}
 })
 const next={NextResponse:{json:(body,init={})=>new Response(JSON.stringify(body),{status:init.status||200,headers:init.headers})}}
 const route=compile('src/app/api/creator/products/[productId]/checkout/route.ts',{
  'next/server':next,'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:ids.user}}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/platform':{PLATFORM_URL:'https://www.slipsurge.com'},
  '@/lib/creatorWhop':{getCreatorPaymentState:async()=>{if(options.wrongAccount)throw Error('Wrong parent');return {canCharge:!options.restricted}},creatorWhop:async(path,body,key)=>{providerCalls.push({path,body,key});return options.response??{id:'ch_verified',purchase_url:'https://whop.com/checkout/verified'}}},
  '@/lib/creatorCommerce':commerce,'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:!options.limited,available:true})},
  '@/lib/creatorWebhookConfig':{creatorDeliveryReady:async()=>!options.disconnected},
  '@/lib/safeApiError':{safeApiError:(_tag,_cause,message,status=500)=>next.NextResponse.json({error:message},{status})},
  '@/lib/whopUrl':{isTrustedWhopUrl:value=>{try{return new URL(value).protocol==='https:'&&new URL(value).hostname==='whop.com'}catch{return false}}},
 })
 return {providerCalls,admin,run:()=>route.POST(new Request('https://www.slipsurge.com/api/creator/products/'+ids.product+'/checkout',{method:'POST',body:JSON.stringify({creator_id:'attacker',account_id:'biz_attacker',price:0})}),{params:Promise.resolve({productId:ids.product})})}
}
test('embedded creator checkout is configured for the server-owned account, variant and signed-in buyer',async()=>{
 const f=embeddedCheckout(),response=await f.run(),data=await response.json();assert.equal(response.status,200);assert.equal(data.checkoutConfigurationId,'ch_verified');assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.deepEqual(f.providerCalls[0].body,{account_id:'biz_creator',variant_id:'plan_owned',redirect_url:'https://www.slipsurge.com/creators/access/complete?product='+ids.product,metadata:{slipsurge_product_id:ids.product,slipsurge_creator_id:ids.creator,internal_user_id:ids.user}})
 assert.match(f.providerCalls[0].key,/^slipsurge-checkout-/);assert.equal(f.admin.calls.some(call=>call.rpc||call.values),false,'checkout must not fulfill or alter memberships')
})
test('embedded checkout rejects missing, legacy and malformed provider configurations and unsafe hosted fallbacks',async()=>{
 for(const response of [{purchase_url:'https://whop.com/checkout/x'},{id:'plan_owned',purchase_url:'https://whop.com/checkout/x'},{id:'ch_x?secret',purchase_url:'https://whop.com/checkout/x'},{id:'ch_owned',purchase_url:'https://attacker.example/checkout'}]){const f=embeddedCheckout({response});assert.equal((await f.run()).status,502)}
})
test('embedded checkout retains owner, active-member, publication, provider readiness and rate gates',async()=>{
 for(const [options,status]of[[{owner:true},409],[{entitled:true},409],[{paused:true},404],[{restricted:true},409],[{wrongAccount:true},502],[{disconnected:true},503],[{limited:true},429]]){
  const f=embeddedCheckout(options),response=await f.run();assert.equal(response.status,status);assert.equal(f.providerCalls.length,0);if(options.entitled)assert.equal((await response.json()).accessUrl,'/creators/access/complete?product='+ids.product)
 }
})
