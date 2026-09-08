'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Copy, Grid3X3, Plus, Share2, SlidersHorizontal, Trash2, X } from 'lucide-react'
import {
  NFL_MATRIX_BOOKS,
  NFL_MATRIX_FIELDS,
  NFL_MATRIX_PROP_TYPES,
  type NflMatrix,
  type NflMatrixCategory,
  type NflMatrixDefinition,
  type NflMatrixFactor,
  type NflMatrixPipelineStep,
} from '@/lib/nflMatrix'
import styles from './nflMatrix.module.css'

type Listing = { id: string; title: string; description: string; color: string; matrix_type: 'classic' | 'pipeline'; snapshot: NflMatrix; copy_count: number }
type EditorState = { matrix: NflMatrix | null } | null

const COLORS = ['#a7ff3f', '#35d7ff', '#ffbd45', '#ff667e', '#a78bfa', '#4de2a1']
const WINDOWS = ['season', 'l1', 'l3', 'l5', 'l10'] as const

function uid() { return `nfl-${Math.random().toString(36).slice(2, 9)}` }
function newFactor(): NflMatrixFactor {
  return { id: uid(), category: 'score', field: 'index', operator: 'gte', value: 60, window: 'season', vendor: null, propType: null, marketValue: null }
}
function newStep(): NflMatrixPipelineStep {
  return { ...newFactor(), kind: 'filter', join: 'and', direction: 'highest', scope: 'team', keep: 1 }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Request failed.')
  return payload as T
}

