'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminPostActions({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function deletePost() {
    if (!confirm('Delete this post?')) return
    setLoading(true)
    await supabase.from('posts').delete().eq('id', postId)
    router.refresh()
    setLoading(false)
  }

  return (
    <button onClick={deletePost} disabled={loading}
      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
      Delete
    </button>
  )
}
