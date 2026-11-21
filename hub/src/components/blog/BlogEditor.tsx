'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, Eye, FileText, ImageIcon, Save, Send } from 'lucide-react'
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
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [lastAction, setLastAction] = useState<'draft' | 'published' | null>(null)

  const words = useMemo(() => form.content.trim() ? form.content.trim().split(/\s+/).length : 0, [form.content])
  const readMinutes = Math.max(1, Math.ceil(words / 220))

  function slug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now()
  }

  async function save(s: 'draft' | 'published') {
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!isSafeImageUrl(form.cover_image)) { setError('Cover image links must begin with https://'); return }
    setSubmitting(true)
    setError('')
    setLastAction(null)
    try {
      if (blogId) {
        const { error: err } = await supabase.from('blogs').update({
          title: form.title.trim(), excerpt: form.excerpt.trim() || form.content.slice(0, 200) || null,
          content: form.content.trim(), category: form.category || null,
          cover_image: form.cover_image.trim() || null, sport: form.sport || null, status: s,
        }).eq('id', blogId)
        if (err) { setError('The article could not be saved. Try again.'); return }
        setLastAction(s)
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
      setLastAction(s)
      router.push(s === 'published' ? `/blog/${data.slug}` : '/blog/my')
    } catch {
      setError('The article could not be saved. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ss-article-editor overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[rgba(var(--line-rgb),0.07)] px-4 py-3 sm:px-5">
        <div className="flex rounded-xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)] p-1" role="tablist" aria-label="Article editor view">
          <button type="button" role="tab" aria-selected={mode === 'write'} onClick={() => setMode('write')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === 'write' ? 'bg-[rgba(var(--contrast-rgb),0.1)] text-[var(--text-1)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}><FileText size={13}/>Write</button>
          <button type="button" role="tab" aria-selected={mode === 'preview'} onClick={() => setMode('preview')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === 'preview' ? 'bg-[rgba(var(--contrast-rgb),0.1)] text-[var(--text-1)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}><Eye size={13}/>Preview</button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[12px] font-bold tabular-nums text-[var(--text-3)]"><span>{words.toLocaleString()} words</span><span>{readMinutes} min read</span>{lastAction && <span className="flex items-center gap-1 text-[var(--accent)]"><Check size={11}/>{lastAction === 'draft' ? 'Draft saved' : 'Published'}</span>}</div>
      </div>

      {error && <div role="alert" className="mx-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--red)_20%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3 text-sm text-[var(--red)] sm:mx-5">{error}</div>}

      {mode === 'write' ? <div className="space-y-4 p-4 sm:p-5">
        <label className="block"><span className="sr-only">Article title</span><input value={form.title} maxLength={140} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Article title…" className="w-full border-0 border-b border-[rgba(var(--line-rgb),0.08)] bg-transparent pb-4 text-xl font-semibold tracking-[-.02em] text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)] focus:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] sm:text-3xl" /></label>

        <div className="grid grid-cols-2 gap-3">
          <label className="ss-flow-field"><span>Category</span><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="ss-flow-input"><option value="">Choose category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="ss-flow-field"><span>Sport</span><select value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))} className="ss-flow-input"><option value="">All sports</option>{['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA'].map(s => <option key={s} value={s}>{s}</option>)}</select></label>
        </div>

        <label className="ss-flow-field"><span>Subtitle</span><input value={form.excerpt} maxLength={280} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="A short summary that appears in feeds" className="ss-flow-input" /><small>{form.excerpt.length}/280</small></label>

        <label className="ss-flow-field"><span className="flex items-center gap-1.5"><ImageIcon size={13}/>Cover image</span><input type="url" value={form.cover_image} maxLength={500} onChange={e => setForm(f => ({ ...f, cover_image: e.target.value }))} placeholder="https://…" className="ss-flow-input" /></label>
        {form.cover_image && <div className="h-48 overflow-hidden rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)]"><SafeImage src={form.cover_image} alt="Cover preview" className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center text-xs text-[var(--text-3)]">Image unavailable</div>} /></div>}

        <label className="ss-flow-field"><span>Article</span><textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Write your analysis… Markdown headings are supported." rows={20} maxLength={50000} className="ss-flow-input min-h-[420px] resize-y font-mono leading-7" /><small>{form.content.length.toLocaleString()}/50,000</small></label>
      </div> : <ArticlePreview form={form} readMinutes={readMinutes} />}

      <div className="flex flex-col gap-3 border-t border-[rgba(var(--line-rgb),0.07)] bg-[var(--surface)] p-4 sm:flex-row sm:p-5">
        <button type="button" onClick={() => save('draft')} disabled={submitting}
          className="ss-settings-secondary !min-h-11 flex-1 justify-center disabled:opacity-40">
          <Save size={14} /> Save draft
        </button>
        <button type="button" onClick={() => save('published')} disabled={submitting}
          className="ss-settings-primary !min-h-11 flex-1 justify-center disabled:opacity-40">
          <Send size={14} /> {submitting ? 'Saving…' : blogId ? 'Save & publish' : 'Publish'}
        </button>
      </div>
    </div>
  )
}

function ArticlePreview({ form, readMinutes }: { form: { title: string; excerpt: string; content: string; cover_image: string; category: string; sport: string }; readMinutes: number }) {
  return <article className="min-h-[620px] p-4 sm:p-7">
    {form.cover_image && <SafeImage src={form.cover_image} alt="" className="mb-6 h-56 w-full rounded-2xl object-cover" />}
    <div className="flex flex-wrap gap-2">{[form.category, form.sport].filter(Boolean).map(value => <span key={value} className="rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold tracking-normal text-[var(--accent)]">{value}</span>)}</div>
    <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-.045em] text-[var(--text-1)] sm:text-4xl">{form.title || 'Untitled article'}</h2>
    {form.excerpt && <p className="mt-4 text-base leading-7 text-[var(--text-2)]">{form.excerpt}</p>}
    <p className="mt-4 text-[12px] font-bold tracking-normal text-[var(--text-3)]">{readMinutes} min read</p>
    <div className="mt-7 space-y-4 text-sm leading-7 text-[var(--text-2)]">{form.content ? form.content.split('\n').map((paragraph, index) => paragraph.startsWith('### ') ? <h4 key={index} className="pt-2 text-lg font-semibold text-[var(--text-1)]">{paragraph.slice(4)}</h4> : paragraph.startsWith('## ') ? <h3 key={index} className="pt-3 text-2xl font-semibold text-[var(--text-1)]">{paragraph.slice(3)}</h3> : paragraph.startsWith('# ') ? <h2 key={index} className="pt-4 text-3xl font-semibold text-[var(--text-1)]">{paragraph.slice(2)}</h2> : paragraph.trim() ? <p key={index} className="whitespace-pre-wrap">{paragraph}</p> : <div key={index} className="h-1" />) : <p className="text-[var(--text-3)]">Your article preview will appear here.</p>}</div>
  </article>
}
