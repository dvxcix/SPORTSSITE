'use client'
import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, BadgeDollarSign, Copy, ExternalLink, Loader2, MessageSquareText, Pause, Play, Plus, Users, Search, Package, Store, Check, Settings2 } from 'lucide-react'
import { CreatorPlatformPanel } from './CreatorPlatformPanel'
import { CreatorLaunchPanel } from './CreatorLaunchPanel'
import type { ScheduledPost } from './ScheduledPostPlanner'
import type { CreatorAnalytics } from './CreatorAnalyticsDashboard'
import type { CreatorPaymentState } from '@/lib/creatorCommerce'
import { CreatorStoreSetup } from '@/components/creator/CreatorStoreSetup'
import { CreatorPublishing } from '@/components/creator/CreatorPublishing'
import { CreatorPromotion } from '@/components/creator/CreatorPromotion'
import type { CreatorStore } from '@/lib/creatorStorefront'
import { CreatorDialog } from '@/components/creator/CreatorDialog'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './CreatorStudio.module.css'

const ScheduledPostPlanner = dynamic(() => import('./ScheduledPostPlanner').then(module => module.ScheduledPostPlanner), { loading: () => <p role="status" className={styles.setupNote}>Loading workspace…</p> })
const CreatorAnalyticsDashboard = dynamic(() => import('./CreatorAnalyticsDashboard').then(module => module.CreatorAnalyticsDashboard), { loading: () => <p role="status" className={styles.setupNote}>Loading workspace…</p> })
const CreatorMembers = dynamic(() => import('@/components/creator/CreatorMembers').then(module => module.CreatorMembers), { loading: () => <p role="status" className={styles.setupNote}>Loading workspace…</p> })
const GroupSettingsForm = dynamic(() => import('@/components/groups/GroupSettingsForm').then(module => module.GroupSettingsForm), { loading: () => <p role="status" className={styles.setupNote}>Loading editor…</p> })
const CreateGroupForm = dynamic(() => import('@/components/groups/CreateGroupForm').then(module => module.CreateGroupForm), { loading: () => <p role="status" className={styles.setupNote}>Loading editor…</p> })
const CreatorDiscordSetup = dynamic(() => import('@/components/creator/CreatorDiscordSetup').then(module => module.CreatorDiscordSetup), { loading: () => <p role="status" className={styles.setupNote}>Loading workspace…</p> })

