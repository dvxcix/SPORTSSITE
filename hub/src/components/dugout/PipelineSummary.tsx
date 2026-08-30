'use client'
import React from 'react'
import { fieldLabel } from './CustomMatrixPanel'
import type { MatrixPipelineStep } from './PipelineBuilder'

const OP_WORD: Record<string, string> = {
  gte: 'at least', lte: 'at most', eq: 'exactly',
  up: 'moved up since open', down: 'moved down since open', flat: 'unchanged since open',
  up_or_flat: 'moved up or unchanged since open', down_or_flat: 'moved down or unchanged since open',
  positive: 'positive', negative: 'negative', zero: 'zero',
  is_null: 'blank (no value)', is_not_null: 'has a value',
  lt_anchor: 'lower than the tied value', gt_anchor: 'higher than the tied value',
}
const MM_WINDOW_WORD: Record<string, string> = { l1: 'L1', l3: 'L3', l5: 'L5', l10: 'L10' }
const MM_DIRECTION_WORD: Record<string, string> = {
  increased: 'increased', decreased: 'decreased', moved: 'moved', crossed_positive: 'crossed to +', crossed_negative: 'crossed to -',
  flat: 'stayed flat',
}

function describeMmTrend(step: MatrixPipelineStep): string {
  const base = step.mm_base_window ? MM_WINDOW_WORD[step.mm_base_window] ?? step.mm_base_window : '?'
  const compare = (step.mm_compare_windows ?? []).map(w => MM_WINDOW_WORD[w] ?? w)
  const dir = step.mm_direction ? MM_DIRECTION_WORD[step.mm_direction] ?? step.mm_direction : '?'
  const needsAmount = step.mm_direction === 'increased' || step.mm_direction === 'decreased' || step.mm_direction === 'moved'
  const amount = needsAmount && step.value != null ? ` by ${step.value}${step.mm_amount_mode === 'exactly' ? '' : '+'}` : ''
  const mode = compare.length > 1 ? (step.mm_match_mode === 'all' ? ' (all)' : ' (any)') : ''
  return `MM ${dir}${amount} from ${base} to ${compare.join('/') || '?'}${mode}`
}

function fieldLabelFor(step: MatrixPipelineStep): string {
  const base = fieldLabel(step.category, step.field_key)
  if (step.field_key !== 'mm_move') return base
  const from = step.mm_base_window ? MM_WINDOW_WORD[step.mm_base_window] ?? step.mm_base_window : '?'
  const to = (step.mm_compare_windows ?? []).map(w => MM_WINDOW_WORD[w] ?? w).join('/')
  return `${base} (${from} vs ${to || '?'})`
}

function describeMovement(step: MatrixPipelineStep, field: string): string | null {
  if (!step.field_key.endsWith('_move')) return null
  const value = step.value ?? 0
  if (step.operator === 'eq' && value === 0) return `${field} had no displayed change`
  if (value < 0) return `${field} moved down by ${step.operator === 'eq' ? 'exactly' : 'at least'} ${Math.abs(value).toFixed(2)}`
  if (value > 0) return `${field} moved up by ${step.operator === 'eq' ? 'exactly' : 'at least'} ${Math.abs(value).toFixed(2)}`
  return null
}

function describeStep(step: MatrixPipelineStep): string {
  const field = fieldLabelFor(step)
  if (step.kind === 'filter') {
    if (step.operator === 'mm_trend') return describeMmTrend(step)
    const movement = describeMovement(step, field)
    if (movement) return movement
    const op = step.operator ? OP_WORD[step.operator] ?? step.operator : ''
    const needsValue = step.operator === 'gte' || step.operator === 'lte' || step.operator === 'eq'
    return `${field} ${op}${needsValue && step.value != null ? ` ${step.value}` : ''}`.trim()
  }
  if (step.kind === 'group') {
    const which = step.direction === 'highest' ? ' (highest group)' : step.direction === 'lowest' ? ' (lowest group)' : ''
    return `tied on ${field}${which}`
  }
  if (step.kind === 'rank') {
    const tol = step.tolerance ? ` (±${step.tolerance})` : ''
    const dirWord = step.direction === 'lowest' ? 'lowest' : step.direction === 'closest_zero' ? 'closest to 0' : step.direction === 'farthest_zero' ? 'farthest from 0' : 'highest'
    return `${dirWord} ${field}${tol}`
  }
  const scope = step.condition_scope === 'game' ? 'either team' : 'the same team'
  const condition = describeChain(step.condition_steps ?? []) || '…'
  const mode = step.unless_mode ?? 'replace'
  if (mode === 'suppress') return `unless ${condition} on ${scope} → then show nobody`
  const then = describeChain(step.then_steps ?? []) || '…'
  if (mode === 'add') return `unless ${condition} on ${scope} → then ALSO ${then}`
  return `unless ${condition} on ${scope} → then ${then}`
}

function connectorFor(steps: MatrixPipelineStep[], index: number): 'AND' | 'OR' | '→' {
  const step = steps[index]
  const previous = steps[index - 1]
  if (step?.kind === 'filter' && previous?.kind === 'filter') return step.join_mode === 'or' ? 'OR' : 'AND'
  return '→'
}

function describeChain(steps: MatrixPipelineStep[]): string {
  return steps.reduce((text, step, index) => {
    if (index === 0) return describeStep(step)
    return `${text} ${connectorFor(steps, index)} ${describeStep(step)}`
  }, '')
}

export function PipelineSummary({ steps }: { steps: MatrixPipelineStep[] }) {
  if (!steps.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        Your formula will appear here as you add steps below.
      </div>
    )
  }
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-1)', padding: '10px 12px', background: 'var(--accent-dim)', border: '1px solid var(--border-2)', borderRadius: 8 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>YOUR FORMULA</span>
      {steps.map((step, index) => {
        const connector = index > 0 ? connectorFor(steps, index) : null
        return (
          <React.Fragment key={index}>
            {connector && (
              <span style={{ color: connector === '→' ? 'var(--text-3)' : 'var(--accent)', margin: '0 6px', fontWeight: 900 }}>
                {connector}
              </span>
            )}
            {describeStep(step)}
          </React.Fragment>
        )
      })}
    </div>
  )
}
