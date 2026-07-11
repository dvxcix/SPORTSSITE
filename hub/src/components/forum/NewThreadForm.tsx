'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function NewThreadForm({ userId, categories, defaultCategory }: {
  userId: string; categories: { id: string; name: string; slug: string }[]; defaultCategory?: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(defaultCategory ?? categories[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
    const cat = categories.find(c => c.id === categoryId)
    router.push(`/forum/thread/${data?.id}`)
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-green-500/50">
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Thread title…"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write your post… (optional)" rows={8}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-green-500/50 resize-y" />
      <button onClick={submit} disabled={submitting || !title.trim()}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {submitting ? 'Posting…' : 'Post Thread'}
      </button>
    </div>
  )
}
