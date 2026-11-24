import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorDiscordConfigured, creatorDiscordRequest } from '@/lib/creatorDiscord'
import { CREATOR_DISCORD_COMMANDS } from '@/lib/creatorDiscordCommands'
import { safeApiError } from '@/lib/safeApiError'

export async function GET(){
 const client=await createClient(),{data:{user}}=await client.auth.getUser()
 if(!user)return NextResponse.json({error:'Sign in first.'},{status:401})
 const {data:profile}=await client.from('users').select('account_type').eq('id',user.id).single()
 if(profile?.account_type!=='admin')return NextResponse.json({error:'Administrator access required.'},{status:403})
 const headers={'Cache-Control':'private, no-store'}
 if(!creatorDiscordConfigured())return NextResponse.json({configured:false,connected:false},{headers})
 try{
  const admin=createAdminClient()
  const [applicationResponse,commandsResponse,integrations,jobs]=await Promise.all([
   creatorDiscordRequest('/oauth2/applications/@me'),
   creatorDiscordRequest(`/applications/${process.env.DISCORD_APPLICATION_ID}/commands`),
   admin.from('creator_discord_integrations').select('id',{count:'exact',head:true}).eq('enabled',true),
   admin.from('creator_discord_jobs').select('id',{count:'exact',head:true}).eq('pending',true),
  ])
  if(integrations.error||jobs.error)throw new Error('Discord delivery status unavailable')
  const app=await applicationResponse.json() as {name:string;bot_public:boolean;bot_require_code_grant:boolean;interactions_endpoint_url?:string;approximate_guild_count?:number}
  const commands=await commandsResponse.json() as {name:string}[]
  const installed=commands.map(command=>command.name)
  return NextResponse.json({configured:true,connected:true,name:app.name,publicBot:app.bot_public,requiresCodeGrant:app.bot_require_code_grant,interactionsReady:app.interactions_endpoint_url==='https://www.slipsurge.com/api/discord/interactions'||app.interactions_endpoint_url==='https://slipsurge.com/api/discord/interactions',guildCount:app.approximate_guild_count??null,activeRoleMappings:integrations.count,pendingDeliveries:jobs.count,commands:installed,missingCommands:CREATOR_DISCORD_COMMANDS.map(command=>command.name).filter(name=>!installed.includes(name))},{headers})
 }catch(cause){return safeApiError('creator-discord-health',cause,'Discord connection status could not be checked.',502)}
}
