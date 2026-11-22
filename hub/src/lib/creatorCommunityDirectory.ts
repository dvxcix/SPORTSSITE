import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/admin'

const ENTRY_FIELDS='id,slug,name,description,sport,avatar_url,emoji,member_count,owner_id,creator_product_id,access_type,is_public'
export type CommunityDirectoryEntry={id:string;slug:string;name:string;description:string|null;sport:string|null;avatar_url:string|null;emoji:string|null;member_count:number;owner_id:string;creator_product_id:string|null;access_type:string;is_public:boolean;price?:number;billing_period_days?:number|null;product_type?:string;invitationId?:string}
function directoryCard(group:CommunityDirectoryEntry):CommunityDirectoryEntry{
 return {id:group.id,slug:group.slug,name:group.name,description:group.description,sport:group.sport,avatar_url:group.avatar_url,emoji:group.emoji,member_count:group.member_count,owner_id:group.owner_id,creator_product_id:group.creator_product_id,access_type:group.access_type,is_public:group.is_public}
}

/** Publication exposes this small directory card, never content, rules, rosters or private free spaces. */
export async function publishedPaidCommunities(options:{slug?:string;creatorId?:string}={}):Promise<CommunityDirectoryEntry[]> {
  const admin=createAdminClient()
  let target:CommunityDirectoryEntry|null=null
  if(options.slug){const result=await admin.from('groups').select(ENTRY_FIELDS).eq('access_type','paid').eq('slug',options.slug).maybeSingle();if(result.error)throw new Error('Community could not be loaded.');target=result.data as CommunityDirectoryEntry|null;if(!target?.creator_product_id)return []}
  let offersQuery=admin.from('creator_products').select('id,creator_id,price,product_type,billing_period_days').eq('status','active').order('created_at',{ascending:false}).limit(500)
  if(target)offersQuery=offersQuery.eq('id',target.creator_product_id)
  if(options.creatorId) offersQuery=offersQuery.eq('creator_id',options.creatorId)
  const {data:offers,error}=await offersQuery
  if(error)throw new Error('Published memberships could not be loaded.')
  if(!offers?.length)return []
  let groupsQuery=admin.from('groups').select(ENTRY_FIELDS).eq('access_type','paid').in('creator_product_id',offers.map(offer=>offer.id)).limit(1000)
  if(options.slug)groupsQuery=groupsQuery.eq('slug',options.slug)
  const {data:groups,error:groupError}=await groupsQuery
  if(groupError)throw new Error('Published communities could not be loaded.')
  return (groups??[]).flatMap(group=>{
    const offer=offers.find(offer=>offer.id===group.creator_product_id&&offer.creator_id===group.owner_id)
    return offer?[{...directoryCard(group as CommunityDirectoryEntry),price:Number(offer.price),billing_period_days:offer.billing_period_days,product_type:offer.product_type}]:[]
  })
}

/** A pending invite reveals only its own destination card. Ordinary private links remain private. */
export async function invitedCommunityEntry(client:SupabaseClient,slug:string,userId:string):Promise<CommunityDirectoryEntry|null> {
  const {data:invites,error}=await client.from('group_invites').select('id,group_id').eq('invited_user_id',userId).eq('status','pending').limit(100)
  if(error)throw new Error('Invitations could not be loaded.')
  if(!invites?.length)return null
  const {data:group,error:groupError}=await createAdminClient().from('groups').select(ENTRY_FIELDS).eq('slug',slug).in('id',invites.map(invite=>invite.group_id)).maybeSingle()
  if(groupError)throw new Error('Invitation destination could not be loaded.')
  return group?{...directoryCard(group as CommunityDirectoryEntry),invitationId:invites.find(invite=>invite.group_id===group.id)!.id}:null
}

export async function invitedCommunityEntries(client:SupabaseClient,userId:string):Promise<CommunityDirectoryEntry[]> {
  const {data:invites,error}=await client.from('group_invites').select('id,group_id').eq('invited_user_id',userId).eq('status','pending').limit(100)
  if(error)throw new Error('Invitations could not be loaded.')
  if(!invites?.length)return []
  const {data:groups,error:groupError}=await createAdminClient().from('groups').select(ENTRY_FIELDS).in('id',invites.map(invite=>invite.group_id)).limit(100)
  if(groupError)throw new Error('Invitation destinations could not be loaded.')
  return (groups??[]).map(group=>({...directoryCard(group as CommunityDirectoryEntry),invitationId:invites.find(invite=>invite.group_id===group.id)!.id}))
}
