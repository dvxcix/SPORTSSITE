'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeDollarSign, BarChart3, BellRing, Building2, Check, Copy, ExternalLink, Eye, Layers3, Loader2, LockKeyhole, MessageSquareText, Pause, Play, Plus, Radio, Rocket, ShieldCheck, Users } from 'lucide-react'
import styles from './CreatorStudio.module.css'

type Product = { id: string; title: string; description: string | null; price: number; product_type: string; status: string; purchase_url: string | null; created_at: string }
type CreatorProfile = { username: string; whop_connected_company_id: string | null }
type CreatorGroup = { id: string; slug: string; emoji: string | null; name: string; access_type: string }
type Event = { id: string; event_type: string; amount: number | null; currency: string | null; status: string | null; created_at: string }

const BENEFITS = [
  ['premiumContent', LockKeyhole, 'Premium picks and posts'],
  ['research', BarChart3, 'Eligible research tools'],
  ['alerts', BellRing, 'Real-time member alerts'],
  ['community', MessageSquareText, 'Private groups and channels'],
] as const

export function CreatorStudioClient({ profile, products, groups, stats, events }: { profile: CreatorProfile; products: Product[]; groups: CreatorGroup[]; stats: { activeMembers: number; revenue: number; offers: number; communities: number }; events: Event[] }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', price: '19.99', productType: 'membership' })
  const [benefits, setBenefits] = useState<Record<string, boolean>>({ premiumContent: true, research: true, alerts: true, community: true })

  async function onboard() {
    setBusy(true); setError('')
    const res = await fetch('/api/creator/whop-onboard', { method: 'POST' }); const data = await res.json()
    setBusy(false); if (!res.ok) return setError(data.error || 'Could not start onboarding'); window.location.href = data.url
  }

  async function createProduct() {
    setBusy(true); setError('')
    const included = BENEFITS.filter(([key]) => benefits[key]).map(([, , label]) => label)
    const description = [form.description.trim(), included.length ? `Includes: ${included.join(', ')}.` : ''].filter(Boolean).join(' ')
    const res = await fetch('/api/creator/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, description, price: Number(form.price) }) }); const data = await res.json()
    setBusy(false); if (!res.ok) return setError(data.error || 'Could not create membership'); window.location.reload()
  }

  async function setProductStatus(productId: string, status: 'active' | 'paused') {
    setBusy(true); setError('')
    const res = await fetch('/api/creator/products', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, status }) })
    const data = await res.json(); setBusy(false)
    if (!res.ok) return setError(data.error || 'Could not update membership'); window.location.reload()
  }

  async function copyStorefront() {
    await navigator.clipboard.writeText(`${window.location.origin}/creators/${profile.username}`)
  }

  const setupCount = [true, !!profile.whop_connected_company_id, products.length > 0, groups.length > 0].filter(Boolean).length

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div><span className={styles.kicker}><Radio size={13} /> CREATOR OPERATING CENTER</span><h1>Creator Studio</h1><p>Run memberships, member access, communities, and commerce from one workspace.</p></div>
      <div className={styles.heroActions}><Link href={`/creators/${profile.username}`}><Eye size={15} /> View storefront</Link><button onClick={copyStorefront}><Copy size={15} /> Copy link</button></div>
    </section>

    {error && <div className={styles.alert}>{error}</div>}
    <section className={styles.stats}>
      <article><Users size={18} /><span><small>ACTIVE MEMBERS</small><strong>{stats.activeMembers}</strong></span></article>
      <article><BadgeDollarSign size={18} /><span><small>RECORDED REVENUE</small><strong>${stats.revenue.toFixed(2)}</strong></span></article>
      <article><Layers3 size={18} /><span><small>LIVE OFFERS</small><strong>{stats.offers}</strong></span></article>
      <article><MessageSquareText size={18} /><span><small>COMMUNITIES</small><strong>{stats.communities}</strong></span></article>
    </section>

    <section className={styles.workspace}>
      <div className={styles.primaryColumn}>
        <article className={styles.panel}>
          <header><div><span>MEMBERSHIP BUILDER</span><h2>Package your member experience</h2><p>Create recurring access or a one-time drop. Select what members receive, then publish through Whop.</p></div><Layers3 size={21} /></header>
          <div className={styles.builder}>
            <label><span>Offer name</span><input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Example: All-Access MLB" /></label>
            <div className={styles.split}><label><span>Price</span><div className={styles.money}><i>$</i><input value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} inputMode="decimal" /></div></label><label><span>Billing</span><select value={form.productType} onChange={event => setForm({ ...form, productType: event.target.value })}><option value="membership">Monthly membership</option><option value="one_time">One-time access</option></select></label></div>
            <label><span>Member promise</span><textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Explain what you cover, how often you publish, and what members can expect." /></label>
            <fieldset><legend>Included with this tier</legend><div className={styles.benefits}>{BENEFITS.map(([key, Icon, label]) => <button aria-pressed={benefits[key]} className={benefits[key] ? styles.selected : ''} onClick={() => setBenefits(current => ({ ...current, [key]: !current[key] }))} type="button" key={key}><Icon size={17} /><span>{label}</span><i>{benefits[key] && <Check size={13} />}</i></button>)}</div></fieldset>
            <button className={styles.primaryButton} onClick={createProduct} disabled={busy || !profile.whop_connected_company_id || !form.title.trim()}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Rocket size={16} />} Create and publish membership</button>
          </div>
        </article>

        <article className={styles.panel}>
          <header><div><span>YOUR OFFERS</span><h2>Membership catalog</h2><p>Manage availability and open the customer checkout experience.</p></div><LockKeyhole size={21} /></header>
          <div className={styles.productList}>{products.length ? products.map(product => <div key={product.id}><div><span className={`${styles.status} ${styles[product.status]}`}>{product.status}</span><h3>{product.title}</h3><p>{product.product_type === 'membership' ? 'Monthly' : 'One time'} · ${Number(product.price).toFixed(2)}</p></div><div className={styles.productActions}>{product.purchase_url && <a href={product.purchase_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Checkout</a>}<button disabled={busy} onClick={() => setProductStatus(product.id, product.status === 'active' ? 'paused' : 'active')}>{product.status === 'active' ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Publish</>}</button></div></div>) : <div className={styles.empty}>Create your first membership above. It will appear on your public storefront immediately after publishing.</div>}</div>
        </article>
      </div>

      <aside>
        <article className={styles.panel}>
          <header><div><span>LAUNCH READINESS</span><h2>{setupCount}/4 complete</h2></div><ShieldCheck size={21} /></header>
          <div className={styles.progress}><i style={{ width: `${setupCount * 25}%` }} /></div>
          <div className={styles.checklist}><span className={styles.done}><Check size={13} /><b>Creator approved</b></span><span className={profile.whop_connected_company_id ? styles.done : ''}>{profile.whop_connected_company_id ? <Check size={13} /> : '2'}<b>Connect payments</b></span><span className={products.length ? styles.done : ''}>{products.length ? <Check size={13} /> : '3'}<b>Publish membership</b></span><span className={groups.length ? styles.done : ''}>{groups.length ? <Check size={13} /> : '4'}<b>Create community</b></span></div>
          <button className={styles.whopButton} onClick={onboard} disabled={busy}><Building2 size={15} /> {profile.whop_connected_company_id ? 'Continue Whop setup' : 'Connect with Whop'}</button>
          {profile.whop_connected_company_id && <Link className={styles.textLink} href="/creators/payouts">Open payouts <ArrowRight size={14} /></Link>}
        </article>

        <article className={`${styles.panel} ${styles.migration}`}><Rocket size={22} /><span>BRING YOUR AUDIENCE</span><h2>Move without losing momentum.</h2><p>Recreate your current tiers, publish a storefront, invite existing members, and launch private channels before announcing the move.</p><ol><li>Match your current pricing</li><li>Build the member destination</li><li>Share your storefront link</li><li>Welcome and retain members</li></ol></article>

        <article className={styles.panel}><header><div><span>COMMUNITY</span><h2>Groups and channels</h2></div><MessageSquareText size={21} /></header><div className={styles.quickActions}><Link href="/groups/create"><Plus size={15} /> New group</Link><Link href="/channels"><MessageSquareText size={15} /> Channels</Link></div><div className={styles.groupList}>{groups.length ? groups.map(group => <Link href={`/groups/${group.slug}`} key={group.id}><i>{group.emoji || '◆'}</i><span><b>{group.name}</b><small>{group.access_type === 'paid' ? 'Paid access' : 'Free access'}</small></span></Link>) : <p>No community created yet.</p>}</div></article>

        <article className={styles.panel}><header><div><span>RECENT ACTIVITY</span><h2>Commerce events</h2></div><BadgeDollarSign size={21} /></header><div className={styles.events}>{events.length ? events.slice(0,5).map(event => <div key={event.id}><span><b>{event.event_type.replaceAll('_', ' ')}</b><small>{new Date(event.created_at).toLocaleDateString()}</small></span><strong>{event.amount ? `$${Number(event.amount).toFixed(2)}` : event.status || 'Recorded'}</strong></div>) : <p>No commerce activity yet.</p>}</div></article>
      </aside>
    </section>
  </main>
}
