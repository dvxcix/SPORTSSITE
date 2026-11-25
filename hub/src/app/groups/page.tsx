import { createClient } from '@/lib/supabase/server'
import { Plus, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { CommunityNav, CommunityMore } from '@/components/community/CommunityNav'
import { ProductAction, ProductPageShell } from '@/components/product/ProductPage'
import { CommunityDirectory } from '@/components/groups/CommunityDirectory'
import { loadCommunityDirectory } from '@/lib/communityDirectoryServer'

export const dynamic='force-dynamic'
export default async function GroupsPage() {
 const client=await createClient()
 const session=await client.auth.getUser().catch(()=>null)
 const user=session?.error?null:session?.data.user
 const directory=await loadCommunityDirectory(client,user?.id)
 return <ProductPageShell><CommunityNav/><header className="ss-community-heading"><h1>Communities</h1><div>{user?<><ProductAction href="/creators/studio?setup=1"><Plus size={15}/> Create community</ProductAction><Link className="ss-community-studio" href="/creators/studio" aria-label="Creator Studio"><Settings2 size={16}/><span>Studio</span></Link></>:null}<CommunityMore/></div></header><CommunityDirectory {...directory} userId={user?.id??null}/></ProductPageShell>
}
