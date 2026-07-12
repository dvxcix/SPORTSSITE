'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { EmojiPicker } from '@/components/social/EmojiPicker'

export function ThreadReplyForm({ userId, threadId }: { userId: string; threadId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
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

  async function reply() {
    if (!content.trim()) return
    setSubmitting(true)
    await supabase.from('forum_replies').insert({ thread_id: threadId, author_id: userId, content: content.trim() })
    setContent('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs font-bold text-zinc-400 mb-2">Reply</p>
      <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)} placeholder="Write a reply…" rows={4}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none mb-3" />
      <div className="flex items-center justify-between">
        <EmojiPicker onSelect={insertAtCursor} />
        <button onClick={reply} disabled={submitting || !content.trim()}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-lg transition-colors text-sm">
          <Send size={13} /> {submitting ? 'Posting…' : 'Post Reply'}
        </button>
      </div>
    </div>
  )
}
