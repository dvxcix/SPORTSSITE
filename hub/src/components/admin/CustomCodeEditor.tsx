'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function CustomCodeEditor() {
  const [css, setCss] = useState('')
  const [js, setJs] = useState('')
  const [headHtml, setHeadHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function save() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('site_settings').upsert([
      { key: 'custom_css', value: css },
      { key: 'custom_js', value: js },
      { key: 'custom_head_html', value: headHtml },
    ])
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const editorClass = "w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-4 py-3 text-sm text-[var(--green)] font-mono placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)] resize-y min-h-[120px]"

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-2">Custom CSS</label>
        <textarea value={css} onChange={e => setCss(e.target.value)}
          placeholder="/* Add custom styles here */" className={editorClass} rows={6} />
      </div>
      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-2">Custom JavaScript</label>
        <textarea value={js} onChange={e => setJs(e.target.value)}
          placeholder="// Add custom scripts here" className={editorClass} rows={6} />
      </div>
      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-2">Custom &lt;head&gt; HTML</label>
        <textarea value={headHtml} onChange={e => setHeadHtml(e.target.value)}
          placeholder="<!-- Analytics, meta tags, etc. -->" className={editorClass} rows={4} />
      </div>
      {error && <div className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{error}</div>}
      <button onClick={save} disabled={saving}
        className="w-full bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold py-2.5 rounded-xl transition-colors">
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Custom Code'}
      </button>
    </div>
  )
}
