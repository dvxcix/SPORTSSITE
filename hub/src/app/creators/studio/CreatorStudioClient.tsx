'use client'
import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, BadgeDollarSign, Copy, ExternalLink, Loader2, MessageSquareText, Pause, Play, Plus, Users } from 'lucide-react'
import { CreatorPlatformPanel } from './CreatorPlatformPanel'
import { CreatorLaunchPanel } from './CreatorLaunchPanel'
import type { ScheduledPost } from './ScheduledPostPlanner'
import type { CreatorAnalytics } from './CreatorAnalyticsDashboard'
import type { CreatorPaymentState } from '@/lib/creatorCommerce'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './CreatorStudio.module.css'

const ScheduledPostPlanner = dynamic(() => import('./ScheduledPostPlanner').then(module => module.ScheduledPostPlanner))
const CreatorAnalyticsDashboard = dynamic(() => import('./CreatorAnalyticsDashboard').then(module => module.CreatorAnalyticsDashboard))
const CreatorMembers = dynamic(() => import('@/components/creator/CreatorMembers').then(module => module.CreatorMembers))
const GroupSettingsForm = dynamic(() => import('@/components/groups/GroupSettingsForm').then(module => module.GroupSettingsForm))
const CreatorDiscordSetup = dynamic(() => import('@/components/creator/CreatorDiscordSetup').then(module => module.CreatorDiscordSetup))

