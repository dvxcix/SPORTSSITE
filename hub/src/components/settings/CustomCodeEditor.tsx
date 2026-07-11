'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'

export function CustomCodeEditor({ initial }: { initial: Record<string, string> }) {
  const supabase = createClient()
  const [css, setCss] = useState(initial.custom_css ?? '')
  const [js, setJs] = useState(initial.custom_js ?? '')
  const [headHtml, setHeadHtml] = useState(initial.custom_head_html ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('site_settings').upsert([
      { key: 'custom_css', value: css },
      { key: 'custom_js', value: js },
      { key: 'custom_head_html', value: headHtml },
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  const taClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 font-mono outline-none focus:border-green-500/50 transition-all resize-y"

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Custom CSS</label>
        <textarea value={css} onChange={e => setCss(e.target.value)} rows={8} placeholder="/* your custom CSS */" className={taClass} />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Custom JavaScript</label>
        <textarea value={js} onChange={e => setJs(e.target.value)} rows={8} placeholder="// your custom JS" className={taClass} />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Custom &lt;head&gt; HTML</label>
        <textarea value={headHtml} onChange={e => setHeadHtml(e.target.value)} rows={5} placeholder="<!-- meta tags, scripts, etc. -->" className={taClass} />
      </div>
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-6 py-2.5 rounded-xl text-sm transition-colors">
        {saved ? <><Check size={13} /> Saved!</> : saving ? 'Saving…' : 'Save Code'}
      </button>
    </div>
  )
}
