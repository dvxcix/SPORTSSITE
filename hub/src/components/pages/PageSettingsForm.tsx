'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'

const CATEGORIES = ['Team', 'Athlete', 'Media', 'Brand', 'Community', 'Podcast', 'Other']
const EMOJIS = ['⭐', '🏈', '⚾', '🏀', '🏒', '⚽', '🎯', '🔥', '💰', '📊']

export function PageSettingsForm({ page }: { page: any }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({
    name: page.name ?? '',
    description: page.description ?? '',
    category: page.category ?? '',
    emoji: page.emoji ?? '⭐',
    avatar_url: page.avatar_url ?? '',
    banner_url: page.banner_url ?? '',
    is_published: page.is_published ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function save() {
    if (!form.name.trim()) { setError('Page name is required'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('pages').update({
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category || null,
      emoji: form.emoji,
      avatar_url: form.avatar_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      is_published: form.is_published,
    }).eq('id', page.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  async function deletePage() {
    setDeleting(true); setError('')
    const { error: err } = await supabase.from('pages').delete().eq('id', page.id)
    if (err) { setError(err.message); setDeleting(false); return }
    router.push('/pages')
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Page Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputClass + ' resize-none'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, category: c }))}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${form.category === c ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Emoji Icon</label>
          <div className="flex gap-2">
            {EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: e }))}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${form.emoji === e ? 'bg-zinc-700 ring-2 ring-green-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Avatar Image URL</label>
          <input value={form.avatar_url} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Banner Image URL</label>
          <input value={form.banner_url} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Published</p>
            <p className="text-xs text-zinc-500">Unpublish to hide this page from everyone but you</p>
          </div>
          <button type="button" onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
            style={{ width: '40px', height: '22px', background: form.is_published ? '#22c55e' : '#3f3f46', borderRadius: '11px', position: 'relative', transition: 'background 0.15s' }}>
            <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', background: 'white', borderRadius: '50%', transition: 'transform 0.15s', transform: form.is_published ? 'translateX(18px)' : 'translateX(2px)' }} />
          </button>
        </div>
      </div>

      <button onClick={save} disabled={saving || !form.name.trim()}
        className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving…' : 'Save Changes'}
      </button>

      <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-4">
        <h3 className="font-bold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-xs text-zinc-500 mb-3">Permanently delete this page and all its posts. This cannot be undone.</p>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <button onClick={deletePage} disabled={deleting} className="bg-red-500 hover:bg-red-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
              {deleting ? 'Deleting…' : 'Yes, delete this page'}
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-zinc-400 hover:text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="border border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            Delete Page
          </button>
        )}
      </div>
    </div>
  )
}
