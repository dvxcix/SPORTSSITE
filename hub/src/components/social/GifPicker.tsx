'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Link2, Loader2, Search, Sparkles, Upload, X } from 'lucide-react'
import { uploadMedia } from '@/lib/uploadMedia'
import { SafeImage } from '@/components/ui/SafeImage'
import { FloatingSurface } from '@/components/ui/FloatingSurface'

const RECENTS_KEY = 'slipsurge:recent-gifs'
const DISCOVERY = ['Trending', 'Sports', 'Winner', 'Hype', 'Reaction', 'Pain']

type GifResult = { id: string; title: string; previewUrl: string; url: string; width: number | null; height: number | null }

function usableGifUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return false
    return /\.gif$/i.test(url.pathname) || /(^|\.)(giphy\.com|tenor\.com|giphyusercontent\.com)$/.test(url.hostname)
  } catch { return false }
}

export function GifPicker({ onSelect, uploadKind = 'posts' }: { onSelect: (url: string) => void; uploadKind?: 'posts' | 'messages' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GifResult[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [url, setUrl] = useState('')
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
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/gifs${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`, { signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load GIFs.')
        setResults(payload.results ?? [])
        setNext(payload.next ?? null)
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') { setResults([]); setNext(null); setError((reason as Error).message) }
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, query ? 260 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [open, query, retryNonce])

  function choose(value: string, result?: GifResult) {
    const updated = [value, ...recents.filter(item => item !== value)].slice(0, 8)
    setRecents(updated)
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(updated)) } catch { /* storage can be unavailable */ }
    if (result) void fetch('/api/gifs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: result.id, query: query.trim() }) }).catch(() => null)
    onSelect(value)
    setQuery('')
    setError('')
    setOpen(false)
  }

  async function loadMore() {
    if (!next || loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ pos: next })
      if (query.trim()) params.set('q', query.trim())
      const response = await fetch(`/api/gifs?${params}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not load more GIFs.')
      setResults(current => [...current, ...(payload.results ?? []).filter((item: GifResult) => !current.some(existing => existing.id === item.id))])
      setNext(payload.next ?? null)
    } catch (reason) { setError((reason as Error).message) } finally { setLoading(false) }
  }

  function addUrl() {
    if (!usableGifUrl(url)) { setError('Paste a secure GIF link.'); return }
    choose(url.trim())
    setUrl('')
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
    <button type="button" className="ss-gif-trigger" onClick={() => setOpen(value => !value)} aria-label="Browse GIFs" aria-expanded={open}>GIF</button>
    <FloatingSurface open={open} anchorRef={rootRef} onClose={() => setOpen(false)} className="ss-gif-panel" width={390} mobileSheet ariaLabel="Choose a GIF">
      <header><span><Sparkles size={15}/><strong>Choose a GIF</strong></span><button type="button" onClick={() => setOpen(false)} aria-label="Close GIF picker"><X size={16}/></button></header>
      <label className="ss-gif-search"><Search size={15}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search thousands of GIFs" aria-label="Search GIFs"/>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear GIF search"><X size={13}/></button>}</label>
      {!query && <div className="ss-gif-discovery" aria-label="GIF categories">{DISCOVERY.map(item => <button type="button" key={item} onClick={() => setQuery(item === 'Trending' ? '' : item)}>{item}</button>)}</div>}
      <div className="ss-gif-results" aria-live="polite">
        {!query && recents.length > 0 && <section className="ss-gif-recents"><span>Recent</span><div>{recents.map(item => <button type="button" key={item} onClick={() => choose(item)}><SafeImage src={item} alt="Recent GIF"/></button>)}</div></section>}
        {loading && results.length === 0 ? <div className="ss-gif-state"><Loader2 size={22} className="animate-spin"/><span>Finding GIFs…</span></div> : null}
        {!loading && error && results.length === 0 ? <div className="ss-gif-state is-error"><span>{error}</span><button type="button" onClick={() => setRetryNonce(value => value + 1)}>Try again</button></div> : null}
        {!loading && !error && results.length === 0 ? <div className="ss-gif-state"><Search size={22}/><span>No GIFs found</span></div> : null}
        {results.length > 0 && <div className="ss-gif-grid">{results.map(result => <button type="button" key={result.id} onClick={() => choose(result.url, result)} title={result.title} aria-label={`Choose ${result.title}`}><SafeImage src={result.previewUrl} alt=""/></button>)}</div>}
        {next && results.length > 0 ? <button type="button" className="ss-gif-more" onClick={() => void loadMore()} disabled={loading}>{loading ? <Loader2 size={14} className="animate-spin"/> : null}{loading ? 'Loading…' : 'Load more'}</button> : null}
      </div>
      <footer><span>Powered by Tenor</span><button type="button" onClick={() => setToolsOpen(value => !value)} aria-expanded={toolsOpen}><Upload size={13}/> Your GIF</button></footer>
      {toolsOpen && <div className="ss-gif-tools">
        <button type="button" className="ss-gif-upload" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 size={15} className="animate-spin"/> : <ImagePlus size={15}/>}<span>{uploading ? 'Uploading…' : 'Upload GIF'}</span></button>
        <input ref={inputRef} type="file" accept="image/gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }}/>
        <div className="ss-gif-url"><Link2 size={13}/><input value={url} onChange={event => { setUrl(event.target.value); if (error) setError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addUrl() } }} placeholder="Paste GIF link" aria-label="GIF link"/><button type="button" onClick={addUrl}>Add</button></div>
      </div>}
    </FloatingSurface>
  </div>
}
