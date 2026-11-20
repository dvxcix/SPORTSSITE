'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pin, Lock, Trash2 } from 'lucide-react'
import { useFeedback } from '@/components/ui/FeedbackProvider'

export function AdminForumActions({ threadId, isPinned, isLocked }: {
  threadId: string; isPinned: boolean; isLocked: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { confirm, notify } = useFeedback()

  async function act(update: Record<string, boolean>) {
    setLoading(true)
    const { error } = await supabase.from('forum_threads').update(update).eq('id', threadId)
    setLoading(false)
    if (error) { notify({ title: 'Update failed', message: error.message, tone: 'error' }); return }
    router.refresh()
  }

  async function del() {
    if (!await confirm({ title: 'Delete thread?', message: 'This thread and its replies will be permanently removed.', confirmLabel: 'Delete thread', tone: 'error' })) return
    setLoading(true)
    const { error } = await supabase.from('forum_threads').delete().eq('id', threadId)
    setLoading(false)
    if (error) { notify({ title: 'Delete failed', message: error.message, tone: 'error' }); return }
    router.refresh()
  }

  return (
    <div className="flex gap-1 shrink-0">
      <button type="button" onClick={() => act({ is_pinned: !isPinned })} disabled={loading} aria-label={isPinned ? 'Unpin thread' : 'Pin thread'} aria-pressed={isPinned}
        className={`p-1.5 rounded-lg transition-colors ${isPinned ? 'text-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)]' : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]'}`}>
        <Pin size={13} />
      </button>
      <button type="button" onClick={() => act({ is_locked: !isLocked })} disabled={loading} aria-label={isLocked ? 'Unlock thread' : 'Lock thread'} aria-pressed={isLocked}
        className={`p-1.5 rounded-lg transition-colors ${isLocked ? 'text-yellow-400 bg-yellow-400/10' : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]'}`}>
        <Lock size={13} />
      </button>
      <button type="button" onClick={del} disabled={loading} aria-label="Delete thread"
        className="p-1.5 text-[var(--text-3)] hover:text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)] rounded-lg transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
