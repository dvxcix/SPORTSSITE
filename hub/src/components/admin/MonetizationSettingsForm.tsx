'use client'
import React, { useState } from 'react'

type Settings = {
  fee_independent_creator_pct: number
  fee_pro_plan_creator_pct: number
  pro_plan_price_monthly: number
  pro_plan_stripe_price_id: string | null
}

export function MonetizationSettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async (key: string, value: any) => {
    setSaving(key)
    setError(null)
    try {
      const res = await fetch('/api/admin/platform-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to save')
      }
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 1500)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(null)
    }
  }

  const Field = ({ label, hint, k, type = 'text' }: { label: string; hint: string; k: keyof Settings; type?: string }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{label}</label>
      <p className="text-xs text-zinc-600 mb-2">{hint}</p>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={values[k] ?? ''}
          onChange={e => setValues(v => ({ ...v, [k]: type === 'number' ? Number(e.target.value) : e.target.value }))}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
        />
        <button
          onClick={() => save(k, values[k])}
          disabled={saving === k}
          className="px-3 py-2 rounded-lg bg-green-500 text-black text-xs font-bold disabled:opacity-50"
        >
          {saving === k ? '…' : savedKey === k ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Independent creator fee %" hint="Platform cut on creators who run their own subscription tier (not in Pro Plan)." k="fee_independent_creator_pct" type="number" />
        <Field label="Pro Plan creator fee %" hint="Platform cut on a creator's earned share of the Pro Plan revenue pool." k="fee_pro_plan_creator_pct" type="number" />
        <Field label="Pro Plan price ($/mo)" hint="Display price for the SlipSurge Pro subscription." k="pro_plan_price_monthly" type="number" />
        <Field label="Pro Plan Stripe Price ID" hint="price_... from Stripe — create a recurring monthly Price for the Pro Plan product." k="pro_plan_stripe_price_id" type="text" />
      </div>
    </div>
  )
}
