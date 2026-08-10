'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BadgeDollarSign, Building2, ExternalLink, Loader2, LockKeyhole, MessageSquareText, Plus, ShieldCheck, Users } from 'lucide-react'

type Product = { id: string; title: string; description: string | null; price: number; product_type: string; status: string; purchase_url: string | null }
type CreatorProfile = { whop_connected_company_id: string | null }
type CreatorGroup = { id: string; slug: string; emoji: string | null; name: string; access_type: string }

export function CreatorStudioClient({ profile, products, groups }: { profile: CreatorProfile; products: Product[]; groups: CreatorGroup[] }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', price: '19.99', productType: 'membership' })

  async function onboard() {
    setBusy(true); setError('')
    const res = await fetch('/api/creator/whop-onboard', { method: 'POST' }); const data = await res.json()
    setBusy(false); if (!res.ok) return setError(data.error || 'Could not start onboarding'); window.location.href = data.url
  }

  async function createProduct() {
    setBusy(true); setError('')
    const res = await fetch('/api/creator/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, price: Number(form.price) }) }); const data = await res.json()
    setBusy(false); if (!res.ok) return setError(data.error || 'Could not create access pass'); window.location.reload()
  }

  return (
    <main className="creator-studio-shell">
      <section className="creator-studio-hero">
        <div><span className="creator-kicker">CREATOR COMMERCE</span><h1>Creator Studio</h1><p>Build paid access, member groups, private channels, and payouts from one operating center.</p></div>
        <span className={`creator-status ${profile.whop_connected_company_id ? 'ready' : ''}`}><ShieldCheck size={15} />{profile.whop_connected_company_id ? 'Whop connected' : 'Setup required'}</span>
      </section>

      {error && <div className="creator-alert">{error}</div>}
      <section className="creator-studio-grid">
        <article className="creator-panel creator-onboarding-panel">
          <div className="creator-panel-title"><Building2 size={19} /><div><h2>Connected account</h2><p>Identity, balance, payout methods, and withdrawals are secured by Whop.</p></div></div>
          <div className="creator-checklist">
            <span className={profile.whop_connected_company_id ? 'done' : ''}>1 <b>Creator approved</b></span><span className={profile.whop_connected_company_id ? 'done' : ''}>2 <b>Whop company created</b></span><span>3 <b>Complete verification</b></span><span>4 <b>Publish access</b></span>
          </div>
          <button className="creator-primary" onClick={onboard} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : <ExternalLink size={16} />}{profile.whop_connected_company_id ? 'Continue Whop setup' : 'Start secure setup'}</button>
          {profile.whop_connected_company_id && <Link className="creator-secondary" href="/creators/payouts"><BadgeDollarSign size={16} />Open payouts</Link>}
        </article>

        <article className="creator-panel">
          <div className="creator-panel-title"><LockKeyhole size={19} /><div><h2>Create paid access</h2><p>Sell a recurring membership or one-time drop. SlipSurge’s fee is applied at checkout.</p></div></div>
          <div className="creator-form-grid"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Access pass name" /><input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} inputMode="decimal" placeholder="19.99" /><select value={form.productType} onChange={e => setForm({ ...form, productType: e.target.value })}><option value="membership">Monthly membership</option><option value="one_time">One-time access</option></select><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What members receive" /></div>
          <button className="creator-primary" onClick={createProduct} disabled={busy || !profile.whop_connected_company_id || !form.title}><Plus size={16} />Create access pass</button>
        </article>
      </section>

      <section className="creator-panel creator-resource-panel"><div className="creator-panel-title"><Users size={19} /><div><h2>Groups and channels</h2><p>Create a member home, then attach an access pass to the group and its channels.</p></div></div><div className="creator-resource-actions"><Link href="/groups/create"><Plus size={16} />New group</Link><Link href="/channels"><MessageSquareText size={16} />Manage channels</Link></div><div className="creator-mini-list">{groups.length ? groups.map(group => <Link key={group.id} href={`/groups/${group.slug}`}><span>{group.emoji || '◆'}</span><b>{group.name}</b><small>{group.access_type === 'paid' ? 'Paid members' : 'Free access'}</small></Link>) : <p>No groups yet. Your first group becomes the home for your member community.</p>}</div></section>

      <section className="creator-panel"><div className="creator-panel-title"><BadgeDollarSign size={19} /><div><h2>Access passes</h2><p>Published offers and customer checkout links.</p></div></div><div className="creator-product-list">{products.length ? products.map(product => <div key={product.id}><span><b>{product.title}</b><small>{product.product_type === 'membership' ? 'Monthly' : 'One time'} · ${Number(product.price).toFixed(2)}</small></span><em>{product.status}</em>{product.purchase_url && <a href={product.purchase_url} target="_blank" rel="noreferrer">Checkout <ExternalLink size={13} /></a>}</div>) : <p>No access passes yet.</p>}</div></section>
    </main>
  )
}
