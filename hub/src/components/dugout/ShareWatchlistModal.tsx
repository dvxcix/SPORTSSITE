'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Download, Copy, Check, Share, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { SafeImage } from '@/components/ui/SafeImage'
import { WATCHLIST_SHARE_PAGE_SIZE, watchlistSharePage } from '@/lib/watchlistSharePages'
import { useAuth } from '@/context/AuthContext'
import styles from './ShareWatchlistModal.module.css'

// Sibling to ShareImageModal.tsx (posts), adapted for a feature with no
// public URL to unfurl: a Watchlist is a private, live snapshot of the
// current user's own pending items, not a permanent public post, so there's
// nothing for X/Reddit/Copy-Link's URL-based share intents to point at.
// Download + native file-share (which attaches the PNG bytes directly, no
// URL needed — covers sharing to X/Instagram/Messages from a phone just
// fine) plus a desktop-friendly "Copy Image" cover the same ground instead.
type ShareWatchlistProps = { onClose: () => void; sport: 'MLB' | 'NFL' | 'NBA' | null; itemIds: string[] }

export function ShareWatchlistModal(props: ShareWatchlistProps) {
  const { user, loading, authUnavailable } = useAuth()
  const [openedFor] = useState(() => user?.id ?? null)
  if (!openedFor || loading || authUnavailable || user?.id !== openedFor) {
    return <ModalSurface open onClose={props.onClose} labelledBy="watchlist-share-title" backdropClassName={styles.backdrop} panelClassName={styles.panel}>
      <div className={styles.header}><h2 id="watchlist-share-title">Share watchlist</h2><button type="button" data-modal-autofocus onClick={props.onClose} className={styles.close} aria-label="Close share watchlist"><X size={18} /></button></div>
      <p role="status">Your account changed or could not be verified. Close and reopen your watchlist to share.</p>
    </ModalSurface>
  }
  return <ShareWatchlistContent {...props} ownerId={openedFor} />
}

