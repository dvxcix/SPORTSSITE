'use client'

import { useMemo, useState } from 'react'
import { BookmarkPlus, Check, FileText, Grid2X2, LoaderCircle, Pencil, Pin, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { WorkspaceCollaboration } from './WorkspaceCollaboration'
import styles from './ResearchWorkspaceClient.module.css'

type SavedItem = {
  id: string; sport: string; game_pk: string | null; game_date: string | null; mlb_id: number | null
  player_name: string; team: string | null; position: string | null; bats: string | null; headshot_url: string | null
  prop_key: string; prop_label: string; line: string | null; book: string | null; odds: number | null
  odds_by_book: Record<string, number> | null; notes: string | null; status: string; created_at: string; updated_at: string
}
type Matrix = { id: string; name: string; color: string | null; element_code: string | null }
type Workspace = { id: string; user_id: string; name: string; description: string; sport: string | null; watchlist_item_ids: string[]; mlb_matrix_ids: string[]; nfl_matrix_ids: string[]; created_at: string; updated_at: string }
type Note = { id: string; title: string; body: string; sport: string | null; game_id: string | null; tags: string[]; pinned: boolean; created_at: string; updated_at: string }

function displayOdds(value: number | null) { return value == null ? '—' : value > 0 ? `+${value}` : String(value) }
export function ResearchWorkspaceClient({ userId, initialItems, initialMlbMatrices, initialNflMatrices, initialWorkspaces, initialNotes }: {
  userId: string; initialItems: SavedItem[]; initialMlbMatrices: Matrix[]; initialNflMatrices: Matrix[]; initialWorkspaces: Workspace[]; initialNotes: Note[]
}) {
  const db = createClient()
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [notes, setNotes] = useState(initialNotes)
  const [activeId, setActiveId] = useState(initialWorkspaces[0]?.id ?? '')
  const [draftIds, setDraftIds] = useState<string[]>(initialWorkspaces[0]?.watchlist_item_ids?.slice(0, 4) ?? [])
  const [mlbMatrixIds, setMlbMatrixIds] = useState<string[]>(initialWorkspaces[0]?.mlb_matrix_ids ?? [])
  const [nflMatrixIds, setNflMatrixIds] = useState<string[]>(initialWorkspaces[0]?.nfl_matrix_ids ?? [])
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteSport, setNoteSport] = useState('')
  const [editingNoteId, setEditingNoteId] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const active = workspaces.find(workspace => workspace.id === activeId) ?? null
  const compared = draftIds.map(id => initialItems.find(item => item.id === id)).filter(Boolean) as SavedItem[]
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return initialItems
    return initialItems.filter(item => `${item.player_name} ${item.team ?? ''} ${item.sport} ${item.prop_label} ${item.book ?? ''}`.toLowerCase().includes(needle))
  }, [initialItems, query])

  function chooseWorkspace(workspace: Workspace) {
    setActiveId(workspace.id); setDraftIds(workspace.watchlist_item_ids.slice(0, 4)); setMlbMatrixIds(workspace.mlb_matrix_ids); setNflMatrixIds(workspace.nfl_matrix_ids); setMessage('')
  }
  function toggleCompare(id: string) {
    setMessage('')
    setDraftIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 4 ? [...current, id] : current)
    if (!draftIds.includes(id) && draftIds.length >= 4) setMessage('Compare Tray holds four markets. Remove one before adding another.')
  }
  function toggleMatrix(kind: 'mlb' | 'nfl', id: string) {
    const set = kind === 'mlb' ? setMlbMatrixIds : setNflMatrixIds
    set(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  }
  async function createWorkspace() {
    const name = newName.trim()
    if (!name) return
    setBusy('create'); setMessage('')
    const { data, error } = await db.from('research_workspaces').insert({ user_id: userId, name, sport: 'MULTI', watchlist_item_ids: draftIds, mlb_matrix_ids: mlbMatrixIds, nfl_matrix_ids: nflMatrixIds }).select('id,user_id,name,description,sport,watchlist_item_ids,mlb_matrix_ids,nfl_matrix_ids,created_at,updated_at').single()
    setBusy('')
    if (error) { setMessage(error.code === '23505' ? 'A workspace with that name already exists.' : 'Workspace could not be created.'); return }
    setWorkspaces(current => [data, ...current]); setActiveId(data.id); setNewName(''); setMessage('Workspace created.')
  }
  async function saveWorkspace() {
    if (!active) { setMessage('Create a workspace to save this tray.'); return }
    setBusy('save'); setMessage('')
    const before = workspaces
    setWorkspaces(current => current.map(workspace => workspace.id === active.id ? { ...workspace, watchlist_item_ids: draftIds, mlb_matrix_ids: mlbMatrixIds, nfl_matrix_ids: nflMatrixIds, updated_at: new Date().toISOString() } : workspace))
    const { error } = await db.rpc('save_research_workspace_board', { p_workspace_id: active.id, p_watchlist_item_ids: draftIds, p_mlb_matrix_ids: mlbMatrixIds, p_nfl_matrix_ids: nflMatrixIds })
    setBusy('')
    if (error) { setWorkspaces(before); setMessage('Changes could not be saved.'); return }
    setMessage('Workspace saved.')
  }
  async function deleteWorkspace() {
    if (!active) return
    setBusy('delete'); setMessage('')
    const { error } = await db.from('research_workspaces').delete().eq('id', active.id).eq('user_id', userId)
    setBusy('')
    if (error) { setMessage('Workspace could not be deleted.'); return }
    const remaining = workspaces.filter(workspace => workspace.id !== active.id)
    setWorkspaces(remaining); setActiveId(remaining[0]?.id ?? ''); setDraftIds(remaining[0]?.watchlist_item_ids?.slice(0, 4) ?? []); setMlbMatrixIds(remaining[0]?.mlb_matrix_ids ?? []); setNflMatrixIds(remaining[0]?.nfl_matrix_ids ?? []); setMessage('Workspace deleted.')
  }
  async function addNote() {
    const title = noteTitle.trim()
    if (!title) return
    setBusy('note'); setMessage('')
    const gameId = compared.length === 1 ? compared[0].game_pk : null
    const { data, error } = await db.from('research_notes').insert({ user_id: userId, title, body: noteBody.trim(), sport: noteSport || null, game_id: gameId, tags: [] }).select('id,title,body,sport,game_id,tags,pinned,created_at,updated_at').single()
    setBusy('')
    if (error) { setMessage('Note could not be saved.'); return }
    setNotes(current => [data, ...current]); setNoteTitle(''); setNoteBody(''); setMessage('Note saved.')
  }
  async function togglePin(note: Note) {
    setNotes(current => current.map(item => item.id === note.id ? { ...item, pinned: !item.pinned } : item).sort((a, b) => Number(b.pinned) - Number(a.pinned)))
    const { error } = await db.from('research_notes').update({ pinned: !note.pinned }).eq('id', note.id).eq('user_id', userId)
    if (error) setNotes(current => current.map(item => item.id === note.id ? note : item))
  }
  function editNote(note: Note) { setEditingNoteId(note.id); setEditTitle(note.title); setEditBody(note.body); setMessage('') }
  async function saveNote(note: Note) {
    const title = editTitle.trim()
    if (!title) return
    setBusy(`edit-${note.id}`)
    const before = notes
    const updated = { ...note, title, body: editBody.trim(), updated_at: new Date().toISOString() }
    setNotes(current => current.map(item => item.id === note.id ? updated : item))
    const { error } = await db.from('research_notes').update({ title, body: editBody.trim() }).eq('id', note.id).eq('user_id', userId)
    setBusy('')
    if (error) { setNotes(before); setMessage('Note changes could not be saved.'); return }
    setEditingNoteId(''); setMessage('Note updated.')
  }
  async function deleteNote(note: Note) {
    const before = notes; setNotes(current => current.filter(item => item.id !== note.id))
    const { error } = await db.from('research_notes').delete().eq('id', note.id).eq('user_id', userId)
    if (error) { setNotes(before); setMessage('Note could not be deleted.') }
  }

  return <div className={styles.layout}>
    <aside className={styles.sidebar}>
      <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Saved views</span><h2>Workspaces</h2></div><Grid2X2 size={18}/></div>
      <div className={styles.createRow}><input value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createWorkspace() }} placeholder="Workspace name" maxLength={64} aria-label="New workspace name"/><button type="button" onClick={() => void createWorkspace()} disabled={!newName.trim() || busy === 'create'} aria-label="Create workspace">{busy === 'create' ? <LoaderCircle className={styles.spin} size={16}/> : <Plus size={16}/>}</button></div>
      <div className={styles.workspaceList}>{workspaces.map(workspace => <button type="button" key={workspace.id} className={workspace.id === activeId ? styles.workspaceActive : styles.workspaceButton} onClick={() => chooseWorkspace(workspace)}><span>{workspace.name}</span><small>{workspace.watchlist_item_ids.length} compared{workspace.user_id !== userId ? ' · shared' : ''}</small></button>)}{!workspaces.length && <div className={styles.emptyMini}>Build your first saved research view.</div>}</div>
      <div className={styles.matrixSection}><span className={styles.eyebrow}>Attached Matrices</span>{initialMlbMatrices.map(matrix => <MatrixToggle key={matrix.id} matrix={matrix} checked={mlbMatrixIds.includes(matrix.id)} onClick={() => toggleMatrix('mlb', matrix.id)} sport="MLB"/>)}{initialNflMatrices.map(matrix => <MatrixToggle key={matrix.id} matrix={matrix} checked={nflMatrixIds.includes(matrix.id)} onClick={() => toggleMatrix('nfl', matrix.id)} sport="NFL"/>)}{!initialMlbMatrices.length && !initialNflMatrices.length && <div className={styles.emptyMini}>Your MLB and NFL Matrices will appear here.</div>}</div>
    </aside>

    <div className={styles.main}>
      <section className={styles.comparePanel}>
        <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Up to four saved markets</span><h2>Compare Tray</h2></div><div className={styles.headerActions}><span>{compared.length}/4</span><button type="button" onClick={() => void saveWorkspace()} disabled={busy === 'save'}>{busy === 'save' ? <LoaderCircle className={styles.spin} size={15}/> : <Save size={15}/>}Save</button>{active?.user_id === userId && <button className={styles.dangerButton} type="button" onClick={() => void deleteWorkspace()} disabled={busy === 'delete'} aria-label="Delete workspace"><Trash2 size={15}/></button>}</div></div>
        {compared.length ? <div className={styles.compareGrid}>{compared.map(item => <article className={styles.compareCard} key={item.id}><button className={styles.remove} type="button" onClick={() => toggleCompare(item.id)} aria-label={`Remove ${item.player_name}`}><X size={14}/></button><div className={styles.player}><PlayerAvatar headshot={item.headshot_url} teamAbbr={item.team} name={item.player_name} size={42}/><div><strong>{item.player_name}</strong><span>{item.team ?? '—'} · {item.position ?? item.sport}</span></div></div><div className={styles.market}>{item.prop_label}</div><div className={styles.metrics}><span><small>Line</small><b>{item.line || '—'}</b></span><span><small>Odds</small><b>{displayOdds(item.odds)}</b></span><span><small>Book</small><b>{item.book || '—'}</b></span></div>{item.notes && <p className={styles.itemNote}>{item.notes}</p>}</article>)}</div> : <div className={styles.emptyTray}><BookmarkPlus size={25}/><strong>Add saved markets to compare</strong><span>Select items from the library below.</span></div>}
      </section>

      <section className={styles.libraryPanel}>
        <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Watchlist library</span><h2>Saved markets</h2></div><label className={styles.search}><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search players or markets" aria-label="Search saved markets"/></label></div>
        <div className={styles.itemList}>{filteredItems.map(item => { const selected = draftIds.includes(item.id); return <button type="button" key={item.id} className={selected ? styles.itemSelected : styles.itemButton} onClick={() => toggleCompare(item.id)} aria-pressed={selected}><PlayerAvatar headshot={item.headshot_url} teamAbbr={item.team} name={item.player_name} size={34}/><span className={styles.itemIdentity}><strong>{item.player_name}</strong><small>{item.sport} · {item.team ?? '—'} · {item.prop_label}</small></span><span className={styles.itemPrice}>{item.line || displayOdds(item.odds)}</span><span className={styles.selectMark}>{selected ? <Check size={14}/> : <Plus size={14}/>}</span></button> })}{!filteredItems.length && <div className={styles.emptyMini}>No saved markets match this search.</div>}</div>
      </section>
    </div>

    <aside className={styles.notesPanel}>
      {active ? <WorkspaceCollaboration workspace={active} userId={userId} /> : null}
      <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Private</span><h2>Notebook</h2></div><FileText size={18}/></div>
      <div className={styles.noteComposer}><input value={noteTitle} onChange={event => setNoteTitle(event.target.value)} placeholder="Note title" maxLength={100} aria-label="Note title"/><textarea value={noteBody} onChange={event => setNoteBody(event.target.value)} placeholder="Capture the read…" maxLength={10000} aria-label="Note body"/><div><select value={noteSport} onChange={event => setNoteSport(event.target.value)} aria-label="Note sport"><option value="">Any sport</option><option value="MLB">MLB</option><option value="NFL">NFL</option></select><button type="button" onClick={() => void addNote()} disabled={!noteTitle.trim() || busy === 'note'}>{busy === 'note' ? <LoaderCircle className={styles.spin} size={15}/> : <Plus size={15}/>}Add</button></div></div>
      <div className={styles.notesList}>{notes.map(note => <article className={styles.noteCard} key={note.id}>{editingNoteId === note.id ? <div className={styles.noteEditor}><input value={editTitle} onChange={event => setEditTitle(event.target.value)} maxLength={100} aria-label="Edit note title"/><textarea value={editBody} onChange={event => setEditBody(event.target.value)} maxLength={10000} aria-label="Edit note body"/><div><button type="button" onClick={() => setEditingNoteId('')}>Cancel</button><button type="button" onClick={() => void saveNote(note)} disabled={!editTitle.trim() || busy === `edit-${note.id}`}>{busy === `edit-${note.id}` ? <LoaderCircle className={styles.spin} size={14}/> : <Save size={14}/>}Save</button></div></div> : <><div className={styles.noteTop}><div><strong>{note.title}</strong>{note.sport && <span>{note.sport}</span>}</div><div><button type="button" onClick={() => editNote(note)} aria-label="Edit note"><Pencil size={14}/></button><button type="button" onClick={() => void togglePin(note)} className={note.pinned ? styles.pinned : ''} aria-label={note.pinned ? 'Unpin note' : 'Pin note'}><Pin size={14}/></button><button type="button" onClick={() => void deleteNote(note)} aria-label="Delete note"><Trash2 size={14}/></button></div></div>{note.body && <p>{note.body}</p>}<time>{new Date(note.updated_at).toLocaleDateString()}</time></>}</article>)}{!notes.length && <div className={styles.emptyMini}>Your private research notes will stay here.</div>}</div>
      {message && <div className={styles.message} role="status">{message}</div>}
    </aside>
  </div>
}

function MatrixToggle({ matrix, checked, onClick, sport }: { matrix: Matrix; checked: boolean; onClick: () => void; sport: string }) {
  return <button type="button" className={checked ? styles.matrixActive : styles.matrixButton} onClick={onClick} aria-pressed={checked}><span className={styles.matrixDot} style={{ background: matrix.color || '#a7ff3f' }}/><span><strong>{matrix.name}</strong><small>{sport}{matrix.element_code ? ` · ${matrix.element_code}` : ''}</small></span>{checked && <Check size={14}/>}</button>
}
