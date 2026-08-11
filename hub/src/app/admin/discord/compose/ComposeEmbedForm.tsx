'use client'

import { useEffect, useRef, useState } from 'react'
import { useFeedback } from '@/components/ui/FeedbackProvider'

const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 font-mono'
const labelClass = 'block text-xs font-bold text-zinc-400 mb-1.5'

type Channel = { id: string; name: string }

// Discord-shaped image upload — reuses /api/upload's existing 'kind' pattern
// (avatars/banners/changelog/etc.), just a new kind so this doesn't run
// through the avatar/banner-only PNG/JPEG normalization step.
async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', 'discord-embeds')
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || 'Upload failed')
  return body.publicUrl as string
}

function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { notify } = useFeedback()

  async function handleFile(f: File) {
    setUploading(true)
    try {
      onChange(await uploadImage(f))
    } catch (e: any) {
      notify({ title: 'Image upload failed', message: e?.message ?? 'Please try again.', tone: 'error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2">
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="Image URL" className={inputClass} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-lg border border-zinc-700"
        >
          {uploading ? '…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>
    </div>
  )
}

export function ComposeEmbedForm() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelId, setChannelId] = useState('')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState('#b4ff4d')
  const [authorName, setAuthorName] = useState('')
  const [authorIconUrl, setAuthorIconUrl] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [footerText, setFooterText] = useState('')
  const [footerIconUrl, setFooterIconUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    fetch('/api/admin/discord/channels')
      .then(r => r.json())
      .then(d => {
        setChannels(d.channels ?? [])
        if (d.channels?.[0]) setChannelId(d.channels[0].id)
      })
      .catch(() => {})
  }, [])

  async function send() {
    setSending(true)
    setResult('')
    try {
      const res = await fetch('/api/admin/discord/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId, content, title, description, url,
          color: parseInt(color.replace('#', ''), 16),
          authorName, authorIconUrl, thumbnailUrl, imageUrl, footerText, footerIconUrl,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Post failed')
      setResult('Posted ✓')
      setTimeout(() => setResult(''), 3000)
    } catch (e: any) {
      setResult(`Error: ${e?.message ?? 'Post failed'}`)
    } finally {
      setSending(false)
    }
  }

  const hasEmbed = title || description || authorName || imageUrl || thumbnailUrl || footerText

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div>
            <label className={labelClass}>Channel</label>
            <select value={channelId} onChange={e => setChannelId(e.target.value)} className={inputClass}>
              {channels.length === 0 && <option value="">No channels found — check bot is in a server</option>}
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Message (shown above the embed, optional)</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={2} className={inputClass} />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Embed</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Header / author name</label>
              <input value={authorName} onChange={e => setAuthorName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Accent color</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-[38px] w-full bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer" />
            </div>
          </div>
          <ImageField label="Header icon" value={authorIconUrl} onChange={setAuthorIconUrl} />
          <div>
            <label className={labelClass}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={256} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Title link (optional)</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://slipsurge.com/..." className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Bio / info body</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} maxLength={4096} className={inputClass} />
          </div>
          <ImageField label="Thumbnail (small, top-right)" value={thumbnailUrl} onChange={setThumbnailUrl} />
          <ImageField label="Banner image (large)" value={imageUrl} onChange={setImageUrl} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Footer text</label>
              <input value={footerText} onChange={e => setFooterText(e.target.value)} maxLength={2048} className={inputClass} />
            </div>
            <ImageField label="Footer icon" value={footerIconUrl} onChange={setFooterIconUrl} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={sending || !channelId}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {sending ? 'Posting…' : 'Post to Discord'}
          </button>
          {result && <span className={`text-xs ${result.startsWith('Error') ? 'text-red-400' : 'text-zinc-400'}`}>{result}</span>}
        </div>
      </div>

      <div className="lg:sticky lg:top-6 self-start">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Preview</p>
        <div className="bg-[#313338] rounded-lg p-4 space-y-2">
          {content && <p className="text-[#dbdee1] text-sm whitespace-pre-wrap break-words">{content}</p>}
          {hasEmbed && (
            <div className="flex rounded overflow-hidden max-w-[440px]" style={{ background: '#2b2d31' }}>
              <div className="w-1 shrink-0" style={{ background: color }} />
              <div className="p-3 min-w-0 flex-1">
                {authorName && (
                  <div className="flex items-center gap-2 mb-1.5">
                    {authorIconUrl && <img src={authorIconUrl} alt="" className="w-6 h-6 rounded-full object-cover" />}
                    <span className="text-[#f2f3f5] text-sm font-semibold">{authorName}</span>
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    {title && (
                      url
                        ? <a href={url} target="_blank" rel="noreferrer" className="text-[#00a8fc] text-sm font-semibold hover:underline break-words">{title}</a>
                        : <p className="text-[#f2f3f5] text-sm font-semibold break-words">{title}</p>
                    )}
                    {description && <p className="text-[#dbdee1] text-sm whitespace-pre-wrap break-words mt-1">{description}</p>}
                  </div>
                  {thumbnailUrl && <img src={thumbnailUrl} alt="" className="w-20 h-20 rounded object-cover shrink-0" />}
                </div>
                {imageUrl && <img src={imageUrl} alt="" className="w-full rounded mt-2 object-cover" />}
                {footerText && (
                  <div className="flex items-center gap-2 mt-2">
                    {footerIconUrl && <img src={footerIconUrl} alt="" className="w-5 h-5 rounded-full object-cover" />}
                    <span className="text-[#949ba4] text-xs">{footerText}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {!content && !hasEmbed && <p className="text-zinc-600 text-sm italic">Nothing to preview yet</p>}
        </div>
      </div>
    </div>
  )
}
