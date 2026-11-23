'use client'

import { useState } from 'react'
import { X, Download, Link2, MessageSquare, Share, Check } from 'lucide-react'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { SafeImage } from '@/components/ui/SafeImage'

// A real in-app share sheet instead of handing off to the OS's native
// picker (which, on Windows/desktop, is a system dialog we have zero
// control over the look of — not what "share this pick" should feel like).
// Downloading/copying/texting all just need the raw PNG bytes or the post
// URL; X and Reddit's own share intents don't accept a binary image
// attachment via URL (platform limitation, not something we can route
// around) — instead the post page sets its Open Graph image to this same
// generated PNG (see posts/[id]/page.tsx), so sharing the link itself
// auto-unfurls with the branded card on both platforms without the user
// needing to attach anything manually.
export function ShareImageModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgErrored, setImgErrored] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const [manualCopy, setManualCopy] = useState(false)

  const imgUrl = `/api/share-image/${postId}`
  const postUrl = typeof window !== 'undefined' ? `${window.location.origin}/posts/${postId}` : ''
  const shareText = 'Check out my pick on SlipSurge 🚀'

  async function download() {
    setBusy('download')
    setFeedback(null)
    try {
      const res = await fetch(imgUrl)
      if (!res.ok) throw new Error('Share image unavailable')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'slipsurge-pick.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setFeedback({ text: 'Image downloaded.', error: false })
    } catch {
      setFeedback({ text: 'Could not download the image. Try again or copy the link.', error: true })
    } finally {
      setBusy(null)
    }
  }

  function shareToX() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postUrl)}`
    window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420')
  }

  function shareToReddit() {
    const url = `https://www.reddit.com/submit?title=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postUrl)}`
    window.open(url, '_blank', 'noopener,noreferrer,width=880,height=720')
  }

  function shareToSms() {
    window.location.href = `sms:?&body=${encodeURIComponent(`${shareText} ${postUrl}`)}`
  }

  async function copyLink() {
    setFeedback(null)
    try {
      await navigator.clipboard.writeText(postUrl)
      setCopied(true)
      setManualCopy(false)
      setFeedback({ text: 'Link copied.', error: false })
    } catch {
      setCopied(false)
      setManualCopy(true)
      setFeedback({ text: 'Select the post link to copy it.', error: true })
    }
  }

  async function nativeShare() {
    if (!navigator.share) { await copyLink(); return }
    setBusy('native')
    setFeedback(null)
    try {
      const res = await fetch(imgUrl)
      if (!res.ok) throw new Error('Share image unavailable')
      const blob = await res.blob()
      const file = new File([blob], 'slipsurge-pick.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My pick on SlipSurge' })
      } else {
        await navigator.share({ url: postUrl, title: 'My pick on SlipSurge' })
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setFeedback({ text: 'Could not share. Copy the link or download the image.', error: true })
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <ModalSurface
      open
      onClose={onClose}
      labelledBy="share-pick-title"
      describedBy="share-pick-description"
      backdropStyle={{ position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 'var(--layer-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(8px)' }}
      panelClassName="ss-share-dialog"
      panelStyle={{ width: 'min(420px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, outline: 'none' }}
    >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div><h2 id="share-pick-title" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Share pick</h2><p id="share-pick-description" className="sr-only">Download or share this pick card.</p></div>
          <button type="button" data-modal-autofocus aria-label="Close share menu" onClick={onClose} style={{ background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', minWidth: 44, minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', padding: 8 }}><X size={18} /></button>
        </div>

        <div style={{
          position: 'relative', width: '100%', minHeight: 160, borderRadius: 12, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 16,
        }}>
          {!imgLoaded && !imgErrored && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-3)' }}>
              Generating image…
            </div>
          )}
          {imgErrored ? (
            <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>Couldn't generate a preview for this pick.</div>
          ) : (
            <SafeImage
              src={imgUrl}
              alt="Pick share preview"
              loading="eager"
              onLoad={() => setImgLoaded(true)}
              onFailure={() => setImgErrored(true)}
              style={{ width: '100%', display: 'block', opacity: imgLoaded ? 1 : 0 }}
            />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <ShareOptionBtn label="Download" onClick={download} busy={busy === 'download'}
            icon={<Download size={18} />} bg="var(--surface-2)" fg="var(--text-1)" />
          <ShareOptionBtn label={copied ? 'Copied' : 'Copy Link'} onClick={copyLink}
            icon={copied ? <Check size={18} /> : <Link2 size={18} />} bg="var(--surface-2)" fg={copied ? 'var(--green)' : 'var(--text-1)'} />
          <ShareOptionBtn label="X" onClick={shareToX}
            icon={<span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>𝕏</span>} bg="#000" fg="#fff" />
          <ShareOptionBtn label="Reddit" onClick={shareToReddit}
            icon={<span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>reddit</span>} bg="#FF4500" fg="#fff" />
          <ShareOptionBtn label="Text" onClick={shareToSms}
            icon={<MessageSquare size={18} />} bg="#2ED573" fg="#052e16" />
          <ShareOptionBtn label="More" onClick={nativeShare} busy={busy === 'native'}
            icon={<Share size={18} />} bg="var(--surface-2)" fg="var(--text-1)" />
        </div>
        {feedback && <p role={feedback.error ? 'alert' : 'status'} className="mt-3 text-sm leading-6" style={{ color: feedback.error ? 'var(--red)' : 'var(--text-2)' }}>{feedback.text}</p>}
        {manualCopy && <label className="mt-2 block text-sm text-[var(--text-2)]">Post link<input readOnly value={postUrl} onFocus={event => event.currentTarget.select()} className="ss-input mt-1" style={{ fontSize: 16, minHeight: 44 }} /></label>}
    </ModalSurface>
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
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>{label}</span>
    </button>
  )
}
