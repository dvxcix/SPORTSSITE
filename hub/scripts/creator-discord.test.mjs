import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8')
function compile(path,imports={},globals={}){
 const module={exports:{}}
 const output=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',...Object.keys(globals),output)(name=>{if(name==='server-only')return {};assert.ok(name in imports,`Unexpected import ${name}`);return imports[name]},module,module.exports,...Object.values(globals))
 return module.exports
}
function database(resolve){const calls=[];return {calls,from(table){const call={table,filters:[]};calls.push(call);const query=new Proxy({},{get:(_,key)=>key==='then'?(yes,no)=>Promise.resolve(resolve(call)).then(yes,no):(...args)=>{if(key==='select')call.columns=args[0];else if(key==='update')call.values=args[0];else call.filters.push([key,...args]);return query}});return query},rpc(name,args){const call={rpc:name,args};calls.push(call);return Promise.resolve(resolve(call))}}}
const user='00000000-0000-4000-8000-000000000001',group='00000000-0000-4000-8000-000000000002',guild='123456789012345678',discordId='123456789012345677',role='123456789012345679',bot='123456789012345680'
const policy=compile('src/lib/creatorDiscordPolicy.ts')
const response=(data,status=200)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
function coreFixture(options={}){
 const calls=[],providers=[]
 const admin=database(call=>{
  if(call.rpc==='claim_creator_discord_jobs')return {data:[{id:'job',integration_id:'integration',user_id:user,assigned_discord_id:options.previousId,version:1}],error:null}
  if(call.rpc==='creator_discord_access')return {data:{allowed:options.allowed!==false,discord_id:options.unlinked?null:discordId,guild_id:guild,role_id:role},error:null}
  if(call.table==='creator_discord_integrations')return {data:{group_id:group,enabled:true},error:null}
  if(call.table==='groups')return {data:{owner_id:'owner',access_type:options.free?'free':'paid',creator_product_id:'product'},error:null}
  if(call.table==='creator_entitlements')return {data:{whop_membership_id:'mem_fixture',status:'active',current_period_end:'2099-01-01'},error:null}
  return {data:null,error:null}
 })
 admin.auth={admin:{getUserById:async()=>{if(options.authOutage)throw Error('Auth unavailable');return {data:{user:{identities:options.unlinked?[]:[{provider:'discord',identity_data:{sub:discordId}}]}},error:null}}}}
 const fetcher=async(url,init={})=>{
  calls.push({url,method:init.method||'GET',body:init.body})
  if(url.endsWith('/users/@me'))return response({id:bot})
  if(url.endsWith('/guilds/'+guild))return response({id:guild,name:'Creator server',roles:[{id:guild,name:'Everyone',permissions:'0',position:0},{id:bot,name:'SlipSurge',permissions:'268435456',position:4},{id:role,name:'Member',permissions:options.unsafe?'8':'0',position:2}]})
  if(url.endsWith('/members/'+bot))return response({roles:[bot]})
  if(url.endsWith('/members/'+discordId))return response({pending:!!options.screening,roles:[]},options.notJoined?404:200)
  return new Response(null,{status:204})
 }
 const core=compile('src/lib/creatorDiscord.ts',{'./creatorDiscordPolicy':policy,'./creatorCommerce':{hasCurrentCreatorAccess:()=>true},'./creatorWebhook':{handleCreatorWebhook:async()=>{providers.push(1);if(options.outage)throw Error('provider down');return true}}},{fetch:fetcher,process:{env:{DISCORD_BOT_TOKEN:'fixture-only',DISCORD_APPLICATION_ID:bot}}})
 return {core,admin,calls,providers}
}

