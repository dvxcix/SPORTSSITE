'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { notify } from '@/lib/notify'
import { notifyMentions } from '@/lib/mentions'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { MentionInput } from '@/components/social/MentionInput'

export function ThreadReplyForm({ userId, threadId, threadAuthorId }: { userId: string; threadId: string; threadAuthorId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [content, setContent] = useState('')
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

  async function reply(event: React.FormEvent) {
    event.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setError('')
    const reply = content.trim()
    const { error: err } = await supabase.from('forum_replies').insert({ thread_id: threadId, author_id: userId, content: reply })
    setSubmitting(false)
    // Previously cleared the textarea and refreshed unconditionally — a
    // failed insert silently ate whatever was typed with no sign anything
    // went wrong.
    if (err) { setError('Could not post reply — please try again.'); return }
    setContent('')
    const link = `/forum/thread/${threadId}`
    await notify(supabase, { userId: threadAuthorId, actorId: userId, type: 'comment', message: 'replied to your discussion', link, targetId: threadId, targetType: 'forum_thread' })
    await notifyMentions(supabase, userId, reply, link, threadId, 'a discussion reply', [threadAuthorId])
    router.refresh()
  }

  return (
    <form className="ss-flow-card mt-4" onSubmit={reply}>
      <p className="mb-2 text-xs font-black uppercase tracking-[.12em] text-zinc-400">Reply</p>
      <MentionInput ref={textareaRef} value={content} onValueChange={setContent} currentUserId={userId} placeholder="Write a reply…" rows={4}
        maxLength={5000} className="ss-flow-input mb-3 w-full resize-none" />
      {error && <p role="alert" className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="flex items-center justify-between">
        <EmojiPicker onSelect={insertAtCursor} />
        <button type="submit" disabled={submitting || !content.trim()}
          className="ss-flow-submit !w-auto !min-h-10 !px-4">
          <Send size={13} /> {submitting ? 'Posting…' : 'Post reply'}
        </button>
      </div>
    </form>
  )
}
