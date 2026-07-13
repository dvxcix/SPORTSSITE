'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pin, Lock, Trash2 } from 'lucide-react'

export function AdminForumActions({ threadId, isPinned, isLocked }: {
  threadId: string; isPinned: boolean; isLocked: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function act(update: Record<string, boolean>) {
    setLoading(true)
    const { error } = await supabase.from('forum_threads').update(update).eq('id', threadId)
    setLoading(false)
    if (error) { alert(`Could not update: ${error.message}`); return }
    router.refresh()
  }

  async function del() {
    if (!confirm('Delete this thread?')) return
    setLoading(true)
    const { error } = await supabase.from('forum_threads').delete().eq('id', threadId)
    setLoading(false)
    if (error) { alert(`Could not delete: ${error.message}`); return }
    router.refresh()
  }

  return (
    <div className="flex gap-1 shrink-0">
      <button onClick={() => act({ is_pinned: !isPinned })} disabled={loading}
        className={`p-1.5 rounded-lg transition-colors ${isPinned ? 'text-green-400 bg-green-400/10' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}>
        <Pin size={13} />
      </button>
      <button onClick={() => act({ is_locked: !isLocked })} disabled={loading}
        className={`p-1.5 rounded-lg transition-colors ${isLocked ? 'text-yellow-400 bg-yellow-400/10' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}>
        <Lock size={13} />
      </button>
      <button onClick={del} disabled={loading}
        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
