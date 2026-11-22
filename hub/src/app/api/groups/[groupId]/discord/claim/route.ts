import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreatorDiscordError, creatorDiscordIdentity, processCreatorDiscordQueue, verifyCreatorDiscordMembership } from '@/lib/creatorDiscord'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(_request:Request,context:{params:Promise<{groupId:string}>}){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return NextResponse.json({error:'Sign in first.'},{status:401})
 const {groupId}=await context.params;const admin=createAdminClient()
 try{
  const rate=await consumeServerRateLimit(user.id,'creator_discord_claim',10,3600);if(!rate.available||!rate.allowed)return NextResponse.json({error:'Please wait before claiming again.'},{status:rate.available?429:503})
  await creatorDiscordIdentity(admin,user.id)
  const {data:integration,error}=await admin.from('creator_discord_integrations').select('id').eq('group_id',groupId).eq('enabled',true).maybeSingle();if(error)throw error;if(!integration)return NextResponse.json({error:'This community has not connected Discord.'},{status:404})
  await verifyCreatorDiscordMembership(admin,integration.id,user.id)
  const {data:access,error:accessError}=await admin.rpc('creator_discord_access',{p_integration_id:integration.id,p_user_id:user.id});if(accessError)throw accessError
  if(!access?.allowed)return NextResponse.json({error:'An active community membership is required.'},{status:403})
  const queued=await admin.rpc('queue_creator_discord',{p_group_id:groupId,p_user_id:user.id});if(queued.error)throw queued.error
  await processCreatorDiscordQueue(admin,1,user.id,integration.id)
  const {data:job}=await admin.from('creator_discord_jobs').select('pending,assigned_discord_id').eq('integration_id',integration.id).eq('user_id',user.id).single()
  if(!job||job.pending||job.assigned_discord_id!==access.discord_id)return NextResponse.json({error:'Role delivery is pending. Join the server and check that the bot can manage the membership role, then try again.'},{status:409})
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})
 }catch(cause){return cause instanceof CreatorDiscordError?NextResponse.json({error:cause.message},{status:cause.status}):safeApiError('creator-discord-claim',cause,'Your role could not be claimed yet. Try again.',502)}
}
