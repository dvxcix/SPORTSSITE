'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const CATS = ['Memorabilia', 'Tickets', 'Picks Package', 'Coaching', 'Apparel', 'Cards', 'Other']
const CONDS = ['New', 'Like New', 'Good', 'Fair', 'Digital']

export function CreateListingForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({ title: '', description: '', price: '', category: '', condition: 'New', sport: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!form.title.trim() || !form.price) { setError('Title and price are required'); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price <= 0) { setError('Enter a valid price'); return }
    setSubmitting(true); setError('')
    try {
      const { data, error: err } = await supabase.from('marketplace_listings').insert({
        seller_id: userId, title: form.title.trim(), description: form.description.trim() || null,
        price, category: form.category || null, condition: form.condition,
        sport: form.sport || null, images: [], is_sold: false,
      }).select('id').single()
      if (err || !data?.id) { setError('The listing could not be posted. Try again.'); return }
      router.push(`/marketplace/${data.id}`)
    } catch {
      setError('The listing could not be posted. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)]"

  return (
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void create() }}>
      {error && <div role="alert" className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{error}</div>}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Title *</label>
          <input aria-label="Listing title" value={form.title} maxLength={120} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What are you selling?" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Description</label>
          <textarea aria-label="Listing description" value={form.description} maxLength={2000} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} placeholder="Details about your listing…" className={inputClass + ' resize-none'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Price (USD) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-2)] font-bold">$</span>
            <input type="number" aria-label="Listing price in US dollars" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00"
              className={inputClass + ' pl-8'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Category</label>
            <select aria-label="Listing category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputClass}>
              <option value="">Select…</option>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Condition</label>
            <select aria-label="Listing condition" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} className={inputClass}>
              {CONDS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>
      <button type="submit" disabled={submitting || !form.title.trim() || !form.price}
        className="w-full bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold py-3 rounded-xl transition-colors">
        {submitting ? 'Listing…' : 'Post Listing'}
      </button>
    </form>
  )
}
