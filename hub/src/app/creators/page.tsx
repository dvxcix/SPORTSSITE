import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import styles from './CreatorsMarketplace.module.css'
import { pageMetadata } from '@/lib/siteMetadata'
import { CreatorDirectory, type CreatorDirectoryItem } from './CreatorDirectory'

export const metadata = pageMetadata({ title: 'Sports Creators and Communities | SlipSurge', description: 'Discover sports creators, premium memberships, private groups, and member channels.', path: '/creators' })

export const dynamic = 'force-dynamic'

export default async function CreatorsPage() {
  const supabase = await createClient()
  const [{data:stores,error:storeError},{data,error}] = await Promise.all([supabase.from('creator_storefronts').select('creator_id,name,bio,logo_url,cover_url,sports,tags,featured,featured_rank,access_mode,creator:users!creator_storefronts_creator_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,creator_products!creator_products_creator_id_fkey(id,title,description,price,product_type,billing_period_days))').eq('status','published').eq('creator.creator_products.status','active').order('featured',{ascending:false}).order('featured_rank').limit(100),supabase
    .from('users')
    .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,creator_products!creator_products_creator_id_fkey!inner(id,title,description,price,product_type,billing_period_days)')
    .in('account_type', ['creator', 'admin'])
    .eq('creator_products.status', 'active')
    .order('follower_count', { ascending: false })
    .limit(48)])
  if (error||storeError) throw new Error('Creator memberships could not be loaded. Please retry.')
  const published=(stores||[]) as unknown as Array<{creator:CreatorDirectoryItem|null;creator_id:string;name:string;bio:string;logo_url:string|null;cover_url:string|null;sports:string[];tags:string[];featured:boolean;featured_rank:number;access_mode:'free'|'paid'}>
  const creators = [...new Map([...(data||[]) as unknown as CreatorDirectoryItem[],...published.filter(row=>row.creator).map(row=>({...row.creator!,display_name:row.name,bio:row.bio,avatar_url:row.logo_url,banner_url:row.cover_url,avatar_ring_style:'none' as const,sports:row.sports,tags:row.tags,featured:row.featured,featured_rank:row.featured_rank,access_mode:row.access_mode}))].map(row=>[row.id,row])).values()]
  return <div className={styles.page}>
    <header className={styles.hero}><div><span className={styles.eyebrow}>Made for your game</span><h1>Find your community.</h1><p>Independent voices. Original research. A place to talk sports.</p></div><Link href="/creators/studio">Start creating <ArrowUpRight size={16}/></Link></header>

    <CreatorDirectory creators={creators} />
  </div>
}
