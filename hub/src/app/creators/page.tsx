import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import styles from './CreatorsMarketplace.module.css'
import { pageMetadata } from '@/lib/siteMetadata'
import { CreatorDirectory } from './CreatorDirectory'
import { publicCreatorDirectory, type PublishedCreatorStore, type PublicCreatorIdentity } from '@/lib/publicCreatorDirectory'

export const metadata = pageMetadata({ title: 'Discover Sports Creators | SlipSurge', description: 'Meet the people sharing sports research and picks. Explore their public profiles, coverage and memberships.', path: '/creators' })

export const dynamic = 'force-dynamic'

export default async function CreatorsPage() {
  const supabase = await createClient()
  const [{data:stores,error:storeError},{data,error}] = await Promise.all([supabase.from('creator_storefronts').select('creator_id,name,bio,logo_url,cover_url,sports,tags,featured,featured_rank,access_mode,creator:users!creator_storefronts_creator_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,is_verified,creator_products!creator_products_creator_id_fkey(id,title,description,price,product_type,billing_period_days))').eq('status','published').eq('creator.creator_products.status','active').order('featured',{ascending:false}).order('featured_rank').limit(100),supabase
    .from('users')
    .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,is_verified,creator_products!creator_products_creator_id_fkey!inner(id,title,description,price,product_type,billing_period_days)')
    .in('account_type', ['creator', 'admin'])
    .eq('creator_products.status', 'active')
    .order('follower_count', { ascending: false })
    .limit(48)])
  if (error||storeError) throw new Error('Creators could not be loaded. Please retry.')
  const creators = publicCreatorDirectory((data || []) as unknown as PublicCreatorIdentity[], (stores || []) as unknown as PublishedCreatorStore[])
  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>Discover sports creators</h1><p>Find the people behind the picks. Explore their profiles, research and memberships.</p></div><div className={styles.heroActions}><Link href="/groups">Browse communities</Link><Link href="/creators/studio">Creator Studio <ArrowUpRight size={16} aria-hidden="true"/></Link></div></header>

    <CreatorDirectory creators={creators} />
  </div>
}