test('server choices contain only the verified account’s owned or managed servers',()=>{
 assert.deepEqual(policy.discordGuildChoices([{id:guild,name:'Mine',owner:true},{id:role,name:'Managed',permissions:'32'},{id:bot,name:'Ordinary',permissions:'1024'},{id:discordId,name:'Bad permission',permissions:'bad'}]).map(item=>item.name),['Mine','Managed'])
})
test('a delegated server manager cannot use the bot to assign roles above their own',()=>{
 const roles=[{id:guild,name:'Everyone',permissions:'0',position:0},{id:bot,name:'Bot',permissions:'268435456',position:8},{id:'manager',name:'Manager',permissions:'268435488',position:4},{id:role,name:'Member',permissions:'0',position:2},{id:'higher',name:'Private access',permissions:'0',position:6}]
 assert.deepEqual(policy.creatorAssignableRoles(guild,roles,[bot],['manager'],false).map(r=>r.id),[role])
 assert.deepEqual(policy.creatorAssignableRoles(guild,roles,[bot],[],false),[])
 assert.deepEqual(policy.creatorAssignableRoles(guild,roles,[bot],[],true).map(r=>r.id),[role,'higher'])
})
test('install grants only role management and panel permissions, with server installation context',()=>{
 const {core}=coreFixture(),url=new URL(core.creatorBotInvite(guild))
 assert.equal(url.searchParams.get('integration_type'),'0');assert.equal(url.searchParams.get('guild_id'),guild)
 assert.equal(url.searchParams.get('scope'),'bot applications.commands')
 const permissions=BigInt(url.searchParams.get('permissions'))
 assert.equal(permissions&8n,0n);for(const bit of [10,11,14,28])assert.notEqual(permissions&(1n<<BigInt(bit)),0n)
})
test('a Whop outage never causes a new paid role grant',async()=>{
 const f=coreFixture({outage:true});assert.deepEqual(await f.core.processCreatorDiscordQueue(f.admin),{completed:0,failed:1});assert.equal(f.calls.length,0)
 assert.equal(f.admin.calls.at(-1).args.p_success,false)
})
test('known membership revocation removes its role even during a Whop outage',async()=>{
 const f=coreFixture({allowed:false,outage:true,authOutage:true});assert.deepEqual(await f.core.processCreatorDiscordQueue(f.admin),{completed:1,failed:0})
 assert.equal(f.providers.length,0);assert.deepEqual(f.calls.map(call=>call.method),['DELETE'])
})
test('unlink removes the previous Discord identity without waiting on Whop',async()=>{
 const f=coreFixture({unlinked:true,outage:true,authOutage:true,previousId:'123456789012345699'});await f.core.processCreatorDiscordQueue(f.admin)
 assert.equal(f.providers.length,0);assert.equal(f.calls[0].method,'DELETE');assert.match(f.calls[0].url,/123456789012345699/)
})
test('a role that becomes administrative after setup is removed and never granted',async()=>{
 const f=coreFixture({free:true,unsafe:true});const result=await f.core.processCreatorDiscordQueue(f.admin)
 assert.equal(result.failed,1);assert.equal(f.calls.some(call=>call.method==='PUT'),false);assert.equal(f.calls.at(-1).method,'DELETE')
})
test('a pending Discord rules screen prevents role assignment',async()=>{
 const f=coreFixture({free:true,screening:true});assert.equal((await f.core.processCreatorDiscordQueue(f.admin)).failed,1)
 assert.equal(f.calls.some(call=>call.method==='PUT'),false)
})
test('members who have not joined await consent without a false role receipt or hot retries',async()=>{
 const f=coreFixture({free:true,notJoined:true});assert.deepEqual(await f.core.processCreatorDiscordQueue(f.admin),{completed:1,failed:0})
 assert.equal(f.calls.some(call=>call.method==='PUT'),false);assert.equal(f.admin.calls.at(-1).args.p_discord_id,null)
})
test('changing Discord identity removes old roles before granting the new identity',async()=>{
 const f=coreFixture({free:true,previousId:'123456789012345699'});assert.equal((await f.core.processCreatorDiscordQueue(f.admin)).completed,1)
 assert.equal(f.calls[0].method,'DELETE');assert.match(f.calls[0].url,/123456789012345699/);assert.equal(f.calls.at(-1).method,'PUT')
})
test('a paid verification outage cannot keep a role on the old Discord identity',async()=>{
 const f=coreFixture({outage:true,previousId:'123456789012345699'});assert.equal((await f.core.processCreatorDiscordQueue(f.admin)).failed,1)
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'DELETE');assert.match(f.calls[0].url,/123456789012345699/)
})
function accountFixture(options={}){
 const {core}=coreFixture(),calls=[]
 const client={auth:{getSession:async()=>({data:{session:options.noToken?{}:{provider_token:'provider-fixture'}}})}}
 const module=compile('src/lib/creatorDiscordAccount.ts',{'./creatorDiscord':{...core,creatorDiscordIdentity:async()=>discordId,creatorDiscordRequest:async(path,method,body)=>{calls.push({path,method,body});if(!method&&options.missing)throw new core.CreatorDiscordError('missing',409,'discord_not_found');return response({pending:options.screening},method==='PUT'?201:200)}},'./creatorDiscordPolicy':policy},{process:{env:{DISCORD_APPLICATION_ID:bot}},fetch:async(url,init)=>{calls.push({url,init});return url.endsWith('/users/@me')?response({id:options.wrongIdentity?role:discordId}):url.endsWith('/oauth2/@me')?response({application:{id:options.wrongApp?role:bot},scopes:options.noJoinScope?['identify']:['identify','guilds.join']}):response([{id:guild,name:'Mine',owner:true},{id:role,name:'Other'}],options.denied?403:200)}})
 return {client,calls,module}
}
test('OAuth provider token must belong to the verified Discord identity',async()=>{
 const f=accountFixture({wrongIdentity:true});await assert.rejects(f.module.discordAccountToken(f.client,discordId),/same Discord account/)
 assert.equal(f.calls.length,1)
})
test('server picker requires guild authorization and never stores a provider token',async()=>{
 const f=accountFixture();assert.deepEqual((await f.module.creatorDiscordGuildChoices(f.client,{},user)).map(g=>g.id),[guild])
 assert.equal(f.calls.length,2);assert.match(f.calls[1].init.headers.Authorization,/^Bearer /)
 const denied=accountFixture({denied:true});await assert.rejects(denied.module.creatorDiscordGuildChoices(denied.client,{},user),error=>error.code==='discord_reconnect')
})
test('join uses only the consenting member token, with the bot authenticated separately',async()=>{
 const f=accountFixture({missing:true});await f.module.joinCreatorDiscordGuild(f.client,guild,discordId)
 assert.deepEqual(f.calls.at(-1),{path:`/guilds/${guild}/members/${discordId}`,method:'PUT',body:{access_token:'provider-fixture'}})
})
test('existing server members need no extra OAuth join scope',async()=>{
 const f=accountFixture({noToken:true});await f.module.joinCreatorDiscordGuild(f.client,guild,discordId);assert.equal(f.calls.length,1)
})
test('a token issued for another Discord application never joins the server',async()=>{
 const f=accountFixture({missing:true,wrongApp:true});await assert.rejects(f.module.joinCreatorDiscordGuild(f.client,guild,discordId),error=>error.code==='discord_application_mismatch');assert.equal(f.calls.some(call=>call.method==='PUT'),false)
})
test('missing join authorization and membership screening give actionable states',async()=>{
 for(const options of [{missing:true,noToken:true},{missing:true,noJoinScope:true},{missing:true,screening:true}]){
  const f=accountFixture(options);await assert.rejects(f.module.joinCreatorDiscordGuild(f.client,guild,discordId),error=>['discord_reconnect','discord_screening'].includes(error.code))
 }
})
test('command registration upserts only the four supported commands',async()=>{
 const calls=[]
 const commands=compile('src/lib/creatorDiscordCommands.ts',{'node:crypto':crypto,'./creatorDiscord':{creatorDiscordRequest:async(...args)=>{calls.push(args)},CreatorDiscordError:Error},'./creatorDiscordClaimAccess':{},'./creatorDiscordPolicy':policy,'./platform':{PLATFORM_URL:'https://www.slipsurge.com'}},{process:{env:{DISCORD_APPLICATION_ID:bot}}})
 assert.equal(await commands.registerCreatorDiscordCommands(),4);assert.deepEqual(calls.map(call=>call[1]),['POST','POST','POST','POST'])
 assert.deepEqual(calls.map(call=>call[2].name),['help','connect','access','community'])
 assert.match(commands.discordCommandRateKey(discordId),/^[0-9a-f-]{36}$/);assert.notEqual(commands.discordCommandRateKey(discordId),commands.discordCommandRateKey(role))
})
function claimFixture(options={}){
 const {core}=coreFixture(),writes=[]
 const integrations=[{id:'one',guild_id:guild,guild_name:'Club',role_name:'Member'},{id:'two',guild_id:guild,guild_name:'Club',role_name:'Research'}]
 const admin=database(call=>{
  if(call.table==='creator_discord_integrations')return {data:integrations,error:null}
  if(call.table==='creator_discord_jobs')return {data:integrations.map(i=>({integration_id:i.id,pending:!!options.pending,assigned_discord_id:discordId})),error:null}
  if(call.rpc==='creator_discord_access')return {data:{allowed:!options.denied},error:null}
  writes.push(call);return {error:null}
 })
 const module=compile('src/lib/creatorDiscordClaimAccess.ts',{'./creatorDiscord':{...core,creatorDiscordIdentity:async()=>discordId,verifyCreatorDiscordMembership:async()=>{if(options.outage)throw Error('outage')},processCreatorDiscordQueue:async(...args)=>writes.push({process:args.slice(1)})},'./creatorDiscordAccount':{joinCreatorDiscordGuild:async()=>writes.push({join:true})}})
 return {module,admin,writes}
}
test('a community claim processes every configured role, not an unrelated integration',async()=>{
 const f=claimFixture();const result=await f.module.claimCommunityDiscord(f.admin,user,group,{})
 assert.deepEqual(result.roles,['Member','Research']);assert.deepEqual(f.writes.filter(call=>call.process).map(call=>call.process),[[1,user,'one'],[1,user,'two']])
})
test('unpaid or unverifiable claims neither join Discord nor queue roles',async()=>{
 for(const options of [{denied:true},{outage:true}]){const f=claimFixture(options);await assert.rejects(f.module.claimCommunityDiscord(f.admin,user,group,{}));assert.equal(f.writes.length,0)}
})
test('partial delivery never reports that all roles are ready',async()=>{
 const f=claimFixture({pending:true});await assert.rejects(f.module.claimCommunityDiscord(f.admin,user,group,{}),error=>error.code==='discord_pending')
})
test('a connected Discord account cannot authorize another creator’s server',async()=>{
 const {core}=coreFixture()
 let browserReads=0,nativeReads=0
 const module=compile('src/lib/creatorDiscordOwner.ts',{
  './supabase/server':{createClient:async()=>{browserReads++;return {auth:{getUser:async()=>({data:{user:{id:user}}})}}}},
  './supabase/admin':{createAdminClient:()=>database(()=>({data:{owner_id:'other'},error:null}))},
  './supabase/accountSettingsActor':{accountSettingsActor:async request=>{
   nativeReads++
   return request.headers.get('authorization')==='Bearer fixture'?{supabase:{},user:{id:user}}:{error:{status:401}}
  }},
  './mlbViewerAccess':{canViewMlb:async()=>false},
  './creatorDiscord':core,
 })
 await assert.rejects(module.creatorDiscordOwner(group),error=>error.status===403)
 const native=token=>new Request('https://www.slipsurge.com/api/action',{headers:{authorization:`Bearer ${token}`}})
 await assert.rejects(module.creatorDiscordOwner(group,native('invalid')),error=>error.status===401)
 await assert.rejects(module.creatorDiscordOwner(group,native('fixture')),error=>error.status===403)
 assert.equal(browserReads,1)
 assert.equal(nativeReads,2)
 assert.throws(()=>module.requireDiscordSameOrigin(new Request('https://www.slipsurge.com/api/action',{headers:{origin:'https://evil.invalid'}})),error=>error.status===403)
})
test('signed interactions reject forged, replayed, malformed and wrong-application requests',async()=>{
 const pair=crypto.generateKeyPairSync('ed25519'),publicHex=Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url').toString('hex')
 const discord=compile('src/lib/discord.ts',{'crypto':crypto,'@slipsurge/core/tiers':{},'@slipsurge/core/nameNorm':{},'@/lib/safeApiError':{safeErrorMetadata:()=>({})},'@/lib/operationalRetry':{}},{process:{env:{DISCORD_PUBLIC_KEY:publicHex}}})
 const body='{"type":1}',stamp=String(Math.floor(Date.now()/1000)),signature=crypto.sign(null,Buffer.from(stamp+body),pair.privateKey).toString('hex')
 assert.equal(discord.verifyDiscordSignature(signature,stamp,body),true)
 assert.equal(discord.verifyDiscordSignature(signature,stamp,body+' '),false)
 assert.equal(discord.verifyDiscordSignature(signature,String(Number(stamp)-600),body),false)
 assert.equal(discord.verifyDiscordSignature('bad',stamp,body),false)
})
test('creator commands acknowledge privately before running membership work',async()=>{
 const after=[],edits=[]
 const route=compile('src/app/api/discord/interactions/route.ts',{'next/server':{NextResponse:Object.assign(Response,{json:Response.json}),after:fn=>after.push(fn)},'@/lib/discord':{verifyDiscordSignature:()=>true,editDeferredReply:async(...args)=>edits.push(args)},'@slipsurge/core/mlbSchedule':{},'@/lib/platform':{},'@/lib/mlbOffseason':{MLB_HIBERNATING:true},'@/lib/creatorDiscordCommands':{CREATOR_DISCORD_COMMANDS:[{name:'access'}],discordCommandRateKey:()=>user,creatorDiscordCommand:async()=>({content:'checked'})},'@/lib/supabase/admin':{createAdminClient:()=>({})},'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:true,available:true})}},{process:{env:{DISCORD_APPLICATION_ID:bot}}})
 const invoke=body=>route.POST(new Request('https://www.slipsurge.com/api/discord/interactions',{method:'POST',body:JSON.stringify(body)}))
 const result=await invoke({type:2,application_id:bot,guild_id:guild,token:'fixture',member:{user:{id:discordId}},data:{name:'access'}})
 assert.deepEqual(await result.json(),{type:5,data:{flags:64}});assert.equal(edits.length,0);await after[0]();assert.equal(edits.length,1)
 assert.equal((await invoke({type:1,application_id:'other'})).status,401)
 assert.equal((await route.POST(new Request('https://www.slipsurge.com/api/discord/interactions',{method:'POST',body:'{'}))).status,400)
})

function actionFixture(options={}){
 const {core}=coreFixture(),calls=[]
 const admin=database(()=>({data:options.unsaved?null:{id:'mapping'},error:null}))
 const module=compile('src/app/api/groups/[groupId]/discord/actions/route.ts',{
  'next/server':{NextResponse:{json:Response.json}},
  '@/lib/creatorDiscord':{...core,inspectCreatorGuild:async()=>({guildId:guild,canCreateRoles:!options.cannotCreate}),creatorDiscordRequest:async(path,method,body)=>{calls.push({path,method,body});if(path.endsWith('/channels'))return response([{id:role,name:'member-access',type:0}]);return response({id:bot,name:body?.name})}},
  '@/lib/creatorDiscordOwner':{creatorDiscordOwner:async()=>({admin,user:{id:user},group:{id:group,name:'Club @everyone',slug:'club'}}),requireDiscordSameOrigin:request=>{if(request.headers.get('origin')!=='https://www.slipsurge.com')throw new core.CreatorDiscordError('Origin',403)}},
  '@/lib/creatorDiscordPolicy':policy,'@/lib/serverRateLimit':{consumeServerRateLimit:async()=>({allowed:true,available:true})},'@/lib/safeApiError':{safeApiError:()=>response({error:'failed'},502)},'@/lib/platform':{PLATFORM_URL:'https://www.slipsurge.com'},
 })
 return {calls,run:body=>module.POST(new Request('https://www.slipsurge.com/api/action',{method:'POST',headers:{origin:'https://www.slipsurge.com','Content-Type':'application/json'},body:JSON.stringify({guildId:guild,...body})}),{params:Promise.resolve({groupId:group})})}
}
test('new Discord roles require creator permission and have no administrative powers',async()=>{
 const f=actionFixture();assert.equal((await f.run({action:'create_role',name:'Member'})).status,200)
 assert.deepEqual(f.calls[0],{path:`/guilds/${guild}/roles`,method:'POST',body:{name:'Member',permissions:'0',mentionable:false,hoist:false}})
 const denied=actionFixture({cannotCreate:true});assert.equal((await denied.run({action:'create_role',name:'Member'})).status,403);assert.equal(denied.calls.length,0)
})
test('access panels cannot target another server’s channel or an unsaved mapping',async()=>{
 for(const [options,channelId,status] of [[{},bot,400],[{unsaved:true},role,409]]){
  const f=actionFixture(options);assert.equal((await f.run({action:'publish_panel',channelId})).status,status);assert.equal(f.calls.some(call=>call.method==='POST'),false)
 }
})
test('access panel suppresses mentions and links to the exact community, never member tokens',async()=>{
 const f=actionFixture();const result=await f.run({action:'publish_panel',channelId:role});assert.equal(result.status,200)
 const message=f.calls.find(call=>call.method==='POST').body
 assert.deepEqual(message.allowed_mentions,{parse:[]});assert.equal(message.components[0].components[0].url,'https://www.slipsurge.com/groups/club?discord=connect')
 assert.equal(JSON.stringify(message).includes('provider-fixture'),false)
})
test('bot connection diagnostics require a real administrator before contacting Discord',async()=>{
 for(const account of [null,'user','admin']){
  let reads=0
  const route=compile('src/app/api/admin/discord/creator-health/route.ts',{
   'next/server':{NextResponse:{json:Response.json}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:account?{id:user}:null}})},from:()=>database(()=>({data:{account_type:account}})).from('users')})},
   '@/lib/supabase/admin':{createAdminClient:()=>database(()=>({count:0,error:null}))},
   '@/lib/creatorDiscord':{creatorDiscordConfigured:()=>true,creatorDiscordRequest:async path=>{reads++;return response(path.endsWith('/commands')?[{name:'help'}]:{name:'SlipSurge',bot_public:true,bot_require_code_grant:false,interactions_endpoint_url:'https://www.slipsurge.com/api/discord/interactions'})}},
   '@/lib/creatorDiscordCommands':{CREATOR_DISCORD_COMMANDS:[{name:'help'},{name:'connect'}]},'@/lib/safeApiError':{safeApiError:()=>response({error:'unavailable'},502)},
  },{process:{env:{DISCORD_APPLICATION_ID:bot}}})
  const result=await route.GET();assert.equal(result.status,account==='admin'?200:account?403:401)
  assert.equal(reads,account==='admin'?2:0)
  if(account==='admin'){const data=await result.json();assert.deepEqual(data.missingCommands,['connect']);assert.equal(data.connected,true);assert.equal(Object.keys(data).some(key=>/token|secret|key/i.test(key)),false)}
 }
})
test('linked Discord identities reauthorize, while new identities use identity linking',async()=>{
 for(const linked of [false,true]){
  const calls=[]
  const client={auth:{getUser:async()=>({data:{user:{id:user,identities:linked?[{provider:'discord'}]:[]}},error:null}),linkIdentity:async input=>{calls.push(['link',input]);return {error:null}},signInWithOAuth:async input=>{calls.push(['reauthorize',input]);return {error:null}}}}
  const module=compile('src/components/creator/creatorDiscordClient.ts',{'@/lib/supabase/client':{createClient:()=>client}},{location:{origin:'https://www.slipsurge.com'}})
  await module.connectCommunityDiscord('/groups/club?discord=claim',false)
  assert.equal(calls[0][0],linked?'reauthorize':'link');assert.equal(calls[0][1].options.scopes,'identify guilds.join')
  assert.match(calls[0][1].options.redirectTo,linked?/discord_community=reauthorize/:/discord_community=link/)
 }
})
function callbackFixture(options={}){
 const calls=[],after=[]
 const auth={getUser:async()=>({data:{user:options.signedOut?null:{id:user}}}),getSession:async()=>({data:{session:{user:{id:user},access_token:'original-fixture-access',refresh_token:'original-fixture-refresh'}}}),exchangeCodeForSession:async()=>{calls.push('exchange');return {data:{user:{id:options.wrongAccount?group:user,user_metadata:{}}},error:null}},signOut:async input=>{calls.push(['signOut',input]);return {error:null}},setSession:async input=>{calls.push(['restore',input]);return {error:options.restoreFails?new Error('failed'):null}}}
 const module=compile('src/app/auth/callback/route.ts',{'next/server':{NextResponse:{redirect:url=>new Response(null,{status:307,headers:{location:String(url)}})},after:fn=>after.push(fn)},'@/lib/supabase/server':{createClient:async()=>({auth,from:()=>database(()=>({data:{id:user}})).from('users')})},'@/lib/supabase/admin':{createAdminClient:()=>{calls.push('profile');return database(()=>({data:{id:user},error:null}))}},'@/lib/xConversion':{},'@/lib/discord':{},'@/lib/safeRedirect':{safeInternalPath:path=>path||'/launch'},
 '@/lib/nativeOAuth':{readNativeOAuthRequest:async()=>{throw Error('Browser Discord authorization called native OAuth')}},'@/lib/nativeAuthHandoff':{},'@/lib/nativeConnectionRedirect':{}})
 return {calls,after,run:(flow='reauthorize',code='fixture')=>module.GET(new Request(`https://www.slipsurge.com/auth/callback?discord_community=${flow}&next=${encodeURIComponent('/groups/club?discord=claim')}${code?'&code='+code:''}`))}
}
test('Discord reauthorization restores the original session if another account is chosen',async()=>{
 for(const flow of ['reauthorize','link']){
  const f=callbackFixture({wrongAccount:true});const result=await f.run(flow)
  assert.match(result.headers.get('location'),/link_error=discord_account_mismatch/);assert.equal(result.headers.get('location').includes('discord=claim'),false)
  assert.deepEqual(f.calls,['exchange',['signOut',{scope:'local'}],['restore',{access_token:'original-fixture-access',refresh_token:'original-fixture-refresh'}]])
  assert.equal(f.after.length,0)
 }
})
test('reconnect refuses a signed-out callback and does not consume the authorization code',async()=>{
 const f=callbackFixture({signedOut:true});const result=await f.run();assert.match(result.headers.get('location'),/auth\/login/);assert.deepEqual(f.calls,[])
})
test('matching Discord reauthorization preserves the community return and normal account flow',async()=>{
 const f=callbackFixture();const result=await f.run();assert.equal(result.headers.get('location'),'https://www.slipsurge.com/groups/club?discord=claim');assert.deepEqual(f.calls,['exchange','profile'])
})
test('cancelled Discord consent returns to the community without an automatic role claim',async()=>{
 const f=callbackFixture();const result=await f.run('reauthorize','');assert.match(result.headers.get('location'),/link_error=discord_authorization_declined/);assert.equal(result.headers.get('location').includes('discord=claim'),false);assert.deepEqual(f.calls,[])
})

