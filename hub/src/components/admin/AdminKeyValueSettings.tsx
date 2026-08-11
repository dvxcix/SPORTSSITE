'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/Switch'

type SettingValue = string | number | boolean
export type SettingField = { key: string; label: string; type: 'text' | 'email' | 'number' | 'toggle'; default: SettingValue; hint?: string }

// Generic settings-list component backed by site_settings (key/value text
// rows). Unlike AdminGeneralSettings (its older sibling), this actually
// loads existing saved values on mount instead of always resetting to
// defaults — that was a real bug there, not fixed here since it's a
// separate, already-shipped page outside this task's scope.
export function AdminKeyValueSettings({ fields }: { fields: SettingField[] }) {
  const [values, setValues] = useState<Record<string, SettingValue>>(() => {
    const v: Record<string, SettingValue> = {}
    fields.forEach(f => { v[f.key] = f.default })
    return v
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    Promise.resolve(supabase.from('site_settings').select('key, value').in('key', fields.map(f => f.key)))
      .then(({ data }) => {
        if (cancelled || !data) return
        setValues(prev => {
          const next = { ...prev }
          for (const row of data) {
            const field = fields.find(f => f.key === row.key)
            if (!field) continue
            next[row.key] = field.type === 'toggle' ? row.value === 'true' : field.type === 'number' ? Number(row.value) : row.value
          }
          return next
        })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.from('site_settings').upsert(
      Object.entries(values).map(([key, value]) => ({ key, value: String(value) })),
      { onConflict: 'key' }
    )
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="text-sm text-zinc-500 py-8 text-center">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {fields.map(f => (
          <div key={f.key} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="text-sm font-medium text-white">{f.label}</label>
              {f.hint && <p className="text-xs text-zinc-500 mt-0.5">{f.hint}</p>}
            </div>
            {f.type === 'toggle' ? (
              <Switch checked={!!values[f.key]} onChange={v => setValues(prev => ({ ...prev, [f.key]: v }))} ariaLabel={f.label} />
            ) : (
              <input
                type={f.type}
                value={String(values[f.key] ?? '')}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                className="w-full shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-left text-sm text-white outline-none focus:border-green-500/50 sm:w-56 sm:py-1.5 sm:text-right"
              />
            )}
          </div>
        ))}
      </div>
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <button onClick={save} disabled={saving}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-2.5 rounded-xl transition-colors">
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}
