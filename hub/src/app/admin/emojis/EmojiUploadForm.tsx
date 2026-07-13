'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { invalidateCustomEmojiCache } from '@/lib/emoji'
import { Trash2, Plus, Pencil } from 'lucide-react'

type Category = { id: string; name: string; sort_order: number }
type CustomEmojiRow = { id: string; code: string; image_url: string; category_id: string | null; category: { name: string } | null; created_at: string }

const CODE_RE = /^[a-z0-9_]{2,30}$/

export function EmojiUploadForm({ userId, initialEmojis, initialCategories }: {
  userId: string; initialEmojis: CustomEmojiRow[]; initialCategories: Category[]
}) {
  const [emojis, setEmojis] = useState(initialEmojis)
  const [categories, setCategories] = useState(initialCategories)
  const [code, setCode] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategories[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  async function addCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    setAddingCategory(true)
    const { data, error: err } = await supabase.from('custom_emoji_categories')
      .insert({ name, sort_order: categories.length })
      .select('*').single()
    setAddingCategory(false)
    if (err) { setError(err.code === '23505' ? `Category "${name}" already exists.` : err.message); return }
    const next = [...categories, data as Category]
    setCategories(next)
    if (!categoryId) setCategoryId((data as Category).id)
    setNewCategoryName('')
  }

  async function removeCategory(id: string) {
    const inUse = emojis.filter(e => e.category_id === id).length
    if (!confirm(inUse > 0
      ? `Delete this category? ${inUse} emoji(s) in it will become uncategorized (they'll still work, just show under "Other" in the picker).`
      : 'Delete this category?')) return
    const { error } = await supabase.from('custom_emoji_categories').delete().eq('id', id)
    if (error) { alert(`Could not delete category: ${error.message}`); return }
    setCategories(c => c.filter(x => x.id !== id))
    setEmojis(e => e.map(x => x.category_id === id ? { ...x, category_id: null, category: null } : x))
    if (categoryId === id) setCategoryId('')
    invalidateCustomEmojiCache()
    router.refresh()
  }

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
        .insert({ code: normalized, image_url: publicUrl, uploaded_by: userId, category_id: categoryId || null })
        .select('*, category:custom_emoji_categories(name)').single()
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

  async function updateEmoji(id: string, patch: { code: string; categoryId: string; file: File | null }) {
    const normalized = patch.code.trim().toLowerCase()
    if (!CODE_RE.test(normalized)) { setError('Code must be 2-30 letters, numbers, or underscores — no colons or spaces.'); return false }
    setError('')
    const update: Record<string, any> = { code: normalized, category_id: patch.categoryId || null }
    if (patch.file) {
      const path = `emojis/${userId}/${Date.now()}-${patch.file.name}`
      const { error: uploadErr } = await supabase.storage.from('media').upload(path, patch.file, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); return false }
      update.image_url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
    }
    const { data, error: err } = await supabase.from('custom_emojis').update(update).eq('id', id)
      .select('*, category:custom_emoji_categories(name)').single()
    if (err) {
      setError(err.code === '23505' ? `:${normalized}: already exists.` : err.message)
      return false
    }
    setEmojis(e => e.map(x => x.id === id ? (data as CustomEmojiRow) : x))
    invalidateCustomEmojiCache()
    router.refresh()
    return true
  }

  async function remove(id: string) {
    if (!confirm('Delete this emoji? Any existing :code: text using it will stop rendering as an image.')) return
    const { error } = await supabase.from('custom_emojis').delete().eq('id', id)
    if (error) { alert(`Could not delete: ${error.message}`); return }
    setEmojis(e => e.filter(x => x.id !== id))
    invalidateCustomEmojiCache()
    router.refresh()
  }

  const grouped = groupByCategory(emojis)

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      {/* Category management */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Categories</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 bg-zinc-800 rounded-full pl-3 pr-1 py-1">
              <span className="text-xs font-bold text-white">{c.name}</span>
              <span className="text-[10px] text-zinc-500">{emojis.filter(e => e.category_id === c.id).length}</span>
              <button onClick={() => removeCategory(c.id)} className="text-zinc-500 hover:text-red-400 p-1">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {categories.length === 0 && <p className="text-xs text-zinc-600">No categories yet — add one below.</p>}
        </div>
        <div className="flex gap-2">
          <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="New category name (e.g. MLB, NBA)…"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          <button onClick={addCategory} disabled={addingCategory || !newCategoryName.trim()}
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-bold px-3 rounded-lg transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Code</label>
            <div className="flex items-center gap-1">
              <span className="text-zinc-500 text-sm">:</span>
              <input value={code} onChange={e => setCode(e.target.value.toLowerCase())}
                placeholder="ath"
                className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
              <span className="text-zinc-500 text-sm">:</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Category</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50">
              <option value="">Uncategorized</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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

      {/* Emoji list, grouped by category */}
      <div className="space-y-5">
        {emojis.length === 0 ? (
          <p className="text-sm text-zinc-600">No custom emojis yet.</p>
        ) : (
          grouped.map(group => (
            <div key={group.label}>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{group.label} · {group.items.length}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.items.map(e => (
                  editingId === e.id ? (
                    <EmojiEditRow
                      key={e.id}
                      emoji={e}
                      categories={categories}
                      onSave={patch => updateEmoji(e.id, patch).then(ok => { if (ok) setEditingId(null) })}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div key={e.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
                      <img src={e.image_url} alt={e.code} className="w-8 h-8 object-contain rounded shrink-0" />
                      <span className="text-sm text-zinc-300 font-mono truncate flex-1">:{e.code}:</span>
                      <button onClick={() => setEditingId(e.id)} className="text-zinc-500 hover:text-white shrink-0" aria-label="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => remove(e.id)} className="text-zinc-500 hover:text-red-400 shrink-0" aria-label="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Inline edit — replaces the emoji's grid tile in place rather than opening
// a modal, matching the rest of this page's flat/no-modal style. Renaming
// the code doesn't touch already-posted text using the old :code: (it'll
// just stop rendering as an image), same tradeoff already called out for
// deleting an emoji.
function EmojiEditRow({ emoji, categories, onSave, onCancel }: {
  emoji: CustomEmojiRow
  categories: Category[]
  onSave: (patch: { code: string; categoryId: string; file: File | null }) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState(emoji.code)
  const [categoryId, setCategoryId] = useState(emoji.category_id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const preview = file ? URL.createObjectURL(file) : emoji.image_url

  async function save() {
    setSaving(true)
    try {
      await onSave({ code, categoryId, file })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="col-span-2 sm:col-span-3 bg-zinc-900 border border-green-500/40 rounded-xl p-3 space-y-2">
      <div className="flex gap-3 items-end flex-wrap">
        <img src={preview} alt="" className="w-9 h-9 object-contain rounded shrink-0" />
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Code</label>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 text-sm">:</span>
            <input value={code} onChange={e => setCode(e.target.value.toLowerCase())}
              className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50" />
            <span className="text-zinc-500 text-sm">:</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Category</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500/50">
            <option value="">Uncategorized</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Replace image (optional)</label>
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !code.trim()}
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

function groupByCategory(emojis: CustomEmojiRow[]): { label: string; items: CustomEmojiRow[] }[] {
  const byLabel = new Map<string, CustomEmojiRow[]>()
  for (const e of emojis) {
    const label = e.category?.name ?? 'Uncategorized'
    if (!byLabel.has(label)) byLabel.set(label, [])
    byLabel.get(label)!.push(e)
  }
  const groups = Array.from(byLabel.entries()).map(([label, items]) => ({ label, items }))
  groups.sort((a, b) => (a.label === 'Uncategorized' ? 1 : b.label === 'Uncategorized' ? -1 : a.label.localeCompare(b.label)))
  return groups
}
