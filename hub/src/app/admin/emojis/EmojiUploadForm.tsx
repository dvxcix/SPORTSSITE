'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { invalidateCustomEmojiCache } from '@/lib/emoji'
import { Trash2 } from 'lucide-react'

type CustomEmojiRow = { id: string; code: string; image_url: string; created_at: string }

const CODE_RE = /^[a-z0-9_]{2,30}$/

export function EmojiUploadForm({ userId, initialEmojis }: { userId: string; initialEmojis: CustomEmojiRow[] }) {
  const [emojis, setEmojis] = useState(initialEmojis)
  const [code, setCode] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  async function upload() {
    const normalized = code.trim().toLowerCase()
    if (!CODE_RE.test(normalized)) { setError('Code must be 2-30 letters, numbers, or underscores — no colons or spaces.'); return }
    if (!file) { setError('Choose an image file.'); return }
    setError('')
    setUploading(true)
    try {
      const path = `emojis/${userId}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)

      const { data, error: insertErr } = await supabase.from('custom_emojis')
        .insert({ code: normalized, image_url: publicUrl, uploaded_by: userId })
        .select('*').single()
      if (insertErr) {
        setError(insertErr.code === '23505' ? `:${normalized}: already exists.` : insertErr.message)
        return
      }
      setEmojis(e => [data as CustomEmojiRow, ...e])
      invalidateCustomEmojiCache()
      setCode(''); setFile(null)
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this emoji? Any existing :code: text using it will stop rendering as an image.')) return
    await supabase.from('custom_emojis').delete().eq('id', id)
    setEmojis(e => e.filter(x => x.id !== id))
    invalidateCustomEmojiCache()
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Code</label>
            <div className="flex items-center gap-1">
              <span className="text-zinc-500 text-sm">:</span>
              <input value={code} onChange={e => setCode(e.target.value.toLowerCase())}
                placeholder="ath"
                className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
              <span className="text-zinc-500 text-sm">:</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Image</label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700" />
          </div>
          <button onClick={upload} disabled={uploading || !code.trim() || !file}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
            {uploading ? 'Uploading…' : 'Add Emoji'}
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">{emojis.length} custom emoji{emojis.length === 1 ? '' : 's'}</p>
        {emojis.length === 0 ? (
          <p className="text-sm text-zinc-600">No custom emojis yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {emojis.map(e => (
              <div key={e.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
                <img src={e.image_url} alt={e.code} className="w-8 h-8 object-contain rounded shrink-0" />
                <span className="text-sm text-zinc-300 font-mono truncate flex-1">:{e.code}:</span>
                <button onClick={() => remove(e.id)} className="text-zinc-500 hover:text-red-400 shrink-0" aria-label="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
