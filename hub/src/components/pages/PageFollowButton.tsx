'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PageFollowButton({ userId, pageId, initialFollowing }: {
  userId: string; pageId: string; initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function toggle() {
    setLoading(true)
    if (following) {
      await supabase.from('page_follows').delete().match({ user_id: userId, page_id: pageId })
    } else {
      await supabase.from('page_follows').insert({ user_id: userId, page_id: pageId })
    }
    setFollowing(v => !v)
    setLoading(false)
  }

  return (
    <button onClick={toggle} disabled={loading}
      className={`h-9 px-4 text-sm rounded-xl font-black transition-all disabled:opacity-60 ${
        following ? 'border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400' : 'bg-green-500 hover:bg-green-400 text-black'
      }`}>
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
