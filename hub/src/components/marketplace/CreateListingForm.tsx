'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const CATS = ['Memorabilia', 'Tickets', 'Picks Package', 'Coaching', 'Apparel', 'Cards', 'Other']
const CONDS = ['New', 'Like New', 'Good', 'Fair', 'Digital']

export function CreateListingForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ title: '', description: '', price: '', category: '', condition: 'New', sport: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!form.title.trim() || !form.price) { setError('Title and price are required'); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price <= 0) { setError('Enter a valid price'); return }
    setSubmitting(true)
    const { data, error: err } = await supabase.from('marketplace_listings').insert({
      seller_id: userId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      price,
      category: form.category || null,
      condition: form.condition,
      sport: form.sport || null,
      images: [],
      is_sold: false,
    }).select('id').single()
    if (err) { setError(err.message); setSubmitting(false); return }
    router.push(`/marketplace/${data?.id}`)
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50"

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Title *</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What are you selling?" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} placeholder="Details about your listing…" className={inputClass + ' resize-none'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Price (USD) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
            <input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00"
              className={inputClass + ' pl-8'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputClass}>
              <option value="">Select…</option>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Condition</label>
            <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} className={inputClass}>
              {CONDS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>
      <button onClick={create} disabled={submitting || !form.title.trim() || !form.price}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {submitting ? 'Listing…' : 'Post Listing'}
      </button>
    </div>
  )
}
