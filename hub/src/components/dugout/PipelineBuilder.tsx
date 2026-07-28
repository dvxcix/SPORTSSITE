'use client'
import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Reorder, useDragControls, type DragControls } from 'motion/react'
import { GripVertical, X, Plus } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import {
  type MatrixFactor, type MmWindowKey, type MmTrendDirection, ALL_CATEGORIES, CATEGORY_LABEL, recencyLabel, recencyOptionsFor, MULTI_BOOK_FIELDS,
  fieldsForCategory, isBooksFieldKey, MmTrendFields, MmMoveWindowPicker,
} from './CustomMatrixPanel'

// A Pipeline is an ordered chain of steps that narrows a pool of players
// down to a final winner (or winners, if the chain runs out of information
// to pick just one) — see matrixEngine.ts's MatrixPipelineStep for the
// engine-side reduction this UI is authoring. Four verbs, freely mixed and
// reordered:
//
//   filter — a plain threshold (exactly a classic Factor's condition). Hard
//            requirement: nobody passing means nobody highlighted.
//   group  — "tied with each other on this field." Lenient: no ties found
//            just leaves the pool as-is rather than wiping it.
//   rank   — "keep whoever's highest/lowest on this field." Also lenient.
//   unless — real gap (2026-07-25): every step above applies uniformly to
//            whatever survived the step before it. Some real formulas need
//            "normally do X, but if a DIFFERENT specific situation exists
//            elsewhere in the game, do Y instead." An Unless step's own
//            nested condition mini-pipeline (searched across
//            condition_scope's universe) checks whether that other situation
//            exists. If it finds nothing, the step is a no-op. If it DOES,
//            `unless_mode` decides what happens: 'replace' (default) swaps
//            the pool for the condition's own findings (narrowed by a then
//            mini-pipeline); 'suppress' wipes the pool to nobody; 'add'
//            unions the condition's findings onto the existing pool instead
//            of replacing it. `uses_anchor` (real gap, 2026-07-26: most
//            "unless" formulas are a plain existence check with no number to
//            compare, so forcing an anchor field on every Unless step was
//            needless clutter) optionally exposes category/field/recency/book
//            as the ANCHOR field — read fresh off whoever's in the pool going
//            into this step — so a nested condition Filter step can compare
//            "lower/higher than the anchor value" instead of a typed-in
//            number. Capped at one level deep — nested steps can't
//            themselves be Unless.
export type MatrixPipelineStep = {
  kind: 'filter' | 'group' | 'rank' | 'unless'
  category: MatrixFactor['category']
  field_key: string
  recency: MatrixFactor['recency']
  book: string | null
  books: string[] | null
  books_min_count: number | null
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'positive' | 'negative' | 'is_null' | 'is_not_null' | 'lt_anchor' | 'gt_anchor' | 'mm_trend' | null
  value: number | null
  // rank: which extreme to keep — 'closest_zero' (rank-only, not offered by
  // the Group step's own UI) ranks by absolute distance from 0 instead,
  // excluding literal 0 itself. group: null keeps every tied cluster
  // (original behavior); 'highest'/'lowest' narrows to the single cluster
  // at that extreme when the pool has more than one — see matrixEngine.ts's
  // selectTieCluster.
  direction: 'highest' | 'lowest' | 'closest_zero' | null
  // rank only — null/0 keeps the exact-match behavior; a positive number
  // also keeps anyone within that raw distance of the best value, so a real
  // standout no longer needs an exact 2-decimal match to survive. See
  // matrixEngine.ts's MatrixTiebreaker.tolerance for the full rationale.
  tolerance: number | null
  // unless only — see the type-level comment above.
  condition_scope: 'team' | 'game' | null
  condition_steps: MatrixPipelineStep[] | null
  then_steps: MatrixPipelineStep[] | null
  unless_mode: 'replace' | 'suppress' | 'add' | null
  uses_anchor: boolean | null
  // filter only, operator 'mm_trend' — see CustomMatrixPanel.tsx's
  // MmTrendFields / matrixEngine.ts's evaluateMmTrend.
  mm_base_window: MmWindowKey | null
  mm_compare_windows: MmWindowKey[] | null
  mm_direction: MmTrendDirection | null
  mm_match_mode: 'any' | 'all' | null
  mm_amount_mode: 'at_least' | 'exactly' | null
}