function ShareWatchlistContent({ onClose, sport, itemIds, ownerId }: ShareWatchlistProps & { ownerId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const active = useRef(false)
  const [image, setImage] = useState<{ key: string; blob: Blob; url: string } | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [sharedIds] = useState(() => [...itemIds])
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(sharedIds.length / WATCHLIST_SHARE_PAGE_SIZE))
  const pageIds = watchlistSharePage(sharedIds, page)
  const imgUrl = '/api/share-image/watchlist?ids=' + encodeURIComponent(pageIds.join(','))
  const currentImage = image?.key === imgUrl ? image : null
  const currentError = imageError === imgUrl

  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function verifyOwner() {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!active.current || authError || user?.id !== ownerId) throw new Error('Your account changed. Reopen your watchlist to share.')
  }

  // Fetch once per page and reuse those exact bytes for preview and export.
  // A page change aborts the old request and releases its object URL.
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    supabase.auth.getUser()
      .then(({ data: { user }, error: authError }) => {
        if (authError || user?.id !== ownerId || controller.signal.aborted) throw new Error('Account unavailable')
        return fetch(imgUrl, { signal: controller.signal })
      })
      .then(async response => {
        if (!response.ok) throw new Error('Image unavailable')
        const blob = await response.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setImage({ key: imgUrl, blob, url: objectUrl })
      })
      .catch(() => { if (!controller.signal.aborted) setImageError(imgUrl) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [imgUrl, retry, ownerId, supabase])

  async function fetchBlob() {
    await verifyOwner()
    if (!currentImage) throw new Error('The image is not ready. Please retry.')
    return currentImage.blob
  }

  async function download() {
    setBusy('download')
    try {
      const blob = await fetchBlob()
      if (!active.current) throw new Error('Your account changed. Reopen your watchlist to share.')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pageCount > 1 ? `slipsurge-watchlist-${page + 1}.png` : 'slipsurge-watchlist.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download. Please retry.')
    } finally {
      setBusy(null)
    }
  }

  async function copyImage() {
    setBusy('copy')
    try {
      const blob = await fetchBlob()
      if (!active.current) throw new Error('Your account changed. Reopen your watchlist to share.')
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy this image. Use Download instead.')
    } finally {
      setBusy(null)
    }
  }

  async function nativeShare() {
    setBusy('native')
    try {
      const blob = await fetchBlob()
      if (!active.current) throw new Error('Your account changed. Reopen your watchlist to share.')
      const file = new File([blob], 'slipsurge-watchlist.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Watchlist on SlipSurge' })
      } else { setError('File sharing is unavailable here. Use Download instead.') }
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === 'AbortError')) setError('Could not share this image. Use Download instead.')
    } finally {
      setBusy(null)
    }
  }

  async function postToFeed() {
    setBusy('feed')
    setError('')
    try {
      const blob = await fetchBlob()
      if (!active.current) throw new Error('Your account changed. Reopen your watchlist to share.')
      const upload = await uploadMedia(new File([blob], 'slipsurge-research.png', { type: 'image/png' }), 'posts', ownerId)
      if ('error' in upload) throw new Error(upload.error)
      await verifyOwner()
      const { data, error: insertError } = await supabase.from('posts').insert({
        author_id: ownerId,
        content: sport === 'NBA' ? 'Court research card' : sport === 'NFL' ? 'Sideline research card' : sport === 'MLB' ? 'Dugout research card' : 'SlipSurge research card',
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

      {pageCount > 1 && <nav className={styles.pagination} aria-label="Watchlist image pages">
        <button type="button" disabled={page === 0 || !!busy} onClick={() => { setPage(page - 1); setImage(null); setImageError(null); setError('') }}>Previous</button>
        <span aria-live="polite">Page {page + 1} of {pageCount} · {pageIds.length} selections</span>
        <button type="button" disabled={page + 1 === pageCount || !!busy} onClick={() => { setPage(page + 1); setImage(null); setImageError(null); setError('') }}>Next</button>
      </nav>}
      {pageCount > 1 && <p className={styles.pageNote}>Share or download each page separately.</p>}
      <div className={styles.preview} aria-busy={!currentImage && !currentError}>
        {!currentImage && !currentError && <div className={styles.previewState} role="status">Generating preview…</div>}
        {currentError ? <div className={styles.previewState}><span>Couldn&apos;t generate your watchlist image.</span><button type="button" onClick={() => { setImage(null); setImageError(null); setRetry(value => value + 1) }}>Try again</button></div> : currentImage && <SafeImage src={currentImage.url} alt={`Watchlist share preview, page ${page + 1} of ${pageCount}`} loading="eager" onError={() => setImageError(imgUrl)} className={styles.previewImage} />}
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <ShareOptionBtn label="Post to feed" onClick={postToFeed} busy={busy === 'feed'} disabled={!currentImage || currentError || !!busy} icon={<Send size={18} />} tone="primary" />
        <ShareOptionBtn label="Download" onClick={download} busy={busy === 'download'} disabled={!currentImage || currentError || !!busy} icon={<Download size={18} />} />
        <ShareOptionBtn label={copied ? 'Copied' : 'Copy image'} onClick={copyImage} busy={busy === 'copy'} disabled={!currentImage || currentError || !!busy} icon={copied ? <Check size={18} /> : <Copy size={18} />} tone={copied ? 'success' : 'default'} />
        <ShareOptionBtn label="More" onClick={nativeShare} busy={busy === 'native'} disabled={!currentImage || currentError || !!busy} icon={<Share size={18} />} />
      </div>
    </ModalSurface>
  )
}

function ShareOptionBtn({ icon, label, onClick, busy, disabled, tone = 'default' }: {
  icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean; disabled?: boolean; tone?: 'default' | 'primary' | 'success'
}) {
  return (
    <button type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      className={styles.action}
      data-tone={tone}
    >
      <span>{icon}</span>
      <b>{busy ? 'Working…' : label}</b>
    </button>
  )
}
