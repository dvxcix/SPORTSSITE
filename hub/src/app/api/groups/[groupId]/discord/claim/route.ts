import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreatorDiscordError } from '@/lib/creatorDiscord'
import { claimCommunityDiscord, communityDiscordStatus } from '@/lib/creatorDiscordClaimAccess'
import { requireDiscordSameOrigin } from '@/lib/creatorDiscordOwner'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

const headers={'Cache-Control':'private, no-store'}
export const maxDuration=120
type Context={params:Promise<{groupId:string}>}
async function run(request:Request,context:Context,claim:boolean){
 try{
  if(claim)requireDiscordSameOrigin(request)
  const client=await createClient(),{data:{user}}=await client.auth.getUser()
  if(!user)return NextResponse.json({error:'Sign in first.'},{status:401,headers})
  const {groupId}=await context.params,admin=createAdminClient()
  if(!/^[0-9a-f-]{36}$/i.test(groupId))return NextResponse.json({error:'Community not found.'},{status:404,headers})
  if(!claim){
   const state=await communityDiscordStatus(admin,user.id,groupId)
   return NextResponse.json({connected:!!state.discordId,ready:state.ready,guildName:state.integrations[0].guild_name,roles:state.integrations.map(role=>role.role_name),inviteUrl:state.integrations[0].invite_url},{headers})
  }
  const rate=await consumeServerRateLimit(user.id,'creator_discord_claim',20,3600)
  if(!rate.available||!rate.allowed)throw new CreatorDiscordError('Please wait before checking again.',rate.available?429:503)
  return NextResponse.json({ok:true,...await claimCommunityDiscord(admin,user.id,groupId,client)},{headers})
 }catch(cause){return cause instanceof CreatorDiscordError?NextResponse.json({error:cause.message,code:cause.code},{status:cause.status,headers}):safeApiError('creator-discord-claim',cause,'Your role could not be claimed yet. Try again.',502)}
}
export async function GET(request:Request,context:Context){return run(request,context,false)}
export async function POST(request:Request,context:Context){return run(request,context,true)}
