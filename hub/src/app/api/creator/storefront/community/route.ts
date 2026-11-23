import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { STORE_COLUMNS,storeCommunityBrand } from '@/lib/creatorStorefront'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export async function POST(request:NextRequest){
 const headers={'Cache-Control':'private, no-store'}
 if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Open store setup from SlipSurge.'},{status:403,headers})
 const client=await createClient(),{data:{user}}=await client.auth.getUser()
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401,headers})
 const rate=await consumeServerRateLimit(user.id,'creator_store_community',12,300)
 if(!rate.available||!rate.allowed)return NextResponse.json({error:'Please wait before trying again.'},{status:rate.available?429:503,headers})
 const admin=createAdminClient(),{data:store,error}=await admin.from('creator_storefronts').select(STORE_COLUMNS).eq('creator_id',user.id).single()
 if(error||!store||store.name.length<2)return NextResponse.json({error:'Save your store details first.'},{status:409,headers})
 const groupSlug='club-'+user.id.replaceAll('-','')
 const query=admin.from('groups').select('id,slug,creator_product_id').eq('owner_id',user.id)
 const {data:existing,error:groupError}=await (store.community_id?query.eq('id',store.community_id):query.eq('slug',groupSlug)).maybeSingle()
 if(groupError)return NextResponse.json({error:'Your community could not be checked.'},{status:503,headers})
 if(store.access_mode==='paid'){
  const {data:product}=await admin.from('creator_products').select('id,whop_plan_id').eq('id',store.product_id).eq('creator_id',user.id).maybeSingle()
  if(!product?.whop_plan_id)return NextResponse.json({error:'Finish your paid membership first.'},{status:409,headers})
 }
 let group=existing
 if(group&&group.creator_product_id!==(store.access_mode==='paid'?store.product_id:null))return NextResponse.json({error:'Community access changed. Review it in community settings.'},{status:409,headers})
 if(!group){
  const {data,error:createError}=await client.rpc('create_community_group',{...storeCommunityBrand(store),p_slug:groupSlug,p_sport:store.sports[0]||null,p_emoji:'⚡',p_is_public:false,p_creator_product_id:store.access_mode==='paid'?store.product_id:null})
  const created=Array.isArray(data)?data[0]:data
  if(createError||!created?.group_id)return NextResponse.json({error:'Your community could not be created. Retry to check and resume it.'},{status:409,headers})
  group={id:created.group_id,slug:created.group_slug,creator_product_id:store.product_id}
 }
 const {error:saveError}=await admin.from('creator_storefronts').update({community_id:group.id,updated_at:new Date().toISOString()}).eq('creator_id',user.id)
 if(saveError)return NextResponse.json({error:'The community was created. Retry to reconnect it to your store.'},{status:503,headers})
 const {error:brandError}=await client.rpc('update_community_group',{p_group_id:group.id,...storeCommunityBrand(store),p_sport:store.sports[0]||null,p_avatar_url:store.logo_url,p_banner_url:store.cover_url,p_is_public:store.status==='published'&&store.access_mode==='free'})
 if(brandError)return NextResponse.json({error:'Your community is saved. Its branding needs another try.'},{status:503,headers})
 return NextResponse.json({group},{headers})
}
