import Link from 'next/link'
import { ArrowRight, BadgeCheck, Compass, LockKeyhole, Search, Sparkles, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import styles from './CreatorsMarketplace.module.css'
import { pageMetadata } from '@/lib/siteMetadata'
import { SafeImage } from '@/components/ui/SafeImage'

export const metadata = pageMetadata({ title: 'Sports Creators and Communities | SlipSurge', description: 'Discover sports creators, premium memberships, private groups, and member channels powered by Whop.', path: '/creators' })

export const dynamic = 'force-dynamic'

type Creator = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  follower_count: number | null
  creator_products: Array<{ id: string; title: string; description: string | null; price: number; product_type: string }>
}

export default async function CreatorsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id,username,display_name,avatar_url,bio,follower_count,creator_products!creator_products_creator_id_fkey(id,title,description,price,product_type)')
    .eq('account_type', 'creator')
    .eq('creator_products.status', 'active')
    .order('follower_count', { ascending: false })
    .limit(48)
  const creators = (data ?? []) as unknown as Creator[]
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

    <section id="marketplace" className={styles.marketplace}>
      <header><div><span>EXPLORE</span><h2>Creator memberships</h2><p>Every active creator offer, ready to compare.</p></div><label><Search size={16} /><input type="search" placeholder="Search creators and specialties" aria-label="Search creators" /></label></header>
      {creators.length ? <div className={styles.grid}>{creators.map(creator => {
        const offer = creator.creator_products?.[0]
        return <Link className={styles.card} href={`/creators/${creator.username}`} key={creator.id}>
          <div className={styles.cardTop}><div className={styles.avatar}><SafeImage src={creator.avatar_url} alt="" fallback={(creator.display_name || creator.username)[0].toUpperCase()} /></div><div><h3>{creator.display_name || creator.username}<BadgeCheck size={15} /></h3><span>@{creator.username}</span></div></div>
          <p>{creator.bio || offer?.description || 'Sports analysis, member content, and community access on SlipSurge.'}</p>
          <div className={styles.offer}><span>{offer?.title || 'Creator membership'}</span><strong>{offer ? `$${Number(offer.price).toFixed(2)}` : 'View offers'}<small>{offer?.product_type === 'membership' ? '/mo' : ''}</small></strong></div>
          <footer><span>{creator.follower_count ?? 0} followers</span><b>View storefront <ArrowRight size={14} /></b></footer>
        </Link>
      })}</div> : <div className={styles.empty}><div><Sparkles size={28} /></div><h3>The first storefronts are being prepared.</h3><p>Approved creators will appear here as soon as they publish their memberships.</p><Link href="/creators/apply">Be among the first creators <ArrowRight size={15} /></Link></div>}
    </section>
  </main>
}
