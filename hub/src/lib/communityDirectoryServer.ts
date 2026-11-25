import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publishedPaidCommunities, invitedCommunityEntries, type CommunityDirectoryEntry } from '@/lib/creatorCommunityDirectory'
import { canViewMlb } from '@/lib/mlbViewerAccess'

export async function loadCommunityDirectory(client: SupabaseClient, userId?: string) {
 const [groups,memberships,paid,invitations,showMlb]=await Promise.all([
  client.from('groups').select('id,slug,name,description,sport,avatar_url,banner_url,emoji,member_count,owner_id,creator_product_id,access_type,is_public').order('member_count',{ascending:false}).limit(200),
  userId?client.from('group_members').select('group_id,group:groups(id,slug,name,description,sport,avatar_url,banner_url,emoji,member_count,owner_id,creator_product_id,access_type,is_public)').eq('user_id',userId):Promise.resolve({data:[],error:null}),
  publishedPaidCommunities(),
  userId?invitedCommunityEntries(client,userId):Promise.resolve([]),
  canViewMlb(client,userId),
 ])
 if(groups.error||memberships.error)throw new Error('Communities could not be loaded. Please retry.')
 const joined=(memberships.data??[]).flatMap(row=>Array.isArray(row.group)?row.group:row.group?[row.group]:[]) as unknown as CommunityDirectoryEntry[]
 const unique=new Map<string,CommunityDirectoryEntry>([...paid,...(groups.data??[]) as CommunityDirectoryEntry[],...joined].map(group=>[group.id,group]))
 // Preserve the published price on an otherwise RLS-readable paid card.
 for(const entry of paid)if(unique.has(entry.id))unique.set(entry.id,{...unique.get(entry.id)!,price:entry.price,billing_period_days:entry.billing_period_days,product_type:entry.product_type})
 const allowed=(group:CommunityDirectoryEntry)=>showMlb||group.sport?.trim().toUpperCase()!=='MLB'
 return { groups: [...unique.values()].filter(allowed), joinedIds: joined.filter(allowed).map(group => group.id), invitations: invitations.filter(allowed) }
}
