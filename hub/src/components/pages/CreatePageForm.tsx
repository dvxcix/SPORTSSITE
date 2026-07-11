'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['Team', 'Athlete', 'Media', 'Brand', 'Community', 'Podcast', 'Other']

export function CreatePageForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ name: '', description: '', category: '', emoji: '⭐', sport: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function slug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function create() {
    if (!form.name.trim()) { setError('Page name is required'); return }
    setSubmitting(true)
    const { data, error: err } = await supabase.from('pages').insert({
      owner_id: userId,
      name: form.name.trim(),
      slug: slug(form.name.trim()),
      description: form.description.trim() || null,
      category: form.category || null,
      emoji: form.emoji,
      sport: form.sport || null,
      is_published: true,
      follower_count: 0,
    }).select('slug').single()
    if (err) { setError(err.message); setSubmitting(false); return }
    router.push(`/pages/${data?.slug}`)
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Page Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Yankees Daily, MLB Picks Central…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
            placeholder="What is this page about?"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, category: c }))}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${form.category === c ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Emoji Icon</label>
          <div className="flex gap-2">
            {['⭐', '🏈', '⚾', '🏀', '🏒', '⚽', '🎯', '🔥', '💰', '📊'].map(e => (
              <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: e }))}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${form.emoji === e ? 'bg-zinc-700 ring-2 ring-green-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={create} disabled={submitting || !form.name.trim()}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {submitting ? 'Creating…' : 'Create Page'}
      </button>
    </div>
  )
}
