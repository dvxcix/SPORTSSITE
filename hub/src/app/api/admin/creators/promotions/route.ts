import { NextRequest, NextResponse } from 'next/server'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { writeAdminAudit } from '@/lib/adminAudit'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export async function POST(request:NextRequest){
 const headers={'Cache-Control':'private, no-store'}
 if(!request.headers.has('authorization')&&request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Open promotions from SlipSurge admin.'},{status:403,headers})
 const auth=await creatorAdminAuth(request)
 if('error'in auth)return NextResponse.json({error:auth.error},{status:auth.status,headers})
 const body=await request.json().catch(()=>null)
 if(!body||Object.keys(body).some(key=>!['creatorId','featured','rank'].includes(key))||typeof body.creatorId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.creatorId)||typeof body.featured!=='boolean'||!Number.isInteger(body.rank)||body.rank<0||body.rank>999)return NextResponse.json({error:'Choose a valid store and placement from 0 to 999.'},{status:400,headers})
 const rate=await consumeServerRateLimit(auth.user.id,'creator_promotions',30,300)
 if(!rate.available||!rate.allowed)return NextResponse.json({error:'Please wait before trying again.'},{status:rate.available?429:503,headers})
 const {data:store,error}=await auth.admin.from('creator_storefronts').update({featured:body.featured,featured_rank:body.rank,updated_at:new Date().toISOString()}).eq('creator_id',body.creatorId).eq('status','published').select('creator_id').maybeSingle()
 if(error||!store)return NextResponse.json({error:'Only published stores can be featured.'},{status:409,headers})
 const auditError=await writeAdminAudit(auth.admin,{actorUserId:auth.user.id,action:'creator.store_feature_changed',targetType:'creator_storefront',targetId:body.creatorId,details:{featured:body.featured,rank:body.rank},request})
 if(auditError)return NextResponse.json({error:'Feature changed, but the audit receipt failed. Refresh before retrying.'},{status:503,headers})
 return NextResponse.json({ok:true},{headers})
}
