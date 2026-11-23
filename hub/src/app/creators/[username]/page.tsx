import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, BadgeCheck, Check, ShieldCheck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import styles from './CreatorStorefront.module.css'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { CreatorFunnelSignal } from '@/components/creator/CreatorFunnelSignal'
import { publishedPaidCommunities } from '@/lib/creatorCommunityDirectory'
import { SafeImage } from '@/components/ui/SafeImage'
import { CommunityDirectory } from '@/components/groups/CommunityDirectory'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { CheckoutButton } from '../offers/[productId]/CheckoutButton'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'

export const dynamic = 'force-dynamic'

export default async function CreatorStorefront({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const supabase = await createClient()
  const { data: creator } = await supabase.from('users').select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,is_verified,account_type').eq('username', username).single()
  if (!creator) notFound()
  const [productResult, groupResult, published, {data:{user}}] = await Promise.all([
    supabase.from('creator_products').select('id,title,description,price,currency,product_type,billing_period_days').eq('creator_id', creator.id).eq('status', 'active').order('price'),
    supabase.from('groups').select('id,name,slug,emoji,description,access_type,creator_product_id,sport,avatar_url,banner_url,member_count,owner_id,is_public').eq('owner_id', creator.id).order('created_at'),
    publishedPaidCommunities({creatorId:creator.id}),
    supabase.auth.getUser(),
  ])
  if(productResult.error||groupResult.error)throw new Error('Creator communities could not be loaded.')
  const products=productResult.data??[]
  const showMlb=await canViewMlb(supabase,user?.id)
  const groups=[...new Map([...(groupResult.data??[]),...published].map(group=>[group.id,group])).values()].filter(group=>showMlb||group.sport?.toUpperCase()!=='MLB')
  if(!['creator','admin'].includes(creator.account_type)&&!products.length&&!groups.length&&user?.id!==creator.id)notFound()

  const {data:joinedGroups}=user?await supabase.from('group_members').select('group_id').eq('user_id',user.id):{data:[]}
  const {data:entitlements}=user?await supabase.from('creator_entitlements').select('product_id,status,current_period_end').eq('user_id',user.id).eq('creator_id',creator.id):{data:[]}
  const activeProducts=new Set((entitlements??[]).filter(hasCurrentCreatorAccess).map(item=>item.product_id))
  const isOwner=user?.id===creator.id
  return <div className={styles.page}>
    <CreatorFunnelSignal creatorId={creator.id} eventType="storefront_view" />
    <Link href="/creators" className={styles.back}><ArrowLeft size={15} /> Creator marketplace</Link>
    <div className={styles.storeCover}>{creator.banner_url&&<SafeImage src={creator.banner_url} alt=""/>}</div>
    <section className={styles.hero}>
      <div className={styles.identity}><MemberAvatar src={creator.avatar_url} name={creator.display_name || creator.username} size={76} tone="creator" ringStyle={creator.avatar_ring_style} ringColor={creator.avatar_ring_color}/><div><span className={styles.verified}>{creator.is_verified&&<BadgeCheck size={15}/>} {creator.is_verified?'Verified creator':'Creator community'}</span><h1>{creator.display_name || creator.username}</h1><p>@{creator.username} · {creator.follower_count ?? 0} followers</p></div></div>
      <p className={styles.bio}>{creator.bio || 'Sports research, picks and conversations.'}</p>{isOwner&&<Link className={styles.ownerEdit} href="/creators/studio?section=settings">Edit storefront <ArrowUpRight size={14}/></Link>}
      <nav className={styles.storeNav} aria-label="Storefront sections"><a href="#memberships">Memberships</a><a href="#communities">Communities · {groups.length}</a><a href="#about">About</a></nav>
    </section>


    <section id="memberships" className={styles.content}>
      <div className={styles.main}>
        <header><h2>Become a member</h2><p>Find the membership that fits you.</p></header>
        {products?.length ? <div className={styles.tiers}>{products.map(product => <article key={product.id}>
          <div><span>{product.product_type === 'membership' ? 'Recurring membership' : 'One-time access'}</span><h3>{product.title}</h3><p>{product.description || 'Premium creator access and member experiences.'}</p></div>
          <ul>{groups.filter(group=>group.creator_product_id===product.id).map(group=><li key={group.id}><Check size={15}/>{group.name}</li>)}</ul>
          <div className={styles.price}><strong>${Number(product.price).toFixed(2)}</strong><span>{product.product_type === 'membership' ? `every ${product.billing_period_days||30} days` : `${product.billing_period_days||30} days · one payment`}</span></div>
          {isOwner||activeProducts.has(product.id)?<Link className={styles.join} href={groups.find(group=>group.creator_product_id===product.id)?'/groups/'+groups.find(group=>group.creator_product_id===product.id)!.slug:'/creators/access/complete?product='+product.id}>Open community <ArrowUpRight size={15}/></Link>:<CheckoutButton productId={product.id} creatorId={creator.id} productTitle={product.title} label={product.product_type==='membership'?'Join membership':'Get access'}/>}<Link className={styles.offerDetails} href={`/creators/offers/${product.id}`}>Membership details</Link>
        </article>)}</div> : <div className={styles.empty}>This creator is preparing their first membership.</div>}
      </div>
      <aside>
        <section className={styles.safety}><ShieldCheck size={20} /><div><h3>Protected access</h3><p>Your membership access stays connected to your SlipSurge account.</p></div></section>
        <section id="about" className={styles.about}><Users size={19}/><h3>About this membership</h3><p>Memberships cover this creator’s content and included community. SlipSurge research plans are sold separately.</p><Link href={'/profile/'+creator.username}>View creator profile →</Link></section>
      </aside>
    </section>
    {!!groups.length&&<section id="communities" className={styles.storeCommunities}><h2>Communities</h2><CommunityDirectory variant="storefront" groups={groups} joinedIds={(joinedGroups??[]).map(row=>row.group_id)} userId={user?.id??null} invitations={[]}/></section>}
  </div>
}
