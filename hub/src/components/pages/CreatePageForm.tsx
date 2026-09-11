'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { sportLogoUrl } from '@/lib/sportLogos'
import Image from 'next/image'
import { ArrowRight, Loader2 } from 'lucide-react'

const CATEGORIES = ['Team', 'Athlete', 'Media', 'Brand', 'Community', 'Podcast', 'Other']
const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']

export function CreatePageForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({ name: '', description: '', category: '', emoji: '⭐', sport: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function slug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Page name is required'); return }
    const pageSlug = slug(form.name.trim())
    if (!pageSlug) { setError('Use at least one letter or number in the page name'); return }
    setSubmitting(true)
    setError('')
    const { data, error: err } = await supabase.from('pages').insert({
      owner_id: userId,
      name: form.name.trim(),
      slug: pageSlug,
      description: form.description.trim() || null,
      category: form.category || null,
      emoji: form.emoji,
      sport: form.sport || null,
      is_published: true,
      follower_count: 0,
    }).select('slug').single()
    if (err) {
      setError(err.code === '23505' ? 'That page name is already taken.' : 'The page could not be created. Try again.')
      setSubmitting(false)
      return
    }
    router.push(`/pages/${data?.slug}`)
    router.refresh()
  }

  return (
    <form className="ss-flow-form" onSubmit={create}>
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="ss-flow-card">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Page Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Yankees Daily, MLB Picks Central…"
            maxLength={60}
            className="ss-flow-input" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
            placeholder="What is this page about?"
            maxLength={280}
            className="ss-flow-input resize-none" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => (
              <button key={c} type="button" aria-pressed={form.category === c} onClick={() => setForm(f => ({ ...f, category: c }))}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${form.category === c ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Icon</label>
          <div className="flex flex-wrap gap-2">
            {['⭐', '🏈', '⚾', '🏀', '🏒', '⚽', '🎯', '🔥', '💰', '📊'].map(e => (
              <button key={e} type="button" aria-pressed={form.emoji === e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${form.emoji === e ? 'bg-zinc-700 ring-2 ring-green-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Sport</label>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map(sport => {
              const value = sport === 'General' ? '' : sport
              const active = form.sport === value
              const logo = sportLogoUrl(sport)
              return <button key={sport} type="button" aria-pressed={active} onClick={() => setForm(f => ({ ...f, sport: value }))} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all ${active ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                {logo && <Image src={logo} alt="" width={14} height={14} className="object-contain" />}{sport}
              </button>
            })}
          </div>
        </div>
      </div>
      <button type="submit" disabled={submitting || !form.name.trim()} className="ss-flow-submit">
        {submitting ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <>Create page <ArrowRight size={16} /></>}
      </button>
    </form>
  )
}
