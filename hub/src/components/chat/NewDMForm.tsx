'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Check, Loader2, Search, Users, X } from 'lucide-react'
import Link from 'next/link'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface User { id: string; username: string; display_name?: string; avatar_url?: string; avatar_ring_style?: import('@/lib/avatarStyles').MemberRingStyle; avatar_ring_color?: string; is_verified?: boolean }

export function NewDMForm({ users, forwardMessageId }: { users: User[]; forwardMessageId?: string }) {
  const [q, setQ] = useState('')
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const [mode, setMode] = useState<'direct' | 'group'>('direct')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Record<string, User>>({})
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchRetry, setSearchRetry] = useState(0)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  useEffect(() => {
    const controller = new AbortController()
    const term = q.trim()
    if (term.length < 2) return () => controller.abort()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/messages/recipients?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: 'no-store' })
        const body = await response.json()
        if (!response.ok || !Array.isArray(body.users)) throw new Error('Search unavailable')
        if (!controller.signal.aborted) setResults(body.users)
      } catch { if (!controller.signal.aborted) { setResults([]); setSearchError('Could not search members. Try again.') } }
      finally { if (!controller.signal.aborted) setSearching(false) }
    }, 220)
    return () => { clearTimeout(timer); controller.abort() }
  }, [q, searchRetry])

  function changeSearch(value: string) {
    setQ(value); setResults([]); setSearchError(''); setSearching(value.trim().length >= 2)
  }

  async function choose(user: User) {
    if (mode === 'group') {
      setSelectedUsers(current => ({ ...current, [user.id]: user }))
      setSelectedIds(current => current.includes(user.id) ? current.filter(id => id !== user.id) : current.length < 19 ? [...current, user.id] : current)
      return
    }
    if (!forwardMessageId) { router.push(`/messages/${user.username}`); return }
    setSendingTo(user.id); setError('')
    try {
    const { error: forwardError } = await supabase.rpc('forward_direct_message', { source_message_id: forwardMessageId, recipient_id: user.id })
    if (forwardError) { setSendingTo(null); setError('Message could not be forwarded. Try again.'); return }
    router.push(`/messages/${user.username}`)
    } catch { setError('Message could not be forwarded. Try again.') }
    finally { setSendingTo(null) }
  }

  async function createGroup() {
    if (!groupName.trim() || selectedIds.length < 2 || creatingGroup) return
    setCreatingGroup(true); setError('')
    try {
    const { data, error: createError } = await supabase.rpc('create_group_conversation', { conversation_name: groupName.trim(), invited_user_ids: selectedIds })
    setCreatingGroup(false)
    if (createError || !data) { setError('Group conversation could not be created. Check the selected members and try again.'); return }
    router.push(`/messages/group/${data}`)
    } catch { setError('Group conversation could not be created. Try again.') }
    finally { setCreatingGroup(false) }
  }

  const filtered = q.trim().length >= 2 ? results : users.filter(u =>
    u.username.toLowerCase().includes(q.toLowerCase()) ||
    (u.display_name || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="ss-new-dm-form">
      <Link href="/messages" className="ss-new-dm-back"><ArrowLeft size={14} /> Inbox</Link>
      {!forwardMessageId && <div className="ss-new-dm-mode" role="tablist" aria-label="Conversation type"><button type="button" role="tab" aria-selected={mode === 'direct'} onClick={() => setMode('direct')}>Direct</button><button type="button" role="tab" aria-selected={mode === 'group'} onClick={() => setMode('group')}><Users size={13}/>Group</button></div>}
      {mode === 'group' && <><div className="ss-new-dm-group-name"><input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={64} placeholder="Group name" aria-label="Group conversation name"/><span>{selectedIds.length}/19 selected</span></div><div className="ss-new-dm-selected">{selectedIds.map(id => <button key={id} type="button" onClick={() => setSelectedIds(current => current.filter(value => value !== id))} aria-label={`Remove ${selectedUsers[id]?.display_name || selectedUsers[id]?.username || 'member'}`}>{selectedUsers[id]?.display_name || selectedUsers[id]?.username}<X size={12}/></button>)}</div></>}
      <div className="ss-new-dm-search">
        <Search size={15} />
        <input autoFocus value={q} maxLength={64} onChange={e => changeSearch(e.target.value)}
          aria-label="Search members"
          placeholder="Search all members…"
          className="ss-new-dm-input" />
        {q && <button type="button" onClick={() => changeSearch('')} aria-label="Clear member search"><X size={13} /></button>}
      </div>

      <div className="ss-new-dm-results">
        {searching ? <p role="status" className="ss-recipient-status"><Loader2 size={16} className="animate-spin"/> Searching members…</p> : searchError ? <p role="alert" className="ss-recipient-status">{searchError}<button type="button" onClick={() => { setSearching(true); setSearchError(''); setSearchRetry(current => current + 1) }}>Retry</button></p> : filtered.map(u => (
          <button key={u.id} type="button" onClick={() => void choose(u)} disabled={sendingTo !== null || creatingGroup}
            className={`ss-new-dm-person text-left ${selectedIds.includes(u.id) ? 'is-selected' : ''}`} aria-pressed={mode === 'group' ? selectedIds.includes(u.id) : undefined}>
            <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={40} ringStyle={u.avatar_ring_style} ringColor={u.avatar_ring_color} />
            <div className="ss-new-dm-person-copy">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-[var(--text-1)] text-sm">{u.display_name || u.username}</p>
                {u.is_verified && <span className="text-[var(--green)] text-xs">✓</span>}
              </div>
              <p className="text-xs text-[var(--text-3)]">@{u.username}</p>
            </div>
            {mode === 'group' ? <span className="ss-new-dm-check">{selectedIds.includes(u.id) ? <Check size={14}/> : null}</span> : <ArrowUpRight size={15} />}
          </button>
        ))}
        {!searching && !searchError && q && filtered.length === 0 && (
          <p className="text-center text-[var(--text-3)] text-sm py-8" role="status">{q.trim().length < 2 ? 'Type 2 characters to search all members.' : `No members found for “${q}”`}</p>
        )}
        {!q && filtered.length === 0 && <p className="ss-recipient-status" role="status">Search a username to start a conversation.</p>}
      </div>
      {mode === 'group' && <div className="ss-new-dm-group-action"><button type="button" onClick={() => void createGroup()} disabled={!groupName.trim() || selectedIds.length < 2 || creatingGroup}>{creatingGroup ? <Loader2 className="animate-spin" size={15}/> : <Users size={15}/>}Create group</button></div>}
      {error ? <p role="alert" className="px-4 pb-4 text-xs text-[var(--red)]">{error}</p> : null}
    </div>
  )
}
