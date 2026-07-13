'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function GroupJoinButton({ userId, groupId, channelId, initialMember }: {
  userId: string; groupId: string; channelId: string | null; initialMember: boolean
}) {
  const [member, setMember] = useState(initialMember)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function toggle() {
    setLoading(true)
    let error
    if (member) {
      ({ error } = await supabase.from('group_members').delete().match({ user_id: userId, group_id: groupId }))
      if (!error && channelId) await supabase.from('channel_members').delete().match({ user_id: userId, channel_id: channelId })
    } else {
      ({ error } = await supabase.from('group_members').insert({ user_id: userId, group_id: groupId, role: 'member' }))
      if (!error && channelId) await supabase.from('channel_members').insert({ user_id: userId, channel_id: channelId })
    }
    // Only flip the button's state if the core group_members write actually
    // succeeded — previously flipped unconditionally, so a failed
    // join/leave (RLS, network) left the button showing membership status
    // that didn't match the database.
    if (!error || error.code === '23505') setMember(v => !v)
    setLoading(false)
  }

  return (
    <button onClick={toggle} disabled={loading}
      className={`text-xs font-black px-4 py-2 rounded-lg transition-all disabled:opacity-60 ${
        member ? 'border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400' : 'bg-green-500 hover:bg-green-400 text-black'
      }`}>
      {member ? 'Leave Group' : 'Join Group'}
    </button>
  )
}
