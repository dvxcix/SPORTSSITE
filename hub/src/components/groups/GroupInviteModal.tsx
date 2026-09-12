'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/lib/notify'
import { UserPlus, X } from 'lucide-react'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { Modal } from '@/components/ui/Modal'

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
        className="ss-community-invite-trigger">
        <UserPlus size={13} /> Invite
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} label={`Invite to ${groupName}`} maxWidth={410}>
          <div className="ss-community-invite">
            <div className="ss-community-invite-head">
              <div><span>Community invite</span><h3 id="group-invite-title">Invite to {groupName}</h3></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close invite dialog"><X size={16} /></button>
            </div>
            <div className="ss-community-invite-search">
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), void search())}
                placeholder="Search by username…"
                aria-label="Search members to invite"
                maxLength={40}
                className="ss-input"
              />
              <button type="button" onClick={() => void search()} disabled={searching}
                >
                Search
              </button>
            </div>
            {error && <p className="ss-community-invite-error" role="alert">{error}</p>}
            <div className="ss-community-invite-results">
              {results.map(u => (
                <div key={u.id} className="ss-community-invite-row">
                  <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={32} />
                  <div>
                    <p>{u.display_name || u.username}</p>
                    <span>@{u.username}</span>
                  </div>
                  <button type="button" onClick={() => invite(u)} disabled={invited.has(u.id) || invitingId === u.id}
                    >
                    {invited.has(u.id) ? 'Invited' : invitingId === u.id ? 'Sending…' : 'Invite'}
                  </button>
                </div>
              ))}
              {q && !searching && results.length === 0 && (
                <p className="ss-community-invite-empty">No users found</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
