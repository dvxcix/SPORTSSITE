import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { groupFeedPage } from '@/lib/groupFeed'
import { InvalidFeedCursorError } from '@/lib/feedPagination'
import { authVisibilityUnavailable } from '@/lib/blocks'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { safeApiError } from '@/lib/safeApiError'

export async function GET(request:Request,{params}:{params:Promise<{groupId:string}>}) {
 const {groupId}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId))return NextResponse.json({error:'Invalid community.'},{status:400})
 const client=await createClient()
 const {data:{user},error:authError}=await client.auth.getUser()
 if(authVisibilityUnavailable(authError))return NextResponse.json({error:'Community access could not be checked.'},{status:503})
 const {data:group,error}=await client.from('groups').select('id,sport').eq('id',groupId).maybeSingle()
 if(error)return safeApiError('group-post-access',error)
 if(!group)return NextResponse.json({error:'Community access unavailable.'},{status:403})
 const hideMlb=!await canViewMlb(client,user?.id)
 if(hideMlb&&group.sport?.toUpperCase()==='MLB')return NextResponse.json({error:'Community unavailable.'},{status:404})
 const search=new URL(request.url).searchParams
 try {return NextResponse.json(await groupFeedPage(client,groupId,{picks:search.get('view')==='picks',userId:user?.id,hideMlb,cursor:search.get('cursor')}),{headers:{'Cache-Control':'private, no-store'}})}
 catch(cause){if(cause instanceof InvalidFeedCursorError)return NextResponse.json({error:'Invalid page cursor.'},{status:400});return safeApiError('group-post-page',cause,'Community posts could not be loaded.',503)}
}
