'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, BadgeDollarSign, Copy, ExternalLink, Loader2, MessageSquareText, Pause, Play, Plus, Users } from 'lucide-react'
import { CreatorPlatformPanel } from './CreatorPlatformPanel'
import { CreatorLaunchPanel } from './CreatorLaunchPanel'
import { ScheduledPostPlanner, type ScheduledPost } from './ScheduledPostPlanner'
import { CreatorAnalyticsDashboard, type CreatorAnalytics } from './CreatorAnalyticsDashboard'
import type { CreatorPaymentState } from '@/lib/creatorCommerce'
import styles from './CreatorStudio.module.css'

type Product = { id: string; title: string; description?: string | null; price: number; product_type: string; status: string; whop_plan_id?: string | null; platform_fee_amount?: number | null }
type CreatorGroup = { id: string; slug: string; emoji: string | null; name: string; access_type: string; creator_product_id?: string | null }
type CommerceEvent = { id: string; event_type: string; amount: number | null; currency: string | null; status: string | null; created_at: string }
export function CreatorStudioClient({ profile, products, groups, stats, analytics, events, scheduledPosts, mlbAccess, feePercentage, isTestAccount = false }: {
  profile: { username: string; account_type?: string }; products: Product[]; groups: CreatorGroup[]; stats: { activeMembers: number; revenue: number; offers: number; communities: number };
  analytics: CreatorAnalytics; events: CommerceEvent[]; scheduledPosts: ScheduledPost[]; mlbAccess: boolean; feePercentage: number; isTestAccount?: boolean
}) {
  const router = useRouter()
  const [readiness, setReadiness] = useState<CreatorPaymentState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', description: '', price: '', productType: 'membership' })
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
      setNotice('Offer saved. Create its member community, then publish it below.')
      setForm({ title: '', description: '', price: '', productType: 'membership' }); setRequestId(null); router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Retry to resume your draft.') }
    finally { setBusy(false) }
  }
  async function resumeOffer(product: Product) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/creator/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: product.id, title: product.title, description: product.description, price: Number(product.price), productType: product.product_type }), signal: AbortSignal.timeout(55_000) })
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
  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>Creator Studio</h1><p>Your communities, content and memberships.</p></div><div className={styles.heroActions}><Link href={`/creators/${profile.username}`}>View storefront <ArrowRight size={15}/></Link><button onClick={copyLink}><Copy size={15}/> Copy link</button></div></header>
    <CreatorLaunchPanel groupCount={groups.length} liveOffers={stats.offers} testAccount={isTestAccount} onReadiness={setReadiness}/>
    <div aria-live="polite">{notice && <p className={styles.setupNote}>{notice}</p>}{error && <p role="alert" className={styles.setupError}>{error}</p>}</div>
    <section className={styles.stats} aria-label="Creator overview">
      <article><Users size={18}/><span><small>Paid members</small><strong>{stats.activeMembers}</strong></span></article>
      <article><BadgeDollarSign size={18}/><span><small>Recent USD receipts</small><strong>${stats.revenue.toFixed(2)}</strong></span></article>
      <article><ExternalLink size={18}/><span><small>Published offers</small><strong>{stats.offers}</strong></span></article>
      <article><MessageSquareText size={18}/><span><small>Communities</small><strong>{stats.communities}</strong></span></article>
    </section>
    <section className={styles.workspace}>
      <div className={styles.primaryColumn}>
        <article className={styles.panel}><header><h2>Your communities</h2><Link href="/groups/create" className={styles.textLink}><Plus size={15}/> New</Link></header><div className={styles.groupList}>{groups.length ? groups.map(group => <Link href={`/groups/${group.slug}`} key={group.id}><i>{group.emoji || '◆'}</i><span><b>{group.name}</b><small>{group.access_type === 'paid' ? 'Paid community' : 'Free community'}</small></span><ArrowRight size={15}/></Link>) : <div className={styles.empty}>Create a free community above. Add your picks, posts, research and member conversations.</div>}</div></article>
        <article className={styles.panel}><header><div><h2>Your offers</h2><p>Save an offer, create its member community, then publish.</p></div></header><div className={styles.productList}>{products.length ? products.map(product => {
          const linked = groups.some(group => group.creator_product_id === product.id)
          return <div key={product.id}><div><span className={styles.status}>{product.status === 'draft' ? 'Draft' : product.status === 'active' ? 'Published' : product.status === 'archived' ? 'Archived' : 'Paused'}</span><h3>{product.title}</h3><p>${Number(product.price).toFixed(2)} · {product.product_type === 'membership' ? 'every 30 days' : 'one payment'}</p>{product.platform_fee_amount != null && <p>Saved platform fee: ${Number(product.platform_fee_amount).toFixed(2)} per payment</p>}</div><div className={styles.productActions}>{!product.whop_plan_id && <button disabled={busy || !readiness?.canCharge} onClick={() => void resumeOffer(product)}>Resume setup</button>}{!linked && product.whop_plan_id && <Link href={`/groups/create?offer=${product.id}`}>Create member community</Link>}{product.status === 'active' && <Link href={`/creators/offers/${product.id}`}>View offer</Link>}<button disabled={busy || product.status === 'archived' || !product.whop_plan_id || (product.status !== 'active' && (!linked || !readiness?.canCharge))} onClick={() => void setStatus(product.id, product.status === 'active' ? 'paused' : 'active')}>{product.status === 'active' ? <><Pause size={14}/> Pause</> : <><Play size={14}/> Publish</>}</button>{product.status === 'paused' && product.whop_plan_id && <button disabled={busy} onClick={() => void setStatus(product.id, 'paused')}>Verify closed links</button>}</div></div>
        }) : <p className={styles.empty}>Free communities do not need a paid offer.</p>}</div></article>
        {(groups.length > 0 || ['creator', 'admin'].includes(profile.account_type || '')) && <ScheduledPostPlanner posts={scheduledPosts} mlbAccess={mlbAccess} groups={groups}/>}
      </div>
      <aside>
        <article className={styles.panel}><header><div><h2>Create a paid offer</h2><p>Sell your content and community access. SlipSurge research plans are purchased separately.</p></div></header>
          <form className={styles.builder} onSubmit={saveOffer}>
            {!readiness?.canCharge && <p className={styles.setupNote}>Complete Whop setup above to create a paid offer.</p>}
            <fieldset disabled={busy || !!requestId} className={styles.offerFields}><label><span>Offer name</span><input required minLength={2} maxLength={80} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Weekend research club"/></label>
            <div className={styles.split}><label><span>Price (USD)</span><input required type="number" min="1" max="10000" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" inputMode="decimal"/></label><label><span>Billing</span><select value={form.productType} onChange={e => setForm({ ...form, productType: e.target.value })}><option value="membership">Every 30 days</option><option value="one_time">One-time access</option></select></label></div>
            <label><span>What members receive</span><textarea required maxLength={1000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe your content, schedule and community."/></label></fieldset>
            <p className={styles.setupNote}>New offers: {feePercentage}% SlipSurge platform fee per payment. Saved offers keep their fee. Whop processing fees may also apply.</p>
            <button className={styles.primaryButton} disabled={busy || !readiness?.canCharge || isTestAccount}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} {requestId ? 'Retry saved draft' : 'Save offer'}</button>
          {requestId && !busy && <button type="button" className={styles.secondaryButton} onClick={() => { setRequestId(null); setForm({ title: '', description: '', price: '', productType: 'membership' }) }}>Start a different offer</button>}
          </form>
        </article>
        <article className={styles.panel}><header><h2>Balance & payouts</h2></header><p className={styles.setupNote}>Whop manages verification, balances, payout methods and withdrawals.</p><Link className={styles.textLink} href="/creators/payouts">Open payouts <ArrowRight size={14}/></Link></article>
        <article className={styles.panel}><header><div><h2>Recent commerce</h2><p>Latest 1,000 events. Receipts are before fees and refunds.</p></div></header><div className={styles.events}>{events.length ? events.slice(0, 5).map(event => <div key={event.id}><span><b>{event.event_type.replaceAll('.', ' ').replaceAll('_', ' ')}</b><small>{new Date(event.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}</small></span><strong>{event.amount != null ? `${Number(event.amount).toFixed(2)} ${(event.currency || 'usd').toUpperCase()}` : event.status || 'Recorded'}</strong></div>) : <p>No purchases yet.</p>}</div></article>
      </aside>
    </section>
    {profile.account_type === 'admin' && <CreatorPlatformPanel/>}
    <details className={styles.analyticsDisclosure}><summary>Audience & sales analytics</summary><CreatorAnalyticsDashboard analytics={analytics} /></details>
  </div>
}