test('server inspection blocks a bot without Manage Roles before offering any roles',async()=>{
 const admin=database(()=>({error:null}));admin.auth={admin:{getUserById:async()=>({data:{user:{identities:[{provider:'discord',identity_data:{sub:discordId}}]}}})}}
 const module=compile('src/lib/creatorDiscord.ts',{'./creatorDiscordPolicy':policy,'./creatorCommerce':{},'./creatorWebhook':{}},{process:{env:{DISCORD_BOT_TOKEN:'fixture'}},fetch:async url=>response(url.endsWith('/users/@me')?{id:bot}:url.endsWith('/guilds/'+guild)?{id:guild,name:'Club',owner_id:discordId,roles:[{id:guild,permissions:'0',position:0},{id:bot,permissions:'0',position:2}]}:{roles:[bot]})})
 await assert.rejects(module.inspectCreatorGuild(admin,user,guild),error=>error.code==='discord_permissions'&&/Manage Roles/.test(error.message))
})

test('setup access context reads only the owned community’s bound product',async()=>{
 for(const paid of [false,true]){
  const admin=database(call=>({data:call.table==='creator_products'?{title:'Weekend research',status:'active'}:[],error:null}))
  const route=compile('src/app/api/groups/[groupId]/discord/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/creatorDiscord':{...coreFixture().core,creatorDiscordIdentity:async()=>discordId,creatorDiscordConfigured:()=>true,creatorBotInvite:()=>null},'@/lib/creatorDiscordAccount':{},'@/lib/creatorDiscordOwner':{creatorDiscordOwner:async()=>({admin,user:{id:user,identities:[{provider:'discord',identity_data:{full_name:'club.owner',provider_id:discordId}}]},group:{name:'Club',slug:'club',access_type:paid?'paid':'free',creator_product_id:paid?'product':null}})},'@/lib/creatorDiscordPolicy':policy,'@/lib/serverRateLimit':{},'@/lib/verifiedIdentity':compile('src/lib/verifiedIdentity.ts'),'@/lib/safeApiError':{safeApiError:()=>Response.json({error:'failed'},{status:502})}},{process:{env:{}}})
  const result=await route.GET(new Request('https://www.slipsurge.com/api/setup'),{params:Promise.resolve({groupId:group})})
  assert.equal(result.status,200);const data=await result.json();assert.equal(data.access.type,paid?'paid':'free');assert.equal(data.accountHandle,'club.owner')
  const product=admin.calls.find(call=>call.table==='creator_products')
  if(paid){assert.deepEqual(product.filters,[['eq','id','product'],['eq','creator_id',user],['maybeSingle']]);assert.equal(data.access.product.title,'Weekend research')}else{assert.equal(product,undefined);assert.equal(data.access.product,null)}
 }
})

