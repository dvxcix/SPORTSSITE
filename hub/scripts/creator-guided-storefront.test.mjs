import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {NextRequest,NextResponse} from 'next/server.js'
import {PGlite} from '@electric-sql/pglite'
import { creatorBrowserRouteImport } from './creator-route-fixture.mjs'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')
function compile(path,imports={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(name==='server-only')return {};const creatorImport=creatorBrowserRouteImport(name,compile,imports);if(creatorImport)return creatorImport;assert.ok(name in imports,'Unexpected import '+name);return imports[name]},module,module.exports);return module.exports}
const domain=compile('src/lib/creatorStorefront.ts'),owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',groupId='00000000-0000-4000-8000-000000000201',productId='00000000-0000-4000-8000-000000000301'
const draft={name:'Court Notes',bio:'Basketball research and original film analysis.',logo_url:null,cover_url:null,sports:['NBA'],tags:['Film study'],access_mode:'free',setup_step:2,product_id:null}
const req=(body,origin='https://www.slipsurge.com')=>new NextRequest('https://www.slipsurge.com/api/creator/storefront',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
function db(resolve){const calls=[];return{calls,from(table){const call={table,filters:[]};calls.push(call);const query=new Proxy({},{get:(_,key)=>key==='then'?(yes,no)=>Promise.resolve(resolve(call)).then(yes,no):(...args)=>{if(['insert','update','upsert'].includes(key)){call.operation=key;call.values=args[0]}else if(key==='select')call.columns=args[0];else call.filters.push([key,...args]);return query}});return query}}}
function setup(options={}){
 const store={...draft,creator_id:owner,status:'draft',community_id:groupId,featured:true,featured_rank:2,...options.store},rpc=[],provider=[]
 const admin=db(call=>{if(call.operation)return {data:{...store,...call.values},error:null};if(call.table==='creator_storefronts')return {data:options.noStore?null:store,error:null};if(call.table==='groups')return {data:options.badGroup?null:{id:groupId,slug:options.privateGroup?'private-film-room':'club-'+owner.replaceAll('-',''),is_public:!options.privateGroup,creator_product_id:options.paid?productId:null,access_type:options.paid?'paid':'free'},error:null};if(call.table==='creator_products')return{data:options.badProduct?null:{id:productId},error:null};throw Error('Unexpected table')})
 const module=compile('src/app/api/creator/storefront/route.ts',{'next/server':{NextRequest,NextResponse},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.anonymous?null:{id:owner}}})},rpc:async(name,args)=>{rpc.push({name,args});return{error:options.brandError?{code:'failed'}:null}}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/creatorStorefront':domain,'@/lib/creatorOfferStatus':{setCreatorOfferStatus:async(...args)=>{provider.push(args.slice(1));if(options.providerError)throw Error('Provider failure')}},'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:!options.limited,available:true})}})
 return {run:body=>module.POST(req(body)),module,admin,rpc,provider,store}
}
test('store draft validates branding, sports and tags and never accepts ownership or promotion fields',()=>{
 assert.deepEqual(domain.storeDraft({...draft,sports:['NBA','NBA'],tags:[' Film study ','Film study']}),draft)
 for(const extra of [{creator_id:other},{featured:true},{featured_rank:0},{community_id:groupId},{status:'published'},{draft:{featured:true}}])assert.throws(()=>domain.storeDraft({...draft,...extra}))
 for(const change of [{tags:Array(9).fill('tag')},{tags:['<script>']},{tags:['x'.repeat(31)]},{sports:['Unknown']},{access_mode:['free']},{logo_url:'javascript:alert(1)'},{cover_url:'https://user:password@example.test/img.png'},{setup_step:9}])assert.throws(()=>domain.storeDraft({...draft,...change}))
 const long={name:'N'.repeat(80),bio:'B'.repeat(1000)};assert.deepEqual(domain.storeCommunityBrand(long),{p_name:'N'.repeat(60),p_description:'B'.repeat(280)});assert.equal(long.bio.length,1000)
})
test('publishing requires a real name, bio, coverage, owned community and paid product where applicable',()=>{
 const valid={...draft,community_id:groupId};assert.equal(domain.storePublishIssue(valid),null)
 for(const change of [{name:''},{bio:'Short'},{sports:[]},{community_id:null},{access_mode:'paid',product_id:null}])assert.equal(typeof domain.storePublishIssue({...valid,...change}),'string')
})
test('creator draft saves resolve ownership on the server and preserve promotion columns',async()=>{
 const f=setup(),response=await f.run({...draft,action:'save'});assert.equal(response.status,200)
 const writes=f.admin.calls.filter(call=>call.operation);assert.equal(writes.length,1);assert.equal(writes[0].values.creator_id,owner);assert.equal('featured'in writes[0].values,false);assert.deepEqual(writes[0].filters,[['eq','creator_id',owner],['single']]);assert.equal(f.provider.length,0)
})
test('editing a published store saves a private draft without changing its public identity',async()=>{
 const f=setup({store:{status:'published'}}),response=await f.run({...draft,name:'New name',action:'save'});assert.equal(response.status,200)
 const write=f.admin.calls.find(call=>call.operation);assert.equal(write.values.draft.name,'New name');assert.equal(Object.hasOwn(write.values,'name'),false);assert.equal(Object.hasOwn(write.values,'status'),false)
 assert.equal((await response.json()).store.has_draft,true)
})

