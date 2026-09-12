'use client'

import { useState } from 'react'
import { CalendarClock, FileText, Loader2, Send, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import styles from './ScheduledPostPlanner.module.css'

export type ScheduledPost = { id: string; content: string; post_type: string; sport: string | null; visibility: string; scheduled_for: string; status: string; published_post_id: string | null; attempts: number; created_at: string }

function localInputDate(offsetMinutes = 30) {
  const date = new Date(Date.now() + offsetMinutes * 60_000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function ScheduledPostPlanner({ posts }: { posts: ScheduledPost[] }) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [postType, setPostType] = useState('text')
  const [sport, setSport] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [scheduledFor, setScheduledFor] = useState(localInputDate())
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function create(draft: boolean) {
    if (!content.trim()) return
    setBusy(draft ? 'draft' : 'schedule'); setMessage('')
    try {
      const response = await fetch('/api/creator/scheduled-posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, postType, sport, visibility, scheduledFor: new Date(scheduledFor).toISOString(), draft }), signal: AbortSignal.timeout(15_000) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not save post.')
      setContent(''); setMessage(draft ? 'Draft saved.' : 'Post scheduled.'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save post.') } finally { setBusy('') }
  }
  async function update(id: string, action: 'cancel' | 'schedule') {
    setBusy(id); setMessage('')
    try {
      const response = await fetch('/api/creator/scheduled-posts', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, scheduledFor: new Date(scheduledFor).toISOString() }), signal: AbortSignal.timeout(15_000) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not update post.')
      setMessage(action === 'cancel' ? 'Scheduled post canceled.' : 'Draft scheduled.'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update post.') } finally { setBusy('') }
  }

  return <article className={styles.panel}>
    <header><div><span>CONTENT CALENDAR</span><h2>Draft and schedule posts</h2><p>Prepare creator updates and publish them at the right moment.</p></div><CalendarClock size={21}/></header>
    <div className={styles.composer}><textarea value={content} onChange={event => setContent(event.target.value)} maxLength={500} placeholder="Write a take or research update…" aria-label="Scheduled post content"/><div className={styles.options}><select value={postType} onChange={event => setPostType(event.target.value)} aria-label="Post type"><option value="text">Take</option><option value="analysis">Research</option></select><select value={sport} onChange={event => setSport(event.target.value)} aria-label="Sport"><option value="">Any sport</option><option>MLB</option><option>NFL</option><option>NBA</option><option>NHL</option><option>NCAAF</option><option>NCAAB</option></select><select value={visibility} onChange={event => setVisibility(event.target.value)} aria-label="Audience"><option value="public">Public</option><option value="followers">Followers</option><option value="premium">Premium</option></select><input type="datetime-local" value={scheduledFor} min={localInputDate(1)} onChange={event => setScheduledFor(event.target.value)} aria-label="Publish date and time"/></div><div className={styles.actions}><span>{content.length}/500</span><button type="button" onClick={() => void create(true)} disabled={!content.trim() || Boolean(busy)}>{busy === 'draft' ? <Loader2 className="animate-spin" size={14}/> : <FileText size={14}/>}Save draft</button><button type="button" onClick={() => void create(false)} disabled={!content.trim() || Boolean(busy)}>{busy === 'schedule' ? <Loader2 className="animate-spin" size={14}/> : <Send size={14}/>}Schedule</button></div></div>
    <div className={styles.queue}>{posts.length ? posts.map(post => <div key={post.id}><span className={styles[post.status] || ''}>{post.status}</span><div><strong>{post.content}</strong><small>{post.sport || 'All sports'} · {post.visibility} · {post.status === 'draft' ? 'Unscheduled' : new Date(post.scheduled_for).toLocaleString()}</small></div>{post.status === 'draft' || post.status === 'failed' ? <button type="button" onClick={() => void update(post.id, 'schedule')} disabled={busy === post.id}>Schedule</button> : post.status === 'scheduled' ? <button type="button" onClick={() => void update(post.id, 'cancel')} disabled={busy === post.id} aria-label="Cancel scheduled post"><X size={14}/></button> : null}</div>) : <p>No drafts or scheduled posts yet.</p>}</div>
    {message && <div className={styles.message} role="status">{message}</div>}
  </article>
}