function FactorEditor({ factor, pipeline, onChange, onRemove }: {
  factor: NflMatrixFactor | NflMatrixPipelineStep
  pipeline: boolean
  onChange: (factor: NflMatrixFactor | NflMatrixPipelineStep) => void
  onRemove: () => void
}) {
  const fields = useMemo(() => NFL_MATRIX_FIELDS.filter(item => item.category === factor.category), [factor.category])
  const step = factor as NflMatrixPipelineStep
  const setCategory = (category: NflMatrixCategory) => {
    const first = NFL_MATRIX_FIELDS.find(item => item.category === category)
    const isMarket = category === 'market'
    const isPicks = category === 'picks'
    onChange({ ...factor, category, field: isMarket ? 'market' : isPicks ? 'public_picks' : first?.field ?? 'index', vendor: isMarket ? 'fanduel' : null, propType: isMarket || isPicks ? 'anytime_td' : null, marketValue: isMarket ? 'current' : null })
  }
  return (
    <article className={styles.factor}>
      <div className={styles.factorTop}>
        {pipeline ? <select value={step.kind} onChange={event => onChange({ ...step, kind: event.target.value as 'filter' | 'rank' })}><option value="filter">Filter</option><option value="rank">Rank</option></select> : null}
        <select value={factor.category} onChange={event => setCategory(event.target.value as NflMatrixCategory)}>
          <option value="score">SlipSurge score</option><option value="usage">Usage</option><option value="tracking">NFL tracking</option><option value="team">Team context</option><option value="baseline">TD baseline</option><option value="market">Sportsbook market</option><option value="picks">Pikkit public picks</option>
        </select>
        <button type="button" onClick={onRemove} aria-label="Remove condition"><Trash2 size={14} /></button>
      </div>
      {factor.category === 'market' ? (
        <div className={styles.factorGrid}>
          <select value={factor.propType ?? 'anytime_td'} onChange={event => onChange({ ...factor, propType: event.target.value })}>{NFL_MATRIX_PROP_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <select value={factor.vendor ?? 'fanduel'} onChange={event => onChange({ ...factor, vendor: event.target.value })}>{NFL_MATRIX_BOOKS.map(book => <option value={book} key={book}>{book}</option>)}</select>
          <select value={factor.marketValue ?? 'current'} onChange={event => onChange({ ...factor, marketValue: event.target.value as NflMatrixFactor['marketValue'] })}><option value="current">Current odds</option><option value="opening">Opening odds</option><option value="move">Current − open</option><option value="line">Prop line</option></select>
        </div>
      ) : factor.category === 'picks' ? (
        <div className={styles.factorGrid}>
          <select value={factor.propType ?? 'anytime_td'} onChange={event => onChange({ ...factor, propType: event.target.value })}>{NFL_MATRIX_PROP_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <span className={styles.fixedContext}>Pikkit picks at selected Market Story capture</span>
        </div>
      ) : (
        <div className={styles.factorGrid}>
          <select value={factor.field} onChange={event => onChange({ ...factor, field: event.target.value })}>{fields.map(field => <option value={field.field} key={field.field}>{field.label}</option>)}</select>
          {!['team', 'baseline'].includes(factor.category) ? <select value={factor.window} onChange={event => onChange({ ...factor, window: event.target.value as NflMatrixFactor['window'] })}>{WINDOWS.map(window => <option value={window} key={window}>{window === 'season' ? 'Season' : window.toUpperCase()}</option>)}</select> : <span className={styles.fixedContext}>Current game context</span>}
        </div>
      )}
      {pipeline && step.kind === 'rank' ? (
        <div className={styles.conditionRow}><span>Keep</span><input type="number" min={1} max={20} value={step.keep} onChange={event => onChange({ ...step, keep: Number(event.target.value) })} /><select value={step.direction} onChange={event => onChange({ ...step, direction: event.target.value as 'highest' | 'lowest' })}><option value="highest">highest</option><option value="lowest">lowest</option></select><select value={step.scope} onChange={event => onChange({ ...step, scope: event.target.value as 'team' | 'game' })}><option value="team">per team</option><option value="game">in game</option></select></div>
      ) : (
        <div className={styles.conditionRow}>
          {pipeline ? <select value={step.join} onChange={event => onChange({ ...step, join: event.target.value as 'and' | 'or' })}><option value="and">AND</option><option value="or">OR</option></select> : null}
          <select value={factor.operator} onChange={event => onChange({ ...factor, operator: event.target.value as NflMatrixFactor['operator'] })}><option value="gte">At least</option><option value="lte">At most</option><option value="eq">Exactly</option><option value="up">Moved up</option><option value="down">Moved down</option><option value="flat">Stayed flat</option><option value="is_available">Is posted</option></select>
          {['gte', 'lte', 'eq'].includes(factor.operator) ? <input type="number" step="any" value={factor.value ?? ''} onChange={event => onChange({ ...factor, value: event.target.value === '' ? null : Number(event.target.value) })} placeholder="Value" /> : null}
        </div>
      )}
    </article>
  )
}

function MatrixEditor({ initial, onClose, onSaved }: { initial: NflMatrix | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? COLORS[0])
  const [type, setType] = useState<'classic' | 'pipeline'>(initial?.matrix_type ?? 'classic')
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(initial?.match_mode ?? 'all')
  const [factors, setFactors] = useState<NflMatrixFactor[]>(initial?.definition.factors ?? [newFactor()])
  const [steps, setSteps] = useState<NflMatrixPipelineStep[]>(initial?.definition.steps ?? [newStep()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const rows = type === 'classic' ? factors : steps
  const save = async () => {
    setSaving(true); setError('')
    const definition: NflMatrixDefinition = type === 'classic' ? { factors } : { steps }
    try {
      await request(initial ? `/api/nfl-matrices/${initial.id}` : '/api/nfl-matrices', { method: initial ? 'PATCH' : 'POST', body: JSON.stringify({ name, color, matrix_type: type, match_mode: matchMode, match_any_count: 1, pipeline_scope: 'team', definition }) })
      window.dispatchEvent(new Event('ss:nfl-matrices-updated'))
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save.') } finally { setSaving(false) }
  }
  return (
    <div className={styles.backdrop} onMouseDown={event => { if (event.currentTarget === event.target) onClose() }}>
      <section className={styles.editor} role="dialog" aria-modal="true" aria-label="NFL Matrix editor">
        <header><div><small>NFL ONLY</small><h2>{initial ? 'Edit NFL Matrix' : 'Build NFL Matrix'}</h2><p>Uses Sideline fields only. It can never highlight an MLB board.</p></div><button onClick={onClose}><X size={18} /> Close</button></header>
        <div className={styles.editorBody}>
          <label className={styles.nameField}><span>Name</span><input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Red-zone role + ATD value" /></label>
          <div className={styles.editorOptions}><div><span>Color</span>{COLORS.map(option => <button type="button" aria-label={`Use ${option}`} key={option} className={color === option ? styles.colorActive : ''} style={{ background: option }} onClick={() => setColor(option)} />)}</div><div><button type="button" className={type === 'classic' ? styles.active : ''} onClick={() => setType('classic')}>Classic</button><button type="button" className={type === 'pipeline' ? styles.active : ''} onClick={() => setType('pipeline')}>Pipeline</button></div></div>
          {type === 'classic' ? <div className={styles.matchMode}><span>Match</span><button type="button" className={matchMode === 'all' ? styles.active : ''} onClick={() => setMatchMode('all')}>ALL conditions</button><button type="button" className={matchMode === 'any' ? styles.active : ''} onClick={() => setMatchMode('any')}>ANY condition</button></div> : <p className={styles.pipelineHelp}>Pipeline steps run top-to-bottom. Filter the pool, then rank within each team or across the game.</p>}
          <div className={styles.factorList}>{rows.map((row, index) => <FactorEditor key={row.id} factor={row} pipeline={type === 'pipeline'} onChange={next => type === 'classic' ? setFactors(current => current.map((item, itemIndex) => itemIndex === index ? next as NflMatrixFactor : item)) : setSteps(current => current.map((item, itemIndex) => itemIndex === index ? next as NflMatrixPipelineStep : item))} onRemove={() => type === 'classic' ? setFactors(current => current.filter((_, itemIndex) => itemIndex !== index)) : setSteps(current => current.filter((_, itemIndex) => itemIndex !== index))} />)}</div>
          <button type="button" className={styles.addCondition} onClick={() => type === 'classic' ? setFactors(current => [...current, newFactor()]) : setSteps(current => [...current, newStep()])}><Plus size={14} /> Add {type === 'classic' ? 'condition' : 'step'}</button>
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className={styles.save} disabled={saving || !name.trim() || !rows.length} onClick={save}>{saving ? 'Saving…' : 'Save NFL Matrix'}</button></footer>
      </section>
    </div>
  )
}

export function NflMatrixButton() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'mine' | 'community'>('mine')
  const [matrices, setMatrices] = useState<NflMatrix[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [editor, setEditor] = useState<EditorState>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const refresh = useCallback(async () => {
    try { setMatrices((await request<{ matrices: NflMatrix[] }>('/api/nfl-matrices')).matrices) } catch { setMatrices([]) }
  }, [])
  const refreshCommunity = useCallback(async () => {
    try { setListings((await request<{ listings: Listing[] }>('/api/nfl-matrix-marketplace')).listings) } catch { setListings([]) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => void refreshCommunity(), 0)
    return () => window.clearTimeout(timer)
  }, [open, refreshCommunity])
  const mutate = async (label: string, task: () => Promise<unknown>) => {
    setBusy(label); setMessage('')
    try { await task(); await refresh(); window.dispatchEvent(new Event('ss:nfl-matrices-updated')); setMessage('Done.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Request failed.') } finally { setBusy('') }
  }
  return (
    <>
      <button type="button" className={`matrix-fab ${styles.fab}`} onClick={() => setOpen(true)}><Grid3X3 size={15} /> NFL Matrix{matrices.length ? <span>{matrices.length}</span> : null}</button>
      {open ? <div className={styles.backdrop} onMouseDown={event => { if (event.currentTarget === event.target) setOpen(false) }}><section className={styles.drawer} role="dialog" aria-modal="true" aria-label="NFL Matrices">
        <header><div><small>THE SIDELINE</small><h2>NFL Matrices</h2><p>Separate criteria, codes, and community posts from MLB.</p></div><button onClick={() => setOpen(false)}><X size={18} /></button></header>
        <nav><button className={tab === 'mine' ? styles.active : ''} onClick={() => setTab('mine')}>My NFL Matrices</button><button className={tab === 'community' ? styles.active : ''} onClick={() => setTab('community')}>NFL Community</button></nav>
        <div className={styles.drawerBody}>
          {tab === 'mine' ? <>
            <button className={styles.newMatrix} onClick={() => setEditor({ matrix: null })}><Plus size={15} /> New NFL Matrix</button>
            <div className={styles.matrixList}>{matrices.map(matrix => <article key={matrix.id} style={{ '--matrix-color': matrix.color } as React.CSSProperties}><header><i /><div><b>{matrix.name}</b><small>{matrix.matrix_type === 'pipeline' ? `${matrix.definition.steps?.length ?? 0} pipeline steps` : `${matrix.definition.factors?.length ?? 0} conditions`} · NFL only</small></div><button title={matrix.enabled ? 'Turn off' : 'Turn on'} onClick={() => mutate(matrix.id, () => request(`/api/nfl-matrices/${matrix.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !matrix.enabled }) }))}>{matrix.enabled ? <Check size={14} /> : <X size={14} />}</button></header><footer><button onClick={() => navigator.clipboard.writeText(matrix.element_code)}><Copy size={12} /> {matrix.element_code}</button><button onClick={() => setEditor({ matrix })}><SlidersHorizontal size={12} /> Edit</button><button onClick={() => mutate(`publish-${matrix.id}`, () => request('/api/nfl-matrix-marketplace', { method: 'POST', body: JSON.stringify({ matrix_id: matrix.id }) }))}><Share2 size={12} /> Publish</button><button onClick={() => mutate(`delete-${matrix.id}`, () => request(`/api/nfl-matrices/${matrix.id}`, { method: 'DELETE' }))}><Trash2 size={12} /></button></footer></article>)}</div>
            {!matrices.length ? <div className={styles.emptyState}><Grid3X3 size={26} /><b>No NFL Matrices yet</b><span>Create one from NFL scores, usage, tracking, team context, or any posted player market.</span></div> : null}
            <div className={styles.importBox}><label><Clipboard size={14} /> Import NFL Element Code</label><div><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="NFL-XXXXXXXX" /><button disabled={!code.trim() || busy === 'import'} onClick={() => mutate('import', () => request('/api/nfl-matrices/import', { method: 'POST', body: JSON.stringify({ element_code: code }) }))}>Import</button></div></div>
          </> : <div className={styles.matrixList}>{listings.map(listing => <article key={listing.id} style={{ '--matrix-color': listing.color } as React.CSSProperties}><header><i /><div><b>{listing.title}</b><small>{listing.matrix_type} · {listing.copy_count} adds</small></div></header>{listing.description ? <p>{listing.description}</p> : null}<footer><button onClick={() => mutate(`community-${listing.id}`, () => request(`/api/nfl-matrix-marketplace/${listing.id}/import`, { method: 'POST' }))}><Plus size={12} /> Add to NFL Matrices</button></footer></article>)}{!listings.length ? <div className={styles.emptyState}><Share2 size={26} /><b>No NFL community posts yet</b><span>Publish one of your NFL Matrices from the My NFL Matrices tab.</span></div> : null}</div>}
          {message ? <div className={styles.message}>{message}</div> : null}
        </div>
      </section></div> : null}
      {editor ? <MatrixEditor initial={editor.matrix} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void refresh() }} /> : null}
    </>
  )
}
