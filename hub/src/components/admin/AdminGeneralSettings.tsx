'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/Switch'

const SETTINGS_FIELDS = [
  { key: 'site_name', label: 'Site Name', type: 'text', default: 'SlipSurge' },
  { key: 'site_tagline', label: 'Tagline', type: 'text', default: 'The Social Hub for Sports & Betting' },
  { key: 'site_email', label: 'Contact Email', type: 'email', default: '' },
  { key: 'allow_registration', label: 'Allow New Registrations', type: 'toggle', default: true },
  { key: 'email_verification', label: 'Require Email Verification', type: 'toggle', default: false },
  { key: 'maintenance_mode', label: 'Maintenance Mode', type: 'toggle', default: false },
  { key: 'max_post_length', label: 'Max Post Length', type: 'number', default: 500 },
  { key: 'posts_per_page', label: 'Posts Per Page', type: 'number', default: 30 },
]

export function AdminGeneralSettings() {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {}
    SETTINGS_FIELDS.forEach(f => { v[f.key] = f.default })
    return v
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Previously this never loaded the actually-saved row at all — every page
  // load silently showed the hardcoded defaults (e.g. "Allow New
  // Registrations" = on) regardless of what was really saved, and hitting
  // Save while looking at a stale/default screen would overwrite the real
  // value right back to that default.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    Promise.resolve(supabase.from('site_settings').select('key, value').in('key', SETTINGS_FIELDS.map(f => f.key)))
      .then(({ data }) => {
        if (cancelled || !data) return
        setValues(prev => {
          const next = { ...prev }
          for (const row of data) {
            const field = SETTINGS_FIELDS.find(f => f.key === row.key)
            if (!field) continue
            next[row.key] = field.type === 'toggle' ? row.value === 'true' : field.type === 'number' ? Number(row.value) : row.value
          }
          return next
        })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function save() {
    setSaving(true)
    // Store in site_settings table (upsert)
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
        {SETTINGS_FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between px-4 py-3.5">
            <label className="text-sm font-medium text-white">{f.label}</label>
            {f.type === 'toggle' ? (
              <Switch checked={!!values[f.key]} onChange={v => setValues(prev => ({ ...prev, [f.key]: v }))} />
            ) : (
              <input
                type={f.type}
                value={values[f.key]}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-green-500/50 w-48 text-right"
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
