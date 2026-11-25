import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { safeApiError } from '@/lib/safeApiError'

export async function respondToCommunityInvite(request: Request, client: SupabaseClient, userId: string) {
  const body=await request.json().catch(()=>null)
  if(!body||typeof body.inviteId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.inviteId)||typeof body.accept!=='boolean')return NextResponse.json({error:'Invalid invitation response.'},{status:400})
  const rate=await consumeServerRateLimit(userId,'creator_invite_respond',30,300)
  if(!rate.available||!rate.allowed)return NextResponse.json({error:'Please wait before responding again.'},{status:rate.available?429:503})
  const {data:invite,error:inviteError}=await client.from('group_invites').select('group_id').eq('id',body.inviteId).eq('invited_user_id',userId).maybeSingle()
  if(inviteError)return safeApiError('creator-invite-lookup',inviteError)
  if(!invite)return NextResponse.json({error:'Invitation not found.'},{status:404})
  const admin=createAdminClient()
  const {data:group,error:groupError}=await admin.from('groups').select('sport').eq('id',invite.group_id).single()
  if(groupError)return safeApiError('creator-invite-group',groupError)
  if(group?.sport?.toUpperCase()==='MLB'&&!await canViewMlb(client,userId))return NextResponse.json({error:'Community unavailable.'},{status:404})
  const {data,error}=await admin.rpc('respond_to_creator_group_invite',{p_actor:userId,p_invite:body.inviteId,p_accept:body.accept})
  if(error?.code==='42501')return NextResponse.json({error:'This community requires a current paid membership before joining.'},{status:409})
  if(error?.code==='P0002')return NextResponse.json({error:'Invitation not found.'},{status:404})
  if(error?.code==='40001')return NextResponse.json({error:'This invitation is no longer pending.'},{status:409})
  if(error)return safeApiError('creator-invite-response',error)
  return NextResponse.json(data)
}
