'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Link2, Loader2, X } from 'lucide-react'
import { uploadMedia } from '@/lib/uploadMedia'
import { SafeImage } from '@/components/ui/SafeImage'

const RECENTS_KEY = 'slipsurge:recent-gifs'

function usableGifUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return false
    return /\.gif$/i.test(url.pathname) || /(^|\.)(giphy\.com|tenor\.com|giphyusercontent\.com)$/.test(url.hostname)
  } catch { return false }
}

export function GifPicker({ onSelect, uploadKind = 'posts' }: { onSelect: (url: string) => void; uploadKind?: 'posts' | 'messages' }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let stored: string[] = []
    try { stored = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]').filter((item: unknown) => typeof item === 'string').slice(0, 8) } catch { /* ignore corrupt local state */ }
    const timer = window.setTimeout(() => setRecents(stored), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    function dismiss(event: MouseEvent) { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', keyboard) }
  }, [open])

  function choose(value: string) {
    const next = [value, ...recents.filter(item => item !== value)].slice(0, 8)
    setRecents(next)
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)) } catch { /* storage can be unavailable */ }
    onSelect(value)
    setUrl('')
    setError('')
    setOpen(false)
  }

  function addUrl() {
    if (!usableGifUrl(url)) { setError('Paste a secure GIF link.'); return }
    choose(url.trim())
  }

  async function upload(file: File) {
    if (file.type !== 'image/gif') { setError('Choose a GIF file.'); return }
    setUploading(true)
    setError('')
    const result = await uploadMedia(file, uploadKind)
    setUploading(false)
    if ('error' in result) { setError(result.error); return }
    choose(result.publicUrl)
  }

  return <div ref={rootRef} className="ss-gif-picker">
    <button type="button" className="ss-gif-trigger" onClick={() => setOpen(value => !value)} aria-label="Add GIF" aria-expanded={open}>GIF</button>
    {open && <div className="ss-gif-panel" role="dialog" aria-label="Add a GIF">
      <header><strong>Add GIF</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close GIF picker"><X size={14}/></button></header>
      <button type="button" className="ss-gif-upload" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 size={15} className="animate-spin"/> : <ImagePlus size={15}/>}<span>{uploading ? 'Uploading…' : 'Upload GIF'}</span></button>
      <input ref={inputRef} type="file" accept="image/gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }}/>
      <div className="ss-gif-url"><Link2 size={13}/><input value={url} onChange={event => { setUrl(event.target.value); if (error) setError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addUrl() } }} placeholder="Paste GIF link" aria-label="GIF link"/><button type="button" onClick={addUrl}>Add</button></div>
      {error && <p role="alert">{error}</p>}
      {recents.length > 0 && <section><span>Recent</span><div>{recents.map(item => <button type="button" key={item} onClick={() => choose(item)}><SafeImage src={item} alt="Recent GIF"/></button>)}</div></section>}
    </div>}
  </div>
}
