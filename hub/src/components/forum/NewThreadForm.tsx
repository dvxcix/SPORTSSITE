'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { Loader2, Send } from 'lucide-react'

export function NewThreadForm({ userId, categories, defaultCategory }: {
  userId: string; categories: { id: string; name: string; slug: string }[]; defaultCategory?: string
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(defaultCategory ?? categories[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function insertAtCursor(insertion: string) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? content.length
    const end = el?.selectionEnd ?? content.length
    const next = content.slice(0, start) + insertion + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  async function submit() {
    if (!title.trim() || !categoryId) { setError('Title and category are required'); return }
    setSubmitting(true)
    const { data, error: err } = await supabase.from('forum_threads').insert({
      author_id: userId,
      category_id: categoryId,
      title: title.trim(),
      content: content.trim() || null,
      reply_count: 0,
      view_count: 0,
      last_reply_at: new Date().toISOString(),
    }).select('id').single()
    if (err) { setError(err.message); setSubmitting(false); return }
    router.push(`/forum/thread/${data?.id}`)
  }

  return (
    <div className="ss-flow-form">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <section className="ss-flow-card">
        <div><label>Category</label><select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="ss-flow-input">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label>Title <span>*</span></label><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Start with a clear title" className="ss-flow-input" /></div>
        <div><label>Post</label><textarea ref={textareaRef} value={content} maxLength={5000} onChange={e => setContent(e.target.value)} placeholder="Share your take…" rows={9} className="ss-flow-input resize-y" /></div>
        <div className="ss-flow-tools"><EmojiPicker onSelect={insertAtCursor} /><span>{content.length.toLocaleString()} / 5,000</span></div>
      </section>
      <button onClick={submit} disabled={submitting || !title.trim()}
        className="ss-flow-submit">
        {submitting ? <><Loader2 size={16} className="animate-spin" /> Posting…</> : <>Post thread <Send size={16} /></>}
      </button>
    </div>
  )
}
