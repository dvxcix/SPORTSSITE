'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function GroupInviteResponse({ inviteId, groupId, channelId, userId, invitedByUsername }: {
  inviteId: string; groupId: string; channelId: string | null; userId: string; invitedByUsername?: string
}) {
  const [loading, setLoading] = useState(false)
  const [declined, setDeclined] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function accept() {
    setLoading(true)
    // Order matters: group_members' own INSERT policy checks for an
    // 'accepted' invite row, so the invite status has to flip first.
    await supabase.from('group_invites').update({ status: 'accepted' }).eq('id', inviteId)
    await supabase.from('group_members').insert({ group_id: groupId, user_id: userId, role: 'member' })
    if (channelId) await supabase.from('channel_members').insert({ channel_id: channelId, user_id: userId })
    router.refresh()
  }

  async function decline() {
    setLoading(true)
    await supabase.from('group_invites').update({ status: 'declined' }).eq('id', inviteId)
    setDeclined(true)
    setLoading(false)
  }

  if (declined) {
    return <p className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">Invite declined.</p>
  }

  return (
    <div className="bg-zinc-900 border border-green-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-sm text-zinc-300">
        {invitedByUsername ? `@${invitedByUsername} invited` : "You've been invited"} you to join this private group.
      </p>
      <div className="flex gap-2 shrink-0">
        <button onClick={decline} disabled={loading}
          className="text-xs font-bold border border-zinc-700 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          Decline
        </button>
        <button onClick={accept} disabled={loading}
          className="text-xs font-bold bg-green-500 hover:bg-green-400 text-black px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          Accept
        </button>
      </div>
    </div>
  )
}
