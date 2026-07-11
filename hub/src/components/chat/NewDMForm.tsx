'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
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
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all" />
      </div>

      <div className="space-y-1">
        {filtered.map(u => (
          <Link key={u.id} href={`/messages/${u.username}`}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900 transition-colors">
            <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-sm font-black text-white overflow-hidden">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-white text-sm">{u.display_name || u.username}</p>
                {u.is_verified && <span className="text-green-400 text-xs">✓</span>}
              </div>
              <p className="text-xs text-zinc-500">@{u.username}</p>
            </div>
          </Link>
        ))}
        {q && filtered.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8">No users found for "{q}"</p>
        )}
      </div>
    </div>
  )
}
