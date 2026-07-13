'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/lib/notify'
import { UserPlus, UserCheck } from 'lucide-react'

interface FollowButtonProps {
  currentUserId: string
  targetUserId: string
  initialFollowing: boolean
}

export function FollowButton({ currentUserId, targetUserId, initialFollowing }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function toggle() {
    setLoading(true)
    if (following) {
      const { error } = await supabase.from('follows').delete()
        .match({ follower_id: currentUserId, following_id: targetUserId })
      // Only reflect success in the UI if the write actually succeeded —
      // this previously flipped state unconditionally, so a failed
      // delete/insert (RLS, network blip, etc.) would show the wrong
      // state until the next full page load silently "fixed" it.
      if (!error) setFollowing(false)
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId })
      // A duplicate-key error (23505) just means the follow row already
      // existed — e.g. the button's initialFollowing prop was stale —
      // not a real failure, so still show "Following" rather than an error.
      if (!error || error.code === '23505') {
        setFollowing(true)
        if (!error) {
          const { data: me } = await supabase.from('users').select('username').eq('id', currentUserId).single()
          await notify(supabase, {
            userId: targetUserId,
            actorId: currentUserId,
            type: 'follow',
            message: 'started following you',
            link: me?.username ? `/profile/${me.username}` : null,
          })
        }
      }
    }
    setLoading(false)
  }

  return (
    <button onClick={toggle} disabled={loading}
      className={`flex items-center gap-1.5 h-9 px-4 text-sm rounded-xl font-black transition-all disabled:opacity-60 ${
        following
          ? 'border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400'
          : 'bg-green-500 hover:bg-green-400 text-black'
      }`}>
      {following ? <><UserCheck size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}
    </button>
  )
}
