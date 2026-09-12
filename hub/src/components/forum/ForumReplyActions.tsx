'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Reply, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThreadReplyForm } from './ThreadReplyForm'

export function ForumReplyActions({ replyId, authorId, currentUserId, threadId, threadAuthorId, content }: {
  replyId: string
  authorId: string
  currentUserId?: string
  threadId: string
  threadAuthorId: string
  content: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'reply' | 'edit'>('idle')
  const [draft, setDraft] = useState(content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ownsReply = currentUserId === authorId

  async function saveEdit() {
    const next = draft.trim()
    if (!next || busy) return
    setBusy(true); setError('')
    const { error: updateError } = await supabase.from('forum_replies').update({ content: next, edited_at: new Date().toISOString() }).eq('id', replyId).eq('author_id', currentUserId!)
    setBusy(false)
    if (updateError) { setError('Reply not updated. Try again.'); return }
    setMode('idle'); router.refresh()
  }

  async function removeReply() {
    if (!ownsReply || busy) return
    setBusy(true); setError('')
    const { error: deleteError } = await supabase.from('forum_replies').update({ content: '', is_deleted: true, edited_at: new Date().toISOString() }).eq('id', replyId).eq('author_id', currentUserId!)
    setBusy(false)
    if (deleteError) { setError('Reply not deleted. Try again.'); return }
    router.refresh()
  }

  return <div className="ss-forum-reply-actions">
    {currentUserId && mode === 'idle' ? <div className="ss-forum-reply-action-row">
      <button type="button" onClick={() => setMode('reply')}><Reply size={12}/> Reply</button>
      {ownsReply ? <><button type="button" onClick={() => setMode('edit')}><Pencil size={12}/> Edit</button><button type="button" className="is-danger" onClick={() => void removeReply()}><Trash2 size={12}/> Delete</button></> : null}
    </div> : null}
    {mode === 'reply' && currentUserId ? <ThreadReplyForm userId={currentUserId} threadId={threadId} threadAuthorId={threadAuthorId} parentReplyId={replyId} parentAuthorId={authorId} compact onCancel={() => setMode('idle')} /> : null}
    {mode === 'edit' ? <div className="ss-forum-inline-editor"><textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={5000}/><div><button type="button" onClick={() => setMode('idle')}><X size={12}/> Cancel</button><button type="button" disabled={busy || !draft.trim()} onClick={() => void saveEdit()}>{busy ? 'Saving…' : 'Save'}</button></div></div> : null}
    {error ? <p role="alert" className="ss-forum-action-error">{error}</p> : null}
  </div>
}
