'use client'

import { useState } from 'react'

type Settings = {
  fee_independent_creator_pct: number
}

export function MonetizationSettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/platform-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'fee_independent_creator_pct',
          value: values.fee_independent_creator_pct,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || 'Failed to save')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {error ? <p className="mb-3 text-xs text-[var(--red)]">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <label htmlFor="creator-platform-fee" className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--text-2)]">Creator platform fee %</label>
          <p className="mb-2 text-xs text-[var(--text-3)]">Application fee collected by SlipSurge when a creator publishes a Whop membership or one-time offer.</p>
          <div className="flex items-center gap-2">
            <input
              id="creator-platform-fee"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={values.fee_independent_creator_pct}
              onChange={event => setValues(current => ({ ...current, fee_independent_creator_pct: Number(event.target.value) }))}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-1)]"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[var(--accent-fill)] px-3 py-2 text-xs font-bold text-[var(--accent-fg)] disabled:opacity-50"
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
