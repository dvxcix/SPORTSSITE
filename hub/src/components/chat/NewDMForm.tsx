'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Search } from 'lucide-react'
import Link from 'next/link'

interface User { id: string; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean }

export function NewDMForm({ users }: { users: User[] }) {
  const [q, setQ] = useState('')
  const router = useRouter()

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(q.toLowerCase()) ||
    (u.display_name || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="ss-new-dm-form">
      <div className="ss-new-dm-search">
        <Search size={15} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search people…"
          className="ss-new-dm-input" />
      </div>

      <div className="ss-new-dm-results">
        {filtered.map(u => (
          <Link key={u.id} href={`/messages/${u.username}`}
            className="ss-new-dm-person">
            <div className="ss-new-dm-avatar">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
            </div>
            <div className="ss-new-dm-person-copy">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-white text-sm">{u.display_name || u.username}</p>
                {u.is_verified && <span className="text-green-400 text-xs">✓</span>}
              </div>
              <p className="text-xs text-zinc-500">@{u.username}</p>
            </div>
            <ArrowUpRight size={15} />
          </Link>
        ))}
        {q && filtered.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8">No users found for "{q}"</p>
        )}
      </div>
    </div>
  )
}
