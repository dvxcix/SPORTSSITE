'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
      await supabase.from('follows').delete()
        .match({ follower_id: currentUserId, following_id: targetUserId })
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId })
    }
    setFollowing(v => !v)
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