test('an unpublished access change detaches only the draft pointer so a matching existing space can be selected',async()=>{
 const f=setup(),response=await f.run({...draft,access_mode:'paid',product_id:productId,action:'save'});assert.equal(response.status,200)
 const write=f.admin.calls.find(call=>call.operation);assert.equal(write.values.community_id,null);assert.equal(write.values.product_id,productId);assert.equal(f.rpc.length,0)
})
test('published access cannot change through store draft edits',async()=>{
 const f=setup({store:{status:'published'}});assert.equal((await f.run({...draft,access_mode:'paid',product_id:productId,action:'save'})).status,409);assert.equal(f.admin.calls.some(call=>call.operation),false)
})
test('free store publication never calls Whop or adds application fees',async()=>{
 const f=setup(),response=await f.run({...draft,action:'publish'});assert.equal(response.status,200);assert.equal(f.provider.length,0)
 assert.equal(f.rpc[0].args.p_is_public,true);assert.equal(f.admin.calls.find(call=>call.operation).values.status,'published')
})
test('reusing an existing private free space never publishes its private content',async()=>{
 const f=setup({privateGroup:true});assert.equal((await f.run({...draft,action:'publish'})).status,200);assert.equal(f.rpc[0].args.p_is_public,false)
})
test('paid publication verifies exact owned community/product and uses the established offer gate',async()=>{
 const input={...draft,access_mode:'paid',product_id:productId,action:'publish'},f=setup({paid:true,store:{access_mode:'paid',product_id:productId}})
 assert.equal((await f.run(input)).status,200);assert.deepEqual(f.provider,[[productId,'active',owner]]);assert.equal(f.rpc[0].args.p_is_public,false)
 const bad=setup({badProduct:true,store:{access_mode:'paid',product_id:productId}});assert.equal((await bad.run(input)).status,403);assert.equal(bad.provider.length,0)
 const missing=setup({badGroup:true});assert.equal((await missing.run({...draft,action:'publish'})).status,409);assert.equal(missing.admin.calls.some(call=>call.operation),false)
})
test('provider/branding failures cannot mark a store published',async()=>{
 for(const options of [{paid:true,store:{access_mode:'paid',product_id:productId},providerError:true},{brandError:true}]){const f=setup(options);assert.ok((await f.run({...draft,...(options.paid?{access_mode:'paid',product_id:productId}:{}),action:'publish'})).status>=400);assert.equal(f.admin.calls.some(call=>call.operation),false)}
})
test('anonymous, forged and rate-limited saves produce no store or provider mutations',async()=>{
 for(const options of [{anonymous:true},{limited:true}]){const f=setup(options);assert.ok((await f.run({...draft,action:'save'})).status>=400);assert.equal(f.admin.calls.some(call=>call.operation),false);assert.equal(f.provider.length,0)}
 const f=setup();assert.equal((await f.module.POST(req({...draft,action:'save'},'https://attacker.test'))).status,403);assert.equal(f.admin.calls.length,0)
})
test('member-created setup communities start private and are resumable without making duplicates',async()=>{
 let created=0;const calls=[];let existing=null
 const admin=db(call=>call.table==='creator_storefronts'?call.operation?{data:null,error:null}:{data:{...draft,creator_id:owner,status:'draft',community_id:null},error:null}:{data:existing?[existing]:[],error:null})
 const module=compile('src/app/api/creator/storefront/community/route.ts',{'next/server':{NextRequest,NextResponse},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async(name,args)=>{calls.push({name,args});if(name==='create_community_group'){created++;existing={id:groupId,slug:args.p_slug,creator_product_id:null,access_type:'free'};return{data:[{group_id:groupId,group_slug:args.p_slug}],error:null}}return{error:null}}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/creatorStorefront':domain,'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:true,available:true})}})
 assert.equal((await module.POST(req({}))).status,200);assert.equal((await module.POST(req({}))).status,200);assert.equal(created,1)
 assert.equal(calls.find(row=>row.name==='create_community_group').args.p_is_public,false)
 assert.ok(calls.filter(row=>row.name==='update_community_group').every(row=>row.args.p_is_public===false))
})
test('new storefront schema enforces owner visibility, private draft columns and service-only promotion writes',async()=>{
 const database=new PGlite();await database.exec(read('review/creator-setup-database.sql'));await database.exec(read('supabase/migrations/20261123123549_creator_guided_storefronts.sql'))
 await database.exec(`insert into creator_storefronts(creator_id,name,bio,sports,status,draft) values ('${owner}','Draft store','Draft biography',array['NBA'],'draft','{"name":"Secret draft"}'),('${other}','Public store','Published biography',array['NFL'],'published','{"name":"Private edit"}');`)
 await database.exec('set role anon');assert.equal((await database.query('select name from creator_storefronts')).rows.length,1)
 await assert.rejects(database.query('select draft from creator_storefronts'));await assert.rejects(database.query(`update creator_storefronts set featured=true where creator_id='${other}'`))
 await database.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`)
 assert.equal((await database.query('select name from creator_storefronts order by name')).rows.length,2)
 await assert.rejects(database.query('select draft from creator_storefronts'));await assert.rejects(database.query(`update creator_storefronts set name='Changed' where creator_id='${owner}'`));await assert.rejects(database.query(`insert into creator_storefronts(creator_id) values ('${owner}')`))
 await database.exec(`reset role; set role service_role; update creator_storefronts set featured=true,featured_rank=1 where creator_id='${other}';`)
 assert.equal((await database.query(`select featured from creator_storefronts where creator_id='${other}'`)).rows[0].featured,true)
 await assert.rejects(database.query(`update creator_storefronts set status='published',bio='' where creator_id='${owner}'`))
 await database.close()
})
test('marketplace promotion requires admin authorization and only updates a published store',async()=>{
 for(const denied of [true,false]){
  const admin=db(call=>({data:{creator_id:other},error:null})),audits=[]
  const module=compile('src/app/api/admin/creators/promotions/route.ts',{'next/server':{NextRequest,NextResponse},'@/lib/creatorAdminAuth':{creatorAdminAuth:async()=>denied?{error:'Forbidden',status:403}:{user:{id:owner},admin}},'@/lib/adminAudit':{writeAdminAudit:async(_admin,input)=>{audits.push(input);return null}},'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:true,available:true})}})
  const response=await module.POST(req({creatorId:other,featured:true,rank:1}))
  assert.equal(response.status,denied?403:200)
  if(denied){assert.equal(admin.calls.length,0);assert.equal(audits.length,0)}else{assert.equal(admin.calls[0].filters.some(args=>args[0]==='eq'&&args[1]==='status'&&args[2]==='published'),true);assert.equal(audits[0].action,'creator.store_feature_changed')}
 }
})
test('embedded onboarding reuses an owned verified subaccount without creating a hosted link',async()=>{
 const calls=[]
 const admin=db(()=>({data:{username:'owner',whop_connected_company_id:'biz_owned'},error:null}))
 const module=compile('src/app/api/creator/whop-onboard/route.ts',{'next/server':{NextRequest,NextResponse},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:owner}}})}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/whopPlatform':{getWhopPlatformCompanyId:()=> 'biz_platform',PLATFORM_URL:'https://www.slipsurge.com'},'@/lib/creatorWhop':{creatorWhop:async path=>{calls.push(path);return{id:'biz_platform'}},getCreatorPaymentState:async id=>{assert.equal(id,'biz_owned');return{state:'ready',canCharge:true}},creatorAccountLink:async()=>{throw Error('Hosted link must not be created')}},'@/lib/whopUrl':{isTrustedWhopUrl:()=>true},'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:true,available:true})},'@/lib/safeApiError':{safeApiError:()=>NextResponse.json({error:'Unavailable'},{status:502})}})
 const response=await module.POST(new NextRequest('https://www.slipsurge.com/api/creator/whop-onboard?embedded=1',{method:'POST',headers:{origin:'https://www.slipsurge.com'}}))
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.embedded,true);assert.equal(Object.hasOwn(body,'url'),false);assert.deepEqual(calls,['/accounts/me'])
})
