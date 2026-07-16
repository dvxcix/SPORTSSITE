'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Trash2, Plus, Pencil } from 'lucide-react'

type Platform = { id: string; key: string; name: string; icon_url: string; url_template: string | null; sort_order: number }
const KEY_RE = /^[a-z0-9_]{2,30}$/

export function SocialPlatformManager({ userId, initialPlatforms }: { userId: string; initialPlatforms: Platform[] }) {
  const [platforms, setPlatforms] = useState(initialPlatforms)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [urlTemplate, setUrlTemplate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  async function create() {
    const normalizedKey = key.trim().toLowerCase()
    if (!KEY_RE.test(normalizedKey)) { setError('Key must be 2-30 lowercase letters/numbers/underscores (e.g. "discord", "twitter").'); return }
    if (!name.trim()) { setError('Give it a display name.'); return }
    if (!file) { setError('Choose an icon image.'); return }
    setError('')
    setUploading(true)
    try {
      const path = `social-platforms/${userId}/${Date.now()}-${file.name}`
      let { error: uploadErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      // Storage RLS requires a live `authenticated` session — if the
      // client's access token silently expired, one refresh + retry
      // recovers the common case instead of surfacing a raw RLS error.
      if (uploadErr && /row-level security/i.test(uploadErr.message)) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        if (refreshed.session) {
          ;({ error: uploadErr } = await supabase.storage.from('media').upload(path, file, { upsert: true }))
        }
      }
      if (uploadErr) {
        setError(
          /row-level security/i.test(uploadErr.message)
            ? 'Your session has expired — please refresh the page and sign in again, then retry the upload.'
            : uploadErr.message
        )
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)

      const { data, error: insertErr } = await supabase.from('social_platforms')
        .insert({ key: normalizedKey, name: name.trim(), icon_url: publicUrl, url_template: urlTemplate.trim() || null, sort_order: platforms.length })
        .select('*').single()
      if (insertErr) {
        setError(insertErr.code === '23505' ? `A platform with key "${normalizedKey}" already exists.` : insertErr.message)
        return
      }
      setPlatforms(p => [...p, data as Platform])
      setKey(''); setName(''); setUrlTemplate(''); setFile(null)
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  async function update(id: string, patch: { name: string; urlTemplate: string; file: File | null }) {
    setError('')
    const update: Record<string, any> = { name: patch.name.trim(), url_template: patch.urlTemplate.trim() || null }
    if (patch.file) {
      const path = `social-platforms/${userId}/${Date.now()}-${patch.file.name}`
      let { error: uploadErr } = await supabase.storage.from('media').upload(path, patch.file, { upsert: true })
      // Storage RLS requires a live `authenticated` session — if the
      // client's access token silently expired, one refresh + retry
      // recovers the common case instead of surfacing a raw RLS error.
      if (uploadErr && /row-level security/i.test(uploadErr.message)) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        if (refreshed.session) {
          ;({ error: uploadErr } = await supabase.storage.from('media').upload(path, patch.file, { upsert: true }))
        }
      }
      if (uploadErr) {
        setError(
          /row-level security/i.test(uploadErr.message)
            ? 'Your session has expired — please refresh the page and sign in again, then retry the upload.'
            : uploadErr.message
        )
        return false
      }
      update.icon_url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
    }
    const { data, error: err } = await supabase.from('social_platforms').update(update).eq('id', id).select('*').single()
    if (err) { setError(err.message); return false }
    setPlatforms(p => p.map(x => x.id === id ? (data as Platform) : x))
    router.refresh()
    return true
  }

  async function remove(id: string) {
    if (!confirm('Delete this platform? Anyone who filled in a handle for it will just stop showing that badge.')) return
    const { error: err } = await supabase.from('social_platforms').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setPlatforms(p => p.filter(x => x.id !== id))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">New Platform</p>
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Key</label>
            <input value={key} onChange={e => setKey(e.target.value.toLowerCase())} placeholder="twitter"
              className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Display Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="X (Twitter)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">URL template (optional)</label>
            <input value={urlTemplate} onChange={e => setUrlTemplate(e.target.value)} placeholder="https://x.com/{handle}"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Icon</label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700" />
          </div>
        </div>
        <button onClick={create} disabled={uploading || !key.trim() || !name.trim() || !file}
          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
          <Plus size={14} /> {uploading ? 'Creating…' : 'Create Platform'}
        </button>
      </div>

      <div className="space-y-2">
        {platforms.length === 0 ? (
          <p className="text-sm text-zinc-600">No platforms yet — members won't see a Connected Accounts section in Settings until you add at least one.</p>
        ) : (
          platforms.map(p => (
            editingId === p.id ? (
              <PlatformEditRow key={p.id} platform={p} onSave={patch => update(p.id, patch).then(ok => { if (ok) setEditingId(null) })} onCancel={() => setEditingId(null)} />
            ) : (
              <div key={p.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <img src={p.icon_url} alt={p.name} className="w-9 h-9 object-contain rounded shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.name} <span className="text-zinc-500 font-mono text-xs">({p.key})</span></p>
                  <p className="text-xs text-zinc-500 truncate">{p.url_template || 'No link — badge only'}</p>
                </div>
                <button onClick={() => setEditingId(p.id)} className="text-zinc-500 hover:text-white shrink-0" aria-label="Edit"><Pencil size={14} /></button>
                <button onClick={() => remove(p.id)} className="text-zinc-500 hover:text-red-400 shrink-0" aria-label="Delete"><Trash2 size={15} /></button>
              </div>
            )
          ))
        )}
      </div>
    </div>
  )
}

function PlatformEditRow({ platform, onSave, onCancel }: {
  platform: Platform
  onSave: (patch: { name: string; urlTemplate: string; file: File | null }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(platform.name)
  const [urlTemplate, setUrlTemplate] = useState(platform.url_template ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const preview = file ? URL.createObjectURL(file) : platform.icon_url

  async function save() {
    setSaving(true)
    try { await onSave({ name, urlTemplate, file }) } finally { setSaving(false) }
  }

  return (
    <div className="bg-zinc-900 border border-green-500/40 rounded-xl p-3 space-y-2">
      <div className="flex gap-3 items-end flex-wrap">
        <img src={preview} alt="" className="w-9 h-9 object-contain rounded shrink-0" />
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Display Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">URL template (optional)</label>
          <input value={urlTemplate} onChange={e => setUrlTemplate(e.target.value)} placeholder="https://x.com/{handle}"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Replace icon (optional)</label>
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !name.trim()}
          className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-xs font-bold border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-4 py-2 rounded-xl transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