async function setupUI(options={},run){
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.slipsurge.com/creators/studio'})
 const globals=['window','document','location','history','IS_REACT_ACT_ENVIRONMENT'],previous=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
 const integration={id:'saved',guild_id:guild,guild_name:'Club server',role_id:role,role_name:'Member',invite_url:null},calls=[]
 const client={DiscordClientError:class extends Error{constructor(message,code){super(message);this.code=code}},connectCommunityDiscord:async()=>{},discordApi:async(path,init={})=>{
  calls.push({path,init});if(options.api){const override=options.api(path,init,calls);if(override!==undefined)return override}
  if(path.includes('servers=1'))return {servers:[{id:guild,name:'Club server'},{id:bot,name:'Other server'}]}
  if(path.includes('guildId='))return {roles:[{id:role,name:path.includes(bot)?'Other server role':'Member'},{id:discordId,name:'Research'}],canCreateRoles:true}
  return {configured:true,connected:!options.unlinked,installUrl:'https://discord.com/oauth2/authorize?client_id='+bot,integrations:options.saved?[integration]:[],access:{name:'Club',slug:'club',type:'paid',product:{title:'Weekend research',status:'active'}}}
 }}
 const stub=(tag)=>(props)=>React.createElement(tag,props,props.children)
 const imports={'react':React,'react/jsx-runtime':jsx,'next/link':{default:stub('a')},'next/image':{default:stub('img')},'lucide-react':{Check:()=>null,ExternalLink:()=>null,Hash:()=>null,Users:()=>null,RefreshCw:()=>null},'@/components/ui/SafeImage':{SafeImage:({fallback,...props})=>props.src?React.createElement('img',props):fallback},'@/components/ui/button':{Button:({variant,...props})=>React.createElement('button',props)},'@/components/ui/FeedbackProvider':{useFeedback:()=>({confirm:async()=>true})},'./creatorDiscordClient':client,'@/lib/creatorDiscordPolicy':policy,'./creatorDiscord.module.css':{default:{}}}
 imports['@/components/brand/DiscordLogo']=compile('src/components/brand/DiscordLogo.tsx',imports)
 imports['@/components/brand/WhopLogo']=compile('src/components/brand/WhopLogo.tsx',{...imports,'./providerMarks.module.css':{default:{}}})
 imports['./CreatorDiscordBrand']=compile('src/components/creator/CreatorDiscordBrand.tsx',imports)
 const summary=compile('src/components/creator/CreatorDiscordClaim.tsx',imports)
 const {CreatorDiscordSetup}=compile('src/components/creator/CreatorDiscordSetup.tsx',{...imports,'./CreatorDiscordClaim':summary})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const flush=async(action=()=>{})=>React.act(async()=>{await action();await Promise.resolve()})
 const button=text=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent===text)
 try{await flush(()=>root.render(React.createElement(CreatorDiscordSetup,{groupId:group})));await run({host,calls,flush,button,dom})}finally{await React.act(async()=>root.unmount());dom.window.close();for(const key of globals){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key]}}
}

