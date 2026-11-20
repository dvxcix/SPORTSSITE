'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'

export function AdminGeneralSettings({ initial }: { initial: Record<string, string> }) {
  const supabase = createClient()
  const [values, setValues] = useState({
    site_name: initial.site_name ?? 'SlipSurge',
    site_tagline: initial.site_tagline ?? 'The Sports Betting Social Hub',
    contact_email: initial.contact_email ?? '',
    allow_registration: initial.allow_registration ?? 'true',
    maintenance_mode: initial.maintenance_mode ?? 'false',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('site_settings').upsert(
      Object.entries(values).map(([key, value]) => ({ key, value: String(value) }))
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  const inputClass = "w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)] transition-all"

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Site Name</label>
          <input value={values.site_name} onChange={e => setValues(v => ({ ...v, site_name: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Tagline</label>
          <input value={values.site_tagline} onChange={e => setValues(v => ({ ...v, site_tagline: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Contact Email</label>
          <input value={values.contact_email} onChange={e => setValues(v => ({ ...v, contact_email: e.target.value }))} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'allow_registration', label: 'Allow Registration' },
            { key: 'maintenance_mode', label: 'Maintenance Mode' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between bg-[var(--surface-2)] rounded-xl px-4 py-3">
              <span className="text-sm font-bold text-[var(--text-1)]">{label}</span>
              <Switch
                checked={values[key as keyof typeof values] === 'true'}
                onChange={checked => setValues(v => ({ ...v, [key]: checked ? 'true' : 'false' }))}
                ariaLabel={label}
              />
            </div>
          ))}
        </div>
      </div>
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
        {saved ? <><Check size={13} /> Saved!</> : saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}
