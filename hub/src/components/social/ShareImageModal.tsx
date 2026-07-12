'use client'

import { useState } from 'react'
import { X, Download, Link2, MessageSquare, Share, Check } from 'lucide-react'

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

  const imgUrl = `/api/share-image/${postId}`
  const postUrl = typeof window !== 'undefined' ? `${window.location.origin}/posts/${postId}` : ''
  const shareText = 'Check out my pick on SlipSurge 🚀'

  async function download() {
    setBusy('download')
    try {
      const res = await fetch(imgUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'slipsurge-pick.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
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
    await navigator.clipboard.writeText(postUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function nativeShare() {
    setBusy('native')
    try {
      const res = await fetch(imgUrl)
      const blob = await res.blob()
      const file = new File([blob], 'slipsurge-pick.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My pick on SlipSurge' })
      } else {
        await navigator.share?.({ url: postUrl, title: 'My pick on SlipSurge' })
      }
    } catch {
      // user dismissed the native sheet — nothing to do
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
        style={{ width: 'min(420px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>Share Pick</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
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
            <img
              src={imgUrl}
              alt="Pick share preview"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgErrored(true)}
              style={{ width: '100%', display: imgLoaded ? 'block' : 'none' }}
            />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <ShareOptionBtn label="Download" onClick={download} busy={busy === 'download'}
            icon={<Download size={18} />} bg="var(--surface-2)" fg="var(--text-1)" />
          <ShareOptionBtn label="Copy Link" onClick={copyLink}
            icon={copied ? <Check size={18} /> : <Link2 size={18} />} bg="var(--surface-2)" fg={copied ? 'var(--green)' : 'var(--text-1)'} />
          <ShareOptionBtn label="X" onClick={shareToX}
            icon={<span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>𝕏</span>} bg="#000" fg="#fff" />
          <ShareOptionBtn label="Reddit" onClick={shareToReddit}
            icon={<span style={{ fontSize: 11, fontWeight: 900, lineHeight: 1 }}>reddit</span>} bg="#FF4500" fg="#fff" />
          <ShareOptionBtn label="Text" onClick={shareToSms}
            icon={<MessageSquare size={18} />} bg="#2ED573" fg="#052e16" />
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
