'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { unblockUser } from '@/lib/blocks'
import { MemberAvatar } from '@/components/social/MemberAvatar'

interface BlockedUser { id: string; username: string; display_name?: string; avatar_url?: string; blocked_at: string }

export function BlockedUsersList({ currentUserId, initialBlocked }: { currentUserId: string; initialBlocked: BlockedUser[] }) {
  const [blocked, setBlocked] = useState(initialBlocked)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  async function unblock(id: string) {
    setPendingId(id)
    setFailedId(null)
    const { ok } = await unblockUser(supabase, currentUserId, id)
    if (ok) setBlocked(b => b.filter(u => u.id !== id))
    else setFailedId(id)
    setPendingId(null)
  }

  if (blocked.length === 0) {
    return (
      <div className="ss-settings-card py-16 text-center">
        <p className="text-4xl mb-3">🚫</p>
        <p className="text-zinc-400 font-medium">You haven't blocked anyone</p>
      </div>
    )
  }

  return (
    <div className="ss-settings-card !p-0 divide-y divide-white/[.07] overflow-hidden">
      {blocked.map(u => (
        <div key={u.id} className="flex items-center gap-3 px-4 py-3">
          <Link href={`/profile/${u.username}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={40} />
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate">{u.display_name || u.username}</p>
              <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
            </div>
          </Link>
          <button onClick={() => unblock(u.id)} disabled={pendingId === u.id}
            className="ss-settings-secondary shrink-0 disabled:opacity-40">
            {pendingId === u.id ? 'Unblocking…' : failedId === u.id ? 'Try again' : 'Unblock'}
          </button>
        </div>
      ))}
    </div>
  )
}
