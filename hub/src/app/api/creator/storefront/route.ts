import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { storeDraft, storePublishIssue, storeCommunityBrand, STORE_OWNER_COLUMNS, ownerStore, type CreatorStore, type CreatorStoreDraft } from '@/lib/creatorStorefront'
import { setCreatorOfferStatus } from '@/lib/creatorOfferStatus'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

const headers = { 'Cache-Control': 'private, no-store' }
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({error:'Open store setup from SlipSurge.'},{status:403,headers})
  const client=await createClient(), {data:{user}}=await client.auth.getUser()
  if(!user)return NextResponse.json({error:'Sign in to set up your store.'},{status:401,headers})
  const body=await request.json().catch(()=>null)
  let draft
  try { draft=storeDraft(body); if(!['save','publish'].includes(body.action))throw new Error('Choose a valid action.') }
  catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:'Invalid storefront.'},{status:400,headers})}
  const rate=await consumeServerRateLimit(user.id,'creator_store_setup',60,300)
  if(!rate.available||!rate.allowed)return NextResponse.json({error:'Please wait a moment before saving again.'},{status:rate.available?429:503,headers})
  const admin=createAdminClient()
  const {data:existing,error:lookupError}=await admin.from('creator_storefronts').select(STORE_OWNER_COLUMNS).eq('creator_id',user.id).maybeSingle()
  if(lookupError)return NextResponse.json({error:'Store setup could not be loaded.'},{status:503,headers})
  if(existing?.status==='published'&&existing.community_id&&(existing.access_mode!==draft.access_mode||existing.product_id!==draft.product_id))return NextResponse.json({error:'Manage access in your community settings once it has been published.'},{status:409,headers})
  if(draft.product_id){const {data:product,error}=await admin.from('creator_products').select('id').eq('id',draft.product_id).eq('creator_id',user.id).maybeSingle();if(error||!product)return NextResponse.json({error:'Choose one of your own memberships.'},{status:403,headers})}
  const accessChanged=existing&&(existing.access_mode!==draft.access_mode||existing.product_id!==draft.product_id)
  const publishing=body.action==='publish', combined={...draft,community_id:accessChanged?null:existing?.community_id||null}
  if(publishing){
    const issue=storePublishIssue(combined)
    if(issue)return NextResponse.json({error:issue},{status:409,headers})
    const {data:group,error}=await admin.from('groups').select('id,slug,is_public,creator_product_id,access_type').eq('id',combined.community_id).eq('owner_id',user.id).maybeSingle()
    if(error||!group||draft.access_mode==='paid'&&(group.creator_product_id!==draft.product_id||group.access_type!=='paid')||draft.access_mode==='free'&&group.access_type==='paid')return NextResponse.json({error:'Your community access could not be verified.'},{status:409,headers})
    if(draft.access_mode==='paid')try{await setCreatorOfferStatus(admin,draft.product_id!,'active',user.id)}catch{return NextResponse.json({error:'Your membership is not ready to publish. Check payment setup and try again.'},{status:409,headers})}
    const publicFree=draft.access_mode==='free'&&(group.is_public===true||group.slug==='club-'+user.id.replaceAll('-',''))
    const {error:brandError}=await client.rpc('update_community_group',{p_group_id:group.id,...storeCommunityBrand(draft),p_sport:draft.sports[0]||null,p_avatar_url:draft.logo_url,p_banner_url:draft.cover_url,p_is_public:publicFree})
    if(brandError)return NextResponse.json({error:'Your community branding could not be published. Refresh its status before retrying.'},{status:503,headers})
  }
  const row:Partial<CreatorStore>&{creator_id:string;draft:CreatorStoreDraft|null}=existing?.status==='published'&&!publishing?{creator_id:user.id,draft,updated_at:new Date().toISOString()}:{...draft,community_id:combined.community_id,creator_id:user.id,status:publishing?'published':existing?.status||'draft',draft:null,setup_step:publishing?4:draft.setup_step,updated_at:new Date().toISOString()}
  const write=existing?admin.from('creator_storefronts').update(row).eq('creator_id',user.id):admin.from('creator_storefronts').insert(row)
  const {data:store,error}=await write.select(STORE_OWNER_COLUMNS).single()
  if(error)return NextResponse.json({error:publishing?'Your store could not be saved. Refresh its status before retrying.':'Your draft could not be saved. Try again.'},{status:503,headers})
  return NextResponse.json({store:ownerStore(store)},{headers})
}
