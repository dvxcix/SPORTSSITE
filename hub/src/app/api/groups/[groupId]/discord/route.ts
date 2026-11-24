import { NextResponse } from 'next/server'
import { creatorBotInvite, creatorDiscordConfigured, creatorDiscordIdentity, creatorDiscordRequest, CreatorDiscordError, inspectCreatorGuild } from '@/lib/creatorDiscord'
import { creatorDiscordGuildChoices } from '@/lib/creatorDiscordAccount'
import { creatorDiscordOwner, requireDiscordSameOrigin } from '@/lib/creatorDiscordOwner'
import { MAX_COMMUNITY_DISCORD_ROLES } from '@/lib/creatorDiscordPolicy'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

const headers={'Cache-Control':'private, no-store'}
export const maxDuration=120
type Context={params:Promise<{groupId:string}>}
function failure(cause:unknown){return cause instanceof CreatorDiscordError?NextResponse.json({error:cause.message,code:cause.code},{status:cause.status,headers}):safeApiError('creator-discord-setup',cause,'Discord setup could not be completed. Try again.',502)}
export async function GET(request:Request,context:Context){
 try{
  const {groupId}=await context.params,{admin,client,user}=await creatorDiscordOwner(groupId)
  const query=new URL(request.url).searchParams,guildId=query.get('guildId')
  if(guildId||query.get('servers')==='1'){
   const rate=await consumeServerRateLimit(user.id,'creator_discord_inspect',60,3600)
   if(!rate.available||!rate.allowed)throw new CreatorDiscordError('Please wait before checking again.',rate.available?429:503)
   if(guildId)return NextResponse.json(await inspectCreatorGuild(admin,user.id,guildId),{headers})
   return NextResponse.json({servers:await creatorDiscordGuildChoices(client,admin,user.id)},{headers})
  }
  const [{data,error},discordId]=await Promise.all([
   admin.from('creator_discord_integrations').select('id,guild_id,guild_name,role_id,role_name,invite_url').eq('group_id',groupId).eq('enabled',true).order('created_at'),
   creatorDiscordIdentity(admin,user.id,false),
  ])
  if(error)throw error
  return NextResponse.json({configured:creatorDiscordConfigured(),applicationId:process.env.DISCORD_APPLICATION_ID||null,connected:!!discordId,installUrl:creatorBotInvite(),integrations:data||[],integration:data?.[0]||null},{headers})
 }catch(cause){return failure(cause)}
}
export async function POST(request:Request,context:Context){
 try{
  requireDiscordSameOrigin(request)
  const {groupId}=await context.params,{admin,user}=await creatorDiscordOwner(groupId),body=await request.json().catch(()=>null)
  const rate=await consumeServerRateLimit(user.id,'creator_discord_setup',30,3600)
  if(!rate.available||!rate.allowed)throw new CreatorDiscordError('Please wait before changing Discord setup again.',rate.available?429:503)
  const roleIds:unknown[]=Array.isArray(body?.roleIds)?body.roleIds:[body?.roleId]
  if(!roleIds.length||roleIds.length>MAX_COMMUNITY_DISCORD_ROLES||new Set(roleIds).size!==roleIds.length)throw new CreatorDiscordError('Choose one to five different member roles.',400)
  const inspected=await inspectCreatorGuild(admin,user.id,String(body?.guildId||''))
  const roles=roleIds.map((id:unknown)=>inspected.roles.find(item=>item.id===id))
  if(roles.some(role=>!role))throw new CreatorDiscordError('Choose member roles below SlipSurge. Administrative roles cannot be used.',400)
  let inviteUrl:string|null=null
  if(body?.inviteUrl){
   const parsed=String(body.inviteUrl).match(/^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)([A-Za-z0-9-]+)\/?$/)
   if(!parsed)throw new CreatorDiscordError('Enter a valid Discord invite link.',400)
   const invite=await(await creatorDiscordRequest(`/invites/${parsed[1]}`)).json() as {guild?:{id:string}}
   if(invite.guild?.id!==inspected.guildId)throw new CreatorDiscordError('That invite belongs to a different server.',400)
   inviteUrl=`https://discord.gg/${parsed[1]}`
  }
  const {error}=await admin.rpc('configure_creator_discord_roles',{p_creator:user.id,p_group:groupId,p_guild:inspected.guildId,p_guild_name:inspected.guildName,p_roles:roleIds,p_role_names:roles.map(role=>role!.name),p_invite:inviteUrl})
  if(error)throw error
  return NextResponse.json({ok:true,guildName:inspected.guildName,roles,inviteUrl},{headers})
 }catch(cause){return failure(cause)}
}
export async function DELETE(request:Request,context:Context){
 try{
  requireDiscordSameOrigin(request)
  const {groupId}=await context.params,{admin,user}=await creatorDiscordOwner(groupId)
  const {error}=await admin.rpc('configure_creator_discord',{p_creator:user.id,p_group:groupId,p_guild:null,p_guild_name:null,p_role:null,p_role_name:null,p_invite:null})
  if(error)throw error
  return NextResponse.json({ok:true},{headers})
 }catch(cause){return failure(cause)}
}
