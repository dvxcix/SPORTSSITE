import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, LockKeyhole, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RestoreCreatorAccess } from '@/components/creator/RestoreCreatorAccess'
import { CheckoutButton } from './CheckoutButton'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import styles from './CreatorOffer.module.css'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { CreatorFunnelSignal } from '@/components/creator/CreatorFunnelSignal'
import { publishedPaidCommunities } from '@/lib/creatorCommunityDirectory'

export const dynamic = 'force-dynamic'

export default async function CreatorOfferPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const supabase = await createClient()
  const [{ data: product }, { data: { user } }] = await Promise.all([
    supabase.from('creator_products').select('id,creator_id,title,description,price,product_type,billing_period_days,status,creator:users!creator_products_creator_id_fkey(username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified)').eq('id', productId).eq('status', 'active').single(),
    supabase.auth.getUser(),
  ])
  if (!product && user) {
    const {data:paused}=await createAdminClient().from('creator_products').select('id').eq('id',productId).eq('status','paused').maybeSingle()
    if(paused)return <div className={styles.page}><Link className={styles.back} href="/settings/membership"><ArrowLeft size={14}/>Your memberships</Link><section className={styles.card}><div className={styles.summary}><h1>Existing membership access</h1><p>New purchases are paused. Current members can still verify and open their community.</p><RestoreCreatorAccess productId={productId} signedIn/><Link className={styles.memberAccess} href={'/creators/access/complete?product='+productId}>Open member access <ArrowRight size={15}/></Link></div></section></div>
  }
  if (!product) notFound()
  const creator = Array.isArray(product.creator) ? product.creator[0] : product.creator
  const [{ data: entitlement }, published] = await Promise.all([
    user ? supabase.from('creator_entitlements').select('id,status,current_period_end').eq('user_id', user.id).eq('product_id', product.id).in('status', ['active', 'trialing']).maybeSingle() : Promise.resolve({ data: null }),
    publishedPaidCommunities({creatorId:product.creator_id}),
  ])
  const includedGroup=published.find(group=>group.creator_product_id===product.id)
  const isOwner=user?.id===product.creator_id
  const hasAccess = Boolean(entitlement && hasCurrentCreatorAccess(entitlement))
  return <div className={styles.page}>
    <CreatorFunnelSignal creatorId={product.creator_id} productId={product.id} eventType="offer_view" />
    <Link className={styles.back} href={`/creators/${creator?.username}`}><ArrowLeft size={14} /> Back to storefront</Link>
    <section className={styles.card}>
      <div className={styles.summary}>
        <span className={styles.eyebrow}><LockKeyhole size={14} /> Creator access</span>
        <div className={styles.creator}><MemberAvatar src={creator?.avatar_url} ringStyle={creator?.avatar_ring_style} ringColor={creator?.avatar_ring_color} name={creator?.display_name || creator?.username || 'SlipSurge creator'} size={38} /><span><strong>{creator?.display_name || creator?.username}</strong><small>{creator?.is_verified&&<BadgeCheck size={12} />} SlipSurge creator</small></span></div>
        <h1>{product.title}</h1><p>{product.description || 'Premium creator content, research, and member community access.'}</p>
        <ul><li><Check size={15} /> Access linked to your SlipSurge account</li><li><Check size={15} /> Private content and communities unlock automatically</li><li><Check size={15} /> Whop-secured checkout and membership management</li></ul>
      </div>
      <aside><span>{hasAccess ? 'Access active' : product.product_type === 'membership' ? 'Recurring membership' : 'One-time access'}</span><div className={styles.price}><strong>{hasAccess ? 'Active' : `$${Number(product.price).toFixed(2)}`}</strong><small>{hasAccess ? 'Connected to your account' : product.product_type === 'membership' ? `every ${product.billing_period_days||30} days` : `${product.billing_period_days||30} days · one payment`}</small></div>{hasAccess || isOwner ? <Link className={styles.memberAccess} href={includedGroup ? `/groups/${includedGroup.slug}` : `/creators/${creator?.username}`}>{includedGroup ? `Open ${includedGroup.name}` : 'Open creator access'} <ArrowRight size={15}/></Link> : <CheckoutButton productId={product.id} creatorId={product.creator_id} />}{!hasAccess&&!isOwner&&<RestoreCreatorAccess productId={product.id} signedIn={!!user}/>}<div className={styles.secure}><ShieldCheck size={15} /><span><b>{hasAccess ? 'Membership verified' : 'Secure checkout'}</b><small>{hasAccess ? 'Your access is ready' : 'Payments and access powered by Whop'}</small></span></div><p>Creator content is informational and does not guarantee outcomes.</p></aside>
    </section>
  </div>
}
