'use client'
import React from 'react'
import { fieldLabel } from './CustomMatrixPanel'
import type { MatrixPipelineStep } from './PipelineBuilder'

const OP_WORD: Record<string, string> = {
  gte: 'at least', lte: 'at most', eq: 'exactly',
  up: 'moved up since open', down: 'moved down since open', flat: 'unchanged since open',
  positive: 'positive', negative: 'negative',
  is_null: 'blank (no value)', is_not_null: 'has a value',
  lt_anchor: 'lower than the tied value', gt_anchor: 'higher than the tied value',
}

// One clause per step, position-independent (no special-casing "first" vs.
// "later" grammar) — the → separators between clauses are what convey the
// pipeline itself, same shape as the walkthrough sentence this feature was
// modeled on ("tied on PA/HR → narrow to matching HR/Parlay → lowest FHR/HR%
// → highest Anytime HR"). Purely mechanical, built from the member's own
// field/operator/direction choices — not written copy.
function describeStep(step: MatrixPipelineStep): string {
  const field = fieldLabel(step.category, step.field_key)
  if (step.kind === 'filter') {
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
    return `${step.direction === 'lowest' ? 'lowest' : 'highest'} ${field}${tol}`
  }
  // unless — describes its own nested condition/then chains recursively.
  const scope = step.condition_scope === 'game' ? 'either team' : 'the same team'
  const condition = describeChain(step.condition_steps ?? [])
  const then = describeChain(step.then_steps ?? [])
  return `unless ${condition || '…'} on ${scope} → then ${then || '…'}`
}

function describeChain(steps: MatrixPipelineStep[]): string {
  return steps.map(describeStep).join(' → ')
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
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: 'var(--text-3)', margin: '0 6px' }}>→</span>}
          {describeStep(s)}
        </React.Fragment>
      ))}
    </div>
  )
}
