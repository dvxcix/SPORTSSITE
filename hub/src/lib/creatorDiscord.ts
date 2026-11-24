import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assignableCreatorRoles, managesDiscordGuild, type DiscordRole } from './creatorDiscordPolicy'
import { handleCreatorWebhook } from './creatorWebhook'
import { hasCurrentCreatorAccess } from './creatorCommerce'

const ID=/^\d{17,22}$/
export class CreatorDiscordError extends Error { constructor(message:string,public status=409,public code='discord_unavailable'){super(message)} }
export function creatorDiscordConfigured(){return !!(process.env.DISCORD_BOT_TOKEN&&process.env.DISCORD_APPLICATION_ID)}
export async function creatorDiscordRequest(path:string,method='GET',body?:unknown) {
 if(!process.env.DISCORD_BOT_TOKEN)throw new CreatorDiscordError('The Discord connection is temporarily unavailable.',503)
 const response=await fetch(`https://discord.com/api/v10${path}`,{method,headers:{Authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),cache:'no-store'})
 if(method==='DELETE'&&response.status===404)return new Response(null,{status:204})
 if(!response.ok)throw new CreatorDiscordError(response.status===404?'Add SlipSurge to this Discord server, or join the server, then try again.':response.status===403?'Discord permissions need attention. Check the bot permissions, member screening and role order.':'Discord could not complete this request. Please try again.',response.status===429?429:409,response.status===404?'discord_not_found':response.status===403?'discord_permissions':'discord_unavailable')
 return response
}
export function creatorBotInvite(guildId?:string){
 if(guildId&&!ID.test(guildId)||!process.env.DISCORD_APPLICATION_ID)return null
 return `https://discord.com/oauth2/authorize?${new URLSearchParams({client_id:process.env.DISCORD_APPLICATION_ID,scope:'bot applications.commands',permissions:'268454912',integration_type:'0',...(guildId?{guild_id:guildId,disable_guild_select:'true'}:{})})}`
}
export async function creatorDiscordIdentity(admin:SupabaseClient,userId:string,required=true){
 const {data,error}=await admin.auth.admin.getUserById(userId)
 if(error||!data?.user)throw new CreatorDiscordError('Discord identity could not be verified. Try again.',503)
 const identity=data.user.identities?.find(item=>item.provider==='discord')
 const raw=identity?.identity_data?.provider_id||identity?.identity_data?.sub
 const id=typeof raw==='string'&&ID.test(raw)?raw:null
 const saved=await admin.from('users').update({discord_id:id}).eq('id',userId)
 if(saved.error)throw new CreatorDiscordError('Discord identity could not be saved.',503)
 if(!id&&required)throw new CreatorDiscordError('Connect your Discord account first.',409,'discord_reconnect')
 return id
}
export async function inspectCreatorGuild(admin:SupabaseClient,userId:string,guildId:string){
 if(!ID.test(guildId))throw new CreatorDiscordError('Enter a valid Discord server ID.',400)
 const discordId=await creatorDiscordIdentity(admin,userId)
 if(!discordId)throw new CreatorDiscordError('Connect Discord first.',409)
 const guild=await (await creatorDiscordRequest(`/guilds/${guildId}`)).json() as {id:string;name:string;owner_id:string;roles:DiscordRole[]}
 const member=await (await creatorDiscordRequest(`/guilds/${guildId}/members/${discordId}`)).json() as {roles:string[]}
 if(!managesDiscordGuild(guild.owner_id,discordId,member.roles,guild.roles,guildId))throw new CreatorDiscordError('You must own or manage this Discord server.',403)
 const bot=await (await creatorDiscordRequest('/users/@me')).json() as {id:string}
 const botMember=await (await creatorDiscordRequest(`/guilds/${guildId}/members/${bot.id}`)).json() as {roles:string[]}
 return {guildId:guild.id,guildName:guild.name,roles:assignableCreatorRoles(guildId,guild.roles,botMember.roles).map(role=>({id:role.id,name:role.name})),canCreateRoles:guild.owner_id===discordId||guild.roles.some(role=>(role.id===guildId||member.roles.includes(role.id))&&!!(BigInt(role.permissions)&BigInt(268435464))),inviteUrl:creatorBotInvite(guildId)}
}

export async function creatorGuildAssignableRoles(guildId:string){
 const guild=await(await creatorDiscordRequest(`/guilds/${guildId}`)).json() as {roles:DiscordRole[]}
 const bot=await(await creatorDiscordRequest('/users/@me')).json() as {id:string}
 const member=await(await creatorDiscordRequest(`/guilds/${guildId}/members/${bot.id}`)).json() as {roles:string[]}
 return assignableCreatorRoles(guildId,guild.roles,member.roles)
}

