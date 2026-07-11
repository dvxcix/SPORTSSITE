'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    // Store in site_settings table (upsert)
    const supabase = createClient()
    await supabase.from('site_settings').upsert(
      Object.entries(values).map(([key, value]) => ({ key, value: String(value) }))
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {SETTINGS_FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between px-4 py-3.5">
            <label className="text-sm font-medium text-white">{f.label}</label>
            {f.type === 'toggle' ? (
              <button type="button" onClick={() => setValues(v => ({ ...v, [f.key]: !v[f.key] }))}
                style={{ width: '40px', height: '22px', background: values[f.key] ? '#22c55e' : '#3f3f46', borderRadius: '11px', position: 'relative', transition: 'background 0.15s' }}>
                <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', background: 'white', borderRadius: '50%', transition: 'transform 0.15s', transform: values[f.key] ? 'translateX(18px)' : 'translateX(2px)' }} />
              </button>
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
