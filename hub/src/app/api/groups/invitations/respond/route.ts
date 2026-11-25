import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { respondToCommunityInvite } from '@/lib/communityInviteServer'

export async function POST(request:Request) {
  const client=await createClient()
  const {data:{user}}=await client.auth.getUser()
  if(!user)return NextResponse.json({error:'Sign in to respond to this invitation.'},{status:401})
  return respondToCommunityInvite(request,client,user.id)
}
