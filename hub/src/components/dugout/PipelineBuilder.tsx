'use client'
import React, { useState } from 'react'
import { Reorder } from 'motion/react'
import { GripVertical, X, Plus } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import {
  type MatrixFactor, ALL_CATEGORIES, CATEGORY_LABEL, recencyLabel, MULTI_BOOK_FIELDS,
  fieldsForCategory, isBooksFieldKey,
} from './CustomMatrixPanel'

// A Pipeline is an ordered chain of steps that narrows a pool of players
// down to a final winner (or winners, if the chain runs out of information
// to pick just one) — see matrixEngine.ts's MatrixPipelineStep for the
// engine-side reduction this UI is authoring. Three verbs, freely mixed and
// reordered:
//
//   filter — a plain threshold (exactly a classic Factor's condition). Hard
//            requirement: nobody passing means nobody highlighted.
//   group  — "tied with each other on this field." Lenient: no ties found
//            just leaves the pool as-is rather than wiping it.
//   rank   — "keep whoever's highest/lowest on this field." Also lenient.
export type MatrixPipelineStep = {
  kind: 'filter' | 'group' | 'rank'
  category: MatrixFactor['category']
  field_key: string
  recency: MatrixFactor['recency']
  book: string | null
  books: string[] | null
  books_min_count: number | null
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'positive' | 'negative' | null
  value: number | null
  direction: 'highest' | 'lowest' | null
}

const KIND_LABEL: Record<MatrixPipelineStep['kind'], string> = { filter: 'Filter', group: 'Group', rank: 'Rank' }
const KIND_COLOR: Record<MatrixPipelineStep['kind'], string> = { filter: 'var(--blue)', group: 'var(--gold)', rank: 'var(--accent)' }
const KIND_DESC: Record<MatrixPipelineStep['kind'], string> = {
  filter: 'Keep players that pass a threshold',
  group: 'Keep players tied with each other on a field',
  rank: 'Narrow to whoever is highest/lowest on a field',
}
export const MAX_PIPELINE_STEPS = 10

export function newPipelineStep(kind: MatrixPipelineStep['kind']): MatrixPipelineStep {
  const category: MatrixFactor['category'] = 'odds'
  const field = fieldsForCategory(category).filter(f => !f.boolean)[0]
  return {
    kind, category, field_key: field.key, recency: null, book: null, books: null, books_min_count: null,
    operator: kind === 'filter' ? 'gte' : null,
    value: null,
    direction: kind === 'rank' ? 'highest' : null,
  }
}

