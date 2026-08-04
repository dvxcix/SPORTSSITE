'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { unblockUser } from '@/lib/blocks'

interface BlockedUser { id: string; username: string; display_name?: string; avatar_url?: string; blocked_at: string }

export function BlockedUsersList({ currentUserId, initialBlocked }: { currentUserId: string; initialBlocked: BlockedUser[] }) {
  const [blocked, setBlocked] = useState(initialBlocked)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const supabase = createClient()

  async function unblock(id: string) {
    setPendingId(id)
    const { ok } = await unblockUser(supabase, currentUserId, id)
    if (ok) setBlocked(b => b.filter(u => u.id !== id))
    setPendingId(null)
  }

  if (blocked.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">🚫</p>
        <p className="text-zinc-400 font-medium">You haven't blocked anyone</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
      {blocked.map(u => (
        <div key={u.id} className="flex items-center gap-3 px-4 py-3">
          <Link href={`/profile/${u.username}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-sm font-black text-white overflow-hidden">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate">{u.display_name || u.username}</p>
              <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
            </div>
          </Link>
          <button onClick={() => unblock(u.id)} disabled={pendingId === u.id}
            className="shrink-0 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
            {pendingId === u.id ? 'Unblocking…' : 'Unblock'}
          </button>
        </div>
      ))}
    </div>
  )
}
