'use client'

import { useState } from 'react'
import { creatorFeeAmount, creatorFeePercentage } from '@/lib/creatorBusiness'
import { useFeedback } from '@/components/ui/FeedbackProvider'

type Settings = {
  fee_independent_creator_pct: number | null
  updatedAt: string | null
}

export function MonetizationSettingsForm({ initial }: { initial: Settings }) {
  const [current, setCurrent] = useState(initial)
  const [input, setInput] = useState(initial.fee_independent_creator_pct?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm } = useFeedback()
  const value = input.trim() === '' ? null : creatorFeePercentage(Number(input))
  const fee = value == null ? null : creatorFeeAmount(20, value)
  const changed = value != null && value !== current.fee_independent_creator_pct

  async function save() {
    if (value == null || !current.updatedAt) { setError('Enter a fee from 0 to 99.99%.'); return }
    if (!await confirm({ title: 'Update the creator fee?', message: `Change the default from ${current.fee_independent_creator_pct}% to ${value}% for newly saved offers. Existing offers and member terms keep their saved fee.`, confirmLabel: 'Update default fee' })) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/platform-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'fee_independent_creator_pct',
          value,
          expectedUpdatedAt: current.updatedAt,
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || 'Failed to save')
      }
      const body = await response.json() as { setting: { value: number; updated_at: string } }
      setCurrent({ fee_independent_creator_pct: body.setting.value, updatedAt: body.setting.updated_at })
      setSaved(true)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {error ? <p role="alert" className="mb-3 text-sm text-[var(--red)]">{error}</p> : null}
      {!current.updatedAt && <p role="alert" className="mb-3 text-sm text-[var(--red)]">The current fee could not be loaded. Reload before editing.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <label htmlFor="creator-platform-fee" className="mb-1 block text-sm font-semibold text-[var(--text-1)]">SlipSurge share</label>
          <p id="creator-fee-help" className="mb-4 text-sm text-[var(--text-2)]">Default for newly saved offers. Existing offers and member terms stay unchanged.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="creator-platform-fee"
              type="number"
              min={0}
              max={99.99}
              step="0.01"
              value={input}
              aria-describedby="creator-fee-help"
              disabled={saving || !current.updatedAt}
              onChange={event => { setInput(event.target.value); setSaved(false) }}
              className="min-h-11 min-w-0 flex-1 basis-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-1)]"
            />
            <span aria-hidden="true">%</span>
            <button
              type="button"
              onClick={save}
              disabled={saving || !changed || !current.updatedAt}
              className="min-h-11 rounded-lg bg-[var(--accent-fill)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Review change'}
            </button>
            {changed && <button type="button" disabled={saving} className="min-h-11 px-3 text-sm text-[var(--text-2)]" onClick={()=>{setInput(current.fee_independent_creator_pct?.toString()??'');setError(null)}}>Cancel</button>}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Example · $20 offer</h3>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-3 text-sm"><dt className="text-[var(--text-2)]">SlipSurge</dt><dd>{fee == null ? '—' : `$${fee.toFixed(2)}`}</dd><dt className="text-[var(--text-2)]">Creator</dt><dd>{fee == null ? '—' : `$${(20-fee).toFixed(2)}`}</dd></dl>
          <p className="mt-3 text-xs text-[var(--text-2)]">Before Whop processing fees, taxes or refunds. The saved offer records its fee amount.</p>
        </div>
      </div>
      <p role="status" className="mt-3 text-sm text-[var(--text-2)]">{saved ? `Saved. New offers use ${current.fee_independent_creator_pct}%.` : current.fee_independent_creator_pct == null ? '' : `Current default: ${current.fee_independent_creator_pct}%. Changes are recorded in the admin audit log.`}</p>
    </div>
  )
}
