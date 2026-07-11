'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function GroupJoinButton({ userId, groupId, initialMember }: {
  userId: string; groupId: string; initialMember: boolean
}) {
  const [member, setMember] = useState(initialMember)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function toggle() {
    setLoading(true)
    if (member) {
      await supabase.from('group_members').delete().match({ user_id: userId, group_id: groupId })
    } else {
      await supabase.from('group_members').insert({ user_id: userId, group_id: groupId, role: 'member' })
    }
    setMember(v => !v)
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
