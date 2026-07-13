'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Upload, Type } from 'lucide-react'

export function CreateStoryForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [type, setType] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('')
  const [bg, setBg] = useState('#111111')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setType('image')
  }

  async function post() {
    if (type === 'text' && !text.trim()) return
    if (type === 'image' && !file) return
    setSubmitting(true)
    setError('')

    let mediaUrl = ''
    if (file) {
      const path = `stories/${userId}/${Date.now()}-${file.name}`
      const { data, error: uploadErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      // Previously ignored a failed upload and posted the story anyway
      // with a blank media_url — an "image story" with no image.
      if (uploadErr || !data) { setError('Could not upload photo — please try again.'); setSubmitting(false); return }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)
      mediaUrl = publicUrl
    }

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error: insertErr } = await supabase.from('stories').insert({
      author_id: userId,
      story_type: type,
      content: text || null,
      media_url: mediaUrl || null,
      bg_color: bg,
      expires_at: expires,
    })
    // Previously navigated to /feed unconditionally — a failed insert
    // meant the story silently never posted, with no error and no
    // indication anything went wrong.
    if (insertErr) { setError('Could not post story — please try again.'); setSubmitting(false); return }

    router.push('/feed')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
        <button onClick={() => setType('text')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${type === 'text' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
          <Type size={14} /> Text
        </button>
        <button onClick={() => setType('image')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${type === 'image' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>
          <Upload size={14} /> Photo
        </button>
      </div>

      {/* Preview */}
      <div className="aspect-[9/16] max-h-64 rounded-2xl overflow-hidden flex items-center justify-center relative"
        style={{ background: preview ? '#000' : bg }}>
        {preview
          ? <img src={preview} alt="" className="w-full h-full object-cover" />
          : <p className="text-white text-center text-xl font-bold px-4 break-words">{text || 'Your story preview'}</p>
        }
      </div>

      {type === 'text' ? (
        <div className="space-y-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
            placeholder="What's your story?"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none" />
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Background Color</label>
            <div className="flex gap-2">
              {['#111111','#1a1a2e','#16213e','#0f3460','#1a472a','#4a1942'].map(c => (
                <button key={c} onClick={() => setBg(c)} style={{ background: c }}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${bg === c ? 'border-white' : 'border-transparent'}`} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-xl py-8 cursor-pointer hover:border-green-500/50 transition-colors">
          <Upload size={24} className="text-zinc-500 mb-2" />
          <span className="text-sm text-zinc-500">Tap to upload photo</span>
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={post} disabled={submitting || (type === 'text' ? !text.trim() : !file)}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {submitting ? 'Posting…' : 'Share Story'}
      </button>
    </div>
  )
}
