'use client'

import { useMemo, useState } from 'react'
import { Bell, Hash, Loader2, MessageSquareText, Plus, Radio, Save, Trash2, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import styles from './GroupChannelManager.module.css'

export type ManagedGroupChannel = {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  channel_kind: 'text' | 'live' | 'picks' | 'announcements'
  sort_order: number
}

const CHANNEL_TYPES = [
  { value: 'text', label: 'Text', icon: MessageSquareText },
  { value: 'live', label: 'Live', icon: Radio },
  { value: 'picks', label: 'Picks', icon: TrendingUp },
  { value: 'announcements', label: 'Announcements', icon: Bell },
] as const

const EMPTY_FORM = { name: '', description: '', icon: '#', channel_kind: 'text' as ManagedGroupChannel['channel_kind'] }

export function GroupChannelManager({ groupId, primaryChannelId, initialChannels }: {
  groupId: string
  primaryChannelId?: string | null
  initialChannels: ManagedGroupChannel[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [channels, setChannels] = useState(initialChannels)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function createChannel(event: React.FormEvent) {
    event.preventDefault()
    if (form.name.trim().length < 2 || creating) return
    setCreating(true)
    setError('')
    setNotice('')
    const { data, error: createError } = await supabase.rpc('create_group_channel', {
      p_group_id: groupId,
      p_name: form.name.trim(),
      p_description: form.description.trim() || null,
      p_icon: form.icon.trim() || '#',
      p_channel_kind: form.channel_kind,
    })
    if (createError || !data) {
      setError('Channel not created. Check the name and try again.')
    } else {
      setChannels(current => [...current, data as ManagedGroupChannel].sort((a, b) => a.sort_order - b.sort_order))
      setForm(EMPTY_FORM)
      setNotice('Channel created.')
    }
    setCreating(false)
  }

  function replaceChannel(channel: ManagedGroupChannel) {
    setChannels(current => current.map(item => item.id === channel.id ? channel : item))
  }

  function removeChannel(channelId: string) {
    setChannels(current => current.filter(item => item.id !== channelId))
  }

  return (
    <section className={styles.panel}>
      <header>
        <span><Hash size={17} /></span>
        <div><p>Community structure</p><h2>Channels</h2><small>Create focused spaces without splitting members into separate groups.</small></div>
      </header>

      <div aria-live="polite">
        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      <div className={styles.channelList}>
        {channels.map(channel => (
          <ChannelEditor
            key={channel.id}
            channel={channel}
            primary={channel.id === primaryChannelId}
            onChange={replaceChannel}
            onDelete={removeChannel}
          />
        ))}
      </div>

      <form className={styles.createForm} onSubmit={createChannel}>
        <div className={styles.createHeading}><Plus size={15} /><strong>New channel</strong></div>
        <div className={styles.nameRow}>
          <label><span>Icon</span><input value={form.icon} maxLength={16} aria-label="New channel icon" onChange={event => setForm(current => ({ ...current, icon: event.target.value }))} /></label>
          <label className={styles.grow}><span>Name</span><input value={form.name} maxLength={48} required minLength={2} placeholder="Live game room" onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
        </div>
        <label><span>Description</span><input value={form.description} maxLength={180} placeholder="What belongs in this channel?" onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
        <fieldset className={styles.typePicker}>
          <legend>Channel type</legend>
          {CHANNEL_TYPES.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" aria-pressed={form.channel_kind === value} onClick={() => setForm(current => ({ ...current, channel_kind: value }))}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </fieldset>
        <button className={styles.createButton} type="submit" disabled={creating || form.name.trim().length < 2}>
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create channel
        </button>
      </form>
    </section>
  )
}

function ChannelEditor({ channel, primary, onChange, onDelete }: {
  channel: ManagedGroupChannel
  primary: boolean
  onChange: (channel: ManagedGroupChannel) => void
  onDelete: (channelId: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [draft, setDraft] = useState(channel)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const Icon = CHANNEL_TYPES.find(type => type.value === channel.channel_kind)?.icon ?? Hash

  async function save() {
    if (draft.name.trim().length < 2 || busy) return
    setBusy(true)
    setError('')
    const { data, error: saveError } = await supabase.rpc('update_group_channel', {
      p_channel_id: channel.id,
      p_name: draft.name.trim(),
      p_description: draft.description?.trim() || null,
      p_icon: draft.icon?.trim() || '#',
      p_channel_kind: draft.channel_kind,
    })
    if (saveError || !data) setError('Channel not saved. Try again.')
    else {
      onChange(data as ManagedGroupChannel)
      setDraft(data as ManagedGroupChannel)
      setEditing(false)
    }
    setBusy(false)
  }

  async function remove() {
    if (primary || busy) return
    setBusy(true)
    setError('')
    const { data, error: deleteError } = await supabase.rpc('delete_group_channel', { p_channel_id: channel.id })
    if (deleteError || !data) setError('Channel not deleted. Try again.')
    else onDelete(channel.id)
    setBusy(false)
  }

  if (!editing) {
    return (
      <article className={styles.channelCard}>
        <span className={styles.channelIcon}>{channel.icon || <Icon size={16} />}</span>
        <span className={styles.channelCopy}><strong>{channel.name}</strong><small>{channel.description || CHANNEL_TYPES.find(type => type.value === channel.channel_kind)?.label}</small></span>
        <span className={styles.kind}><Icon size={12} /> {channel.channel_kind}</span>
        {primary && <span className={styles.primary}>Primary</span>}
        <button type="button" onClick={() => setEditing(true)}>Edit</button>
      </article>
    )
  }

  return (
    <article className={`${styles.channelCard} ${styles.editing}`}>
      <div className={styles.editGrid}>
        <label><span>Icon</span><input aria-label={`${channel.name} icon`} value={draft.icon ?? ''} maxLength={16} onChange={event => setDraft(current => ({ ...current, icon: event.target.value }))} /></label>
        <label className={styles.grow}><span>Name</span><input aria-label={`${channel.name} name`} value={draft.name} maxLength={48} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
        <label className={styles.full}><span>Description</span><input aria-label={`${channel.name} description`} value={draft.description ?? ''} maxLength={180} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></label>
        <label className={styles.full}><span>Type</span><select aria-label={`${channel.name} type`} value={draft.channel_kind} onChange={event => setDraft(current => ({ ...current, channel_kind: event.target.value as ManagedGroupChannel['channel_kind'] }))}>{CHANNEL_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
      </div>
      {error && <p className={styles.inlineError} role="alert">{error}</p>}
      <div className={styles.editorActions}>
        {!primary && (confirmDelete ? <><button className={styles.danger} type="button" onClick={remove} disabled={busy}><Trash2 size={13} /> Confirm delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></> : <button className={styles.dangerGhost} type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</button>)}
        <span />
        <button type="button" onClick={() => { setDraft(channel); setEditing(false); setError('') }} disabled={busy}>Cancel</button>
        <button className={styles.saveButton} type="button" onClick={save} disabled={busy || draft.name.trim().length < 2}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
      </div>
    </article>
  )
}
