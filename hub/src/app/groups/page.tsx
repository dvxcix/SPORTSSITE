import { createClient } from '@/lib/supabase/server'
import { Plus, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { CommunityNav, CommunityMore } from '@/components/community/CommunityNav'
import { ProductAction, ProductPageShell } from '@/components/product/ProductPage'
import { CommunityDirectory } from '@/components/groups/CommunityDirectory'
import { publishedPaidCommunities, invitedCommunityEntries, type CommunityDirectoryEntry } from '@/lib/creatorCommunityDirectory'
import { canViewMlb } from '@/lib/mlbViewerAccess'

export const dynamic='force-dynamic'
export default async function GroupsPage() {
 const client=await createClient()
 const session=await client.auth.getUser().catch(()=>null)
 const user=session?.error?null:session?.data.user
 const [groups,memberships,paid,invitations,showMlb]=await Promise.all([
  client.from('groups').select('id,slug,name,description,sport,avatar_url,banner_url,emoji,member_count,owner_id,creator_product_id,access_type,is_public').order('member_count',{ascending:false}).limit(200),
  user?client.from('group_members').select('group_id,group:groups(id,slug,name,description,sport,avatar_url,banner_url,emoji,member_count,owner_id,creator_product_id,access_type,is_public)').eq('user_id',user.id):Promise.resolve({data:[],error:null}),
  publishedPaidCommunities(),
  user?invitedCommunityEntries(client,user.id):Promise.resolve([]),
  canViewMlb(client,user?.id),
 ])
 if(groups.error||memberships.error)throw new Error('Communities could not be loaded. Please retry.')
 const joined=(memberships.data??[]).flatMap(row=>Array.isArray(row.group)?row.group:row.group?[row.group]:[]) as unknown as CommunityDirectoryEntry[]
 const unique=new Map<string,CommunityDirectoryEntry>([...paid,...(groups.data??[]) as CommunityDirectoryEntry[],...joined].map(group=>[group.id,group]))
 // Preserve the published price on an otherwise RLS-readable paid card.
 for(const entry of paid)if(unique.has(entry.id))unique.set(entry.id,{...unique.get(entry.id)!,price:entry.price,billing_period_days:entry.billing_period_days,product_type:entry.product_type})
 const allowed=(group:CommunityDirectoryEntry)=>showMlb||group.sport?.trim().toUpperCase()!=='MLB'
 return <ProductPageShell><CommunityNav/><header className="ss-community-heading"><h1>Communities</h1><div>{user?<><ProductAction href="/creators/studio?setup=1"><Plus size={15}/> Create community</ProductAction><Link className="ss-community-studio" href="/creators/studio"><Settings2 size={16}/><span>Studio</span></Link></>:null}<CommunityMore/></div></header><CommunityDirectory groups={[...unique.values()].filter(allowed)} joinedIds={joined.filter(allowed).map(group=>group.id)} userId={user?.id??null} invitations={invitations.filter(allowed)}/></ProductPageShell>
}
