'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { uploadMedia } from '@/lib/uploadMedia'
import { Switch as Toggle } from '@/components/ui/Switch'
import { X } from 'lucide-react'
import type { ChangelogEntry } from '@/lib/changelog'

const EMPTY_DRAFT = { id: null as string | null, title: '', description: '', how_to_use: '', screenshot_urls: [] as string[], is_active: false }
type Draft = typeof EMPTY_DRAFT

export function ChangelogManager({ initialEntries }: { initialEntries: ChangelogEntry[] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  function startNew() { setDraft({ ...EMPTY_DRAFT }); setError('') }
  function startEdit(entry: ChangelogEntry) {
    setDraft({ id: entry.id, title: entry.title, description: entry.description, how_to_use: entry.how_to_use ?? '', screenshot_urls: entry.screenshot_urls, is_active: entry.is_active })
    setError('')
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !draft) return
    setUploading(true)
    setError('')
    for (const file of Array.from(files)) {
      const result = await uploadMedia(file, 'changelog')
      if ('error' in result) { setError(result.error); continue }
      setDraft(d => d ? { ...d, screenshot_urls: [...d.screenshot_urls, result.publicUrl] } : d)
    }
    setUploading(false)
  }

  function removeScreenshot(url: string) {
    setDraft(d => d ? { ...d, screenshot_urls: d.screenshot_urls.filter(u => u !== url) } : d)
  }

  async function save() {
    if (!draft || !draft.title.trim() || !draft.description.trim()) { setError('Title and description are required.'); return }
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      how_to_use: draft.how_to_use.trim() || null,
      screenshot_urls: draft.screenshot_urls,
      is_active: draft.is_active,
      updated_at: new Date().toISOString(),
    }
    const result = draft.id
      ? await supabase.from('changelog_entries').update(payload).eq('id', draft.id).select().single()
      : await supabase.from('changelog_entries').insert({ ...payload, created_by: user?.id ?? null }).select().single()
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    const saved = result.data as ChangelogEntry
    setEntries(prev => draft.id ? prev.map(e => e.id === saved.id ? saved : e) : [saved, ...prev])
    setDraft(null)
    router.refresh()
  }

  async function toggleActive(entry: ChangelogEntry) {
    const { error: err } = await supabase.from('changelog_entries').update({ is_active: !entry.is_active }).eq('id', entry.id)
    if (err) return
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_active: !e.is_active } : e))
  }

  async function remove(entry: ChangelogEntry) {
    if (!confirm(`Delete "${entry.title}"? This also clears everyone's dismissal record for it.`)) return
    const { error: err } = await supabase.from('changelog_entries').delete().eq('id', entry.id)
    if (err) return
    setEntries(prev => prev.filter(e => e.id !== entry.id))
  }

  return (
    <div className="space-y-6">
      {!draft && (
        <button onClick={startNew} className="bg-green-500 hover:bg-green-400 text-black font-black px-5 py-2.5 rounded-xl text-sm transition-colors">
          + New Entry
        </button>
      )}

      {draft && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Title</label>
            <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Custom Matrix Columns"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">What changed</label>
            <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={3}
              placeholder="What shipped, in plain terms a member would recognize."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">How to use it (optional)</label>
            <textarea value={draft.how_to_use} onChange={e => setDraft({ ...draft, how_to_use: e.target.value })} rows={3}
              placeholder="Step-by-step, if it's not obvious from the description alone."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Screenshots</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {draft.screenshot_urls.map(url => (
                <div key={url} className="relative">
                  <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-zinc-700" />
                  <button onClick={() => removeScreenshot(url)} className="absolute -top-1.5 -right-1.5 bg-zinc-900 border border-zinc-700 rounded-full p-0.5 text-zinc-400 hover:text-white">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
            <input type="file" accept="image/*" multiple disabled={uploading} onChange={e => handleFiles(e.target.files)}
              className="text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-300 file:text-xs" />
            {uploading && <p className="text-xs text-zinc-500 mt-1">Uploading…</p>}
          </div>

          <Toggle checked={draft.is_active} onChange={v => setDraft({ ...draft, is_active: v })} label="Active" />

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-5 py-2.5 rounded-xl text-sm transition-colors">
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
            <button onClick={() => setDraft(null)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-zinc-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {entries.length === 0 && <p className="text-sm text-zinc-600">No entries yet.</p>}
        {entries.map(entry => (
          <div key={entry.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{entry.title}</p>
              <p className="text-xs text-zinc-500 truncate">{entry.description}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{new Date(entry.created_at).toLocaleDateString()} · {entry.screenshot_urls.length} screenshot{entry.screenshot_urls.length === 1 ? '' : 's'}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Toggle checked={entry.is_active} onChange={() => toggleActive(entry)} />
              <button onClick={() => startEdit(entry)} className="text-xs font-bold text-zinc-400 hover:text-white">Edit</button>
              <button onClick={() => remove(entry)} className="text-xs font-bold text-red-400/80 hover:text-red-400">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
