'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookmarkPlus, LoaderCircle, Send, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { ModalSurface } from '@/components/ui/ModalSurface'
import type { SlateEdgeEvidence } from '@/lib/slateEdgeEvidence'
import { SlateEdgeEvidenceCard } from './SlateEdgeEvidenceCard'
import styles from './SlateEdgeShareModal.module.css'

type Workspace = { id: string; name: string; user_id: string }

export function SlateEdgeShareModal({ evidence, onClose }: { evidence: SlateEdgeEvidence | null; onClose: () => void }) {
  const { user } = useAuth()
  const router = useRouter()
  const [note, setNote] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [busy, setBusy] = useState<'feed' | 'workspace' | ''>('')
  const [message, setMessage] = useState('')
  const db = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!evidence || !user) return
    void db.from('research_workspaces').select('id,name,user_id').order('updated_at', { ascending: false }).then(({ data }) => {
      const rows = (data ?? []) as Workspace[]
      setWorkspaces(rows)
      setWorkspaceId(current => current || rows[0]?.id || '')
    })
  }, [db, evidence, user])

  if (!evidence) return null

  async function postToFeed() {
    if (!user) { router.push('/auth/login?next=' + encodeURIComponent(evidence!.source.path)); return }
    setBusy('feed'); setMessage('')
    const { error } = await db.from('posts').insert({
      author_id: user.id,
      content: note.trim() || `Slate Edge read: ${evidence!.snapshot.name}`,
      post_type: 'analysis',
      sport: 'MLB',
      pick_data: null,
      poll_data: null,
      media_urls: [],
      attachments: [evidence],
      visibility: 'public',
      game_pk: null,
    })
    setBusy('')
    if (error) { setMessage('Could not post this read.'); return }
    setMessage('Posted to your feed.')
    router.refresh()
    window.setTimeout(onClose, 650)
  }

  async function saveToWorkspace() {
    if (!user) { router.push('/auth/login?next=/workspace'); return }
    if (!workspaceId) { setMessage('Create a Research Workspace first.'); return }
    setBusy('workspace'); setMessage('')
    const { error } = await db.from('research_workspace_items').insert({
      workspace_id: workspaceId,
      added_by: user.id,
      item_type: 'slate_edge_player',
      title: `${evidence!.snapshot.name} · ${evidence!.source.window.toUpperCase()} Slate Edge`,
      source_path: evidence!.source.path,
      payload: evidence,
    })
    setBusy('')
    if (error) { setMessage('Could not save this evidence.'); return }
    setMessage('Saved to Research Workspace.')
    router.refresh()
    window.setTimeout(onClose, 650)
  }

  return <ModalSurface open onClose={onClose} labelledBy="slate-share-title" backdropClassName={styles.backdrop} panelClassName={styles.panel}>
    <header><span><small>Structured evidence</small><h2 id="slate-share-title">Share what you saw</h2></span><button type="button" onClick={onClose} aria-label="Close"><X size={17}/></button></header>
    <SlateEdgeEvidenceCard evidence={evidence} interactive={false}/>
    <label className={styles.note}><span>Add context <small>optional</small></span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="What stood out in this read?"/></label>
    <div className={styles.destinations}>
      <section><span><Send size={15}/><b>Post to Feed</b></span><p>Followers see this exact captured read and can open its live board context.</p><button type="button" onClick={() => void postToFeed()} disabled={!!busy}>{busy === 'feed' ? <LoaderCircle className={styles.spin} size={15}/> : <Send size={15}/>}Post evidence</button></section>
      <section><span><BookmarkPlus size={15}/><b>Research Workspace</b></span><p>Keep the snapshot beside your notes and comparisons.</p>{workspaces.length ? <><select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} aria-label="Research workspace"><option value="">Choose workspace</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button type="button" onClick={() => void saveToWorkspace()} disabled={!!busy || !workspaceId}>{busy === 'workspace' ? <LoaderCircle className={styles.spin} size={15}/> : <BookmarkPlus size={15}/>}Save read</button></> : <button type="button" className={styles.createWorkspace} onClick={() => router.push('/workspace')}>Create a workspace</button>}</section>
    </div>
    {message && <p className={styles.message} role="status">{message}</p>}
  </ModalSurface>
}
