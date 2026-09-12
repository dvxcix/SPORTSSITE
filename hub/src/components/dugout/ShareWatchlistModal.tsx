'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Download, Copy, Check, Share, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './ShareWatchlistModal.module.css'

// Sibling to ShareImageModal.tsx (posts), adapted for a feature with no
// public URL to unfurl: a Watchlist is a private, live snapshot of the
// current user's own pending items, not a permanent public post, so there's
// nothing for X/Reddit/Copy-Link's URL-based share intents to point at.
// Download + native file-share (which attaches the PNG bytes directly, no
// URL needed — covers sharing to X/Instagram/Messages from a phone just
// fine) plus a desktop-friendly "Copy Image" cover the same ground instead.
export function ShareWatchlistModal({ onClose, sport }: { onClose: () => void; sport: 'MLB' | 'NFL' | null }) {
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
        content: sport === 'NFL' ? 'Sideline research card' : sport === 'MLB' ? 'Dugout research card' : 'SlipSurge research card',
        post_type: 'analysis',
        sport,
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
    <ModalSurface
      open
      onClose={onClose}
      labelledBy="watchlist-share-title"
      describedBy="watchlist-share-description"
      backdropClassName={styles.backdrop}
      panelClassName={styles.panel}
    >
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{sport ?? 'CROSS-SPORT'} RESEARCH</span>
          <h2 id="watchlist-share-title">Share watchlist</h2>
          <p id="watchlist-share-description">Publish or export the current saved-board snapshot.</p>
        </div>
        <button type="button" data-modal-autofocus onClick={onClose} className={styles.close} aria-label="Close share watchlist"><X size={18} /></button>
      </div>

      <div className={styles.preview} aria-busy={!imgLoaded && !imgErrored}>
        {!imgLoaded && !imgErrored && <div className={styles.previewState} role="status">Generating preview…</div>}
        {imgErrored ? <div className={styles.previewState}>Couldn&apos;t generate your watchlist image.</div> : <SafeImage src={imgUrl} alt="Watchlist share preview" loading="eager" onLoad={() => setImgLoaded(true)} onError={() => setImgErrored(true)} className={imgLoaded ? styles.previewImage : styles.previewImageHidden} />}
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <ShareOptionBtn label="Post to feed" onClick={postToFeed} busy={busy === 'feed'} icon={<Send size={18} />} tone="primary" />
        <ShareOptionBtn label="Download" onClick={download} busy={busy === 'download'} icon={<Download size={18} />} />
        <ShareOptionBtn label={copied ? 'Copied' : 'Copy image'} onClick={copyImage} busy={busy === 'copy'} icon={copied ? <Check size={18} /> : <Copy size={18} />} tone={copied ? 'success' : 'default'} />
        <ShareOptionBtn label="More" onClick={nativeShare} busy={busy === 'native'} icon={<Share size={18} />} />
      </div>
    </ModalSurface>
  )
}

function ShareOptionBtn({ icon, label, onClick, busy, tone = 'default' }: {
  icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean; tone?: 'default' | 'primary' | 'success'
}) {
  return (
    <button type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className={styles.action}
      data-tone={tone}
    >
      <span>{icon}</span>
      <b>{busy ? 'Working…' : label}</b>
    </button>
  )
}
