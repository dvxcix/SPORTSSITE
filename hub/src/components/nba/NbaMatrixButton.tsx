'use client'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'

import { useCallback, useEffect, useState } from 'react'
import { Check, Clipboard, Copy, Grid3X3, Plus, Share2, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { ModalSurface } from '@/components/ui/ModalSurface'
import {
  NBA_MATRIX_BOOKS,
  NBA_MATRIX_FIELDS,
  NBA_MATRIX_PROP_TYPES,
  type NbaMatrix,
  type NbaMatrixCategory,
  type NbaMatrixDefinition,
  type NbaMatrixFactor,
  type NbaMatrixPipelineStep,
} from '@/lib/nbaMatrix'
import styles from '@/components/sideline/nflMatrix.module.css'
import extra from './nbaMatrix.module.css'
import { nbaFirstMarket } from '@/lib/nbaFirstBasketMarkets'
import { nbaTrackingField } from '@/lib/nbaTracking'
import { PAINT_MARKETS } from '@/lib/nbaPaint'

type Listing = { id: string; title: string; description: string; color: string; matrix_type: 'classic' | 'pipeline'; snapshot: NbaMatrix; copy_count: number }
type EditorState = { matrix: NbaMatrix | null } | null

const COLORS = ['#a7ff3f', '#35d7ff', '#ffbd45', '#ff667e', '#a78bfa', '#4de2a1']
const WINDOWS = ['season', 'l1', 'l3', 'l5', 'l10', 'l20'] as const

function uid() { return `nba-${Math.random().toString(36).slice(2, 9)}` }
function newFactor(): NbaMatrixFactor {
  return { id: uid(), category: 'score', field: 'index', operator: 'gte', value: 60, window: 'season', vendor: 'fanduel', propType: 'points', marketValue: null, marketKind: 'milestone', marketSide: 'over', marketLine: 15, location: 'all' }
}
function newStep(): NbaMatrixPipelineStep {
  return { ...newFactor(), kind: 'filter', join: 'and', direction: 'highest', scope: 'team', keep: 1 }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Request failed.')
  return payload as T
}

function FactorEditor({ factor, pipeline, onChange, onRemove, trackingFields }: {
  factor: NbaMatrixFactor | NbaMatrixPipelineStep; pipeline: boolean
  onChange: (factor: NbaMatrixFactor | NbaMatrixPipelineStep) => void; onRemove: () => void; trackingFields: string[]
}) {
  const fields = factor.category === 'tracking'
    ? [...new Set([...NBA_MATRIX_FIELDS.filter(f => f.category === 'tracking').map(f => f.field), ...trackingFields, factor.field])].map(field => ({ field, label: nbaTrackingField(field).label }))
    : NBA_MATRIX_FIELDS.filter(f => f.category === factor.category)
  const step = factor as NbaMatrixPipelineStep
  const isGroup = pipeline && step.kind === 'group'
  const isFirst = !!nbaFirstMarket(factor.propType ?? '')
  const contracts = ['market', 'score'].includes(factor.category)
  const setCategory = (category: NbaMatrixCategory) => onChange({ ...factor, category, field: category === 'market' ? 'market' : category === 'picks' ? 'public_picks' : NBA_MATRIX_FIELDS.find(f => f.category === category)?.field ?? 'index', propType: 'points', vendor: 'fanduel', window: category === 'tracking' ? 'l10' : factor.window, marketKind: 'milestone', marketSide: 'over', marketLine: 15, marketValue: category === 'market' ? 'probability_move' : null })
  const setMarket = (propType: string) => onChange({ ...factor, propType, marketLine: nbaFirstMarket(propType) ? .5 : null, marketKind: nbaFirstMarket(propType) ? 'over_under' : 'milestone', marketSide: 'over' })
  return <article className={styles.factor}>
    <div className={styles.factorTop}>
      {pipeline && <select aria-label="Pipeline step type" value={step.kind} onChange={e => onChange({ ...step, kind: e.target.value as NbaMatrixPipelineStep['kind'] })}><option value="filter">Filter</option><option value="rank">Rank</option><option value="group">Group</option><option value="unless">Unless</option></select>}
      {!isGroup && <select aria-label="Condition category" value={factor.category} onChange={e => setCategory(e.target.value as NbaMatrixCategory)}><option value="score">SlipSurge</option><option value="stats">Player stats</option><option value="tracking">Game tracking</option><option value="team">Team context</option><option value="market">Odds & movement</option><option value="picks">Public picks</option></select>}
      <button type="button" onClick={onRemove} aria-label="Remove condition"><Trash2 size={14}/></button>
    </div>
    {isGroup ? <select aria-label="Group pool" value={step.scope} onChange={e => onChange({ ...step, scope: e.target.value as 'team' | 'game' })}><option value="team">Group by team</option><option value="game">Group by game</option></select> : <>
      {!['market','picks'].includes(factor.category) && <div className={styles.factorGrid}><select aria-label="Condition field" value={factor.field} onChange={e => onChange({ ...factor, field: e.target.value })}>{fields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}</select>
        {['stats','tracking'].includes(factor.category) && <><select aria-label="Stat window" value={factor.window} onChange={e => onChange({ ...factor, window: e.target.value as NbaMatrixFactor['window'] })}>{WINDOWS.filter(w => factor.category !== 'tracking' || w !== 'season').map(w => <option key={w} value={w}>{w === 'season' ? 'Season' : w.toUpperCase()}</option>)}</select><select aria-label="Home away split" value={factor.location ?? 'all'} onChange={e => onChange({ ...factor, location: e.target.value as 'all' | 'home' | 'away' })}><option value="all">All games</option><option value="home">Home</option><option value="away">Away</option></select></>}
      </div>}
      {(contracts || factor.category === 'picks') && <div className={styles.factorGrid}>
        <select aria-label="NBA market" value={factor.propType ?? 'points'} onChange={e => setMarket(e.target.value)}>{NBA_MATRIX_PROP_TYPES.filter(([key]) => factor.category === 'market' || PAINT_MARKETS.some(m => m.key === key && !key.endsWith('first3min'))).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
        {contracts && <select aria-label="Sportsbook" value={factor.vendor ?? ''} onChange={e => onChange({ ...factor, vendor: e.target.value || null })}><option value="">Best available</option>{NBA_MATRIX_BOOKS.map(b => <option key={b} value={b}>{b}</option>)}</select>}
        {factor.category === 'market' && <select aria-label="Market value" value={factor.marketValue ?? 'probability_move'} onChange={e => onChange({ ...factor, marketValue: e.target.value as NbaMatrixFactor['marketValue'] })}><option value="probability_move">Movement · probability pp</option><option value="current">Current American odds</option><option value="opening">Opening American odds</option><option value="move">American odds change</option><option value="probability">Implied probability %</option><option value="line">Target line</option>{!isFirst && !factor.propType?.endsWith('first3min') && <option value="hit_rate">Hit rate %</option>}</select>}
      </div>}
      {contracts && <div className={styles.factorGrid}>
        {!isFirst && <><select aria-label="Contract type" value={factor.marketKind ?? 'milestone'} onChange={e => onChange({ ...factor, marketKind: e.target.value as 'milestone' | 'over_under', marketSide: 'over', marketLine: null })}><option value="milestone">Milestone · N+</option><option value="over_under">Over / under</option></select><label>Exact target<input aria-label="Exact market threshold" type="number" min="0" step="any" placeholder="Balanced target" value={factor.marketLine ?? ''} onChange={e => onChange({ ...factor, marketLine: e.target.value === '' ? null : Number(e.target.value) })}/></label></>}
        {(isFirst || factor.marketKind === 'over_under') && <select aria-label="Market side" value={factor.marketSide ?? 'over'} onChange={e => onChange({ ...factor, marketSide: e.target.value as 'over' | 'under' })}><option value="over">{isFirst ? 'Yes' : 'Over'}</option><option value="under">{isFirst ? 'No' : 'Under'}</option></select>}
        {factor.marketValue === 'hit_rate' && <select aria-label="Hit rate window" value={factor.window} onChange={e => onChange({ ...factor, window: e.target.value as NbaMatrixFactor['window'] })}>{WINDOWS.map(w => <option key={w} value={w}>{w === 'season' ? 'Season' : w.toUpperCase()}</option>)}</select>}
      </div>}
      {pipeline && step.kind === 'rank' ? <div className={`${styles.conditionRow} ${extra.rankRow}`}><span>Keep</span><input aria-label="Number of ranked players to keep" type="number" min={1} max={50} value={step.keep} onChange={e => onChange({ ...step, keep: Number(e.target.value) })}/><select aria-label="Rank direction" value={step.direction} onChange={e => onChange({ ...step, direction: e.target.value as 'highest' | 'lowest' })}><option value="highest">{factor.marketValue === 'probability_move' ? 'Most shortened' : 'Highest'}</option><option value="lowest">{factor.marketValue === 'probability_move' ? 'Most lengthened' : 'Lowest'}</option></select><select aria-label="Rank scope" value={step.scope} onChange={e => onChange({ ...step, scope: e.target.value as 'team' | 'game' })}><option value="team">Per team</option><option value="game">In game</option></select></div> : <div className={styles.conditionRow}>
        {pipeline && step.kind === 'filter' && <select aria-label="Condition join" value={step.join} onChange={e => onChange({ ...step, join: e.target.value as 'and' | 'or' })}><option value="and">AND</option><option value="or">OR</option></select>}
        {pipeline && step.kind === 'unless' && <select aria-label="Unless scope" value={step.scope} onChange={e => onChange({ ...step, scope: e.target.value as 'team' | 'game' })}><option value="team">Skip team when any player</option><option value="game">Skip game when any player</option></select>}
        <select aria-label="Condition operator" value={factor.operator} onChange={e => onChange({ ...factor, operator: e.target.value as NbaMatrixFactor['operator'] })}><option value="gte">At least</option><option value="lte">At most</option><option value="eq">Exactly</option><option value="up">{factor.marketValue === 'probability_move' ? 'Shortened' : 'Positive'}</option><option value="down">{factor.marketValue === 'probability_move' ? 'Lengthened' : 'Negative'}</option><option value="flat">Zero</option><option value="is_available">Available</option></select>
        {['gte','lte','eq'].includes(factor.operator) && <input aria-label="Condition value" type="number" step="any" value={factor.value ?? ''} onChange={e => onChange({ ...factor, value: e.target.value === '' ? null : Number(e.target.value) })}/>}
      </div>}
    </>}
  </article>
}

function MatrixEditor({ initial, onClose, onSaved, gameId }: { initial: NbaMatrix | null; onClose: () => void; onSaved: () => void; gameId?: number }) {
  const oddsMode = useNbaOddsMode()
  const [trackingFields, setTrackingFields] = useState<string[]>([])
  useEffect(() => { if (!gameId) return; const abort = new AbortController(); void fetch(nbaModeHref('/the-paint/tracking?game='+gameId, oddsMode), {signal:abort.signal}).then(r=>r.ok?r.json():null).then(r=>{if(r?.fields)setTrackingFields(r.fields)}).catch(()=>{}); return()=>abort.abort() },[oddsMode, gameId])
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? COLORS[0])
  const [type, setType] = useState<'classic' | 'pipeline'>(initial?.matrix_type ?? 'classic')
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(initial?.match_mode ?? 'all')
  const [matchCount, setMatchCount] = useState(initial?.match_any_count ?? 1)
  const [factors, setFactors] = useState<NbaMatrixFactor[]>(initial?.definition.factors ?? [newFactor()])
  const [steps, setSteps] = useState<NbaMatrixPipelineStep[]>(initial?.definition.steps ?? [newStep()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const rows = type === 'classic' ? factors : steps
  const save = async () => {
    setSaving(true); setError('')
    const definition: NbaMatrixDefinition = type === 'classic' ? { factors } : { steps }
    try {
      await request(initial ? `/api/nba-matrices/${initial.id}` : '/api/nba-matrices', { method: initial ? 'PATCH' : 'POST', body: JSON.stringify({ name, color, matrix_type: type, match_mode: matchMode, match_any_count: matchCount, pipeline_scope: 'team', definition }) })
      window.dispatchEvent(new Event('ss:nba-matrices-updated'))
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save.') } finally { setSaving(false) }
  }
  return (
    <ModalSurface open onClose={onClose} label="NBA Matrix editor" backdropClassName={styles.backdrop} backdropStyle={{ display: 'grid' }} panelClassName={styles.editor}>
        <header><div><small>THE COURT</small><h2>{initial ? 'Edit NBA Matrix' : 'Build NBA Matrix'}</h2></div><button type="button" aria-label="Close NBA Matrix editor" onClick={onClose}><X size={18} /></button></header>
        <div className={styles.editorBody}>
          <label className={styles.nameField}><span>Name</span><input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="15+ points shortened · rebounds lengthened" /></label>
          <div className={styles.editorOptions}><div><span>Color</span>{COLORS.map(option => <button type="button" aria-label={`Use ${option}`} key={option} className={color === option ? styles.colorActive : ''} style={{ background: option }} onClick={() => setColor(option)} />)}</div><div><button type="button" className={type === 'classic' ? styles.active : ''} onClick={() => setType('classic')}>Classic</button><button type="button" className={type === 'pipeline' ? styles.active : ''} onClick={() => setType('pipeline')}>Pipeline</button></div></div>
          {type === 'classic' ? <div className={styles.matchMode}><span>Match</span><button type="button" className={matchMode === 'all' ? styles.active : ''} onClick={() => setMatchMode('all')}>ALL conditions</button><button type="button" className={matchMode === 'any' ? styles.active : ''} onClick={() => setMatchMode('any')}>ANY conditions</button>{matchMode === 'any' && <input aria-label="Minimum matching conditions" type="number" min={1} max={factors.length || 1} value={matchCount} onChange={e => setMatchCount(Number(e.target.value))}/>}</div> : null}
          <div className={styles.factorList}>{rows.map((row, index) => <div key={row.id}><span className={extra.stepNumber}>{index + 1}</span><FactorEditor trackingFields={trackingFields} factor={row} pipeline={type === 'pipeline'} onChange={next => type === 'classic' ? setFactors(current => current.map((item, itemIndex) => itemIndex === index ? next as NbaMatrixFactor : item)) : setSteps(current => current.map((item, itemIndex) => itemIndex === index ? next as NbaMatrixPipelineStep : item))} onRemove={() => type === 'classic' ? setFactors(current => current.filter((_, itemIndex) => itemIndex !== index)) : setSteps(current => current.filter((_, itemIndex) => itemIndex !== index))} />{type === 'pipeline' && <div className={extra.stepOrder}><button type="button" aria-label={'Move step '+(index+1)+' up'} disabled={index === 0} onClick={() => setSteps(current => { const next = [...current]; [next[index-1],next[index]]=[next[index],next[index-1]]; return next })}>Move up</button><button type="button" aria-label={'Move step '+(index+1)+' down'} disabled={index === steps.length-1} onClick={() => setSteps(current => { const next = [...current]; [next[index+1],next[index]]=[next[index],next[index+1]]; return next })}>Move down</button></div>}</div>)}</div>
          <button type="button" className={styles.addCondition} disabled={rows.length >= 40} onClick={() => type === 'classic' ? setFactors(current => [...current, newFactor()]) : setSteps(current => [...current, newStep()])}><Plus size={14} /> Add {type === 'classic' ? 'condition' : 'step'}</button>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className={styles.save} disabled={saving || !name.trim() || !rows.length || rows.length > 40} onClick={save}>{saving ? 'Saving…' : 'Save NBA Matrix'}</button></footer>
    </ModalSurface>
  )
}

export function NbaMatrixButton({ gameId, initialOpen = false }: { gameId?: number; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('ss:open-nba-matrices', show)
    return () => window.removeEventListener('ss:open-nba-matrices', show)
  }, [])
  const [tab, setTab] = useState<'mine' | 'community'>('mine')
  const [matrices, setMatrices] = useState<NbaMatrix[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [editor, setEditor] = useState<EditorState>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [loadingMatrices, setLoadingMatrices] = useState(true)
  const [loadingCommunity, setLoadingCommunity] = useState(false)
  const refresh = useCallback(async () => {
    try { setMatrices((await request<{ matrices: NbaMatrix[] }>('/api/nba-matrices')).matrices) }
    catch { setMessage('NBA Matrices could not load. Try again.') }
    finally { setLoadingMatrices(false) }
  }, [])
  const refreshCommunity = useCallback(async () => {
    setLoadingCommunity(true)
    try { setListings((await request<{ listings: Listing[] }>('/api/nba-matrix-marketplace')).listings) }
    catch { setMessage('NBA community matrices could not load. Try again.') }
    finally { setLoadingCommunity(false) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    const update = () => void refresh()
    window.addEventListener('focus', update)
    window.addEventListener('nba-matrices-changed', update)
    window.addEventListener('ss:nba-matrices-updated', update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', update)
      window.removeEventListener('nba-matrices-changed', update)
      window.removeEventListener('ss:nba-matrices-updated', update)
    }
  }, [refresh])
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => void refreshCommunity(), 0)
    return () => window.clearTimeout(timer)
  }, [open, refreshCommunity])
  const mutate = async (label: string, task: () => Promise<unknown>) => {
    setBusy(label); setMessage('')
    try { await task(); await refresh(); window.dispatchEvent(new Event('ss:nba-matrices-updated')); setMessage('Done.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Request failed.') } finally { setBusy('') }
  }
  const copyCode = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Element code copied.') }
    catch { setMessage('Element code could not be copied.') }
  }
  return (
    <>
      <button type="button" className={extra.inlineButton} onClick={() => setOpen(true)}><Grid3X3 size={15} /> NBA Matrix{matrices.length ? <span>{matrices.length}</span> : null}</button>
      <ModalSurface open={open && !editor} onClose={() => setOpen(false)} label="NBA Matrices" backdropClassName={styles.backdrop} backdropStyle={{ display: 'grid' }} panelClassName={styles.drawer}>
        <header><div><small>THE COURT</small><h2>NBA Matrices</h2></div><button type="button" aria-label="Close NBA Matrices" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <nav aria-label="NBA Matrix views"><button type="button" aria-pressed={tab === 'mine'} className={tab === 'mine' ? styles.active : ''} onClick={() => setTab('mine')}>My NBA Matrices</button><button type="button" aria-pressed={tab === 'community'} className={tab === 'community' ? styles.active : ''} onClick={() => setTab('community')}>NBA Community</button></nav>
        <div className={styles.drawerBody}>
          {tab === 'mine' ? <>
            <button type="button" className={styles.newMatrix} onClick={() => setEditor({ matrix: null })}><Plus size={15} /> New NBA Matrix</button>
            <div className={styles.matrixList}>{matrices.map(matrix => <article key={matrix.id} style={{ '--matrix-color': matrix.color } as React.CSSProperties}><header><i /><div><b>{matrix.name}</b><small>{matrix.matrix_type === 'pipeline' ? `${matrix.definition.steps?.length ?? 0} pipeline steps` : `${matrix.definition.factors?.length ?? 0} conditions`}</small></div><button type="button" aria-label={`${matrix.enabled ? 'Disable' : 'Enable'} ${matrix.name}`} aria-pressed={matrix.enabled} onClick={() => mutate(matrix.id, () => request(`/api/nba-matrices/${matrix.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !matrix.enabled }) }))}>{matrix.enabled ? <Check size={14} /> : <X size={14} />}</button></header><footer><button type="button" onClick={() => void copyCode(matrix.element_code)}><Copy size={12} /> {matrix.element_code}</button><button type="button" onClick={() => setEditor({ matrix })}><SlidersHorizontal size={12} /> Edit</button><button type="button" onClick={() => mutate(`publish-${matrix.id}`, () => request('/api/nba-matrix-marketplace', { method: 'POST', body: JSON.stringify({ matrix_id: matrix.id }) }))}><Share2 size={12} /> Publish</button><button type="button" aria-label={`Delete ${matrix.name}`} onClick={() => mutate(`delete-${matrix.id}`, () => request(`/api/nba-matrices/${matrix.id}`, { method: 'DELETE' }))}><Trash2 size={12} /></button></footer></article>)}</div>
            {!loadingMatrices && !matrices.length ? <div className={styles.emptyState}><Grid3X3 size={26} /><b>No NBA Matrices yet</b></div> : null}
            <div className={styles.importBox}><label><Clipboard size={14} /> Import NBA Element Code</label><div><input aria-label="NBA Element Code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="NBA-XXXXXXXX" /><button type="button" disabled={!code.trim() || busy === 'import'} onClick={() => mutate('import', () => request('/api/nba-matrices/import', { method: 'POST', body: JSON.stringify({ element_code: code }) }))}>Import</button></div></div>
          </> : <div className={styles.matrixList}>{listings.map(listing => <article key={listing.id} style={{ '--matrix-color': listing.color } as React.CSSProperties}><header><i /><div><b>{listing.title}</b><small>{listing.matrix_type} · {listing.copy_count} adds</small></div></header>{listing.description ? <p>{listing.description}</p> : null}<footer><button type="button" onClick={() => mutate(`community-${listing.id}`, () => request(`/api/nba-matrix-marketplace/${listing.id}/import`, { method: 'POST' }))}><Plus size={12} /> Add to NBA Matrices</button></footer></article>)}{!loadingCommunity && !listings.length ? <div className={styles.emptyState}><Share2 size={26} /><b>No NBA community posts yet</b></div> : null}</div>}
          {message ? <div className={styles.message} role="status" aria-live="polite">{message}</div> : null}
        </div>
      </ModalSurface>
      {editor ? <MatrixEditor gameId={gameId} initial={editor.matrix} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void refresh() }} /> : null}
    </>
  )
}
