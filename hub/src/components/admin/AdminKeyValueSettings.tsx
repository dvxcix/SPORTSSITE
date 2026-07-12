'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/Switch'

export type SettingField = { key: string; label: string; type: 'text' | 'email' | 'number' | 'toggle'; default: any; hint?: string }

// Generic settings-list component backed by site_settings (key/value text
// rows). Unlike AdminGeneralSettings (its older sibling), this actually
// loads existing saved values on mount instead of always resetting to
// defaults — that was a real bug there, not fixed here since it's a
// separate, already-shipped page outside this task's scope.
export function AdminKeyValueSettings({ fields }: { fields: SettingField[] }) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {}
    fields.forEach(f => { v[f.key] = f.default })
    return v
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
    const supabase = createClient()
    await supabase.from('site_settings').upsert(
      Object.entries(values).map(([key, value]) => ({ key, value: String(value) })),
      { onConflict: 'key' }
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  if (loading) return <div className="text-sm text-zinc-500 py-8 text-center">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {fields.map(f => (
          <div key={f.key} className="flex items-center justify-between px-4 py-3.5">
            <div>
              <label className="text-sm font-medium text-white">{f.label}</label>
              {f.hint && <p className="text-xs text-zinc-500 mt-0.5">{f.hint}</p>}
            </div>
            {f.type === 'toggle' ? (
              <Switch checked={!!values[f.key]} onChange={v => setValues(prev => ({ ...prev, [f.key]: v }))} />
            ) : (
              <input
                type={f.type}
                value={values[f.key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-green-500/50 w-56 text-right shrink-0"
              />
            )}
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-2.5 rounded-xl transition-colors">
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}
