'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Grid3x3, Plus, Pencil, Trash2, Copy, Check, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useDraggableFab } from '@/lib/useDraggableFab'

// "Custom Matrix" — a member's own saved highlight rules for The Dugout's
// batter table. Terminology is deliberately its own: a saved rule is a
// "Matrix", built from "Elements", each one a "Factor" — paraphrased away
// from a competitor's naming rather than reusing it (see matrixEngine.ts's
// own header comment for the full data-source breakdown this UI drives).

export type MatrixFactor = {
  id?: string
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'positive' | 'negative'
  value: number | null
  recency: 'game' | 'l3' | 'l5' | 'l10' | 'season' | 'custom' | null
}

export type MatrixDef = {
  id: string
  name: string
  color: string
  priority: number
  match_mode: 'all' | 'any'
  match_any_count: number | null
  element_code: string
  factors: MatrixFactor[]
}

const ODDS_FIELDS: { key: string; label: string; deltaOnly?: boolean }[] = [
  { key: 'fhr', label: 'First HR' },
  { key: 'hr', label: 'Anytime HR' },
  { key: 'hrml', label: 'HR / Moneyline Parlay' },
  { key: 'laser', label: 'Laser (105+ ft)' },
  { key: 'moonshot', label: 'Moonshot' },
  { key: 'pa1', label: '1st PA Home Run' },
  { key: 'rbi1', label: '1+ RBI' },
  { key: 'rbi2', label: '2+ RBI' },
  { key: 'rbi3', label: '3+ RBI' },
  { key: 'tb2', label: '2+ Total Bases' },
  { key: 'tb3', label: '3+ Total Bases' },
  { key: 'tb4', label: '4+ Total Bases' },
  { key: 'tb5', label: '5+ Total Bases' },
  { key: 'hr2', label: '2+ Home Runs' },
  { key: 'singles', label: '1+ Single' },
  { key: 'doubles', label: '1+ Double' },
  { key: 'triples', label: '1+ Triple' },
  { key: 'sb1', label: '1+ Stolen Base' },
  { key: 'sb2', label: '2+ Stolen Bases' },
  { key: 'hits1', label: '1+ Hit' },
  { key: 'hits2', label: '2+ Hits' },
  { key: 'runs1', label: '1+ Run' },
  { key: 'runs2', label: '2+ Runs' },
  { key: 'booksfhr', label: 'Books missing First HR odds', deltaOnly: false },
  { key: 'bookshr', label: 'Books missing Anytime HR odds', deltaOnly: false },
]
const STAT_FIELDS: { key: string; label: string }[] = [
  { key: 'pa', label: 'Plate Appearances' }, { key: 'h', label: 'Hits' },
  { key: '1b', label: 'Singles' }, { key: '2b', label: 'Doubles' }, { key: '3b', label: 'Triples' },
  { key: 'hr', label: 'Home Runs' }, { key: 'bb', label: 'Walks' }, { key: 'k', label: 'Strikeouts' },
  { key: 'avg', label: 'Batting Average' }, { key: 'obp', label: 'On-Base %' }, { key: 'slg', label: 'Slugging %' },
  { key: 'whiff', label: 'Whiff %' }, { key: 'chase', label: 'Chase %' },
  { key: 'avgev', label: 'Avg Exit Velocity' }, { key: 'la', label: 'Avg Launch Angle' },
  { key: 'hh', label: 'Hard-Hit %' }, { key: 'brl', label: 'Barrel %' }, { key: 'xwoba', label: 'xwOBA (Contact)' },
  { key: 'bspd', label: 'Avg Bat Speed' }, { key: 'atk', label: 'Avg Attack Angle' },
  { key: 'swlen', label: 'Avg Swing Length' }, { key: 'tilt', label: 'Avg Swing Tilt' }, { key: 'attackdir', label: 'Avg Attack Direction' },
]
const SAVANT_FIELDS: { key: string; label: string }[] = [
  { key: 'hardsw', label: 'Hard-Swing %' }, { key: 'sq', label: 'Squared-Up %' }, { key: 'blast', label: 'Blast %' },
  { key: 'idlaa', label: 'Ideal Attack-Angle %' }, { key: 'pullair', label: 'Pull Air Rate' }, { key: 'fb', label: 'Fly-Ball Rate' },
]
// "Dugout Specs" — the Dugout table's own computed columns (not raw
// sportsbook prices): implied-probability ratios between two markets, plus
// this player's own today-vs-his-season-average price deltas. Field keys
// match the exact same ones evaluateDugoutSpecsFactor computes server-side
// off the real props object — see matrixEngine.ts.
const DUGOUT_SPECS_FIELDS: { key: string; label: string; signed?: boolean }[] = [
  { key: 'div', label: 'DIV (FD − Caesars FHR)', signed: true },
  { key: 'fhr_div_sa', label: 'FHR ÷ HR' },
  { key: 'm_div_f', label: 'M ÷ F (BetMGM ÷ FanDuel)' },
  { key: 'sa_div_ml', label: 'HR ÷ Parlay' },
  { key: 'pa1_div_sa', label: 'PA ÷ HR' },
  { key: 'sa_div_rbi', label: 'HR ÷ RBI' },
  { key: 'sa_div_rbi2', label: 'HR ÷ RBI2' },
  { key: 'sa_div_rbi3', label: 'HR ÷ RBI3' },
  { key: 'sa_div_hrr', label: 'HR ÷ HRR' },
  { key: 'sa_div_tb', label: 'HR ÷ TB' },
  { key: 'sa_div_tb3', label: 'HR ÷ TB3' },
  { key: 'sa_div_tb4', label: 'HR ÷ TB4' },
  { key: 'sa_div_tb5', label: 'HR ÷ TB5' },
  { key: 'sa_div_hr2', label: 'HR ÷ 2HR' },
  { key: 'fhr_pct', label: 'FHR % (vs. season avg)', signed: true },
  { key: 'sa_pct', label: 'HR % (vs. season avg)', signed: true },
]
// Community pick counts — a plain threshold, or (the "% of Game" variant)
// this player's share of his own game's total picks for that market across
// all 18 real batters, not just a raw count (see evaluatePicksFactor).
const PICKS_FIELDS: { key: string; label: string }[] = [
  { key: 'hr', label: 'HR Picks' }, { key: 'hrPct', label: 'HR Picks — % of Game' },
  { key: 'hits', label: 'Hits Picks' }, { key: 'hitsPct', label: 'Hits Picks — % of Game' },
  { key: 'runs', label: 'Runs Picks' }, { key: 'runsPct', label: 'Runs Picks — % of Game' },
  { key: 'stolenBases', label: 'Stolen Base Picks' }, { key: 'stolenBasesPct', label: 'Stolen Base Picks — % of Game' },
  { key: 'singles', label: 'Singles Picks' }, { key: 'singlesPct', label: 'Singles Picks — % of Game' },
  { key: 'doubles', label: 'Doubles Picks' }, { key: 'doublesPct', label: 'Doubles Picks — % of Game' },
  { key: 'triples', label: 'Triples Picks' }, { key: 'triplesPct', label: 'Triples Picks — % of Game' },
  { key: 'rbi', label: 'RBI Picks' }, { key: 'rbiPct', label: 'RBI Picks — % of Game' },
  { key: 'hrr', label: 'HRR Picks' }, { key: 'hrrPct', label: 'HRR Picks — % of Game' },
  { key: 'tb', label: 'TB Picks' }, { key: 'tbPct', label: 'TB Picks — % of Game' },
]
const CATEGORY_LABEL: Record<MatrixFactor['category'], string> = {
  odds: 'Odds', dugout_specs: 'Dugout Specs', pitchlog_stat: 'Stat Line', savant_stat: 'Bat Tracking', picks: 'Picks',
}
const RECENCY_LABEL: Record<string, string> = { game: 'Last Game', l3: 'Last 3', l5: 'Last 5', l10: 'Last 10', season: 'Season', custom: 'Custom Range' }
const OPERATOR_LABEL: Record<string, string> = {
  gte: 'At least', lte: 'At most', eq: 'Exactly',
  up: 'Moved up since open', down: 'Moved down since open', flat: 'Unchanged since open',
  positive: 'Is positive (+)', negative: 'Is negative (−)',
}

