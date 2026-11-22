import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MemberRingStyle } from './avatarStyles'

export type CreatorOperatorProfile = { id:string; username:string; display_name:string|null; avatar_url:string|null; avatar_ring_style:MemberRingStyle|null; avatar_ring_color:string|null; email:string|null; account_type:string; creator_commerce_status:string|null; creator_commerce_updated_at:string|null; linked:boolean }
export type CreatorManagedGroup = { id:string; name:string; slug:string; owner_id:string; access_type:string; is_public:boolean; member_count:number; creator_product_id:string|null; sport:string|null }
export type CreatorManagedOffer = { id:string; creator_id:string; title:string; price:number; currency:string; product_type:string; status:string; updated_at:string; platform_fee_amount:number|null }
export type CreatorManagedMember = { id:string; creator_id:string; product_id:string; user_id:string; status:string; current_period_end:string|null; created_at:string; admin_revoked_at:string|null; admin_revoked_reason:string|null; member:{username:string;display_name:string|null}|null }
export type CreatorManagedEvent = { id:string;creator_id:string;product_id:string|null;event_type:string;amount:number|null;currency:string|null;status:string|null;created_at:string }
export type CreatorOperationsData = { creators:CreatorOperatorProfile[]; groups:CreatorManagedGroup[]; offers:CreatorManagedOffer[]; members:CreatorManagedMember[]; events:CreatorManagedEvent[] }
const PROFILE = 'id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,email,account_type,creator_commerce_status,creator_commerce_updated_at,whop_connected_company_id'

export async function getCreatorOperations(admin: SupabaseClient):Promise<CreatorOperationsData> {
  const results = await Promise.all([
    admin.from('users').select(PROFILE).in('account_type',['creator','admin']).order('display_name').limit(500),
    admin.from('groups').select('id,name,slug,owner_id,access_type,is_public,member_count,creator_product_id,sport').order('created_at',{ascending:false}).limit(500),
    admin.from('creator_products').select('id,creator_id,title,price,currency,product_type,status,updated_at,platform_fee_amount').order('updated_at',{ascending:false}).limit(500),
    admin.from('creator_entitlements').select('id,creator_id,product_id,user_id,status,current_period_end,created_at,admin_revoked_at,admin_revoked_reason,member:users!creator_entitlements_user_id_fkey(username,display_name)').order('created_at',{ascending:false}).limit(500),
    admin.from('creator_commerce_events').select('id,creator_id,product_id,event_type,amount,currency,status,created_at').order('created_at',{ascending:false}).limit(100),
  ])
  if (results.some(result=>result.error)) throw new Error('Creator operations could not be loaded. Please retry.')
  const profiles=results[0].data??[],groups=results[1].data??[],offers=results[2].data??[],members=results[3].data??[],events=results[4].data??[]
  const known = new Set(profiles.map(profile=>profile.id))
  const owners = [...new Set([...groups.map(group=>group.owner_id),...offers.map(offer=>offer.creator_id),...members.map(member=>member.creator_id)])].filter(id=>!known.has(id))
  const extra = owners.length ? await admin.from('users').select(PROFILE).in('id',owners).limit(1500) : {data:[],error:null}
  if (extra.error) throw new Error('Community owners could not be loaded.')
  return {
    creators:[...profiles,...(extra.data??[])].map(profile=>{
      const {whop_connected_company_id,...publicProfile}=profile
      return {...publicProfile,linked:Boolean(whop_connected_company_id)} as CreatorOperatorProfile
    }),
    groups:groups as unknown as CreatorManagedGroup[], offers:offers as unknown as CreatorManagedOffer[], members:members as unknown as CreatorManagedMember[], events:events as unknown as CreatorManagedEvent[],
  }
}