/** Verify the bound membership with Whop before delivering paid Discord access. */
export async function verifyCreatorDiscordMembership(admin:SupabaseClient,integrationId:string,userId:string){
 const integration=await admin.from('creator_discord_integrations').select('group_id,enabled').eq('id',integrationId).maybeSingle()
 if(integration.error)throw new Error('Discord community lookup failed')
 if(!integration.data?.group_id||!integration.data.enabled)return
 const group=await admin.from('groups').select('owner_id,access_type,creator_product_id').eq('id',integration.data.group_id).maybeSingle()
 if(group.error)throw new Error('Community access lookup failed')
 if(!group.data||group.data.access_type!=='paid'||group.data.owner_id===userId)return
 const entitlement=await admin.from('creator_entitlements').select('whop_membership_id,admin_revoked_at,status,current_period_end').eq('product_id',group.data.creator_product_id).eq('user_id',userId).maybeSingle()
 if(entitlement.error)throw new Error('Membership lookup failed')
 if(!entitlement.data?.whop_membership_id||entitlement.data.admin_revoked_at)return
 const id=entitlement.data.whop_membership_id as string
 try {
  const handled=await handleCreatorWebhook(admin,`discord-check:${id}`,'membership.updated',{id,metadata:{internal_user_id:userId}})
  if(!handled)throw new Error('Whop membership could not be verified')
 } catch(cause) {
  // A provider outage cannot extend a known expired/revoked membership or authorize a new role.
  if(hasCurrentCreatorAccess(entitlement.data))throw cause
 }
}

/** Queue rows are durable desired-state checks. Always re-read access immediately before touching Discord. */
export async function processCreatorDiscordQueue(admin:SupabaseClient,limit=20,userId:string|null=null,integrationId:string|null=null){
 const {data:jobs,error}=await admin.rpc('claim_creator_discord_jobs',{p_limit:limit,p_user:userId,p_integration:integrationId})
 if(error)throw new Error('Discord delivery queue unavailable')
 let completed=0,failed=0
 const lanes=Array.from({length:Math.min(4,jobs?.length||0)},(_,index)=>(jobs??[]).filter((_:unknown,jobIndex:number)=>jobIndex%4===index))
 await Promise.all(lanes.map(async lane=>{for(const job of lane){
  try{
   if(job.user_id)await creatorDiscordIdentity(admin,job.user_id,false)
   // Local revocations (unlink, leave, expiry, admin hold) must not depend on Whop being available.
   let {data:access,error:accessError}=await admin.rpc('creator_discord_access',{p_integration_id:job.integration_id,p_user_id:job.user_id})
   if(accessError||!access)throw new Error('Access check unavailable')
   if(access.allowed&&access.discord_id&&job.user_id){
    await verifyCreatorDiscordMembership(admin,job.integration_id,job.user_id)
    const checked=await admin.rpc('creator_discord_access',{p_integration_id:job.integration_id,p_user_id:job.user_id})
    access=checked.data;accessError=checked.error
   }
   if(accessError||!access)throw new Error('Access check unavailable')
   if(access.discord_id){
    // Revoke roles for the previous identity as well when a member unlinks or changes Discord accounts.
    if(job.assigned_discord_id&&job.assigned_discord_id!==access.discord_id){const old=await creatorDiscordRequest(`/guilds/${access.guild_id}/members/${job.assigned_discord_id}/roles/${access.role_id}`,'DELETE');if(!old.ok)throw new Error('Previous role removal failed')}
    if(access.allowed){
     const roles=await creatorGuildAssignableRoles(access.guild_id)
     if(!roles.some(role=>role.id===access.role_id)){
      await creatorDiscordRequest(`/guilds/${access.guild_id}/members/${access.discord_id}/roles/${access.role_id}`,'DELETE')
      throw new CreatorDiscordError('The membership role is no longer safe or below SlipSurge. Ask the creator to update Discord access.')
     }
     const member=await(await creatorDiscordRequest(`/guilds/${access.guild_id}/members/${access.discord_id}`)).json() as {pending?:boolean}
     if(member.pending)throw new CreatorDiscordError('Accept the server rules before claiming a role.',409,'discord_screening')
    }
    await creatorDiscordRequest(`/guilds/${access.guild_id}/members/${access.discord_id}/roles/${access.role_id}`,access.allowed?'PUT':'DELETE')
   }else if(job.assigned_discord_id){await creatorDiscordRequest(`/guilds/${access.guild_id}/members/${job.assigned_discord_id}/roles/${access.role_id}`,'DELETE')}
   const {error:finishError}=await admin.rpc('finish_creator_discord_job',{p_id:job.id,p_version:job.version,p_success:true,p_discord_id:access.allowed?access.discord_id:null})
   if(finishError)throw new Error('Discord delivery receipt unavailable')
   completed++
  }catch{failed++;await admin.rpc('finish_creator_discord_job',{p_id:job.id,p_version:job.version,p_success:false,p_discord_id:null})}
 }}))
 return {completed,failed}
}