test('creator setup checks saved server automatically and previews saved roles, not unsaved selections',async()=>{
 await setupUI({saved:true},async({host,calls,flush,button})=>{
  assert.equal(button('Access saved').disabled,true);assert.equal(calls.filter(call=>call.path.includes('guildId=')).length,1)
  await flush(()=>host.querySelectorAll('input[type=checkbox]')[1].click())
  assert.match(host.textContent,/Changes are not saved/);assert.equal(button('Save Discord access').disabled,false)
  await flush(()=>button('Member preview').click());assert.match(host.textContent,/Member/);assert.doesNotMatch(host.textContent,/Member · Research/)
  assert.equal(calls.some(call=>call.init.method==='POST'),false)
  await flush(()=>button('Access rules').click());assert.match(host.textContent,/Weekend research/);assert.match(host.textContent,/Members stay in your server/)
 })
})

test('changing server cancels a stale inspection and clearing the selection restores the chooser',async()=>{
 let resolveOld
 await setupUI({api:(path)=>path.includes('guildId='+guild)?new Promise(resolve=>{resolveOld=resolve}):undefined},async({host,flush,button})=>{
  const select=host.querySelector('select')
  await flush(()=>{select.value=guild;select.dispatchEvent(new window.Event('change',{bubbles:true}))})
  await flush(()=>{select.value=bot;select.dispatchEvent(new window.Event('change',{bubbles:true}))})
  await flush(()=>resolveOld({roles:[{id:role,name:'Wrong server role'}],canCreateRoles:true}))
  assert.match(host.textContent,/Other server role/);assert.doesNotMatch(host.textContent,/Wrong server role/)
  await flush(()=>{select.value='';select.dispatchEvent(new window.Event('change',{bubbles:true}))})
  assert.equal(button('Save Discord access'),undefined);assert.doesNotMatch(host.textContent,/permissions checked/)
 })
})

test('unlinked setup leads with authorization and never offers an unscoped bot installation',async()=>{
 await setupUI({unlinked:true},async({host,button})=>{assert.ok(button('Connect Discord'));assert.equal(host.querySelector('a[href*="discord.com"]'),null);assert.equal(host.querySelector('select'),null)})
})

test('returning from a deliberate bot installation rechecks once without background polling',async()=>{
 let attempts=0
 await setupUI({saved:true,api:path=>{if(path.includes('guildId=')&&++attempts===1)return Promise.reject(new Error('Add SlipSurge to this server.'))}},async({host,flush,dom})=>{
  Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true})
  const install=host.querySelector('a[href*="discord.com/oauth2/authorize"]');assert.ok(install)
  install.addEventListener('click',event=>event.preventDefault())
  await flush(()=>install.click());await flush(()=>dom.window.dispatchEvent(new dom.window.Event('focus')))
  assert.equal(attempts,2);assert.match(host.textContent,/permissions checked/)
  await flush(()=>dom.window.dispatchEvent(new dom.window.Event('focus')));assert.equal(attempts,2)
 })
})
