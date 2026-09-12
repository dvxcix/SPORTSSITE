'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, LoaderCircle, MessageCircle, Send, UserMinus, UserPlus, UsersRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import styles from './WorkspaceCollaboration.module.css'

type Workspace = { id: string; user_id: string; name: string }
type PublicUser = { username: string | null; display_name: string | null; avatar_url: string | null }
type Member = { user_id: string; role: 'viewer' | 'editor'; users: PublicUser | PublicUser[] | null }
type Comment = { id: string; user_id: string; body: string; created_at: string; users: PublicUser | PublicUser[] | null }
const profile = (value: PublicUser | PublicUser[] | null) => Array.isArray(value) ? value[0] ?? null : value

export function WorkspaceCollaboration({ workspace, userId }: { workspace: Workspace; userId: string }) {
  const db = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<Member[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const isOwner = workspace.user_id === userId

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 90_000).toISOString()
    const [memberResult, commentResult, presenceResult] = await Promise.all([
      db.from('research_workspace_members').select('user_id,role,users!research_workspace_members_user_id_fkey(username,display_name,avatar_url)').eq('workspace_id', workspace.id).order('created_at'),
      db.from('research_workspace_comments').select('id,user_id,body,created_at,users!research_workspace_comments_user_id_fkey(username,display_name,avatar_url)').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(60),
      db.from('research_workspace_presence').select('user_id').eq('workspace_id', workspace.id).gte('last_seen_at', since),
    ])
    if (!memberResult.error) setMembers((memberResult.data ?? []) as unknown as Member[])
    if (!commentResult.error) setComments((commentResult.data ?? []) as unknown as Comment[])
    if (!presenceResult.error) setActiveIds(new Set((presenceResult.data ?? []).map(row => row.user_id)))
  }, [db, workspace.id])

  useEffect(() => {
    const heartbeat = () => db.from('research_workspace_presence').upsert({ workspace_id: workspace.id, user_id: userId, last_seen_at: new Date().toISOString() }, { onConflict: 'workspace_id,user_id' }).then(() => load())
    void heartbeat()
    const interval = window.setInterval(heartbeat, 30_000)
    const channel = db.channel(`research-workspace:${workspace.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'research_workspace_comments', filter: `workspace_id=eq.${workspace.id}` }, () => void load()).subscribe()
    return () => { window.clearInterval(interval); void db.removeChannel(channel) }
  }, [db, load, userId, workspace.id])

  async function invite() {
    if (!username.trim()) return
    setBusy('invite'); setNotice('')
    const { error } = await db.rpc('invite_research_workspace_member', { p_workspace_id: workspace.id, p_username: username.trim(), p_role: role })
    setBusy('')
    if (error) { setNotice('That member could not be added.'); return }
    setUsername(''); setNotice('Member access updated.'); await load()
  }
  async function remove(user: string) {
    setBusy(user); setNotice('')
    const { error } = await db.rpc('remove_research_workspace_member', { p_workspace_id: workspace.id, p_user_id: user })
    setBusy('')
    if (error) { setNotice('Member access could not be changed.'); return }
    if (user === userId) window.location.reload()
    else await load()
  }
  async function comment() {
    const message = body.trim()
    if (!message) return
    setBusy('comment'); setNotice('')
    const { error } = await db.from('research_workspace_comments').insert({ workspace_id: workspace.id, user_id: userId, body: message })
    setBusy('')
    if (error) { setNotice('Comment could not be posted.'); return }
    setBody(''); await load()
  }

  return <section className={styles.shell} aria-label="Workspace collaboration">
    <header><div><span>COLLABORATION</span><strong>{activeIds.size} active now</strong></div><UsersRound aria-hidden="true" /></header>
    {isOwner ? <div className={styles.invite}><label><span className="sr-only">Member username</span><input value={username} onChange={event => setUsername(event.target.value)} placeholder="Invite by username" maxLength={32} /></label><select value={role} onChange={event => setRole(event.target.value as 'viewer' | 'editor')} aria-label="Workspace role"><option value="viewer">Can view</option><option value="editor">Can edit</option></select><button type="button" onClick={() => void invite()} disabled={!username.trim() || busy === 'invite'} aria-label="Invite member">{busy === 'invite' ? <LoaderCircle className={styles.spin} /> : <UserPlus />}</button></div> : null}
    <div className={styles.members}>
      {members.map(member => { const user = profile(member.users); return <div key={member.user_id}><span className={activeIds.has(member.user_id) ? styles.activeAvatar : ''}><MemberAvatar src={user?.avatar_url} name={user?.display_name || user?.username || 'Member'} size={28} /></span><span><strong>{user?.display_name || user?.username || 'Member'}</strong><small>{member.role}</small></span>{(isOwner || member.user_id === userId) ? <button type="button" onClick={() => void remove(member.user_id)} aria-label={`Remove ${user?.display_name || user?.username || 'member'}`}>{busy === member.user_id ? <LoaderCircle className={styles.spin} /> : <UserMinus />}</button> : null}</div>})}
      {!members.length ? <p className={styles.empty}>Invite someone to research together.</p> : null}
    </div>
    <div className={styles.thread}><div className={styles.threadTitle}><MessageCircle /> Board comments</div>{comments.map(item => { const user = profile(item.users); return <article key={item.id}><MemberAvatar src={user?.avatar_url} name={user?.display_name || user?.username || 'Member'} size={25} /><div><strong>{user?.display_name || user?.username || 'Member'}</strong><p>{item.body}</p><time>{new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div></article>})}{!comments.length ? <p className={styles.empty}>No board comments yet.</p> : null}</div>
    <div className={styles.composer}><textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Add context to this board" maxLength={2000} aria-label="Workspace comment" /><button type="button" onClick={() => void comment()} disabled={!body.trim() || busy === 'comment'}>{busy === 'comment' ? <LoaderCircle className={styles.spin} /> : <Send />}<span className="sr-only">Post comment</span></button></div>
    {notice ? <div className={styles.notice} role="status">{notice.includes('updated') ? <Check /> : null}{notice}</div> : null}
  </section>
}
