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
    const { error } = following
      ? await supabase.from('page_follows').delete().match({ user_id: userId, page_id: pageId })
      : await supabase.from('page_follows').insert({ user_id: userId, page_id: pageId })
    // Only flip state if the write actually succeeded — previously flipped
    // unconditionally, so a failed follow/unfollow left the button showing
    // a status that didn't match the database.
    if (!error || error.code === '23505') setFollowing(v => !v)
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
