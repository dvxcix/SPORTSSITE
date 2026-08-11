'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useFeedback } from '@/components/ui/FeedbackProvider'

export function AdminPostActions({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const { confirm, notify } = useFeedback()

  async function deletePost() {
    if (!await confirm({ title: 'Delete post?', message: 'This post and its discussion will be permanently removed.', confirmLabel: 'Delete post', tone: 'error' })) return
    setLoading(true)
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    setLoading(false)
    if (error) { notify({ title: 'Delete failed', message: error.message, tone: 'error' }); return }
    router.refresh()
  }

  return (
    <button onClick={deletePost} disabled={loading}
      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
      Delete
    </button>
  )
}
