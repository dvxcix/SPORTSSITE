'use client'

import { useMemo, useState } from 'react'
import { Check, Search, ShieldCheck, UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import styles from './GroupMemberManager.module.css'

export type GroupRole = 'owner' | 'admin' | 'moderator' | 'analyst' | 'subscriber' | 'member'
export type GroupMemberManagerMember = { user_id: string; role: GroupRole; user: { username: string; display_name?: string | null; avatar_url?: string | null; is_verified?: boolean | null } | null }
type Role = GroupRole
type Member = GroupMemberManagerMember
const ROLES: Array<{ id: Exclude<Role, 'owner'>; label: string }> = [
  { id: 'admin', label: 'Admin' }, { id: 'moderator', label: 'Moderator' }, { id: 'analyst', label: 'Analyst' },
  { id: 'subscriber', label: 'Subscriber' }, { id: 'member', label: 'Member' },
]

export function GroupMemberManager({ groupId, initialMembers }: { groupId: string; initialMembers: Member[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState(initialMembers)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const filtered = members.filter(member => `${member.user?.display_name ?? ''} ${member.user?.username ?? ''}`.toLowerCase().includes(query.toLowerCase()))

  async function setRole(member: Member, role: Exclude<Role, 'owner'>) {
    if (member.role === role) return
    setBusy(member.user_id); setMessage('')
    const { error } = await supabase.rpc('set_group_member_role', { p_group_id: groupId, p_user_id: member.user_id, p_role: role })
    if (error) setMessage('That role could not be updated.')
    else setMembers(current => current.map(item => item.user_id === member.user_id ? { ...item, role } : item))
    setBusy('')
  }

  async function remove(member: Member) {
    setBusy(member.user_id); setMessage('')
    const { error } = await supabase.rpc('remove_group_member', { p_group_id: groupId, p_user_id: member.user_id })
    if (error) setMessage('That member could not be removed.')
    else setMembers(current => current.filter(item => item.user_id !== member.user_id))
    setBusy('')
  }

  return <section className={styles.panel}>
    <header><div><span><ShieldCheck size={14}/> ACCESS</span><h2>Members and roles</h2></div><b>{members.length}</b></header>
    <div className={styles.search}><Search size={15}/><input aria-label="Find a group member" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a member" /></div>
    <div className={styles.list}>
      {filtered.map(member => <article key={member.user_id}>
        <MemberAvatar src={member.user?.avatar_url} name={member.user?.display_name || member.user?.username || 'Member'} size={38}/>
        <div className={styles.identity}><strong>{member.user?.display_name || member.user?.username || 'Member'}</strong><small>@{member.user?.username || 'member'}</small></div>
        {member.role === 'owner' ? <span className={styles.owner}><Check size={12}/> Owner</span> : <>
          <select value={member.role} disabled={busy === member.user_id} onChange={event => setRole(member, event.target.value as Exclude<Role, 'owner'>)} aria-label={`Role for ${member.user?.username}`}>
            {ROLES.map(role => <option value={role.id} key={role.id}>{role.label}</option>)}
          </select>
          <button type="button" disabled={busy === member.user_id} onClick={() => remove(member)} aria-label={`Remove ${member.user?.username}`}><UserMinus size={15}/></button>
        </>}
      </article>)}
      {!filtered.length && <p className={styles.empty}>No members match that search.</p>}
    </div>
    {message && <p role="alert" className={styles.error}>{message}</p>}
  </section>
}
