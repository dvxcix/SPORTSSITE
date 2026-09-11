import Link from 'next/link'
import { ArrowRight, BadgeCheck, Compass, LockKeyhole, Sparkles, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import styles from './CreatorsMarketplace.module.css'
import { pageMetadata } from '@/lib/siteMetadata'
import { CreatorDirectory, type CreatorDirectoryItem } from './CreatorDirectory'

export const metadata = pageMetadata({ title: 'Sports Creators and Communities | SlipSurge', description: 'Discover sports creators, premium memberships, private groups, and member channels.', path: '/creators' })

export const dynamic = 'force-dynamic'

export default async function CreatorsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id,username,display_name,avatar_url,bio,follower_count,creator_products!creator_products_creator_id_fkey(id,title,description,price,product_type)')
    .eq('account_type', 'creator')
    .eq('creator_products.status', 'active')
    .order('follower_count', { ascending: false })
    .limit(48)
  const creators = (data ?? []) as unknown as CreatorDirectoryItem[]
  return <main className={styles.page}>
    <section className={styles.hero} style={{ gridTemplateColumns: '1fr' }}>
      <div className={styles.heroGlow} />
      <div>
        <span className={styles.eyebrow}><Compass size={15} /> CREATOR MARKETPLACE</span>
        <h1>Find the people behind the edge.</h1>
        <p>Discover trusted sports creators, compare memberships, preview their work, and unlock content, research, alerts, and private communities in one place.</p>
        <div className={styles.actions}><a href="#marketplace">Explore creators <ArrowRight size={16} /></a><Link href="/creators/apply">Build your membership</Link></div>
      </div>
    </section>

    <section className={styles.trustRow}>
      <span><BadgeCheck size={17} /> Reviewed creators</span>
      <span><LockKeyhole size={17} /> Secure member access</span>
      <span><Users size={17} /> Private communities</span>
      <span><Sparkles size={17} /> SlipSurge tools included by tier</span>
    </section>

    <CreatorDirectory creators={creators} />
  </main>
}
