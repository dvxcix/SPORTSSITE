'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Loader2, Plus, Save, Shield, Trash2, UserRoundCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import type { GroupMemberManagerMember } from './GroupMemberManager'
import type { ManagedGroupChannel } from './GroupChannelManager'
import styles from './GroupRoleManager.module.css'

const PERMISSIONS = [
  ['view_channels', 'View channels'],
  ['send_messages', 'Send messages'],
  ['manage_messages', 'Manage messages'],
  ['manage_channels', 'Manage channels'],
  ['manage_roles', 'Manage roles'],
  ['manage_members', 'Manage members'],
  ['create_invites', 'Create invites'],
] as const

type PermissionKey = typeof PERMISSIONS[number][0]
type PermissionMap = Record<PermissionKey, boolean>

export type CommunityRole = {
  id: string
  group_id: string
  name: string
  color: string
  position: number
  is_default: boolean
  permissions: PermissionMap
}

export type CommunityRoleAssignment = { user_id: string; role_id: string }
export type CommunityChannelOverride = {
  channel_id: string
  role_id: string
  can_view: boolean | null
  can_send: boolean | null
  can_manage_messages: boolean | null
}

const DEFAULT_PERMISSIONS: PermissionMap = {
  view_channels: true,
  send_messages: true,
  manage_messages: false,
  manage_channels: false,
  manage_roles: false,
  manage_members: false,
  create_invites: false,
}

