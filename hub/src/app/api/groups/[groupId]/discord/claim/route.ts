import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreatorDiscordError } from '@/lib/creatorDiscord'
import { claimCommunityDiscord, communityDiscordStatus } from '@/lib/creatorDiscordClaimAccess'
import { nativeDiscordToken } from '@/lib/creatorDiscordAccount'
import { requireDiscordSameOrigin } from '@/lib/creatorDiscordOwner'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { nativeCommunityPublishing } from '@/lib/nativeCommunityPublishing'

const headers={'Cache-Control':'private, no-store'}
export const maxDuration=120
type Context={params:Promise<{groupId:string}>}
async function run(request:Request,context:Context,claim:boolean){
 try{
  const native=request.headers.has('authorization') ? await requireNativeAccount(request) : null
  if(native?.error)return native.error
  if(claim&&!native)requireDiscordSameOrigin(request)
  const client=native?.supabase??await createClient()
  const userId=native?.userId??(await client.auth.getUser()).data.user?.id
  if(!userId)return NextResponse.json({error:'Sign in first.'},{status:401,headers})
  const {groupId}=await context.params
  if(!/^[0-9a-f-]{36}$/i.test(groupId))return NextResponse.json({error:'Community not found.'},{status:404,headers})
  if(native){
   const group=await nativeCommunityPublishing(client,userId,groupId)
   if(group.error)return NextResponse.json({error:group.error},{status:group.status,headers})
  }
  const admin=createAdminClient()
  if(!claim){
   const state=await communityDiscordStatus(admin,userId,groupId)
   return NextResponse.json({connected:!!state.discordId,ready:state.ready,guildName:state.integrations[0].guild_name,roles:state.integrations.map(role=>role.role_name),inviteUrl:state.integrations[0].invite_url},{headers})
  }
  const rate=await consumeServerRateLimit(userId,'creator_discord_claim',20,3600)
  if(!rate.available||!rate.allowed)throw new CreatorDiscordError('Please wait before checking again.',rate.available?429:503)
  let token:string|undefined
  if(native){
   const raw=await request.text()
   if(raw.length>4096)throw new CreatorDiscordError('Discord authorization is invalid.',400)
   let input:unknown
   try{input=JSON.parse(raw||'{}')}catch{throw new CreatorDiscordError('Discord authorization is invalid.',400)}
   if(!input||typeof input!=='object'||Array.isArray(input))throw new CreatorDiscordError('Discord authorization is invalid.',400)
   token=nativeDiscordToken((input as {providerToken?:unknown}).providerToken)
  }
  return NextResponse.json({ok:true,...await claimCommunityDiscord(admin,userId,groupId,client,token)},{headers})
 }catch(cause){return cause instanceof CreatorDiscordError?NextResponse.json({error:cause.message,code:cause.code},{status:cause.status,headers}):safeApiError('creator-discord-claim',cause,'Your role could not be claimed yet. Try again.',502)}
}
export async function GET(request:Request,context:Context){return run(request,context,false)}
export async function POST(request:Request,context:Context){return run(request,context,true)}