type Product = { id: string; title: string; description?: string | null; price: number; product_type: string; status: string; whop_plan_id?: string | null; platform_fee_amount?: number | null; billing_period_days?: number | null }
type CreatorGroup = { id: string; slug: string; emoji: string | null; name: string; access_type: string; creator_product_id?: string | null; description?: string | null; avatar_url?: string | null; banner_url?: string | null; sport?: string | null; is_public?: boolean; rules?: string | null }
type CommerceEvent = { id: string; event_type: string; amount: number | null; currency: string | null; status: string | null; created_at: string }
export function CreatorStudioClient({ profile, products, groups, stats, analytics, events, scheduledPosts, mlbAccess, isTestAccount = false }: {
  profile: { username: string; account_type?: string }; products: Product[]; groups: CreatorGroup[]; stats: { activeMembers: number; revenue: number; offers: number; communities: number };
  analytics: CreatorAnalytics; events: CommerceEvent[]; scheduledPosts: ScheduledPost[]; mlbAccess: boolean; isTestAccount?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const section = ['overview','products','communities','members','content','settings'].includes(params.get('section') || '') ? params.get('section')! : 'overview'
  const [offerStep,setOfferStep] = useState(0)
  const [selectedGroup,setSelectedGroup] = useState(groups[0]?.id || '')
  const selected = groups.find(group=>group.id===selectedGroup) || groups[0]
  const [readiness, setReadiness] = useState<CreatorPaymentState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', description: '', price: '', productType: 'membership', billingDays: 30 })
  async function saveOffer(event: React.FormEvent) {
    event.preventDefault()
    if (busy || isTestAccount || !readiness?.canCharge) return
    const price = Number(form.price)
    if (!Number.isFinite(price) || price < 1 || price > 10_000) { setError('Enter a price from $1 to $10,000.'); return }
    const id = requestId || crypto.randomUUID()
    setRequestId(id); setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/creator/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, requestId: id, price }), signal: AbortSignal.timeout(55_000) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Offer could not be saved.')
      setNotice('Product saved as a draft. Connect its member community, then publish.')
      setForm({ title: '', description: '', price: '', productType: 'membership', billingDays: 30 }); setRequestId(null); setOfferStep(0); router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Retry to resume your draft.') }
    finally { setBusy(false) }
  }
  async function resumeOffer(product: Product) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/creator/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: product.id, title: product.title, description: product.description, price: Number(product.price), productType: product.product_type, billingDays: product.billing_period_days ?? 30 }), signal: AbortSignal.timeout(55_000) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Offer setup could not be resumed.')
      setNotice('Offer saved. Create its member community, then publish.'); router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Try again.') }
    finally { setBusy(false) }
  }
  async function setStatus(productId: string, status: 'active' | 'paused') {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/creator/products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, status }), signal: AbortSignal.timeout(35_000) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Offer could not be updated.')
      setNotice(status === 'active' ? 'Offer published to your storefront.' : 'New purchases paused. Existing members keep their access.')
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Try again.') }
    finally { setBusy(false) }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/creators/${profile.username}`); setNotice('Storefront link copied.') }
    catch { setError('The link could not be copied. Open your storefront and copy its address.') }
  }
  const sections=[['overview','Overview'],['products','Products'],['communities','Communities'],['members','Members'],['content','Content'],['settings','Payments & settings']]
  const productCards=<div className={styles.productList}>{products.length ? products.map(product=>{
    const linked=groups.find(group=>group.creator_product_id===product.id)
    return <article key={product.id}><div><span className={styles.status} data-status={product.status}>{product.status==='active'?'Published':product.status==='draft'?'Draft':product.status==='archived'?'Archived':'Paused'}</span><h3>{product.title}</h3><p>{product.description}</p><strong className={styles.productPrice}>$ {Number(product.price).toFixed(2)} <small>{product.product_type==='membership'?'every '+(product.billing_period_days||30)+' days':(product.billing_period_days||30)+' days · one payment'}</small></strong><p>{linked?linked.name:'Connect a community before publishing'}</p></div><div className={styles.productActions}>{!product.whop_plan_id&&<button disabled={busy||!readiness?.canCharge} onClick={()=>void resumeOffer(product)}>Resume setup</button>}{!linked&&product.whop_plan_id&&<Link href={'/groups/create?offer='+product.id}>Connect community</Link>}{linked&&<Link href={'/groups/'+linked.slug}>Open community</Link>}{product.status==='active'&&<Link href={'/creators/offers/'+product.id}>View product</Link>}<button disabled={busy||product.status==='archived'||!product.whop_plan_id||(product.status!=='active'&&(!linked||!readiness?.canCharge))} onClick={()=>void setStatus(product.id,product.status==='active'?'paused':'active')}>{product.status==='active'?<><Pause size={14}/>Pause sales</>:<><Play size={14}/>Publish</>}</button>{product.status==='paused'&&product.whop_plan_id&&<button disabled={busy} onClick={()=>void setStatus(product.id,'paused')}>Verify closed links</button>}</div></article>
  }):<div className={styles.empty}><BadgeDollarSign size={24}/><h3>Your first product starts here</h3><p>Set a price, connect a community, and publish it to your storefront.</p></div>}</div>
  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>Creator Studio</h1><p>Manage your storefront and community.</p></div><div className={styles.heroActions}><Link href={'/creators/'+profile.username}>View storefront <ArrowRight size={15}/></Link><button onClick={copyLink}><Copy size={15}/>Copy link</button></div></header>
    <nav className={styles.studioNav} aria-label="Creator workspace">{sections.map(([key,label])=><Link key={key} scroll={false} href={'/creators/studio?section='+key} aria-current={section===key?'page':undefined}>{label}</Link>)}</nav>
    <div aria-live="polite">{notice&&<p className={styles.setupNote}>{notice}</p>}{error&&<p role="alert" className={styles.setupError}>{error}</p>}</div>
    <div hidden={section!=='overview'&&section!=='settings'||section==='overview'&&stats.offers>0}><CreatorLaunchPanel compact={section==='settings'} groupCount={groups.length} liveOffers={stats.offers} testAccount={isTestAccount} onReadiness={setReadiness}/></div>
    {section==='overview'&&<>
      <section className={styles.stats} aria-label="Creator overview"><article><Users size={18}/><span><small>Paid members</small><strong>{stats.activeMembers}</strong></span></article><article><BadgeDollarSign size={18}/><span><small>Recent USD receipts</small><strong>$ {stats.revenue.toFixed(2)}</strong></span></article><article><ExternalLink size={18}/><span><small>Published products</small><strong>{stats.offers}</strong></span></article><article><MessageSquareText size={18}/><span><small>Communities</small><strong>{stats.communities}</strong></span></article></section>
      <section className={styles.quickActions}><Link href="/creators/studio?section=products"><BadgeDollarSign size={19}/><span><strong>Products & memberships</strong><small>Pricing, access and publication</small></span><ArrowRight size={16}/></Link><Link href="/creators/studio?section=communities"><Users size={19}/><span><strong>Make your space yours</strong><small>Banner, avatar, channels and Discord</small></span><ArrowRight size={16}/></Link><Link href="/creators/studio?section=content"><MessageSquareText size={19}/><span><strong>Plan your next post</strong><small>Picks, research and member updates</small></span><ArrowRight size={16}/></Link></section>
      <CreatorAnalyticsDashboard analytics={analytics} />
    </>}
    {section==='products'&&<section className={styles.workspace} data-empty-products={products.length===0||undefined}><article className={styles.panel}><header><div><h2>Products</h2><p>Publish when the product and its member community are ready.</p></div></header>{productCards}</article><aside><article className={styles.panel}><header><div><h2>New product</h2><p>{['Tell members what they receive.','Choose a price and access period.','Review before saving your draft.'][offerStep]}</p></div></header><ol className={styles.wizardSteps} aria-label="Product setup steps">{['Details','Pricing','Review'].map((label,index)=><li key={label} aria-current={index===offerStep?'step':undefined}><span>{index+1}</span>{label}</li>)}</ol>
      <form className={styles.builder} onSubmit={event=>{if(offerStep<2){event.preventDefault();setOfferStep(offerStep+1)}else void saveOffer(event)}}>
      {!readiness?.canCharge&&<p className={styles.setupNote}><Link href="/creators/studio?section=settings">Complete payment setup</Link> before saving a paid product. Free communities are available now.</p>}
      <fieldset disabled={busy||!!requestId} className={styles.offerFields}>
       {offerStep===0&&<><label><span>Product name</span><input required minLength={2} maxLength={80} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Weekend research club"/></label><label><span>What members receive</span><textarea required minLength={10} maxLength={1000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Your content, posting schedule and included community."/></label></>}
       {offerStep===1&&<><label><span>Price (USD)</span><input required type="number" min="1" max="10000" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0.00" inputMode="decimal"/></label><label><span>Payment type</span><select aria-label="Payment type" value={form.productType} onChange={e=>setForm({...form,productType:e.target.value})}><option value="membership">Recurring membership</option><option value="one_time">One payment</option></select></label><label><span>{form.productType==='membership'?'Renews every':'Access duration'}</span><select aria-label={form.productType==='membership'?'Renews every':'Access duration'} value={form.billingDays} onChange={e=>setForm({...form,billingDays:Number(e.target.value)})}>{[7,30,90,365].map(days=><option key={days} value={days}>{days} days</option>)}</select></label><p className={styles.setupNote}>Fees follow your existing Whop account configuration. SlipSurge adds no separate application fee.</p></>}
       {offerStep===2&&<div className={styles.productPreview}><span>Draft preview</span><h3>{form.title}</h3><p>{form.description}</p><strong>$ {Number(form.price).toFixed(2)}<small>{form.productType==='membership'?'every '+form.billingDays+' days':form.billingDays+' days · one payment'}</small></strong><p>Next: connect its community, add your branding, then publish.</p></div>}
      </fieldset><div className={styles.formActions}>{offerStep>0&&!requestId&&<button type="button" disabled={busy} className={styles.secondaryButton} onClick={()=>setOfferStep(offerStep-1)}>Back</button>}<button className={styles.primaryButton} disabled={busy||offerStep===2&&(!readiness?.canCharge||isTestAccount)}>{busy?<Loader2 size={16} className="animate-spin"/>:offerStep===2?<Plus size={16}/>:<ArrowRight size={16}/>} {offerStep<2?'Continue':requestId?'Retry saved draft':'Save draft'}</button></div>{requestId&&!busy&&<button type="button" className={styles.secondaryButton} onClick={()=>{setRequestId(null);setOfferStep(0);setForm({title:'',description:'',price:'',productType:'membership',billingDays:30})}}>Start a different product</button>}</form></article></aside></section>}
    {section==='communities'&&<section><header className={styles.sectionHeading}><div><h2>Your communities</h2><p>Brand your space, organize channels, and connect Discord.</p></div><Link className={styles.secondaryButton} href="/groups/create"><Plus size={15}/>New community</Link></header><div className={styles.communityCards}>{groups.map(group=><button key={group.id} className={styles.communityCard} aria-pressed={selected?.id===group.id} onClick={()=>setSelectedGroup(group.id)}><div className={styles.communityCover}>{group.banner_url&&<SafeImage src={group.banner_url} alt=""/>}</div><div className={styles.communityIdentity}><span><SafeImage src={group.avatar_url} alt="" fallback={group.emoji||'⚡'}/></span><div><strong>{group.name}</strong><small>{group.access_type==='paid'?'Paid membership':'Free community'}</small></div></div></button>)}</div>{selected?<div className={styles.communityEditor}><div className={styles.sectionHeading}><h3>{selected.name}</h3><div className={styles.heroActions}><Link href={'/groups/'+selected.slug}>Open community <ArrowRight size={14}/></Link><Link href={'/groups/'+selected.slug+'/settings'}>Channels, roles & members</Link></div></div><GroupSettingsForm key={selected.id} group={selected} showDangerZone={false}/><CreatorDiscordSetup key={'discord-'+selected.id} groupId={selected.id}/></div>:<div className={styles.empty}><Users size={25}/><h3>A home for your members</h3><p>Start free, then add paid products whenever you are ready.</p><Link className={styles.primaryButton} href="/groups/create">Create community</Link></div>}</section>}
    {section==='members'&&<section className={styles.panel}><header><div><h2>Members</h2><p>Manage members, invitations, roles and access for each community.</p></div></header><CreatorMembers/><div className={styles.groupList}>{groups.map(group=><Link key={group.id} href={'/groups/'+group.slug+'/settings#members'}><i>{group.emoji||'◆'}</i><span><b>{group.name}</b><small>{group.access_type==='paid'?'Paid members & community roles':'Free members & invitations'}</small></span><ArrowRight size={15}/></Link>)}{!groups.length&&<p className={styles.empty}>Create a community to manage its members here.</p>}</div></section>}
    {section==='content'&&<section><header className={styles.sectionHeading}><div><h2>Content</h2><p>Write picks, posts and research for the right audience.</p></div></header>{(groups.length>0||['creator','admin'].includes(profile.account_type||''))?<ScheduledPostPlanner posts={scheduledPosts} mlbAccess={mlbAccess} groups={groups}/>:<div className={styles.empty}><p>Create a community to start publishing.</p><Link href="/groups/create">Create community →</Link></div>}</section>}
    {section==='settings'&&<><div className={styles.workspace}><article className={styles.panel}><header><h2>Storefront identity</h2></header><p className={styles.setupNote}>Your public profile supplies your storefront name, photo, cover and bio. Each community has its own branding.</p><Link className={styles.textLink} href="/settings/profile">Edit storefront profile <ArrowRight size={15}/></Link><Link className={styles.textLink} href="/settings/connections">Connected Whop & Discord accounts <ArrowRight size={15}/></Link></article><article className={styles.panel}><header><h2>Balance & payouts</h2></header><p className={styles.setupNote}>Whop manages account verification, balances, payment fees and withdrawals. No additional SlipSurge application fee is added.</p><Link className={styles.textLink} href="/creators/payouts">Open payouts <ArrowRight size={15}/></Link></article></div><article className={styles.panel}><header><div><h2>Recent commerce</h2><p>Latest 1,000 events. Receipts are before fees and refunds.</p></div></header><div className={styles.events}>{events.length?events.slice(0,10).map(event=><div key={event.id}><span><b>{event.event_type.replaceAll('.',' ').replaceAll('_',' ')}</b><small>{new Date(event.created_at).toLocaleDateString('en-US',{timeZone:'UTC'})}</small></span><strong>{event.amount!=null?Number(event.amount).toFixed(2)+' '+(event.currency||'usd').toUpperCase():event.status||'Recorded'}</strong></div>):<p>No purchases yet.</p>}</div></article>{profile.account_type==='admin'&&<CreatorPlatformPanel/>}</>}
  </div>
}