const KIND_LABEL: Record<MatrixPipelineStep['kind'], string> = { filter: 'Filter', group: 'Group', rank: 'Rank', unless: 'Unless' }
const KIND_COLOR: Record<MatrixPipelineStep['kind'], string> = { filter: 'var(--blue)', group: 'var(--gold)', rank: 'var(--accent)', unless: 'var(--purple)' }
const KIND_DESC: Record<MatrixPipelineStep['kind'], string> = {
  filter: 'Keep players that pass a threshold',
  group: 'Keep players tied with each other on a field — for a standout value nobody else shares, use Rank instead',
  rank: 'Narrow to whoever is highest/lowest on a field (add a tolerance to also keep close runners-up)',
  unless: 'Normally leave the pool as-is — unless a different condition is true elsewhere in the game, then replace/add/suppress the result',
}
export const MAX_PIPELINE_STEPS = 10

// `anchorFrom` (only ever used for a new Unless step, and only matters once
// `uses_anchor` is turned on) copies the category/field/recency/book of
// whatever step precedes it in the list — the anchor is overwhelmingly
// almost always "whatever we just grouped/ranked on," so this is the sane
// default rather than making a member re-pick it every time. New Unless
// steps default `uses_anchor` to false (most "unless" formulas are a plain
// existence check with no number to compare) and `unless_mode` to 'replace'
// (the original, most common behavior) — both freely changeable in the UI.
export function newPipelineStep(kind: MatrixPipelineStep['kind'], anchorFrom?: MatrixPipelineStep): MatrixPipelineStep {
  const seedFromAnchor = kind === 'unless' && !!anchorFrom
  const category: MatrixFactor['category'] = seedFromAnchor ? anchorFrom!.category : 'odds'
  const fieldsList = fieldsForCategory(category).filter(f => !f.boolean)
  const field_key = seedFromAnchor && fieldsList.some(f => f.key === anchorFrom!.field_key) ? anchorFrom!.field_key : fieldsList[0].key
  return {
    kind, category, field_key,
    recency: seedFromAnchor ? anchorFrom!.recency : null,
    book: seedFromAnchor ? anchorFrom!.book : null,
    books: null, books_min_count: null,
    operator: kind === 'filter' ? 'gte' : null,
    value: null,
    direction: kind === 'rank' ? 'highest' : null,
    tolerance: null,
    condition_scope: kind === 'unless' ? 'team' : null,
    condition_steps: kind === 'unless' ? [] : null,
    then_steps: kind === 'unless' ? [] : null,
    unless_mode: kind === 'unless' ? 'replace' : null,
    uses_anchor: kind === 'unless' ? false : null,
    mm_base_window: null, mm_compare_windows: null, mm_direction: null, mm_match_mode: null, mm_amount_mode: null,
  }
}

