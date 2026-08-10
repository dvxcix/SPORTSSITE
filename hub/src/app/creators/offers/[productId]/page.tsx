import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BadgeCheck, Check, LockKeyhole, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CheckoutButton } from './CheckoutButton'
import styles from './CreatorOffer.module.css'

export const dynamic = 'force-dynamic'

export default async function CreatorOfferPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const supabase = await createClient()
  const { data: product } = await supabase.from('creator_products').select('id,title,description,price,product_type,status,creator:users!creator_products_creator_id_fkey(username,display_name,avatar_url)').eq('id', productId).eq('status', 'active').single()
  if (!product) notFound()
  const creator = Array.isArray(product.creator) ? product.creator[0] : product.creator
  return <main className={styles.page}>
    <Link className={styles.back} href={`/creators/${creator?.username}`}><ArrowLeft size={14} /> Back to storefront</Link>
    <section className={styles.card}>
      <div className={styles.summary}>
        <span className={styles.eyebrow}><LockKeyhole size={14} /> SECURE CREATOR ACCESS</span>
        <div className={styles.creator}><div>{creator?.avatar_url ? <img src={creator.avatar_url} alt="" /> : (creator?.display_name || creator?.username || 'S')[0]}</div><span><strong>{creator?.display_name || creator?.username}</strong><small><BadgeCheck size={12} /> SlipSurge creator</small></span></div>
        <h1>{product.title}</h1><p>{product.description || 'Premium creator content, research, and member community access.'}</p>
        <ul><li><Check size={15} /> Access linked to your SlipSurge account</li><li><Check size={15} /> Private content and communities unlock automatically</li><li><Check size={15} /> Whop-secured checkout and membership management</li></ul>
      </div>
      <aside><span>{product.product_type === 'membership' ? 'MONTHLY MEMBERSHIP' : 'ONE-TIME ACCESS'}</span><div className={styles.price}><strong>${Number(product.price).toFixed(2)}</strong><small>{product.product_type === 'membership' ? 'per month' : 'one payment'}</small></div><CheckoutButton productId={product.id} /><div className={styles.secure}><ShieldCheck size={15} /><span><b>Secure checkout</b><small>Payments and access powered by Whop</small></span></div><p>Creator content is informational and does not guarantee outcomes.</p></aside>
    </section>
  </main>
}
