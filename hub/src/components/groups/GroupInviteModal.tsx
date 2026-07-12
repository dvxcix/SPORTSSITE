'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/lib/notify'
import { UserPlus, X } from 'lucide-react'

type FoundUser = { id: string; username: string; display_name: string | null; avatar_url: string | null }

export function GroupInviteModal({ groupId, groupSlug, groupName, currentUserId }: {
  groupId: string; groupSlug: string; groupName: string; currentUserId: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<FoundUser[]>([])
  const [searching, setSearching] = useState(false)
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const supabase = createClient()

  async function search() {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${q.trim()}%,display_name.ilike.%${q.trim()}%`)
      .neq('id', currentUserId)
      .limit(10)
    setResults(data ?? [])
    setSearching(false)
  }

  async function invite(u: FoundUser) {
    setError('')
    const { error: err } = await supabase.from('group_invites').insert({
      group_id: groupId, invited_user_id: u.id, invited_by: currentUserId,
    })
    if (err) {
      // Duplicate invite (unique constraint) reads as a normal "already invited" state, not a failure.
      if (err.code === '23505') setInvited(s => new Set(s).add(u.id))
      else setError('Could not send invite.')
      return
    }
    await notify(supabase, {
      userId: u.id, actorId: currentUserId, type: 'group_invite',
      message: `invited you to join ${groupName}`, link: `/groups/${groupSlug}`,
      targetId: groupId, targetType: 'group',
    })
    setInvited(s => new Set(s).add(u.id))
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
        <UserPlus size={13} /> Invite
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-white">Invite to {groupName}</h3>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Search by username…"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50"
              />
              <button onClick={search} disabled={searching}
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 rounded-lg transition-colors disabled:opacity-40">
                Search
              </button>
            </div>
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {results.map(u => (
                <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/60">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-white">
                    {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.display_name || u.username}</p>
                    <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
                  </div>
                  <button onClick={() => invite(u)} disabled={invited.has(u.id)}
                    className="text-xs font-bold bg-green-500 hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black px-2.5 py-1 rounded-lg transition-colors shrink-0">
                    {invited.has(u.id) ? 'Invited' : 'Invite'}
                  </button>
                </div>
              ))}
              {q && !searching && results.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-3">No users found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
