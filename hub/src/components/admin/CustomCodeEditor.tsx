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

  const editorClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-green-300 font-mono placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-y min-h-[120px]"

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Custom CSS</label>
        <textarea value={css} onChange={e => setCss(e.target.value)}
          placeholder="/* Add custom styles here */" className={editorClass} rows={6} />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Custom JavaScript</label>
        <textarea value={js} onChange={e => setJs(e.target.value)}
          placeholder="// Add custom scripts here" className={editorClass} rows={6} />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Custom &lt;head&gt; HTML</label>
        <textarea value={headHtml} onChange={e => setHeadHtml(e.target.value)}
          placeholder="<!-- Analytics, meta tags, etc. -->" className={editorClass} rows={4} />
      </div>
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <button onClick={save} disabled={saving}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-2.5 rounded-xl transition-colors">
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Custom Code'}
      </button>
    </div>
  )
}
