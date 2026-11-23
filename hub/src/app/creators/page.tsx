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
  const { data, error } = await supabase
    .from('users')
    .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,creator_products!creator_products_creator_id_fkey!inner(id,title,description,price,product_type,billing_period_days)')
    .in('account_type', ['creator', 'admin'])
    .eq('creator_products.status', 'active')
    .order('follower_count', { ascending: false })
    .limit(48)
  if (error) throw new Error('Creator memberships could not be loaded. Please retry.')
  const creators = (data ?? []) as unknown as CreatorDirectoryItem[]
  return <div className={styles.page}>
    <header className={styles.hero}><div><span className={styles.eyebrow}>Made for your game</span><h1>Find your community.</h1><p>Independent voices. Original research. A place to talk sports.</p></div><Link href="/creators/studio">Start creating <ArrowUpRight size={16}/></Link></header>

    <CreatorDirectory creators={creators} />
  </div>
}
