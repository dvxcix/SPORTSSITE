import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as crypto from 'node:crypto'

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
 admin.auth={admin:{getUserById:async()=>({data:{user:{identities:options.unlinked?[]:[{provider:'discord',identity_data:{sub:discordId}}]}},error:null})}}
 const fetcher=async(url,init={})=>{
  calls.push({url,method:init.method||'GET',body:init.body})
  if(url.endsWith('/users/@me'))return response({id:bot})
  if(url.endsWith('/guilds/'+guild))return response({id:guild,name:'Creator server',roles:[{id:guild,name:'Everyone',permissions:'0',position:0},{id:bot,name:'SlipSurge',permissions:'268435456',position:4},{id:role,name:'Member',permissions:options.unsafe?'8':'0',position:2}]})
  if(url.endsWith('/members/'+bot))return response({roles:[bot]})
  if(url.endsWith('/members/'+discordId))return response({pending:!!options.screening,roles:[]})
  return new Response(null,{status:204})
 }
 const core=compile('src/lib/creatorDiscord.ts',{'./creatorDiscordPolicy':policy,'./creatorCommerce':{hasCurrentCreatorAccess:()=>true},'./creatorWebhook':{handleCreatorWebhook:async()=>{providers.push(1);if(options.outage)throw Error('provider down');return true}}},{fetch:fetcher,process:{env:{DISCORD_BOT_TOKEN:'fixture-only',DISCORD_APPLICATION_ID:bot}}})
 return {core,admin,calls,providers}
}

test('server choices contain only the verified account’s owned or managed servers',()=>{
 assert.deepEqual(policy.discordGuildChoices([{id:guild,name:'Mine',owner:true},{id:role,name:'Managed',permissions:'32'},{id:bot,name:'Ordinary',permissions:'1024'},{id:discordId,name:'Bad permission',permissions:'bad'}]).map(item=>item.name),['Mine','Managed'])
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
 const f=coreFixture({allowed:false,outage:true});assert.deepEqual(await f.core.processCreatorDiscordQueue(f.admin),{completed:1,failed:0})
 assert.equal(f.providers.length,0);assert.deepEqual(f.calls.map(call=>call.method),['DELETE'])
})
test('unlink removes the previous Discord identity without waiting on Whop',async()=>{
 const f=coreFixture({unlinked:true,outage:true,previousId:'123456789012345699'});await f.core.processCreatorDiscordQueue(f.admin)
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
test('changing Discord identity removes old roles before granting the new identity',async()=>{
 const f=coreFixture({free:true,previousId:'123456789012345699'});assert.equal((await f.core.processCreatorDiscordQueue(f.admin)).completed,1)
 assert.equal(f.calls[0].method,'DELETE');assert.match(f.calls[0].url,/123456789012345699/);assert.equal(f.calls.at(-1).method,'PUT')
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
 const module=compile('src/lib/creatorDiscordOwner.ts',{'./supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:user}}})}})},'./supabase/admin':{createAdminClient:()=>database(()=>({data:{owner_id:'other'},error:null}))},'./creatorDiscord':core})
 await assert.rejects(module.creatorDiscordOwner(group),error=>error.status===403)
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
