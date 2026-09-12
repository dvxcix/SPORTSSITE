'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Save, Send } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'

const CATEGORIES = ['Analysis', 'Picks', 'News', 'Opinion', 'Preview', 'Recap', 'Fantasy', 'Betting Strategy']

function isSafeImageUrl(value: string) {
  if (!value.trim()) return true
  try { return ['http:', 'https:'].includes(new URL(value.trim()).protocol) } catch { return false }
}

export function BlogEditor({ userId, initial, blogId }: { userId: string; initial?: any; blogId?: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    excerpt: initial?.excerpt ?? '',
    content: initial?.content ?? '',
    category: initial?.category ?? '',
    cover_image: initial?.cover_image ?? '',
    sport: initial?.sport ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function slug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now()
  }

  async function save(s: 'draft' | 'published') {
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!isSafeImageUrl(form.cover_image)) { setError('Cover image links must begin with https://'); return }
    setSubmitting(true)
    setError('')
    try {
      if (blogId) {
        const { error: err } = await supabase.from('blogs').update({
          title: form.title.trim(), excerpt: form.excerpt.trim() || form.content.slice(0, 200) || null,
          content: form.content.trim(), category: form.category || null,
          cover_image: form.cover_image.trim() || null, sport: form.sport || null, status: s,
        }).eq('id', blogId)
        if (err) { setError('The article could not be saved. Try again.'); return }
        router.push(s === 'published' ? `/blog/${initial?.slug}` : '/blog/my')
        return
      }
      const { data, error: err } = await supabase.from('blogs').insert({
        author_id: userId, title: form.title.trim(), slug: slug(form.title.trim()),
        excerpt: form.excerpt.trim() || form.content.slice(0, 200) || null,
        content: form.content.trim(), category: form.category || null,
        cover_image: form.cover_image.trim() || null, sport: form.sport || null,
        status: s, view_count: 0,
      }).select('slug').single()
      if (err || !data?.slug) { setError('The article could not be saved. Try again.'); return }
      router.push(s === 'published' ? `/blog/${data.slug}` : '/blog/my')
    } catch {
      setError('The article could not be saved. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <input value={form.title} maxLength={140} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        placeholder="Article title…"
        className="w-full bg-transparent text-2xl font-black text-white placeholder:text-zinc-700 outline-none border-b border-zinc-800 pb-3" />

      <input type="url" value={form.cover_image} maxLength={500} onChange={e => setForm(f => ({ ...f, cover_image: e.target.value }))}
        placeholder="Cover image URL (optional)"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />

      {form.cover_image && (
        <div className="h-40 rounded-xl overflow-hidden">
          <SafeImage src={form.cover_image} alt="" className="w-full h-full object-cover" fallback={<div className="grid h-full place-items-center bg-zinc-900 text-xs text-zinc-500">Image unavailable</div>} />
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-green-500/50">
            <option value="">Category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <select value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-green-500/50">
            <option value="">Sport…</option>
            {['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <input value={form.excerpt} maxLength={280} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
        placeholder="Short excerpt / subtitle (optional)"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />

      <textarea
        value={form.content}
        onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
        placeholder="Write your article here… (Markdown supported)"
        rows={20}
        maxLength={50000}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-green-500/50 resize-y font-mono leading-relaxed"
      />

      <div className="flex gap-3">
        <button type="button" onClick={() => save('draft')} disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-bold py-2.5 rounded-xl transition-colors disabled:opacity-40">
          <Save size={14} /> Save Draft
        </button>
        <button type="button" onClick={() => save('published')} disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-2.5 rounded-xl transition-colors">
          <Send size={14} /> {blogId ? 'Save & Publish' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
