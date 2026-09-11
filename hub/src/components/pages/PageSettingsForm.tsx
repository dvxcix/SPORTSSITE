'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'
import { sportLogoUrl } from '@/lib/sportLogos'
import Image from 'next/image'
import { Loader2, Save, Trash2 } from 'lucide-react'

const CATEGORIES = ['Team', 'Athlete', 'Media', 'Brand', 'Community', 'Podcast', 'Other']
const EMOJIS = ['⭐', '🏈', '⚾', '🏀', '🏒', '⚽', '🎯', '🔥', '💰', '📊']
const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']

function isSafeImageUrl(value: string) {
  if (!value.trim()) return true
  try { return ['http:', 'https:'].includes(new URL(value.trim()).protocol) } catch { return false }
}

export function PageSettingsForm({ page }: { page: any }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({
    name: page.name ?? '',
    description: page.description ?? '',
    category: page.category ?? '',
    sport: page.sport ?? '',
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
    if (!isSafeImageUrl(form.avatar_url) || !isSafeImageUrl(form.banner_url)) { setError('Image links must begin with https://'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('pages').update({
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category || null,
      sport: form.sport || null,
      emoji: form.emoji,
      avatar_url: form.avatar_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      is_published: form.is_published,
    }).eq('id', page.id)
    if (err) { setError('The page could not be saved. Try again.'); setSaving(false); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  async function deletePage() {
    setDeleting(true); setError('')
    const { error: err } = await supabase.from('pages').delete().eq('id', page.id)
    if (err) { setError('The page could not be deleted. Try again.'); setDeleting(false); return }
    router.push('/pages')
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="ss-flow-form">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="ss-flow-card">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Page Name *</label>
          <input value={form.name} maxLength={60} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} maxLength={280} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputClass + ' resize-none'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => (
              <button key={c} type="button" aria-pressed={form.category === c} onClick={() => setForm(f => ({ ...f, category: c }))}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${form.category === c ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Icon</label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map(e => (
              <button key={e} type="button" aria-pressed={form.emoji === e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${form.emoji === e ? 'bg-zinc-700 ring-2 ring-green-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Sport</label>
          <div className="flex flex-wrap gap-1.5">{SPORTS.map(sport => {
            const value = sport === 'General' ? '' : sport
            const active = form.sport === value
            const logo = sportLogoUrl(sport)
            return <button key={sport} type="button" aria-pressed={active} onClick={() => setForm(f => ({ ...f, sport: value }))} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all ${active ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
              {logo && <Image src={logo} alt="" width={14} height={14} className="object-contain" />}{sport}
            </button>
          })}</div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Avatar Image URL</label>
          <input type="url" value={form.avatar_url} maxLength={500} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Banner Image URL</label>
          <input type="url" value={form.banner_url} maxLength={500} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Published</p>
            <p className="text-xs text-zinc-500">Unpublish to hide this page from everyone but you</p>
          </div>
          <Switch checked={form.is_published} onChange={checked => setForm(f => ({ ...f, is_published: checked }))} ariaLabel="Published" />
        </div>
      </div>

      <button onClick={save} disabled={saving || !form.name.trim()} className="ss-flow-submit">
        {saved ? <><Check size={14} /> Saved</> : saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save changes</>}
      </button>

      <div className="ss-danger-card">
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
            <Trash2 size={14} /> Delete page
          </button>
        )}
      </div>
    </div>
  )
}