export function GroupRoleManager({ groupId, initialRoles, initialAssignments, initialOverrides, members, channels }: {
  groupId: string
  initialRoles: CommunityRole[]
  initialAssignments: CommunityRoleAssignment[]
  initialOverrides: CommunityChannelOverride[]
  members: GroupMemberManagerMember[]
  channels: ManagedGroupChannel[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [roles, setRoles] = useState(initialRoles)
  const [assignments, setAssignments] = useState(initialAssignments)
  const [overrides, setOverrides] = useState(initialOverrides)
  const [selectedId, setSelectedId] = useState(initialRoles[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const selected = roles.find(role => role.id === selectedId) ?? roles[0]

  function updateSelected(patch: Partial<CommunityRole>) {
    if (!selected) return
    setRoles(current => current.map(role => role.id === selected.id ? { ...role, ...patch } : role))
  }

  async function createRole() {
    setBusy('create'); setError(''); setNotice('')
    const { data, error: requestError } = await supabase.rpc('create_community_role', { p_group_id: groupId, p_name: 'New role', p_color: '#b4ff4d' })
    if (requestError || !data) setError('Role not created. Try a different name.')
    else {
      const role = data as CommunityRole
      setRoles(current => [...current, role])
      setSelectedId(role.id)
      setCreating(true)
    }
    setBusy('')
  }

  async function saveRole() {
    if (!selected) return
    setBusy(`save:${selected.id}`); setError(''); setNotice('')
    const { data, error: requestError } = await supabase.rpc('update_community_role', {
      p_role_id: selected.id,
      p_name: selected.name.trim(),
      p_color: selected.color,
      p_permissions: selected.permissions,
    })
    if (requestError || !data) setError('Role changes were not saved.')
    else {
      setRoles(current => current.map(role => role.id === selected.id ? data as CommunityRole : role))
      setNotice('Role saved.')
      setCreating(false)
    }
    setBusy('')
  }

  async function deleteRole() {
    if (!selected || selected.is_default) return
    setBusy(`delete:${selected.id}`); setError('')
    const { data, error: requestError } = await supabase.rpc('delete_community_role', { p_role_id: selected.id })
    if (requestError || !data) setError('Role not deleted.')
    else {
      setRoles(current => current.filter(role => role.id !== selected.id))
      setAssignments(current => current.filter(item => item.role_id !== selected.id))
      setOverrides(current => current.filter(item => item.role_id !== selected.id))
      setSelectedId(roles.find(role => role.id !== selected.id)?.id ?? '')
    }
    setBusy('')
  }

  async function toggleAssignment(userId: string, roleId: string, enabled: boolean) {
    const key = `member:${userId}:${roleId}`
    setBusy(key); setError('')
    const { error: requestError } = await supabase.rpc('set_community_member_role', { p_group_id: groupId, p_user_id: userId, p_role_id: roleId, p_enabled: enabled })
    if (requestError) setError('Member role not updated.')
    else setAssignments(current => enabled ? [...current, { user_id: userId, role_id: roleId }] : current.filter(item => item.user_id !== userId || item.role_id !== roleId))
    setBusy('')
  }

  async function setOverride(channelId: string, key: 'can_view' | 'can_send' | 'can_manage_messages', value: boolean | null) {
    if (!selected) return
    const current = overrides.find(item => item.channel_id === channelId && item.role_id === selected.id)
    const next = { channel_id: channelId, role_id: selected.id, can_view: current?.can_view ?? null, can_send: current?.can_send ?? null, can_manage_messages: current?.can_manage_messages ?? null, [key]: value }
    setBusy(`override:${channelId}:${key}`); setError('')
    const { data, error: requestError } = await supabase.rpc('set_channel_role_override', {
      p_channel_id: channelId,
      p_role_id: selected.id,
      p_can_view: next.can_view,
      p_can_send: next.can_send,
      p_can_manage_messages: next.can_manage_messages,
    })
    if (requestError || !data) setError('Channel permission not updated.')
    else setOverrides(items => [...items.filter(item => item.channel_id !== channelId || item.role_id !== selected.id), data as CommunityChannelOverride])
    setBusy('')
  }

  return <section className={styles.panel} id="roles">
    <header><span><Shield size={17} /></span><div><p>Access system</p><h2>Roles and permissions</h2><small>Control what members can see and do across this community.</small></div></header>
    {(notice || error) && <p className={error ? styles.error : styles.notice} role={error ? 'alert' : undefined}>{error || notice}</p>}
    <div className={styles.workspace}>
      <aside className={styles.roleRail}>
        <button className={styles.newRole} type="button" onClick={createRole} disabled={busy === 'create'}>{busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New role</button>
        {roles.map(role => <button type="button" key={role.id} aria-current={selected?.id === role.id} onClick={() => setSelectedId(role.id)}><i style={{ background: role.color }} /><span>{role.name}</span>{role.is_default && <small>Default</small>}</button>)}
      </aside>
      {selected && <div className={styles.editor}>
        <div className={styles.roleIdentity}>
          <label><span>Role name</span><input value={selected.name} maxLength={32} onChange={event => updateSelected({ name: event.target.value })} /></label>
          <label><span>Color</span><div><input type="color" value={selected.color} onChange={event => updateSelected({ color: event.target.value })} /><code>{selected.color}</code></div></label>
        </div>
        <div className={styles.permissionGrid}>
          {PERMISSIONS.map(([key, label]) => <label key={key}><span><strong>{label}</strong><small>{permissionDescription(key)}</small></span><input type="checkbox" checked={Boolean(selected.permissions?.[key])} disabled={selected.is_default && key === 'manage_roles'} onChange={event => updateSelected({ permissions: { ...DEFAULT_PERMISSIONS, ...selected.permissions, [key]: event.target.checked } })} /></label>)}
        </div>
        <details className={styles.assignments} open={creating}>
          <summary><UserRoundCog size={14} /> Assign members <ChevronDown size={14} /></summary>
          <div>{members.filter(member => member.role !== 'owner').map(member => {
            const checked = assignments.some(item => item.user_id === member.user_id && item.role_id === selected.id)
            const key = `member:${member.user_id}:${selected.id}`
            return <label key={member.user_id}><MemberAvatar src={member.user?.avatar_url} name={member.user?.display_name || member.user?.username || 'Member'} size={30} /><span><strong>{member.user?.display_name || member.user?.username}</strong><small>@{member.user?.username}</small></span><input type="checkbox" checked={checked} disabled={selected.is_default || busy === key} onChange={event => toggleAssignment(member.user_id, selected.id, event.target.checked)} /></label>
          })}</div>
        </details>
        <details className={styles.overrides}>
          <summary><Shield size={14} /> Channel overrides <ChevronDown size={14} /></summary>
          <div className={styles.overrideTable}>
            <div className={styles.overrideHead}><span>Channel</span><span>View</span><span>Send</span><span>Moderate</span></div>
            {channels.map(channel => {
              const override = overrides.find(item => item.channel_id === channel.id && item.role_id === selected.id)
              return <div className={styles.overrideRow} key={channel.id}><strong>{channel.icon || '#'} {channel.name}</strong>{(['can_view', 'can_send', 'can_manage_messages'] as const).map(key => <select key={key} aria-label={`${channel.name} ${key}`} value={override?.[key] === true ? 'allow' : override?.[key] === false ? 'deny' : 'inherit'} disabled={busy === `override:${channel.id}:${key}`} onChange={event => setOverride(channel.id, key, event.target.value === 'inherit' ? null : event.target.value === 'allow')}><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></select>)}</div>
            })}
          </div>
        </details>
        <footer>{!selected.is_default && <button type="button" className={styles.delete} onClick={deleteRole} disabled={busy.startsWith('delete:')}><Trash2 size={14} /> Delete role</button>}<span /><button type="button" className={styles.save} onClick={saveRole} disabled={!selected.name.trim() || busy.startsWith('save:')}>{busy.startsWith('save:') ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save role</button></footer>
      </div>}
    </div>
  </section>
}

function permissionDescription(key: PermissionKey) {
  return ({
    view_channels: 'Open channels allowed for this role.',
    send_messages: 'Post messages and participate in chat.',
    manage_messages: 'Delete, pin, and moderate messages.',
    manage_channels: 'Create and configure channels.',
    manage_roles: 'Create roles and change permissions.',
    manage_members: 'Change member access and remove members.',
    create_invites: 'Create community invitation links.',
  } as Record<PermissionKey, string>)[key]
}
