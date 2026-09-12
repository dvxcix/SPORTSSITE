'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Download, Copy, Check, Share, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'

// Sibling to ShareImageModal.tsx (posts), adapted for a feature with no
// public URL to unfurl: a Watchlist is a private, live snapshot of the
// current user's own pending items, not a permanent public post, so there's
// nothing for X/Reddit/Copy-Link's URL-based share intents to point at.
// Download + native file-share (which attaches the PNG bytes directly, no
// URL needed — covers sharing to X/Instagram/Messages from a phone just
// fine) plus a desktop-friendly "Copy Image" cover the same ground instead.
export function ShareWatchlistModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgErrored, setImgErrored] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const imgUrl = '/api/share-image/watchlist'

  async function fetchBlob() {
    const res = await fetch(imgUrl)
    if (!res.ok) throw new Error('Failed to generate image')
    return res.blob()
  }

  async function download() {
    setBusy('download')
    try {
      const blob = await fetchBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'slipsurge-watchlist.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(null)
    }
  }

  async function copyImage() {
    setBusy('copy')
    try {
      const blob = await fetchBlob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard image-write isn't supported in every browser — download
      // still works as the fallback, so this just silently no-ops.
    } finally {
      setBusy(null)
    }
  }

  async function nativeShare() {
    setBusy('native')
    try {
      const blob = await fetchBlob()
      const file = new File([blob], 'slipsurge-watchlist.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Watchlist on SlipSurge' })
      }
    } catch {
      // user dismissed the native sheet — nothing to do
    } finally {
      setBusy(null)
    }
  }

  async function postToFeed() {
    setBusy('feed')
    setError('')
    try {
      const blob = await fetchBlob()
      const upload = await uploadMedia(new File([blob], 'dugout-research.png', { type: 'image/png' }), 'posts')
      if ('error' in upload) throw new Error(upload.error)
      const { data, error: insertError } = await supabase.from('posts').insert({
        content: 'Dugout research card',
        post_type: 'analysis',
        sport: 'MLB',
        media_urls: [upload.publicUrl],
        visibility: 'public',
      }).select('id').single()
      if (insertError || !data?.id) throw insertError ?? new Error('Post could not be created')
      onClose()
      router.push(`/posts/${data.id}`)
      router.refresh()
    } catch {
      setError('Could not post this card. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>Share Watchlist</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Scrolls internally once the image is taller than this box — the
            downloaded/shared PNG is always the complete image regardless of
            how much of it is visible here at once. */}
        <div style={{
          position: 'relative', width: '100%', maxHeight: '55vh', overflowY: 'auto', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 16,
        }}>
          {!imgLoaded && !imgErrored && (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
              Generating image…
            </div>
          )}
          {imgErrored ? (
            <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>Couldn't generate your watchlist image.</div>
          ) : (
            <img
              src={imgUrl}
              alt="Watchlist share preview"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgErrored(true)}
              style={{ width: '100%', display: imgLoaded ? 'block' : 'none' }}
            />
          )}
        </div>

        {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 10 }}>
          <ShareOptionBtn label="Post to Feed" onClick={postToFeed} busy={busy === 'feed'}
            icon={<Send size={18} />} bg="color-mix(in srgb, var(--green) 18%, var(--surface-2))" fg="var(--green)" />
          <ShareOptionBtn label="Download" onClick={download} busy={busy === 'download'}
            icon={<Download size={18} />} bg="var(--surface-2)" fg="var(--text-1)" />
          <ShareOptionBtn label="Copy Image" onClick={copyImage} busy={busy === 'copy'}
            icon={copied ? <Check size={18} /> : <Copy size={18} />} bg="var(--surface-2)" fg={copied ? 'var(--green)' : 'var(--text-1)'} />
          <ShareOptionBtn label="More" onClick={nativeShare} busy={busy === 'native'}
            icon={<Share size={18} />} bg="var(--surface-2)" fg="var(--text-1)" />
        </div>
      </div>
    </div>
  )
}

function ShareOptionBtn({ icon, label, onClick, bg, fg, busy }: {
  icon: React.ReactNode; label: string; onClick: () => void; bg: string; fg: string; busy?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', padding: 4,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 44, height: 44, borderRadius: '50%', background: bg, color: fg, flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>{label}</span>
    </button>
  )
}
