import { NextRequest, NextResponse } from 'next/server'
import { creatorRouteAccount } from '@/lib/creatorRouteAccount'
import { createAdminClient } from '@/lib/supabase/admin'
import { STORE_OWNER_COLUMNS, ownerStore, storeCommunityBrand } from '@/lib/creatorStorefront'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export async function POST(request: NextRequest) {
 const headers={'Cache-Control':'private, no-store'}
 if (!request.headers.has('authorization') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({error:'Open store setup from SlipSurge.'},{status:403,headers})
 const account = await creatorRouteAccount(request, 'Sign in required.')
 if (account.error) return account.error
 const { client, userId } = account
 let body
 try { const raw=await request.text();body=raw.trim()?JSON.parse(raw):{} } catch { return NextResponse.json({error:'Choose a valid community.'},{status:400,headers}) }
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='communityId')||body.communityId!=null&&body.communityId!=='new'&&(typeof body.communityId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.communityId)))return NextResponse.json({error:'Choose a valid community.'},{status:400,headers})
 const rate=await consumeServerRateLimit(userId,'creator_store_community',12,300)
 if(!rate.available||!rate.allowed)return NextResponse.json({error:'Please wait before trying again.'},{status:rate.available?429:503,headers})
 const admin=createAdminClient(),{data:row,error}=await admin.from('creator_storefronts').select(STORE_OWNER_COLUMNS).eq('creator_id',userId).single()
 const store=ownerStore(row)
 if(error||!store||store.name.length<2)return NextResponse.json({error:'Save your store details first.'},{status:409,headers})
 const productId=store.access_mode==='paid'?store.product_id:null
 if(store.access_mode==='paid'){
  const {data:product}=await admin.from('creator_products').select('id,whop_plan_id').eq('id',productId).eq('creator_id',userId).maybeSingle()
  if(!product?.whop_plan_id)return NextResponse.json({error:'Finish your paid membership first.'},{status:409,headers})
 }
 const {data:owned,error:groupError}=await admin.from('groups').select('id,slug,creator_product_id,access_type').eq('owner_id',userId).order('created_at').limit(100)
 if(groupError)return NextResponse.json({error:'Your communities could not be checked.'},{status:503,headers})
 const groups=owned??[],compatible=groups.filter(group=>group.access_type===store.access_mode&&(group.creator_product_id??null)===productId)
 const explicit=body.communityId&&body.communityId!=='new'?body.communityId:null
 if(explicit&&!compatible.some(group=>group.id===explicit))return NextResponse.json({error:'Choose one of your communities with the same membership access.'},{status:403,headers})
 if(store.status==='published'&&explicit&&explicit!==store.community_id)return NextResponse.json({error:'Manage your published community in Studio.'},{status:409,headers})
 const groupSlug='club-'+userId.replaceAll('-','')
 let group=compatible.find(group=>group.id===(explicit||store.community_id))
 if(!group&&body.communityId==='new')group=compatible.find(group=>group.slug===groupSlug)
 if(!group&&!body.communityId){if(compatible.length>1)return NextResponse.json({error:'Choose which existing community belongs to your store.'},{status:409,headers});group=compatible[0]}
 let createdNew=false
 if(store.status==='published'&&!group)return NextResponse.json({error:'Your published community could not be verified.'},{status:409,headers})
 if(!group){
  const {data,error:createError}=await client.rpc('create_community_group',{...storeCommunityBrand(store),p_slug:groupSlug,p_sport:store.sports[0]||null,p_emoji:'⚡',p_is_public:false,p_creator_product_id:productId})
  const created=Array.isArray(data)?data[0]:data
  if(createError||!created?.group_id)return NextResponse.json({error:'Your community could not be created. Retry to check and resume it.'},{status:409,headers})
  group={id:created.group_id,slug:created.group_slug,creator_product_id:productId,access_type:store.access_mode};createdNew=true
 }
 const {error:saveError}=await admin.from('creator_storefronts').update({community_id:group.id,updated_at:new Date().toISOString()}).eq('creator_id',userId)
 if(saveError)return NextResponse.json({error:'The community is saved. Retry to reconnect it to your store.'},{status:503,headers})
 // Linking an existing space must not change its content, brand, privacy or membership.
 if(createdNew){const {error:brandError}=await client.rpc('update_community_group',{p_group_id:group.id,...storeCommunityBrand(store),p_sport:store.sports[0]||null,p_avatar_url:store.logo_url,p_banner_url:store.cover_url,p_is_public:false});if(brandError)return NextResponse.json({error:'Your community is saved. Finish its branding in community settings.'},{status:503,headers})}
 return NextResponse.json({group,reused:!createdNew},{headers})
}