// `hasAnchor` (true only for a step living inside an Unless step's
// condition/then list) unlocks the lt_anchor/gt_anchor filter operators —
// "lower/higher than the tied value" — worded plainly rather than exposing
// the word "anchor" to the member.
function PipelineStepCard({ step, index, hasAnchor, dragControls, onChange, onRemove }: {
  step: MatrixPipelineStep; index: number; hasAnchor?: boolean; dragControls?: DragControls
  onChange: (s: MatrixPipelineStep) => void; onRemove: () => void
}) {
  // group/rank exclude boolean fields (Is PWR ⚡?) — "tied"/"highest" on a
  // Yes/No is meaningless, same exclusion TiebreakerRow already applies.
  const fields = step.kind === 'filter' ? fieldsForCategory(step.category) : fieldsForCategory(step.category).filter(f => !f.boolean)
  const isBoolean = step.kind === 'filter' && fields.find(f => f.key === step.field_key)?.boolean === true
  const isBooksField = step.kind === 'filter' && isBooksFieldKey(step.field_key)
  // 'mm_trend' spans all 4 windows itself (see MmTrendFields below) — the
  // plain recency picker is meaningless once that operator is selected.
  const needsRecency = (step.category === 'pitchlog_stat' || step.category === 'savant_stat' || (step.category === 'dugout_specs' && step.field_key === 'mm'))
    && step.operator !== 'mm_trend'
  const needsValue = step.operator === 'gte' || step.operator === 'lte' || step.operator === 'eq'
  const hidesValue = step.kind === 'filter' && !needsValue
  const multiBookFilter = step.kind === 'filter' && step.category === 'odds' ? MULTI_BOOK_FIELDS[step.field_key] : null
  const singleBookField = step.kind !== 'filter' && step.category === 'odds' ? MULTI_BOOK_FIELDS[step.field_key] : null
  // Real gap, reported live (2026-07-27): 'positive'/'negative' was gated to
  // dugout_specs only, but a pitchlog_stat/savant_stat field on a '_delta'
  // recency (Bat Speed/Squared-Up%, the only two with one) is just as
  // signed a value (recent minus season) — see CustomMatrixPanel.tsx's
  // FactorRow for the matching Classic-mode fix.
  const isDeltaRecency = typeof step.recency === 'string' && step.recency.endsWith('_delta')

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
        <GripVertical
          size={14}
          onPointerDown={e => dragControls?.start(e)}
          style={{ color: 'var(--text-3)', cursor: dragControls ? 'grab' : 'default', flexShrink: 0, touchAction: 'none' }}
        />
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
              // 'mm_trend' is only ever offered for field_key 'mm' — switching
              // away from it resets to a plain threshold.
              ...(step.operator === 'mm_trend' && field_key !== 'mm' ? { operator: 'gte' as const, value: null } : {}),
              // Switching TO 'mm_move' (any step kind — filter threshold,
              // group tie, or rank) needs its own base/compare windows.
              ...(field_key === 'mm_move' && !step.mm_base_window ? { mm_base_window: 'l10' as const, mm_compare_windows: ['l1'] as const } : {}),
            })
          }}
          style={{ fontSize: 11, padding: '5px 6px', minWidth: 150, flex: '1 1 150px' }}
        >
          {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>

        {step.field_key === 'mm_move' && (
          <MmMoveWindowPicker
            baseWindow={step.mm_base_window} compareWindows={step.mm_compare_windows}
            onPatch={patch => onChange({ ...step, ...patch })}
          />
        )}

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
              onChange={e => {
                const operator = e.target.value as MatrixPipelineStep['operator']
                onChange({
                  ...step, operator,
                  ...(operator === 'mm_trend' && !step.mm_base_window
                    ? { mm_base_window: 'l10' as const, mm_compare_windows: ['l1'] as const, mm_direction: 'decreased' as const, mm_match_mode: null, mm_amount_mode: null }
                    : {}),
                })
              }}
              style={{ fontSize: 11, padding: '5px 6px', width: 190 }}
            >
              <option value="gte">At least</option>
              <option value="lte">At most</option>
              <option value="eq">Exactly</option>
              {!isBooksField && (
                <>
                  <option value="is_null">Is blank (no value)</option>
                  <option value="is_not_null">Has a value</option>
                </>
              )}
              {hasAnchor && !isBooksField && (
                <>
                  <option value="lt_anchor">Lower than the tied value</option>
                  <option value="gt_anchor">Higher than the tied value</option>
                </>
              )}
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
                  {step.field_key === 'mm' && <option value="mm_trend">Trend across L1/L3/L5/L10</option>}
                </>
              )}
              {step.category !== 'dugout_specs' && isDeltaRecency && (
                <>
                  <option value="positive">Is positive (+)</option>
                  <option value="negative">Is negative (−)</option>
                </>
              )}
            </select>
            {step.operator === 'mm_trend' && (
              <MmTrendFields
                baseWindow={step.mm_base_window} compareWindows={step.mm_compare_windows}
                direction={step.mm_direction} amount={step.value} matchMode={step.mm_match_mode}
                amountMode={step.mm_amount_mode}
                onPatch={patch => onChange({ ...step, ...patch })}
              />
            )}
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
            onChange={e => {
              const recency = e.target.value as MatrixFactor['recency']
              const stillDelta = typeof recency === 'string' && recency.endsWith('_delta')
              onChange({
                ...step, recency,
                // Same reset as CustomMatrixPanel.tsx's FactorRow — leaving
                // 'positive'/'negative' selected while switching away from a
                // '_delta' recency would strand the step on an operator its
                // own dropdown no longer offers.
                ...((step.operator === 'positive' || step.operator === 'negative') && step.category !== 'dugout_specs' && !stillDelta
                  ? { operator: 'gte' as const, value: null }
                  : {}),
              })
            }}
            title="Every window here (even Season) only counts games against whichever pitcher hand this player's real opponent throws on the day being evaluated — not every game he's played, full stop"
            style={{ fontSize: 11, padding: '5px 6px', width: 100 }}
          >
            {/* '_delta' options only for Bat Speed/Squared-Up% — see
                CustomMatrixPanel.tsx's recencyOptionsFor/DELTA_DISPLAYED_FIELDS:
                those are the only two fields the board actually shows a
                computed Δ for, so they're the only ones with a real number
                to calibrate a delta threshold against. */}
            {recencyOptionsFor(step.category, step.field_key).map(r => (
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
            onChange={e => onChange({ ...step, direction: e.target.value as 'highest' | 'lowest' | 'closest_zero' })}
            style={{ fontSize: 11, padding: '5px 6px', width: 110 }}
          >
            <option value="highest">Highest</option>
            <option value="lowest">Lowest</option>
            <option value="closest_zero">Closest to 0</option>
          </select>
        )}

        {step.kind === 'group' && (
          <select
            className="ss-input" value={step.direction ?? 'all'}
            onChange={e => onChange({ ...step, direction: e.target.value === 'all' ? null : e.target.value as 'highest' | 'lowest' })}
            title="When more than one pair/group ties at different values, which one to keep"
            style={{ fontSize: 11, padding: '5px 6px', width: 170 }}
          >
            <option value="all">Keep every tied group</option>
            <option value="highest">Keep the highest-tied group</option>
            <option value="lowest">Keep the lowest-tied group</option>
          </select>
        )}

        {step.kind === 'rank' && (
          <input
            type="number" min={0} step={0.01} className="ss-input"
            placeholder="± tolerance"
            title="Also keep anyone within this amount of the best value (e.g. 0.02) — leave blank for an exact match only"
            value={step.tolerance ?? ''}
            onChange={e => onChange({ ...step, tolerance: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
            style={{ fontSize: 11, padding: '5px 6px', width: 90 }}
          />
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

// An Unless step's own row picks the ANCHOR field (its category/field_key/
// recency/book), the search scope for its condition, and contains two
// nested StepLists (condition, then) — capped at allowUnless=false so a
// member can never nest a second Unless inside either one.
function UnlessStepCard({ step, index, dragControls, onChange, onRemove }: {
  step: MatrixPipelineStep; index: number; dragControls?: DragControls
  onChange: (s: MatrixPipelineStep) => void; onRemove: () => void
}) {
  const fields = fieldsForCategory(step.category).filter(f => !f.boolean)
  const needsRecency = step.category === 'pitchlog_stat' || step.category === 'savant_stat' || (step.category === 'dugout_specs' && step.field_key === 'mm')
  const singleBookField = step.category === 'odds' ? MULTI_BOOK_FIELDS[step.field_key] : null

  function changeCategory(category: MatrixFactor['category']) {
    const opts = fieldsForCategory(category).filter(f => !f.boolean)
    onChange({ ...step, category, field_key: opts[0].key, book: null, recency: category === 'pitchlog_stat' || category === 'savant_stat' ? 'season' : null })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px',
      background: 'var(--surface-2)', border: `1px solid ${KIND_COLOR.unless}`, borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GripVertical
          size={14}
          onPointerDown={e => dragControls?.start(e)}
          style={{ color: 'var(--text-3)', cursor: dragControls ? 'grab' : 'default', flexShrink: 0, touchAction: 'none' }}
        />
        <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-3)', flexShrink: 0 }}>{index + 1}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 999,
          color: KIND_COLOR.unless, background: 'var(--surface-3)', border: `1px solid ${KIND_COLOR.unless}`,
        }}>
          UNLESS
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{KIND_DESC.unless}</span>
        <button onClick={onRemove} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 22 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>SEARCH FOR THE EXCEPTION ON</span>
        <select
          className="ss-input" value={step.condition_scope ?? 'team'}
          onChange={e => onChange({ ...step, condition_scope: e.target.value as 'team' | 'game' })}
          style={{ fontSize: 11, padding: '5px 6px', width: 130 }}
        >
          <option value="team">Same team</option>
          <option value="game">Either team</option>
        </select>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em', marginLeft: 8 }}>WHEN FOUND</span>
        <select
          className="ss-input" value={step.unless_mode ?? 'replace'}
          onChange={e => onChange({ ...step, unless_mode: e.target.value as MatrixPipelineStep['unless_mode'] })}
          title="What happens to the normal pool once the exception condition below is found"
          style={{ fontSize: 11, padding: '5px 6px', width: 190 }}
        >
          <option value="replace">Replace with the exception</option>
          <option value="add">Add the exception too</option>
          <option value="suppress">Suppress — highlight nobody</option>
        </select>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 22, fontSize: 10, color: 'var(--text-3)', cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox" checked={step.uses_anchor === true}
          onChange={e => onChange({ ...step, uses_anchor: e.target.checked })}
          style={{ margin: 0 }}
        />
        Compare the exception against a value from my normal picks
      </label>

      {step.uses_anchor === true && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', paddingLeft: 22 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>TIED VALUE FROM</span>
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
              onChange({
                ...step, field_key, book: null,
                ...(field_key === 'mm_move' && !step.mm_base_window ? { mm_base_window: 'l10' as const, mm_compare_windows: ['l1'] as const } : {}),
              })
            }}
            style={{ fontSize: 11, padding: '5px 6px', minWidth: 150, flex: '1 1 150px' }}
          >
            {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          {step.field_key === 'mm_move' && (
            <MmMoveWindowPicker
              baseWindow={step.mm_base_window} compareWindows={step.mm_compare_windows}
              onPatch={patch => onChange({ ...step, ...patch })}
            />
          )}
          {needsRecency && (
            <select
              className="ss-input" value={step.recency ?? 'season'}
              onChange={e => onChange({ ...step, recency: e.target.value as MatrixFactor['recency'] })}
              title="Every window here (even Season) only counts games against whichever pitcher hand this player's real opponent throws on the day being evaluated — not every game he's played, full stop"
              style={{ fontSize: 11, padding: '5px 6px', width: 100 }}
            >
              {recencyOptionsFor(step.category, step.field_key).map(r => (
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
        </div>
      )}

      <div style={{ paddingLeft: 22, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--gold)', letterSpacing: '0.05em', marginBottom: 6 }}>IF THIS IS TRUE</div>
        <StepList
          steps={step.condition_steps ?? []}
          onChange={condition_steps => onChange({ ...step, condition_steps })}
          allowUnless={false} hasAnchor={step.uses_anchor === true} showHeader={false}
          emptyText="No condition yet — add a Filter/Group/Rank step to define what triggers this exception."
        />
      </div>

      {step.unless_mode === 'suppress' ? (
        <div style={{ paddingLeft: 22, borderTop: '1px dashed var(--border)', paddingTop: 8, fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>
          Highlighting is suppressed entirely for this pool once the condition above is found — nobody gets highlighted.
        </div>
      ) : (
        <div style={{ paddingLeft: 22, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.05em', marginBottom: 6 }}>
            {step.unless_mode === 'add' ? 'THEN ALSO HIGHLIGHT' : 'THEN DO THIS INSTEAD'}
          </div>
          <StepList
            steps={step.then_steps ?? []}
            onChange={then_steps => onChange({ ...step, then_steps })}
            allowUnless={false} hasAnchor={step.uses_anchor === true} showHeader={false}
            emptyText="No replacement rule yet — add a Rank step to pick the winner among whoever the condition found."
          />
        </div>
      )}
    </div>
  )
}

// The "+ Add step" control — a choice picker rather than a generic button,
// since the whole point of Pipeline mode is a member choosing which verb
// they mean at each point in the chain.
const ADD_STEP_MENU_WIDTH = 220

function AddStepMenu({ onAdd, disabled, allowUnless }: { onAdd: (kind: MatrixPipelineStep['kind']) => void; disabled: boolean; allowUnless: boolean }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const kinds = allowUnless ? (['filter', 'group', 'rank', 'unless'] as const) : (['filter', 'group', 'rank'] as const)

  useEffect(() => { setMounted(true) }, [])

  // Real gap, reported live (2026-07-26): this menu used to render as a
  // plain position:absolute child of its own button — fine at the top
  // level, but an Unless step's condition/then StepLists nest their own
  // "Add step" button several levels deep inside the Matrix modal's own
  // scrollable body (CustomMatrixPanel.tsx's overflowY:auto container),
  // and per the CSS overflow spec, setting overflow-y to a non-visible
  // value also forces overflow-x to behave as non-visible on that same
  // box — so any menu that popped out wider than the modal's remaining
  // width got silently clipped off-screen, invisible and unclickable.
  // Portaled to document.body with fixed/viewport coordinates instead
  // (same fix already used for Tooltip in ui/tooltip-card.tsx) so it
  // always renders on top of everything, never clipped by an ancestor.
  // Recomputed once at open time (not tracked live) and dismissed on
  // scroll — this menu is only open for the second it takes to pick an
  // option, so a live-tracking reposition isn't worth the complexity.
  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const left = Math.max(4, Math.min(rect.right - ADD_STEP_MENU_WIDTH, window.innerWidth - ADD_STEP_MENU_WIDTH - 4))
      setMenuPos({ top: rect.bottom + 4, left })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const closeOnScroll = () => setOpen(false)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => window.removeEventListener('scroll', closeOnScroll, true)
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
          color: disabled ? 'var(--text-3)' : 'var(--accent)', background: disabled ? 'var(--surface-2)' : 'var(--accent-dim)',
          border: 'none', borderRadius: 6, padding: '5px 9px', cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <Plus size={12} /> Add step
      </button>
      {mounted && open && !disabled && menuPos && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999, width: ADD_STEP_MENU_WIDTH,
            background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
          }}>
            {kinds.map(kind => (
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
        </>,
        document.body
      )}
    </div>
  )
}

// Reusable list-of-steps renderer — the top-level PipelineBuilder is just
// `<StepList allowUnless />`; an Unless step's condition/then lists are two
// more instances with allowUnless={false} (structurally capping nesting at
// one level, not just by convention) and hasAnchor (unlocking the
// lt_anchor/gt_anchor filter operators). `showHeader=false` drops the
// "Steps (N)" label for the compact nested case, keeping just the Add button.
function StepList({ steps, onChange, allowUnless, hasAnchor, showHeader = true, emptyText }: {
  steps: MatrixPipelineStep[]; onChange: (s: MatrixPipelineStep[]) => void
  allowUnless: boolean; hasAnchor?: boolean; showHeader?: boolean; emptyText?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        {showHeader && <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>Steps ({steps.length})</span>}
        <div style={{ marginLeft: showHeader ? 'auto' : 0 }}>
          <AddStepMenu
            disabled={steps.length >= MAX_PIPELINE_STEPS} allowUnless={allowUnless}
            onAdd={kind => onChange([...steps, newPipelineStep(kind, steps[steps.length - 1])])}
          />
        </div>
      </div>

      {steps.length === 0 ? (
        <div style={{ padding: '18px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
          {emptyText ?? 'No steps yet. Add a Filter, Group, or Rank step to start narrowing your pool of players.'}
        </div>
      ) : (
        <Reorder.Group as="div" axis="y" values={steps} onReorder={onChange} style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((step, i) => (
            <StepListItem
              key={i} step={step} index={i} hasAnchor={hasAnchor}
              onChange={next => onChange(steps.map((s, si) => (si === i ? next : s)))}
              onRemove={() => onChange(steps.filter((_, si) => si !== i))}
            />
          ))}
        </Reorder.Group>
      )}
    </div>
  )
}

// Reorder.Item's default `dragListener` makes the ENTIRE item a drag
// surface — including every dropdown/input inside it, so clicking a select
// could just as easily start a drag as open it, and dragging never had a
// precise, reliable starting point. `dragListener={false}` + a manual
// `dragControls` bound ONLY to the GripVertical handle's pointerdown (see
// PipelineStepCard/UnlessStepCard) fixes both: normal clicks on the card's
// controls stay normal clicks, and a drag only ever starts from the handle.
function StepListItem({ step, index, hasAnchor, onChange, onRemove }: {
  step: MatrixPipelineStep; index: number; hasAnchor?: boolean
  onChange: (s: MatrixPipelineStep) => void; onRemove: () => void
}) {
  const dragControls = useDragControls()
  return (
    <Reorder.Item value={step} as="div" dragListener={false} dragControls={dragControls} style={{ listStyle: 'none' }}>
      {step.kind === 'unless' ? (
        <UnlessStepCard step={step} index={index} dragControls={dragControls} onChange={onChange} onRemove={onRemove} />
      ) : (
        <PipelineStepCard step={step} index={index} hasAnchor={hasAnchor} dragControls={dragControls} onChange={onChange} onRemove={onRemove} />
      )}
    </Reorder.Item>
  )
}

export function PipelineBuilder({ steps, onChange }: { steps: MatrixPipelineStep[]; onChange: (s: MatrixPipelineStep[]) => void }) {
  return <StepList steps={steps} onChange={onChange} allowUnless />
}