function PipelineStepCard({ step, index, onChange, onRemove }: {
  step: MatrixPipelineStep; index: number
  onChange: (s: MatrixPipelineStep) => void; onRemove: () => void
}) {
  // group/rank exclude boolean fields (Is PWR ⚡?) — "tied"/"highest" on a
  // Yes/No is meaningless, same exclusion TiebreakerRow already applies.
  const fields = step.kind === 'filter' ? fieldsForCategory(step.category) : fieldsForCategory(step.category).filter(f => !f.boolean)
  const isBoolean = step.kind === 'filter' && fields.find(f => f.key === step.field_key)?.boolean === true
  const isBooksField = step.kind === 'filter' && isBooksFieldKey(step.field_key)
  const needsRecency = step.category === 'pitchlog_stat' || step.category === 'savant_stat'
  const hidesValue = step.kind === 'filter' && (
    (step.category === 'odds' && ['up', 'down', 'flat'].includes(step.operator ?? '')) ||
    step.operator === 'positive' || step.operator === 'negative'
  )
  const multiBookFilter = step.kind === 'filter' && step.category === 'odds' ? MULTI_BOOK_FIELDS[step.field_key] : null
  const singleBookField = step.kind !== 'filter' && step.category === 'odds' ? MULTI_BOOK_FIELDS[step.field_key] : null

  function changeCategory(category: MatrixFactor['category']) {
    const opts = step.kind === 'filter' ? fieldsForCategory(category) : fieldsForCategory(category).filter(f => !f.boolean)
    const first = opts[0] ?? fieldsForCategory(category)[0]
    onChange({
      ...step, category, field_key: first.key, book: null, books: null, books_min_count: null,
      recency: category === 'pitchlog_stat' || category === 'savant_stat' ? 'season' : null,
      ...(step.kind === 'filter' ? { operator: first.boolean ? 'eq' : 'gte', value: first.boolean ? 1 : null } : {}),
    })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
      background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GripVertical size={14} style={{ color: 'var(--text-3)', cursor: 'grab', flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-3)', flexShrink: 0 }}>{index + 1}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 999,
          color: KIND_COLOR[step.kind], background: 'var(--surface-3)', border: `1px solid ${KIND_COLOR[step.kind]}`,
        }}>
          {KIND_LABEL[step.kind].toUpperCase()}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{KIND_DESC[step.kind]}</span>
        <button onClick={onRemove} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', paddingLeft: 22 }}>
        <select
          className="ss-input" value={step.category}
          onChange={e => changeCategory(e.target.value as MatrixFactor['category'])}
          style={{ fontSize: 11, padding: '5px 6px', width: 110 }}
        >
          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>

        <select
          className="ss-input" value={step.field_key}
          onChange={e => {
            const field_key = e.target.value
            const nowBoolean = step.kind === 'filter' && fields.find(f => f.key === field_key)?.boolean === true
            onChange({
              ...step, field_key, book: null, books: null, books_min_count: null,
              ...(step.kind === 'filter' && isBooksFieldKey(field_key) ? { operator: 'gte' } : {}),
              ...(nowBoolean ? { operator: 'eq', value: 1 } : isBoolean ? { operator: 'gte', value: null } : {}),
            })
          }}
          style={{ fontSize: 11, padding: '5px 6px', minWidth: 150, flex: '1 1 150px' }}
        >
          {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>

        {step.kind === 'filter' && (isBoolean ? (
          <select
            className="ss-input" value={step.value === 0 ? '0' : '1'}
            onChange={e => onChange({ ...step, operator: 'eq', value: Number(e.target.value) })}
            style={{ fontSize: 11, padding: '5px 6px', width: 100 }}
          >
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        ) : (
          <>
            <select
              className="ss-input" value={step.operator ?? 'gte'}
              onChange={e => onChange({ ...step, operator: e.target.value as MatrixPipelineStep['operator'] })}
              style={{ fontSize: 11, padding: '5px 6px', width: 170 }}
            >
              <option value="gte">At least</option>
              <option value="lte">At most</option>
              <option value="eq">Exactly</option>
              {step.category === 'odds' && !isBooksField && (
                <>
                  <option value="up">Moved up since open</option>
                  <option value="down">Moved down since open</option>
                  <option value="flat">Unchanged since open</option>
                </>
              )}
              {step.category === 'dugout_specs' && (
                <>
                  <option value="positive">Is positive (+)</option>
                  <option value="negative">Is negative (−)</option>
                </>
              )}
            </select>
            {!hidesValue && (
              <input
                className="ss-input" type="number" placeholder={isBooksField ? 'books missing' : 'value'}
                value={step.value ?? ''}
                onChange={e => onChange({ ...step, value: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ fontSize: 11, padding: '5px 6px', width: 84 }}
              />
            )}
          </>
        ))}

        {needsRecency && (
          <select
            className="ss-input" value={step.recency ?? 'season'}
            onChange={e => onChange({ ...step, recency: e.target.value as MatrixFactor['recency'] })}
            style={{ fontSize: 11, padding: '5px 6px', width: 100 }}
          >
            {['game', 'l3', 'l5', 'l10', 'season', 'game_delta', 'l3_delta', 'l5_delta', 'l10_delta'].map(r => (
              <option key={r} value={r}>{recencyLabel(step.category, r)}</option>
            ))}
          </select>
        )}

        {singleBookField && (
          <div style={{ display: 'flex', gap: 3 }}>
            {singleBookField.map(b => {
              const on = (step.book ?? 'fanduel') === b.key
              return (
                <button
                  key={b.key} title={b.label} onClick={() => onChange({ ...step, book: b.key })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24,
                    padding: 0, borderRadius: 6, cursor: 'pointer',
                    background: on ? 'var(--accent-dim)' : 'var(--surface-3)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, opacity: on ? 1 : 0.55,
                  }}
                >
                  <BookLogo vendor={b.key} size={14} />
                </button>
              )
            })}
          </div>
        )}

        {step.kind === 'rank' && (
          <select
            className="ss-input" value={step.direction ?? 'highest'}
            onChange={e => onChange({ ...step, direction: e.target.value as 'highest' | 'lowest' })}
            style={{ fontSize: 11, padding: '5px 6px', width: 90 }}
          >
            <option value="highest">Highest</option>
            <option value="lowest">Lowest</option>
          </select>
        )}
      </div>

      {multiBookFilter && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 22, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>BOOKS</span>
          {multiBookFilter.map(b => {
            const selected = step.books?.length ? step.books : ['fanduel']
            const on = selected.includes(b.key)
            return (
              <button
                key={b.key} title={b.label}
                onClick={() => {
                  const next = on ? selected.filter(k => k !== b.key) : [...selected, b.key]
                  onChange({ ...step, books: next.length ? next : ['fanduel'] })
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24,
                  padding: 0, borderRadius: 6, cursor: 'pointer',
                  background: on ? 'var(--accent-dim)' : 'var(--surface-3)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, opacity: on ? 1 : 0.55,
                }}
              >
                <BookLogo vendor={b.key} size={14} />
              </button>
            )
          })}
          <select
            className="ss-input" value={step.books_min_count == null ? 'all' : 'atLeast'}
            onChange={e => onChange({ ...step, books_min_count: e.target.value === 'atLeast' ? (step.books?.length ?? 1) : null })}
            style={{ fontSize: 10, padding: '4px 5px', width: 140, marginLeft: 'auto' }}
          >
            <option value="all">True for every book picked</option>
            <option value="atLeast">True for at least N picked</option>
          </select>
          {step.books_min_count != null && (
            <input
              className="ss-input" type="number" min={1} max={(step.books?.length ?? 1) || 1}
              value={step.books_min_count}
              onChange={e => onChange({ ...step, books_min_count: Math.max(1, Number(e.target.value) || 1) })}
              style={{ fontSize: 10, padding: '4px 5px', width: 44 }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// The "+ Add step" control — a 3-choice picker rather than a generic
// button, since the whole point of Pipeline mode is a member choosing
// which of the 3 verbs they mean at each point in the chain.
function AddStepMenu({ onAdd, disabled }: { onAdd: (kind: MatrixPipelineStep['kind']) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
          color: disabled ? 'var(--text-3)' : 'var(--accent)', background: disabled ? 'var(--surface-2)' : 'var(--accent-dim)',
          border: 'none', borderRadius: 6, padding: '5px 9px', cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <Plus size={12} /> Add step
      </button>
      {open && !disabled && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 81, width: 220,
            background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
          }}>
            {(['filter', 'group', 'rank'] as const).map(kind => (
              <button
                key={kind}
                onClick={() => { onAdd(kind); setOpen(false) }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%',
                  padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: KIND_COLOR[kind] }}>{KIND_LABEL[kind]}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{KIND_DESC[kind]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function PipelineBuilder({ steps, onChange }: { steps: MatrixPipelineStep[]; onChange: (s: MatrixPipelineStep[]) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>Steps ({steps.length})</span>
        <div style={{ marginLeft: 'auto' }}>
          <AddStepMenu disabled={steps.length >= MAX_PIPELINE_STEPS} onAdd={kind => onChange([...steps, newPipelineStep(kind)])} />
        </div>
      </div>

      {steps.length === 0 ? (
        <div style={{ padding: '18px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
          No steps yet. Add a Filter, Group, or Rank step to start narrowing your pool of players.
        </div>
      ) : (
        <Reorder.Group as="div" axis="y" values={steps} onReorder={onChange} style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((step, i) => (
            <Reorder.Item key={i} value={step} as="div" style={{ listStyle: 'none' }}>
              <PipelineStepCard
                step={step} index={i}
                onChange={next => onChange(steps.map((s, si) => (si === i ? next : s)))}
                onRemove={() => onChange(steps.filter((_, si) => si !== i))}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
    </div>
  )
}
