import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorBotInvite, creatorDiscordConfigured, creatorDiscordRequest, CreatorDiscordError, inspectCreatorGuild } from '@/lib/creatorDiscord'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

async function owner(groupId:string){
 const client=await createClient();const {data:{user}}=await client.auth.getUser()
 if(!user)throw new CreatorDiscordError('Sign in first.',401)
 const admin=createAdminClient();const {data:group}=await admin.from('groups').select('id,owner_id').eq('id',groupId).maybeSingle()
 if(!group||group.owner_id!==user.id)throw new CreatorDiscordError('Community owner access required.',403)
 return {admin,user}
}
function failure(cause:unknown){return cause instanceof CreatorDiscordError?NextResponse.json({error:cause.message},{status:cause.status}):safeApiError('creator-discord-setup',cause,'Discord setup could not be completed. Try again.',502)}
export async function GET(request:Request,context:{params:Promise<{groupId:string}>}){
 try{const {groupId}=await context.params;const {admin,user}=await owner(groupId);const guildId=new URL(request.url).searchParams.get('guildId')
  if(guildId){const rate=await consumeServerRateLimit(user.id,'creator_discord_inspect',20,3600);if(!rate.available||!rate.allowed)throw new CreatorDiscordError('Please wait before checking again.',rate.available?429:503);return NextResponse.json(await inspectCreatorGuild(admin,user.id,guildId),{headers:{'Cache-Control':'private, no-store'}})}
  const {data,error}=await admin.from('creator_discord_integrations').select('guild_id,guild_name,role_id,role_name,invite_url').eq('group_id',groupId).eq('enabled',true).maybeSingle();if(error)throw error
  return NextResponse.json({configured:creatorDiscordConfigured(),applicationId:process.env.DISCORD_APPLICATION_ID||null,integration:data},{headers:{'Cache-Control':'private, no-store'}})
 }catch(cause){return failure(cause)}
}
export async function POST(request:Request,context:{params:Promise<{groupId:string}>}){
 try{const {groupId}=await context.params;const {admin,user}=await owner(groupId);const body=await request.json().catch(()=>null)
  const rate=await consumeServerRateLimit(user.id,'creator_discord_setup',10,3600);if(!rate.available||!rate.allowed)throw new CreatorDiscordError('Please wait before changing Discord setup again.',rate.available?429:503)
  const inspected=await inspectCreatorGuild(admin,user.id,String(body?.guildId||''));const role=inspected.roles.find(item=>item.id===body?.roleId)
  if(!role)throw new CreatorDiscordError('Choose an assignable membership role below the SlipSurge bot. Administrative roles cannot be used.',400)
  let inviteUrl:string|null=null
  if(body?.inviteUrl){const parsed=String(body.inviteUrl).match(/^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)([A-Za-z0-9-]+)\/?$/);if(!parsed)throw new CreatorDiscordError('Enter a valid Discord invite link.',400);const invite=await (await creatorDiscordRequest(`/invites/${parsed[1]}`)).json() as {guild?:{id:string}};if(invite.guild?.id!==inspected.guildId)throw new CreatorDiscordError('That invite belongs to a different server.',400);inviteUrl=`https://discord.gg/${parsed[1]}`}
  const {error}=await admin.rpc('configure_creator_discord',{p_creator:user.id,p_group:groupId,p_guild:inspected.guildId,p_guild_name:inspected.guildName,p_role:role.id,p_role_name:role.name,p_invite:inviteUrl});if(error)throw error
  return NextResponse.json({ok:true,inviteUrl:creatorBotInvite(inspected.guildId)})
 }catch(cause){return failure(cause)}
}
export async function DELETE(_request:Request,context:{params:Promise<{groupId:string}>}){
 try{const {groupId}=await context.params;const {admin,user}=await owner(groupId);const {error}=await admin.rpc('configure_creator_discord',{p_creator:user.id,p_group:groupId,p_guild:null,p_guild_name:null,p_role:null,p_role_name:null,p_invite:null});if(error)throw error;return NextResponse.json({ok:true})}catch(cause){return failure(cause)}
}
