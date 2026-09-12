'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/lib/notify'
import { UserPlus, X } from 'lucide-react'
import { MemberAvatar } from '@/components/social/MemberAvatar'

type FoundUser = { id: string; username: string; display_name: string | null; avatar_url: string | null }

export function GroupInviteModal({ groupId, groupSlug, groupName, currentUserId }: {
  groupId: string; groupSlug: string; groupName: string; currentUserId: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<FoundUser[]>([])
  const [searching, setSearching] = useState(false)
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!open) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  const search = useCallback(async () => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    setError('')
    const term = q.trim().replace(/[^\p{L}\p{N} ._@-]/gu, ' ').replace(/\s+/g, ' ').slice(0, 40)
    if (!term) { setResults([]); setSearching(false); return }
    try {
      const { data, error: searchError } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .neq('id', currentUserId)
        .limit(10)
      if (searchError) { setError('Search is unavailable. Try again.'); setResults([]); return }
      const candidates = data ?? []
      const ids = candidates.map(user => user.id)
      if (!ids.length) { setResults([]); return }
      const [{ data: members }, { data: pending }] = await Promise.all([
        supabase.from('group_members').select('user_id').eq('group_id', groupId).in('user_id', ids),
        supabase.from('group_invites').select('invited_user_id').eq('group_id', groupId).eq('status', 'pending').in('invited_user_id', ids),
      ])
      const memberIds = new Set((members ?? []).map(row => row.user_id))
      const pendingIds = new Set((pending ?? []).map(row => row.invited_user_id))
      if (pendingIds.size) setInvited(current => new Set([...current, ...pendingIds]))
      setResults(candidates.filter(user => !memberIds.has(user.id)))
    } catch {
      setError('Search is unavailable. Try again.')
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [currentUserId, groupId, q, supabase])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (q.trim().length < 2) { setResults([]); return }
      void search()
    }, 280)
    return () => window.clearTimeout(timer)
  }, [open, q, search])

  async function invite(u: FoundUser) {
    setError('')
    setInvitingId(u.id)
    try {
      const { error: err } = await supabase.from('group_invites').insert({
        group_id: groupId, invited_user_id: u.id, invited_by: currentUserId,
      })
      if (err) {
        if (err.code === '23505') setInvited(s => new Set(s).add(u.id))
        else setError('Could not send invite. Try again.')
        return
      }
      setInvited(s => new Set(s).add(u.id))
      void notify(supabase, {
        userId: u.id, actorId: currentUserId, type: 'group_invite',
        message: `invited you to join ${groupName}`, link: `/groups/${groupSlug}`,
        targetId: groupId, targetType: 'group',
      })
    } catch {
      setError('Could not send invite. Try again.')
    } finally {
      setInvitingId(null)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
        <UserPlus size={13} /> Invite
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="group-invite-title" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 id="group-invite-title" className="text-sm font-black text-white">Invite to {groupName}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close invite dialog" className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), void search())}
                placeholder="Search by username…"
                aria-label="Search members to invite"
                maxLength={40}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50"
              />
              <button type="button" onClick={() => void search()} disabled={searching}
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 rounded-lg transition-colors disabled:opacity-40">
                Search
              </button>
            </div>
            {error && <p className="text-xs text-red-400 mb-2" role="alert">{error}</p>}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {results.map(u => (
                <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/60">
                  <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.display_name || u.username}</p>
                    <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
                  </div>
                  <button type="button" onClick={() => invite(u)} disabled={invited.has(u.id) || invitingId === u.id}
                    className="text-xs font-bold bg-green-500 hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black px-2.5 py-1 rounded-lg transition-colors shrink-0">
                    {invited.has(u.id) ? 'Invited' : invitingId === u.id ? 'Sending…' : 'Invite'}
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
