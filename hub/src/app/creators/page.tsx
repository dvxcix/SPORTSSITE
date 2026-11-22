import Link from 'next/link'
import { ArrowRight, BadgeCheck, Compass, Layers, LockKeyhole, Users } from 'lucide-react'
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
    .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,bio,follower_count,creator_products!creator_products_creator_id_fkey!inner(id,title,description,price,product_type,billing_period_days)')
    .in('account_type', ['creator', 'admin'])
    .eq('creator_products.status', 'active')
    .order('follower_count', { ascending: false })
    .limit(48)
  if (error) throw new Error('Creator memberships could not be loaded. Please retry.')
  const creators = (data ?? []) as unknown as CreatorDirectoryItem[]
  return <div className={styles.page}>
    <section className={styles.hero} style={{ gridTemplateColumns: '1fr' }}>
      <div>
        <span className={styles.eyebrow}><Compass size={15} /> Creator marketplace</span>
        <h1>Find sports creators and memberships</h1>
        <p>Explore creator profiles, compare memberships, and find their research and communities.</p>
        <div className={styles.actions}><a href="#marketplace">Explore creators <ArrowRight size={16} /></a><Link href="/creators/studio">Start your community</Link></div>
      </div>
    </section>

    <section className={styles.trustRow}>
      <span><BadgeCheck size={17} /> Creator storefronts</span>
      <span><LockKeyhole size={17} /> Secure member access</span>
      <span><Users size={17} /> Private communities</span>
      <span><Layers size={17} /> Research plans sold separately</span>
    </section>

    <CreatorDirectory creators={creators} />
  </div>
}