type Product = { id: string; title: string; description?: string | null; price: number; product_type: string; status: string; whop_plan_id?: string | null; platform_fee_amount?: number | null; billing_period_days?: number | null }
type CreatorGroup = { id: string; slug: string; emoji: string | null; name: string; access_type: string; creator_product_id?: string | null; description?: string | null; avatar_url?: string | null; banner_url?: string | null; sport?: string | null; is_public?: boolean; rules?: string | null }
type CommerceEvent = { id: string; event_type: string; amount: number | null; currency: string | null; status: string | null; created_at: string }
export function CreatorStudioClient({ profile, store: initialStore, products, groups, stats, analytics, events, scheduledPosts, mlbAccess, isTestAccount = false }: {
  profile: { username: string; account_type?: string; display_name?:string|null;bio?:string|null;avatar_url?:string|null;banner_url?:string|null }; store:CreatorStore|null; products: Product[]; groups: CreatorGroup[]; stats: { activeMembers: number; revenue: number; offers: number; communities: number };
  analytics: CreatorAnalytics; events: CommerceEvent[]; scheduledPosts: ScheduledPost[]; mlbAccess: boolean; isTestAccount?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const section = ['overview','products','communities','members','content','promotion','analytics','settings'].includes(params.get('section') || '') ? params.get('section')! : 'overview'
  const [profileOpen, setProfileOpen] = useState(params.get('setup')==='1'||!initialStore&&!groups.length&&!products.length)
  const [store,setStore]=useState(initialStore)
  const [productOpen, setProductOpen] = useState(false)
  const [createCommunity, setCreateCommunity] = useState<string | null>(() => products.some(product=>product.id===params.get('offer')&&product.whop_plan_id)?params.get('offer'):null)
  const [communityOpen, setCommunityOpen] = useState(false)
  const [communityTab, setCommunityTab] = useState('appearance')
  const [communityBusy, setCommunityBusy] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [productStatus, setProductStatus] = useState('all')
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
      setForm({ title: '', description: '', price: '', productType: 'membership', billingDays: 30 }); setRequestId(null); setOfferStep(0); setProductOpen(false); router.refresh()
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

  const visibleProducts = products.filter(product => (productStatus === 'all' || product.status === productStatus) && [product.title,product.description].some(value => value?.toLowerCase().includes(productQuery.trim().toLowerCase())))
  const heading = {overview:'Your business, at a glance',products:'Products',communities:'Communities',members:'Members',content:'Posts & research',promotion:'Grow your community',analytics:'Analytics',settings:'Settings'}[section] || 'Overview'
  const productChoices = products.filter(product => product.whop_plan_id && ['active','draft','paused'].includes(product.status)).map(product => ({id:product.id,title:product.title,price:Number(product.price),currency:'USD'}))
  function openCommunity(group: CreatorGroup) { setSelectedGroup(group.id); setCommunityTab('appearance'); setCommunityOpen(true) }
  return <div className={styles.page}>
    <header className={styles.pageHeading}><div><h1>{heading}</h1><p>{{overview:'Build your community. Share your work. Grow on your terms.',products:'Your memberships and access passes.',communities:'The spaces your members call home.',members:'Memberships, invitations and community access.',content:'Publish picks, media and research to your members.',promotion:'Your storefront, discovery and promotion.',analytics:'See how people discover and join your community.',settings:'Your identity, connections and payments.'}[section]}</p></div><div className={styles.heroActions}>{section==='products'?<button className={styles.primaryButton} onClick={()=>{setError('');setProductOpen(true)}}><Plus size={16}/>New product</button>:section==='communities'?<button className={styles.primaryButton} onClick={()=>setCreateCommunity('')}><Plus size={16}/>New community</button>:section==='overview'?<button onClick={copyLink}><Copy size={15}/>Copy storefront link</button>:null}</div></header>
    <div aria-live="polite">{notice&&<p className={styles.successNote}><Check size={16}/>{notice}</p>}{error&&!productOpen&&<p role="alert" className={styles.setupError}>{error}</p>}</div>
    <div hidden={section!=='settings'}><CreatorLaunchPanel compact groupCount={groups.length} liveOffers={stats.offers} testAccount={isTestAccount} onReadiness={setReadiness}/></div>
    {section==='overview'&&<>
      <section className={styles.stats} aria-label="Creator overview">{[[Users,'Paid members',stats.activeMembers],[BadgeDollarSign,'Recent USD receipts','$'+stats.revenue.toFixed(2)],[Package,'Published products',stats.offers],[MessageSquareText,'Communities',stats.communities]].map(([Icon,label,value])=>{const MetricIcon=Icon as typeof Users;return <article key={String(label)}><MetricIcon size={18}/><small>{String(label)}</small><strong>{String(value)}</strong></article>})}</section>
      {(!store||store.status!=='published')&&<section className={styles.getStarted}><div><span className={styles.sectionLabel}>Your store</span><h2>{store?'Pick up where you left off':'Create a store of your own'}</h2><p>Choose your branding, sports and membership. Preview before publishing.</p></div><button className={styles.primaryButton} onClick={()=>setProfileOpen(true)}>{store?'Continue setup':'Create my store'}<ArrowRight size={16}/></button></section>}
      <div className={styles.overviewGrid}><section className={styles.panel}><header><h2>Your storefront</h2><Store size={18}/></header><p className={styles.setupNote}>A public home for your memberships and communities.</p><div className={styles.storefrontAddress}>slipsurge.com/creators/{profile.username}</div><div className={styles.heroActions}><Link href={'/creators/'+profile.username}>Preview <ExternalLink size={14}/></Link><button onClick={()=>setProfileOpen(true)}>Edit profile <Settings2 size={14}/></button></div></section><section className={styles.panel}><header><h2>Keep things moving</h2></header><div className={styles.actionList}><Link href="/creators/studio?section=members"><Users size={17}/><span>Manage members</span><ArrowRight size={15}/></Link><Link href="/creators/studio?section=content"><MessageSquareText size={17}/><span>Publish research & picks</span><ArrowRight size={15}/></Link><Link href="/creators/studio?section=analytics"><BadgeDollarSign size={17}/><span>View performance</span><ArrowRight size={15}/></Link></div></section></div>
    </>}
    {section==='products'&&<section className={styles.catalogue} aria-label="Your products"><div className={styles.catalogueToolbar}><label className={styles.search}><Search size={17}/><input type="search" placeholder="Search products" aria-label="Search products" value={productQuery} onChange={event=>setProductQuery(event.target.value)}/></label><select aria-label="Product status" value={productStatus} onChange={event=>setProductStatus(event.target.value)}><option value="all">All products</option><option value="active">Published</option><option value="draft">Drafts</option><option value="paused">Paused</option><option value="archived">Archived</option></select><span>{visibleProducts.length} {visibleProducts.length===1?'product':'products'}</span></div>
      <div className={styles.catalogueHeader} aria-hidden="true"><span>Product</span><span>Price</span><span>Community</span><span>Actions</span></div>
      {visibleProducts.length?visibleProducts.map(product=>{const linked=groups.find(group=>group.creator_product_id===product.id);return <article className={styles.productRow} key={product.id}><div className={styles.productIdentity}><div className={styles.productIcon}>{linked?.avatar_url?<SafeImage src={linked.avatar_url} alt=""/>:<Package size={21}/>}</div><div><h2>{product.title}</h2><span className={styles.status} data-status={product.status}>{product.status==='active'?'Published':product.status==='draft'?'Draft':product.status==='archived'?'Archived':'Paused'}</span><p>{product.description}</p></div></div><div className={styles.rowPrice}><strong>{'$'}{Number(product.price).toFixed(2)}</strong><small>{product.product_type==='membership'?'Every '+(product.billing_period_days||30)+' days':(product.billing_period_days||30)+' days · one payment'}</small></div><div className={styles.rowCommunity}>{linked?<button onClick={()=>openCommunity(linked)}>{linked.name}<Settings2 size={13}/></button>:product.whop_plan_id?<button onClick={()=>setCreateCommunity(product.id)}>Connect community <Plus size={13}/></button>:<span>Finish payment setup</span>}</div><div className={styles.productActions}>{!product.whop_plan_id&&<button disabled={busy||!readiness?.canCharge} onClick={()=>void resumeOffer(product)}>Resume setup</button>}{product.status==='active'&&<Link aria-label={'View '+product.title} href={'/creators/offers/'+product.id}><ExternalLink size={16}/></Link>}<button disabled={busy||product.status==='archived'||!product.whop_plan_id||(product.status!=='active'&&(!linked||!readiness?.canCharge))} onClick={()=>void setStatus(product.id,product.status==='active'?'paused':'active')}>{product.status==='active'?<><Pause size={14}/>Pause</>:<><Play size={14}/>Publish</>}</button>{product.status==='paused'&&product.whop_plan_id&&<button disabled={busy} onClick={()=>void setStatus(product.id,'paused')}>Verify closed links</button>}</div></article>}):<div className={styles.empty}><Package size={30}/><h2>{products.length?'No matching products':'Create your first product'}</h2><p>{products.length?'Try another name or status.':'Turn your picks, research and community into a membership.'}</p>{products.length?<button className={styles.secondaryButton} onClick={()=>{setProductQuery('');setProductStatus('all')}}>Reset filters</button>:<button className={styles.primaryButton} onClick={()=>setProductOpen(true)}><Plus size={16}/>New product</button>}</div>}
    </section>}
    {section==='communities'&&<section className={styles.communityCards}>{groups.map(group=><article className={styles.communityCard} key={group.id}><div className={styles.communityCover}>{group.banner_url&&<SafeImage src={group.banner_url} alt=""/>}</div><div className={styles.communityBody}><div className={styles.communityIdentity}><span><SafeImage src={group.avatar_url} alt="" fallback={group.emoji||'⚡'}/></span><div><h2>{group.name}</h2><small>{group.access_type==='paid'?'Paid membership':'Free community'}</small></div></div><p>{group.description||'Add an introduction to welcome your members.'}</p><div className={styles.heroActions}><button onClick={()=>openCommunity(group)}><Settings2 size={15}/>Manage</button><Link href={'/groups/'+group.slug}>Open <ArrowRight size={15}/></Link></div></div></article>)}{!groups.length&&<div className={styles.empty}><Users size={30}/><h2>Start with a space of your own</h2><p>Bring your picks, research and conversations together.</p><button className={styles.primaryButton} onClick={()=>setCreateCommunity('')}>Create a free community</button></div>}</section>}
    {section==='members'&&<><section className={styles.panel}><CreatorMembers/></section><section className={styles.panel}><header><h2>Community roles & invitations</h2></header><div className={styles.groupList}>{groups.map(group=><Link key={group.id} href={'/groups/'+group.slug+'/settings#members'}><i>{group.emoji||'◆'}</i><span><b>{group.name}</b><small>{group.access_type==='paid'?'Paid members & community roles':'Free members & invitations'}</small></span><ArrowRight size={15}/></Link>)}{!groups.length&&<p>Create a community to invite members.</p>}</div></section></>}
    {section==='content'&&<CreatorPublishing groups={groups}><ScheduledPostPlanner posts={scheduledPosts} mlbAccess={mlbAccess} groups={groups}/></CreatorPublishing>}{section==='promotion'&&<CreatorPromotion store={store} username={profile.username} onSetup={()=>setProfileOpen(true)}/>}
    {section==='analytics'&&<CreatorAnalyticsDashboard analytics={analytics} />}
    {section==='settings'&&<><div className={styles.overviewGrid}><section className={styles.panel}><header><h2>Storefront profile</h2></header><p className={styles.setupNote}>Your name, photo, cover and bio appear on your public storefront.</p><div className={styles.actionList}><button onClick={()=>setProfileOpen(true)}>Edit public profile<ArrowRight size={15}/></button><Link href="/settings/connections">Whop & Discord connections<ArrowRight size={15}/></Link></div></section><section className={styles.panel}><header><h2>Balance & payouts</h2></header><p className={styles.setupNote}>Your existing Whop fees apply. SlipSurge adds no separate application fee.</p><Link className={styles.secondaryButton} href="/creators/payouts">Manage earnings<ArrowRight size={15}/></Link></section></div><section className={styles.panel}><header><h2>Recent commerce</h2><span className={styles.sectionLabel}>Before fees & refunds</span></header><div className={styles.events}>{events.length?events.slice(0,10).map(event=><div key={event.id}><span><b>{event.event_type.replaceAll('.',' ').replaceAll('_',' ')}</b><small>{new Date(event.created_at).toLocaleDateString('en-US',{timeZone:'UTC'})}</small></span><strong>{event.amount!=null?Number(event.amount).toFixed(2)+' '+(event.currency||'usd').toUpperCase():event.status||'Recorded'}</strong></div>):<p>No purchases yet.</p>}</div></section>{profile.account_type==='admin'&&<CreatorPlatformPanel/>}</>}
    {profileOpen&&<CreatorStoreSetup store={store} profile={profile} products={products} groups={groups} mlbAccess={mlbAccess} testAccount={isTestAccount} onSaved={setStore} onClose={()=>{setProfileOpen(false);router.refresh()}}/>}
    {productOpen&&<CreatorDialog title="New product" description="Create a draft. Nothing appears on your storefront until you publish." busy={busy} onClose={()=>setProductOpen(false)}><div className={styles.productComposer}><div><ol className={styles.wizardSteps} aria-label="Product setup steps">{['Details','Pricing','Review'].map((label,index)=><li key={label} aria-current={index===offerStep?'step':undefined}><span>{index<offerStep?<Check size={13}/>:index+1}</span>{label}</li>)}</ol><form className={styles.builder} onSubmit={event=>{if(offerStep<2){event.preventDefault();setOfferStep(offerStep+1)}else void saveOffer(event)}}><fieldset disabled={busy||!!requestId} className={styles.offerFields}>
      {offerStep===0&&<><label><span>Product name</span><input required minLength={2} maxLength={80} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Weekend research club"/></label><label><span>What members receive</span><textarea required minLength={10} maxLength={1000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Your content, posting schedule and included community."/></label></>}
      {offerStep===1&&<><label><span>Price (USD)</span><input required type="number" min="1" max="10000" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0.00" inputMode="decimal"/></label><label><span>Payment type</span><select value={form.productType} onChange={e=>setForm({...form,productType:e.target.value})}><option value="membership">Recurring membership</option><option value="one_time">One payment</option></select></label><label><span>{form.productType==='membership'?'Renews every':'Access duration'}</span><select value={form.billingDays} onChange={e=>setForm({...form,billingDays:Number(e.target.value)})}>{[7,30,90,365].map(days=><option key={days} value={days}>{days} days</option>)}</select></label><p className={styles.setupNote}>Your existing Whop fees apply. No extra SlipSurge application fee.</p></>}
      {offerStep===2&&<div className={styles.reviewDetails}><h3>Ready to save your draft?</h3><p>Next, connect its member community and add your branding. Publish when everything is ready.</p><dl><div><dt>Payment</dt><dd>{form.productType==='membership'?'Recurring':'One payment'}</dd></div><div><dt>Access period</dt><dd>{form.billingDays} days</dd></div><div><dt>Visibility</dt><dd>Draft · only you</dd></div></dl></div>}
      </fieldset>{!readiness?.canCharge&&<p className={styles.setupNote}><Link href="/creators/studio?section=settings" onClick={()=>setProductOpen(false)}>Complete payment setup</Link> before saving a paid product. You can create a free community now.</p>}{error&&<p role="alert" className={styles.setupError}>{error}</p>}<div className={styles.formActions}>{offerStep>0&&!requestId&&<button type="button" disabled={busy} className={styles.secondaryButton} onClick={()=>setOfferStep(offerStep-1)}>Back</button>}<button className={styles.primaryButton} disabled={busy||offerStep===2&&(!readiness?.canCharge||isTestAccount)}>{busy?<Loader2 size={16} className="animate-spin"/>:offerStep===2?<Plus size={16}/>:null}{offerStep<2?'Continue':requestId?'Retry saved draft':'Save draft'}{offerStep<2&&<ArrowRight size={15}/>}</button></div>{requestId&&!busy&&<button type="button" className={styles.secondaryButton} onClick={()=>{setRequestId(null);setOfferStep(0);setForm({title:'',description:'',price:'',productType:'membership',billingDays:30})}}>Start a different product</button>}</form></div><aside className={styles.productPreview}><span className={styles.sectionLabel}>Member preview</span><div className={styles.previewArt}><Package size={36}/></div><h3>{form.title||'Your membership'}</h3><p>{form.description||'Your picks, research and community. Tell members what makes it yours.'}</p><strong>{'$'}{Number(form.price||0).toFixed(2)}<small>{form.productType==='membership'?'every '+form.billingDays+' days':form.billingDays+' days · one payment'}</small></strong><span className={styles.previewJoin}>Join membership</span><small className={styles.setupNote}>Preview only</small></aside></div></CreatorDialog>}
    {createCommunity!==null&&<CreatorDialog title="New community" description="Give your members a place to connect." busy={communityBusy} onClose={()=>setCreateCommunity(null)}><CreateGroupForm products={productChoices} selectedProductId={createCommunity||undefined} onSubmittingChange={setCommunityBusy} onCreated={created=>{setSelectedGroup(created.id);setCreateCommunity(null);setNotice('Community created. Add channels and invite your members.');router.refresh()}}/></CreatorDialog>}
    {communityOpen&&selected&&<CreatorDialog title={selected.name} onClose={()=>setCommunityOpen(false)}><nav className={styles.dialogTabs} aria-label="Community settings">{[['appearance','Appearance'],['discord','Discord'],['manage','Channels & members']].map(([key,label])=><button key={key} aria-pressed={communityTab===key} onClick={()=>setCommunityTab(key)}>{label}</button>)}</nav>{communityTab==='appearance'?<GroupSettingsForm key={selected.id} group={selected} showDangerZone={false}/>:communityTab==='discord'?<CreatorDiscordSetup key={'discord-'+selected.id} groupId={selected.id}/>:<div className={styles.manageCommunity}><Users size={30}/><h3>Build your member experience</h3><p>Organize channels, manage roles and invitations, or open your group chat.</p><div className={styles.actionList}><Link href={'/groups/'+selected.slug+'/settings#members'}>Members, roles & invitations<ArrowRight size={15}/></Link><Link href={'/groups/'+selected.slug+'/settings'}>Channels & permissions<ArrowRight size={15}/></Link><Link href={'/groups/'+selected.slug}>Open community & chat<ArrowRight size={15}/></Link></div></div>}</CreatorDialog>}
  </div>
}
