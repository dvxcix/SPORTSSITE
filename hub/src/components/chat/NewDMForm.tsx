'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Search, X } from 'lucide-react'
import Link from 'next/link'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface User { id: string; username: string; display_name?: string; avatar_url?: string; avatar_ring_style?: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit'; avatar_ring_color?: string; is_verified?: boolean }

export function NewDMForm({ users, forwardMessageId }: { users: User[]; forwardMessageId?: string }) {
  const [q, setQ] = useState('')
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  async function choose(user: User) {
    if (!forwardMessageId) { router.push(`/messages/${user.username}`); return }
    setSendingTo(user.id); setError('')
    const { error: forwardError } = await supabase.rpc('forward_direct_message', { source_message_id: forwardMessageId, recipient_id: user.id })
    if (forwardError) { setSendingTo(null); setError('Message could not be forwarded. Try again.'); return }
    router.push(`/messages/${user.username}`)
  }

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(q.toLowerCase()) ||
    (u.display_name || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="ss-new-dm-form">
      <Link href="/messages" className="ss-new-dm-back"><ArrowLeft size={14} /> Inbox</Link>
      <div className="ss-new-dm-search">
        <Search size={15} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          aria-label="Search members"
          placeholder="Search people…"
          className="ss-new-dm-input" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear member search"><X size={13} /></button>}
      </div>

      <div className="ss-new-dm-results">
        {filtered.map(u => (
          <button key={u.id} type="button" onClick={() => void choose(u)} disabled={sendingTo === u.id}
            className="ss-new-dm-person text-left">
            <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={40} ringStyle={u.avatar_ring_style} ringColor={u.avatar_ring_color} />
            <div className="ss-new-dm-person-copy">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-white text-sm">{u.display_name || u.username}</p>
                {u.is_verified && <span className="text-green-400 text-xs">✓</span>}
              </div>
              <p className="text-xs text-zinc-500">@{u.username}</p>
            </div>
            <ArrowUpRight size={15} />
          </button>
        ))}
        {q && filtered.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8" role="status">No users found for “{q}”</p>
        )}
      </div>
      {error ? <p role="alert" className="px-4 pb-4 text-xs text-red-400">{error}</p> : null}
    </div>
  )
}
