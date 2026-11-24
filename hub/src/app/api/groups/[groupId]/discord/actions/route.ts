import { NextResponse } from 'next/server'
import { creatorDiscordRequest, CreatorDiscordError, inspectCreatorGuild } from '@/lib/creatorDiscord'
import { creatorDiscordOwner, requireDiscordSameOrigin } from '@/lib/creatorDiscordOwner'
import { DISCORD_ID } from '@/lib/creatorDiscordPolicy'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'
import { PLATFORM_URL } from '@/lib/platform'

type Channel={id:string;name:string;type:number;guild_id?:string}
const headers={'Cache-Control':'private, no-store'}
export async function POST(request:Request,context:{params:Promise<{groupId:string}>}){
 try{
  requireDiscordSameOrigin(request)
  const {groupId}=await context.params,{admin,user,group}=await creatorDiscordOwner(groupId)
  const rate=await consumeServerRateLimit(user.id,'creator_discord_actions',20,3600)
  if(!rate.available||!rate.allowed)throw new CreatorDiscordError('Please wait before trying again.',rate.available?429:503)
  const body=await request.json().catch(()=>null)
  if(!DISCORD_ID.test(body?.guildId||''))throw new CreatorDiscordError('Choose your Discord server.',400)
  const guild=await inspectCreatorGuild(admin,user.id,body.guildId)
  if(body.action==='create_role'){
   const name=String(body.name||'').trim()
   if(!guild.canCreateRoles)throw new CreatorDiscordError('Manage Roles permission is required to create a role.',403)
   if(!name||name.length>100)throw new CreatorDiscordError('Enter a role name of 1–100 characters.',400)
   const role=await(await creatorDiscordRequest(`/guilds/${guild.guildId}/roles`,'POST',{name,permissions:'0',mentionable:false,hoist:false})).json() as {id:string;name:string}
   return NextResponse.json({role},{headers})
  }
  const channels=(await(await creatorDiscordRequest(`/guilds/${guild.guildId}/channels`)).json() as Channel[]).filter(channel=>channel.type===0||channel.type===5)
  if(body.action==='channels')return NextResponse.json({channels:channels.map(({id,name})=>({id,name}))},{headers})
  if(body.action!=='publish_panel'||!channels.some(channel=>channel.id===body.channelId))throw new CreatorDiscordError('Choose a text channel in this server.',400)
  const {data:integration,error}=await admin.from('creator_discord_integrations').select('id').eq('group_id',groupId).eq('guild_id',guild.guildId).eq('enabled',true).limit(1).maybeSingle()
  if(error)throw error
  if(!integration)throw new CreatorDiscordError('Save the membership roles for this server first.',409)
  const message=await(await creatorDiscordRequest(`/channels/${body.channelId}/messages`,'POST',{
   allowed_mentions:{parse:[]},
   embeds:[{title:group.name,description:'Connect your Discord account on SlipSurge to verify your community membership and unlock your member roles.',color:0xB4FF4D}],
   components:[{type:1,components:[{type:2,style:5,label:'Connect to Discord',url:`${PLATFORM_URL}/groups/${encodeURIComponent(group.slug)}?discord=connect`}]}],
  })).json() as {id:string}
  return NextResponse.json({ok:true,url:`https://discord.com/channels/${guild.guildId}/${body.channelId}/${message.id}`},{headers})
 }catch(cause){return cause instanceof CreatorDiscordError?NextResponse.json({error:cause.message,code:cause.code},{status:cause.status,headers}):safeApiError('creator-discord-action',cause,'Discord could not complete this action. Try again.',502)}
}
