import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, LockKeyhole, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CheckoutButton } from './CheckoutButton'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import styles from './CreatorOffer.module.css'
import { CreatorFunnelSignal } from '@/components/creator/CreatorFunnelSignal'

export const dynamic = 'force-dynamic'

export default async function CreatorOfferPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const supabase = await createClient()
  const [{ data: product }, { data: { user } }] = await Promise.all([
    supabase.from('creator_products').select('id,creator_id,title,description,price,product_type,status,creator:users!creator_products_creator_id_fkey(username,display_name,avatar_url)').eq('id', productId).eq('status', 'active').single(),
    supabase.auth.getUser(),
  ])
  if (!product) notFound()
  const creator = Array.isArray(product.creator) ? product.creator[0] : product.creator
  const [{ data: entitlement }, { data: includedGroup }] = await Promise.all([
    user ? supabase.from('creator_entitlements').select('id,status').eq('user_id', user.id).eq('product_id', product.id).in('status', ['active', 'trialing']).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('groups').select('slug,name').eq('creator_product_id', product.id).limit(1).maybeSingle(),
  ])
  return <div className={styles.page}>
    <CreatorFunnelSignal creatorId={product.creator_id} productId={product.id} eventType="offer_view" />
    <Link className={styles.back} href={`/creators/${creator?.username}`}><ArrowLeft size={14} /> Back to storefront</Link>
    <section className={styles.card}>
      <div className={styles.summary}>
        <span className={styles.eyebrow}><LockKeyhole size={14} /> SECURE CREATOR ACCESS</span>
        <div className={styles.creator}><MemberAvatar src={creator?.avatar_url} name={creator?.display_name || creator?.username || 'SlipSurge creator'} size={38} /><span><strong>{creator?.display_name || creator?.username}</strong><small><BadgeCheck size={12} /> SlipSurge creator</small></span></div>
        <h1>{product.title}</h1><p>{product.description || 'Premium creator content, research, and member community access.'}</p>
        <ul><li><Check size={15} /> Access linked to your SlipSurge account</li><li><Check size={15} /> Private content and communities unlock automatically</li><li><Check size={15} /> Whop-secured checkout and membership management</li></ul>
      </div>
      <aside><span>{entitlement ? 'ACCESS ACTIVE' : product.product_type === 'membership' ? 'MONTHLY MEMBERSHIP' : 'ONE-TIME ACCESS'}</span><div className={styles.price}><strong>{entitlement ? 'Unlocked' : `$${Number(product.price).toFixed(2)}`}</strong><small>{entitlement ? 'Connected to your account' : product.product_type === 'membership' ? 'per month' : 'one payment'}</small></div>{entitlement ? <Link className={styles.memberAccess} href={includedGroup ? `/groups/${includedGroup.slug}` : `/creators/${creator?.username}`}>{includedGroup ? `Open ${includedGroup.name}` : 'Open creator access'} <ArrowRight size={15}/></Link> : <CheckoutButton productId={product.id} creatorId={product.creator_id} />}<div className={styles.secure}><ShieldCheck size={15} /><span><b>{entitlement ? 'Membership verified' : 'Secure checkout'}</b><small>{entitlement ? 'Your access is ready' : 'Payments and access powered by Whop'}</small></span></div><p>Creator content is informational and does not guarantee outcomes.</p></aside>
    </section>
  </div>
}