const FIELDS_BY_CATEGORY: Record<MatrixFactor['category'], { key: string; label: string }[]> = {
  odds: ODDS_FIELDS, dugout_specs: DUGOUT_SPECS_FIELDS, pitchlog_stat: STAT_FIELDS, savant_stat: SAVANT_FIELDS, picks: PICKS_FIELDS,
}
function fieldsForCategory(cat: MatrixFactor['category']) {
  return FIELDS_BY_CATEGORY[cat]
}
function fieldLabel(cat: MatrixFactor['category'], key: string) {
  return fieldsForCategory(cat).find(f => f.key === key)?.label ?? key
}
function newFactor(): MatrixFactor {
  return { category: 'odds', field_key: 'fhr', operator: 'gte', value: null, recency: null }
}
const SWATCHES = ['#B4FF4D', '#4D9EFF', '#FF4D6A', '#FFB84D', '#A855F7', '#2ED573', '#FF8FA3', '#5EEAD4']

async function api<T>(url: string, opts?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: json?.error || 'Something went wrong.' }
    return { data: json, error: null }
  } catch {
    return { data: null, error: 'Network error — try again.' }
  }
}

const ALL_CATEGORIES = ['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks'] as const

function FactorRow({ factor, onChange, onRemove }: { factor: MatrixFactor; onChange: (f: MatrixFactor) => void; onRemove: () => void }) {
  const fields = fieldsForCategory(factor.category)
  const isBooksField = factor.field_key === 'booksfhr' || factor.field_key === 'bookshr'
  // No threshold VALUE needed for any of these — odds' delta-vs-open trio,
  // or dugout_specs' plain sign check (a Factor like "FHR% is positive"
  // doesn't want a number typed in, same shape as "moved up since open").
  const hidesValue = (factor.category === 'odds' && ['up', 'down', 'flat'].includes(factor.operator))
    || factor.operator === 'positive' || factor.operator === 'negative'
  const needsRecency = factor.category === 'pitchlog_stat' || factor.category === 'savant_stat'

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <select
        className="ss-input" value={factor.category}
        onChange={e => {
          const category = e.target.value as MatrixFactor['category']
          const field_key = fieldsForCategory(category)[0].key
          onChange({ ...factor, category, field_key, operator: 'gte', recency: category === 'pitchlog_stat' || category === 'savant_stat' ? 'season' : null })
        }}
        style={{ fontSize: 11, padding: '5px 6px', width: 110 }}
      >
        {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
      </select>

      <select
        className="ss-input" value={factor.field_key}
        onChange={e => onChange({ ...factor, field_key: e.target.value, ...(isBooksFieldKey(e.target.value) ? { operator: 'gte' } : {}) })}
        style={{ fontSize: 11, padding: '5px 6px', minWidth: 150, flex: '1 1 150px' }}
      >
        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      <select
        className="ss-input" value={factor.operator}
        onChange={e => onChange({ ...factor, operator: e.target.value as MatrixFactor['operator'] })}
        style={{ fontSize: 11, padding: '5px 6px', width: 170 }}
      >
        <option value="gte">{OPERATOR_LABEL.gte}</option>
        <option value="lte">{OPERATOR_LABEL.lte}</option>
        <option value="eq">{OPERATOR_LABEL.eq}</option>
        {factor.category === 'odds' && !isBooksField && (
          <>
            <option value="up">{OPERATOR_LABEL.up}</option>
            <option value="down">{OPERATOR_LABEL.down}</option>
            <option value="flat">{OPERATOR_LABEL.flat}</option>
          </>
        )}
        {factor.category === 'dugout_specs' && (
          <>
            <option value="positive">{OPERATOR_LABEL.positive}</option>
            <option value="negative">{OPERATOR_LABEL.negative}</option>
          </>
        )}
      </select>

      {!hidesValue && (
        <input
          className="ss-input" type="number" placeholder={isBooksField ? 'books missing' : 'value'}
          value={factor.value ?? ''}
          onChange={e => onChange({ ...factor, value: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ fontSize: 11, padding: '5px 6px', width: 84 }}
        />
      )}

      {needsRecency && (
        <select
          className="ss-input" value={factor.recency ?? 'season'}
          onChange={e => onChange({ ...factor, recency: e.target.value as MatrixFactor['recency'] })}
          style={{ fontSize: 11, padding: '5px 6px', width: 100 }}
        >
          {(factor.category === 'savant_stat' ? ['game', 'l3', 'l5', 'l10', 'season'] : ['game', 'l3', 'l5', 'l10', 'season', 'custom']).map(r => (
            <option key={r} value={r}>{RECENCY_LABEL[r]}</option>
          ))}
        </select>
      )}

      <button onClick={onRemove} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
        <X size={14} />
      </button>
    </div>
  )
}
function isBooksFieldKey(k: string) { return k === 'booksfhr' || k === 'bookshr' }

function MatrixEditor({ initial, onClose, onSaved }: { initial: MatrixDef | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? SWATCHES[0])
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(initial?.match_mode ?? 'all')
  const [matchAnyCount, setMatchAnyCount] = useState(initial?.match_any_count ?? 2)
  const [factors, setFactors] = useState<MatrixFactor[]>(initial?.factors?.length ? initial.factors : [newFactor()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async () => {
    if (!name.trim()) { setError('Give this Matrix a name.'); return }
    if (!factors.length) { setError('A Matrix needs at least one Factor.'); return }
    setSaving(true); setError(null)
    const body = { name: name.trim(), color, match_mode: matchMode, match_any_count: matchMode === 'any' ? matchAnyCount : null, factors }
    const { error: err } = initial
      ? await api(`/api/matrices/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      : await api('/api/matrices', { method: 'POST', body: JSON.stringify(body) })
    setSaving(false)
    if (err) { setError(err); return }
    onSaved()
  }, [name, color, matchMode, matchAnyCount, factors, initial, onSaved])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{initial ? 'Edit Matrix' : 'New Matrix'}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="ss-input" placeholder="Matrix name" value={name} onChange={e => setName(e.target.value)}
            style={{ flex: 1, fontSize: 13, padding: '8px 10px' }}
          />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {SWATCHES.map(c => (
              <button
                key={c} onClick={() => setColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: color === c ? '2px solid var(--text-1)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, color: 'var(--text-2)' }}>
          Highlight when a batter meets
          <select className="ss-input" value={matchMode} onChange={e => setMatchMode(e.target.value as 'all' | 'any')} style={{ fontSize: 12, padding: '5px 6px' }}>
            <option value="all">every Element</option>
            <option value="any">at least</option>
          </select>
          {matchMode === 'any' && (
            <input
              className="ss-input" type="number" min={1} max={factors.length || 1} value={matchAnyCount}
              onChange={e => setMatchAnyCount(Math.max(1, Number(e.target.value) || 1))}
              style={{ fontSize: 12, padding: '5px 6px', width: 50 }}
            />
          )}
          {matchMode === 'any' && 'Elements'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>Elements ({factors.length})</span>
          <button
            onClick={() => setFactors([...factors, newFactor()])}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
              color: 'var(--accent)', background: 'var(--accent-dim)', border: 'none', borderRadius: 6, padding: '5px 9px', cursor: 'pointer',
            }}
          >
            <Plus size={12} /> Add Factor
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {factors.map((f, i) => (
            <FactorRow
              key={i} factor={f}
              onChange={nf => setFactors(factors.map((x, xi) => xi === i ? nf : x))}
              onRemove={() => setFactors(factors.filter((_, xi) => xi !== i))}
            />
          ))}
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="ss-btn-ghost" style={{ flex: 1, padding: '9px 0', fontSize: 12 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="ss-btn-accent" style={{ flex: 1, padding: '9px 0', fontSize: 12, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Matrix'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MatrixCard({ matrix, onEdit, onDeleted }: { matrix: MatrixDef; onEdit: () => void; onDeleted: () => void }) {
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(matrix.element_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [matrix.element_code])

  const del = useCallback(async () => {
    if (!confirm(`Delete "${matrix.name}"? This can't be undone.`)) return
    setDeleting(true)
    await api(`/api/matrices/${matrix.id}`, { method: 'DELETE' })
    onDeleted()
  }, [matrix, onDeleted])

  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, opacity: deleting ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: matrix.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matrix.name}</span>
        <button onClick={onEdit} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
        <button onClick={del} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
        {matrix.factors.length} Element{matrix.factors.length === 1 ? '' : 's'} · {matrix.match_mode === 'all' ? 'match all' : `match ${matrix.match_any_count ?? 1}+`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "'SF Mono',monospace", color: 'var(--text-2)', background: 'var(--surface-2)', padding: '3px 7px', borderRadius: 5, letterSpacing: '0.03em' }}>
          {matrix.element_code}
        </span>
        <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: copied ? 'var(--accent)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export function MatrixButton() {
  const { user } = useAuth()
  const fab = useDraggableFab('matrix-fab-pos')
  const [open, setOpen] = useState(false)
  const [matrices, setMatrices] = useState<MatrixDef[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<MatrixDef | null | undefined>(undefined) // undefined = closed, null = new
  const [importCode, setImportCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data } = await api<{ matrices: MatrixDef[] }>('/api/matrices')
    setMatrices(data?.matrices ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { if (user) refresh() }, [user, refresh])

  const doImport = useCallback(async () => {
    if (!importCode.trim()) return
    setImporting(true); setImportError(null)
    const { error } = await api('/api/matrices/import', { method: 'POST', body: JSON.stringify({ element_code: importCode.trim() }) })
    setImporting(false)
    if (error) { setImportError(error); return }
    setImportCode('')
    refresh()
  }, [importCode, refresh])

  if (!user) return null

  return (
    <>
      <style>{`.matrix-fab { position: fixed; right: 20px; bottom: calc(136px + env(safe-area-inset-bottom, 0px)); z-index: 50; }`}</style>
      <button
        ref={fab.ref} className="matrix-fab" title="Drag to move" onClick={() => setOpen(true)} {...fab.handlers}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 999,
          background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border-2)', cursor: 'grab',
          fontSize: 13, fontWeight: 800, boxShadow: '0 4px 16px rgba(0,0,0,0.35)', userSelect: 'none', ...fab.style,
        }}
      >
        <Grid3x3 size={15} /> Matrix
        {matrices.length > 0 && (
          <span style={{ background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{matrices.length}</span>
        )}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(420px, 100vw)', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', animation: 'slideIn 0.2s ease-out',
          }}>
            <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Grid3x3 size={16} /> Custom Matrix
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{matrices.length}/10</span>
              <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              <button
                onClick={() => setEditing(null)}
                disabled={matrices.length >= 10}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 0', marginBottom: 12, borderRadius: 8, fontSize: 12, fontWeight: 800,
                  color: matrices.length >= 10 ? 'var(--text-3)' : 'var(--accent-fg)',
                  background: matrices.length >= 10 ? 'var(--surface-2)' : 'var(--accent)',
                  border: 'none', cursor: matrices.length >= 10 ? 'not-allowed' : 'pointer',
                }}
              >
                <Plus size={14} /> New Matrix
              </button>

              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading…</div>
              ) : matrices.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                  No Matrices saved yet.<br />Build one to auto-highlight batters who meet your own criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {matrices.map(m => (
                    <MatrixCard key={m.id} matrix={m} onEdit={() => setEditing(m)} onDeleted={refresh} />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }}>Import a shared Element Code</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="ss-input" placeholder="EL-XXXX-XXXX" value={importCode}
                    onChange={e => setImportCode(e.target.value.toUpperCase())}
                    style={{ flex: 1, fontSize: 11, padding: '7px 8px', fontFamily: "'SF Mono',monospace" }}
                  />
                  <button onClick={doImport} disabled={importing || matrices.length >= 10} className="ss-btn-ghost" style={{ fontSize: 11, padding: '7px 12px' }}>
                    {importing ? '…' : 'Import'}
                  </button>
                </div>
                {importError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{importError}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {editing !== undefined && (
        <MatrixEditor
          initial={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); refresh() }}
        />
      )}
    </>
  )
}
