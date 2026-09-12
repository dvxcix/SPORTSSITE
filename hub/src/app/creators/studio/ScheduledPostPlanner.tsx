'use client'

import { useMemo, useRef, useState } from 'react'
import { CalendarClock, CalendarDays, Check, Clock3, Edit3, FileText, Loader2, Send, Trash2, X } from 'lucide-react'
import styles from './ScheduledPostPlanner.module.css'

export type ScheduledPost = { id: string; content: string; post_type: string; sport: string | null; visibility: string; scheduled_for: string; status: string; published_post_id: string | null; attempts: number; created_at: string; updated_at?: string }

function localInputDate(offsetMinutes = 30) {
  const date = new Date(Date.now() + offsetMinutes * 60_000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function localInputFromIso(value: string) {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function dateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function ScheduledPostPlanner({ posts }: { posts: ScheduledPost[] }) {
  const [items, setItems] = useState(posts)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [postType, setPostType] = useState('text')
  const [sport, setSport] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [scheduledFor, setScheduledFor] = useState(localInputDate())
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + offset)
    const key = dateKey(date)
    return { key, date, count: items.filter(item => item.status === 'scheduled' && dateKey(item.scheduled_for) === key).length }
  }), [items])
  const drafts = items.filter(item => item.status === 'draft' || item.status === 'failed')
  const scheduled = items.filter(item => item.status === 'scheduled').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))

  function resetComposer() {
    setEditingId(null); setContent(''); setPostType('text'); setSport(''); setVisibility('public'); setScheduledFor(localInputDate())
  }

  function edit(post: ScheduledPost) {
    setEditingId(post.id); setContent(post.content); setPostType(post.post_type); setSport(post.sport ?? ''); setVisibility(post.visibility); setScheduledFor(localInputFromIso(post.scheduled_for)); setMessage('')
    requestAnimationFrame(() => { composerRef.current?.focus(); composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) })
  }

  function chooseDay(day: Date) {
    const current = new Date(scheduledFor)
    const next = new Date(day); next.setHours(current.getHours() || 12, current.getMinutes(), 0, 0)
    setScheduledFor(localInputFromIso(next.toISOString()))
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  async function save(draft: boolean) {
    if (!content.trim()) return
    const operation = editingId ? 'edit' : draft ? 'draft' : 'schedule'
    setBusy(operation); setMessage('')
    try {
      const payload = { content, postType, sport, visibility, scheduledFor: new Date(scheduledFor).toISOString(), draft }
      const response = await fetch('/api/creator/scheduled-posts', {
        method: editingId ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(editingId ? { ...payload, id: editingId, action: 'edit' } : payload), signal: AbortSignal.timeout(15_000),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.post) throw new Error(data?.error || 'Could not save post.')
      setItems(current => editingId ? current.map(item => item.id === editingId ? data.post : item) : [...current, data.post])
      setMessage(editingId ? 'Post updated.' : draft ? 'Draft saved.' : 'Post scheduled.')
      resetComposer()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save post.') } finally { setBusy('') }
  }

  async function cancel(post: ScheduledPost) {
    setBusy(post.id); setMessage('')
    try {
      const response = await fetch('/api/creator/scheduled-posts', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: post.id, action: 'cancel' }), signal: AbortSignal.timeout(15_000) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not cancel post.')
      setItems(current => current.filter(item => item.id !== post.id)); if (editingId === post.id) resetComposer(); setMessage('Scheduled post canceled.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not cancel post.') } finally { setBusy('') }
  }

  async function remove(post: ScheduledPost) {
    setBusy(post.id); setMessage('')
    try {
      const response = await fetch('/api/creator/scheduled-posts?id=' + encodeURIComponent(post.id), { method: 'DELETE', signal: AbortSignal.timeout(15_000) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not delete post.')
      setItems(current => current.filter(item => item.id !== post.id)); if (editingId === post.id) resetComposer(); setMessage('Draft deleted.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete post.') } finally { setBusy('') }
  }

  const row = (post: ScheduledPost) => <div key={post.id} className={styles.queueRow} data-editing={editingId === post.id}>
    <span className={styles[post.status] || ''}>{post.status}</span>
    <div><strong>{post.content}</strong><small>{post.sport || 'All sports'} · {post.visibility} · {post.status === 'draft' ? 'Unscheduled' : new Date(post.scheduled_for).toLocaleString()}</small></div>
    <div className={styles.rowActions}>
      <button type="button" onClick={() => edit(post)} disabled={Boolean(busy)} aria-label={'Edit ' + post.content}><Edit3 size={13}/></button>
      {post.status === 'scheduled' ? <button type="button" onClick={() => void cancel(post)} disabled={busy === post.id} aria-label="Cancel scheduled post">{busy === post.id ? <Loader2 className="animate-spin" size={13}/> : <X size={13}/>}</button>
        : <button type="button" onClick={() => void remove(post)} disabled={busy === post.id} aria-label="Delete draft">{busy === post.id ? <Loader2 className="animate-spin" size={13}/> : <Trash2 size={13}/>}</button>}
    </div>
  </div>

  return <article className={styles.panel}>
    <header><div><span>CONTENT CALENDAR</span><h2>Draft and schedule posts</h2><p>Plan creator updates and keep every publishing window in one place.</p></div><CalendarClock size={21}/></header>
    <div className={styles.calendar} aria-label="Next seven publishing days">{calendarDays.map(day => <button key={day.key} type="button" onClick={() => chooseDay(day.date)} data-selected={dateKey(scheduledFor) === day.key}><span>{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span><strong>{day.date.getDate()}</strong><small>{day.count ? day.count + ' scheduled' : 'Open'}</small></button>)}</div>
    <div className={styles.composer} data-editing={Boolean(editingId)}>
      <div className={styles.composerTitle}>{editingId ? <><Edit3 size={14}/><strong>Editing scheduled content</strong><button type="button" onClick={resetComposer}>Cancel edit</button></> : <><CalendarDays size={14}/><strong>New calendar post</strong></>}</div>
      <textarea ref={composerRef} value={content} onChange={event => setContent(event.target.value)} maxLength={500} placeholder="Write a take or research update…" aria-label="Scheduled post content"/>
      <div className={styles.options}><select value={postType} onChange={event => setPostType(event.target.value)} aria-label="Post type"><option value="text">Take</option><option value="analysis">Research</option></select><select value={sport} onChange={event => setSport(event.target.value)} aria-label="Sport"><option value="">Any sport</option><option>MLB</option><option>NFL</option><option>NBA</option><option>NHL</option><option>NCAAF</option><option>NCAAB</option></select><select value={visibility} onChange={event => setVisibility(event.target.value)} aria-label="Audience"><option value="public">Public</option><option value="followers">Followers</option><option value="premium">Premium</option></select><label><Clock3 size={13}/><input type="datetime-local" value={scheduledFor} min={localInputDate(1)} onChange={event => setScheduledFor(event.target.value)} aria-label="Publish date and time"/></label></div>
      <div className={styles.actions}><span>{content.length}/500</span><button type="button" onClick={() => void save(true)} disabled={!content.trim() || Boolean(busy)}>{busy === 'draft' || busy === 'edit' ? <Loader2 className="animate-spin" size={14}/> : <FileText size={14}/>}Save draft</button><button type="button" onClick={() => void save(false)} disabled={!content.trim() || Boolean(busy)}>{busy === 'schedule' || busy === 'edit' ? <Loader2 className="animate-spin" size={14}/> : editingId ? <Check size={14}/> : <Send size={14}/>} {editingId ? 'Update & schedule' : 'Schedule'}</button></div>
    </div>
    <div className={styles.board}>
      <section><header><div><span>UPCOMING</span><strong>{scheduled.length} scheduled</strong></div><CalendarDays size={16}/></header><div className={styles.queue}>{scheduled.length ? scheduled.map(row) : <p>No scheduled posts yet.</p>}</div></section>
      <section><header><div><span>WORKBENCH</span><strong>{drafts.length} drafts</strong></div><FileText size={16}/></header><div className={styles.queue}>{drafts.length ? drafts.map(row) : <p>No drafts waiting.</p>}</div></section>
    </div>
    {message && <div className={styles.message} role="status">{message}</div>}
  </article>
}
