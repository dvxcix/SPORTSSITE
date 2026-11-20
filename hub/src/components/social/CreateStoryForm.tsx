'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import { useRouter } from 'next/navigation'
import { Upload, Type } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import { useAuth } from '@/context/AuthContext'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export function CreateStoryForm({ userId }: { userId: string }) {
  const { profile } = useAuth()
  const mlbAccess = !MLB_HIBERNATING || profile?.account_type === 'admin'
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [type, setType] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('')
  const [sport, setSport] = useState('')
  const [bg, setBg] = useState('#111111')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (preview) URL.revokeObjectURL(preview)
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
      const result = await uploadMedia(file, 'stories')
      // Previously ignored a failed upload and posted the story anyway
      // with a blank media_url — an "image story" with no image.
      if ('error' in result) {
        setError(result.error)
        setSubmitting(false)
        return
      }
      mediaUrl = result.publicUrl
    }

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error: insertErr } = await supabase.from('stories').insert({
      author_id: userId,
      story_type: type,
      content: [sport ? `#${sport}` : '', text.trim()].filter(Boolean).join(' ') || null,
      media_url: mediaUrl || null,
      bg_color: bg,
      expires_at: expires,
    })
    // Previously navigated to /feed unconditionally — a failed insert
    // meant the story silently never posted, with no error and no
    // indication anything went wrong.
    if (insertErr) { setError('Could not post story — please try again.'); setSubmitting(false); return }

    router.push('/feed')
  }

  return (
    <div className="space-y-4">
      <label className="block text-xs font-bold text-[var(--text-2)]">Sport
        <select aria-label="Story sport" value={sport} onChange={event => setSport(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-1)]">
          <option value="">All sports</option>{[...(mlbAccess ? ['MLB'] : []), 'NFL', 'NBA'].map(league => <option key={league} value={league}>{league}</option>)}
        </select>
      </label>
      {/* Toggle */}
      <div className="flex gap-2 p-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
        <button onClick={() => setType('text')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${type === 'text' ? 'bg-[var(--surface-2)] text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>
          <Type size={14} /> Text
        </button>
        <button onClick={() => setType('image')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${type === 'image' ? 'bg-[var(--surface-2)] text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>
          <Upload size={14} /> Photo
        </button>
      </div>

      {/* Preview */}
      <div className="aspect-[9/16] max-h-64 rounded-2xl overflow-hidden flex items-center justify-center relative"
        style={{ background: preview ? '#000' : bg }}>
        {preview
          ? <SafeImage src={preview} alt="Story preview" className="w-full h-full object-cover" />
          : <p className="text-[var(--text-1)] text-center text-xl font-bold px-4 break-words">{text || 'Your story preview'}</p>
        }
      </div>

      {type === 'text' ? (
        <div className="space-y-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
            placeholder={mlbAccess ? 'Share your MLB, NFL or NBA moment…' : 'Share your NFL or NBA moment…'}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)] resize-none" />
          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-2">Background Color</label>
            <div className="flex gap-2">
              {['#111111','#1a1a2e','#16213e','#0f3460','#1a472a','#4a1942'].map(c => (
                <button key={c} onClick={() => setBg(c)} style={{ background: c }}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${bg === c ? 'border-[var(--border-3)]' : 'border-transparent'}`} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--border-2)] rounded-xl py-8 cursor-pointer hover:border-[color-mix(in_srgb,var(--green)_50%,transparent)] transition-colors">
          <Upload size={24} className="text-[var(--text-3)] mb-2" />
          <span className="text-sm text-[var(--text-3)]">Tap to upload photo</span>
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
      )}

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
      <button onClick={post} disabled={submitting || (type === 'text' ? !text.trim() : !file)}
        className="w-full bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold py-3 rounded-xl transition-colors">
        {submitting ? 'Posting…' : 'Share Story'}
      </button>
    </div>
  )
}
