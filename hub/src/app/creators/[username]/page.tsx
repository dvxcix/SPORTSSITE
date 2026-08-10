import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BadgeCheck, BarChart3, BellRing, Check, LockKeyhole, MessageSquareText, ShieldCheck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import styles from './CreatorStorefront.module.css'

export const dynamic = 'force-dynamic'

export default async function CreatorStorefront({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const supabase = await createClient()
  const { data: creator } = await supabase.from('users').select('id,username,display_name,avatar_url,banner_url,bio,follower_count').eq('username', username).eq('account_type', 'creator').single()
  if (!creator) notFound()
  const [{ data: products }, { data: groups }] = await Promise.all([
    supabase.from('creator_products').select('id,title,description,price,currency,product_type,billing_period_days').eq('creator_id', creator.id).eq('status', 'active').order('price'),
    supabase.from('groups').select('id,name,slug,emoji,description,access_type,creator_product_id').eq('owner_id', creator.id).order('created_at'),
  ])

  return <main className={styles.page}>
    <Link href="/creators" className={styles.back}><ArrowLeft size={15} /> Creator marketplace</Link>
    <section className={styles.hero} style={creator.banner_url ? { backgroundImage: `linear-gradient(90deg,rgba(7,10,8,.96),rgba(7,10,8,.68)),url(${creator.banner_url})` } : undefined}>
      <div className={styles.identity}><div className={styles.avatar}>{creator.avatar_url ? <img src={creator.avatar_url} alt="" /> : (creator.display_name || creator.username)[0].toUpperCase()}</div><div><span className={styles.verified}><BadgeCheck size={15} /> VERIFIED SLIPSURGE CREATOR</span><h1>{creator.display_name || creator.username}</h1><p>@{creator.username} · {creator.follower_count ?? 0} followers</p></div></div>
      <p className={styles.bio}>{creator.bio || 'Premium sports content, research, and member community on SlipSurge.'}</p>
      <div className={styles.heroFeatures}><span><BarChart3 size={15} /> Research</span><span><BellRing size={15} /> Member alerts</span><span><MessageSquareText size={15} /> Private channels</span></div>
    </section>

    <section className={styles.content}>
      <div className={styles.main}>
        <header><span>MEMBERSHIPS</span><h2>Choose your access</h2><p>Checkout is secured by Whop. Access connects automatically to your SlipSurge account.</p></header>
        {products?.length ? <div className={styles.tiers}>{products.map((product, index) => <article className={index === 0 ? styles.featured : ''} key={product.id}>
          {index === 0 && <span className={styles.popular}>CREATOR PICK</span>}
          <div><span>{product.product_type === 'membership' ? 'Recurring membership' : 'One-time access'}</span><h3>{product.title}</h3><p>{product.description || 'Premium creator access and member experiences.'}</p></div>
          <ul><li><Check size={15} /> Premium creator posts and picks</li><li><Check size={15} /> Included member groups and channels</li><li><Check size={15} /> Eligible SlipSurge tools selected by creator</li><li><Check size={15} /> Automatic access after payment</li></ul>
          <div className={styles.price}><strong>${Number(product.price).toFixed(2)}</strong><span>{product.product_type === 'membership' ? 'per month' : 'one time'}</span></div>
          <Link href={`/creators/offers/${product.id}`}>Choose membership</Link>
        </article>)}</div> : <div className={styles.empty}>This creator is preparing their first membership.</div>}
      </div>
      <aside>
        <section className={styles.safety}><ShieldCheck size={20} /><div><h3>Protected access</h3><p>Entitlements are verified after checkout and removed automatically when access ends.</p></div></section>
        <section className={styles.communities}><span>COMMUNITIES</span><h3>Member spaces</h3>{groups?.length ? groups.slice(0,4).map(group => <div key={group.id}><i>{group.emoji || '◆'}</i><span><b>{group.name}</b><small>{group.access_type === 'paid' ? 'Membership required' : 'Open community'}</small></span><LockKeyhole size={14} /></div>) : <p>Member groups will appear here when published.</p>}</section>
        <section className={styles.about}><Users size={19} /><h3>One membership home</h3><p>Content, research, alerts, group access, and creator conversations stay connected to your SlipSurge identity.</p></section>
      </aside>
    </section>
  </main>
}
