'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { WhopCheckoutEmbed } from '@whop/checkout/react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Whop's embed accepts EITHER planId OR sessionId (mutually exclusive per its
// own types) — we always use sessionId here, created server-side with the
// logged-in user's internal id attached as metadata (see
// /api/whop/checkout-session), so the webhook can map a completed payment
// back to the right SlipSurge account without email-matching.
export function PricingCheckoutButton({ planId, label, loggedIn, highlight }: { planId: string; label: string; loggedIn: boolean; highlight?: boolean }) {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Decided in JS, not a CSS @media breakpoint — reported live twice now that
  // the modal still rendered as the centered/rounded desktop popup on a real
  // phone (rounded corners, a visible gap above showing the page behind it),
  // meaning the @media (max-width: 640px) override wasn't reliably taking
  // effect. matchMedia gives one unambiguous answer instead of trusting the
  // cascade to apply three separate !important overrides correctly.
  const [isMobile, setIsMobile] = useState(false)

  // Reported live: on mobile, the embedded checkout form can run taller than
  // the viewport, and the global Watchlist/My Picks FABs (mounted site-wide,
  // not just on Dugout — see RootLayoutShell) sat on top of it right where a
  // lower field needed to be reached. This body class hides them for as long
  // as the modal is actually open (see globals.css), not just while this
  // component happens to be mounted.
  useEffect(() => {
    if (!sessionId) return
    document.body.classList.add('ss-modal-open')
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => {
      document.body.classList.remove('ss-modal-open')
      mq.removeEventListener('change', update)
    }
  }, [sessionId])

  async function startCheckout() {
    if (!loggedIn) {
      router.push('/auth/login?next=/pricing')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/whop/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to start checkout')
      setSessionId(data.sessionId)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={startCheckout}
        disabled={loading}
        size="lg"
        className="w-full bg-[#B4FF4D] text-black hover:bg-[#A3EE3C]"
        style={highlight ? { boxShadow: '0 0 0 3px rgba(180,255,77,0.15)' } : undefined}
      >
        {loading ? 'Loading…' : label}
      </Button>
      {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{error}</p>}
      {sessionId && createPortal(
        // The overlay itself is the ONE scrollable element (not a flex-
        // centered overlay wrapping a separately-scrollable card) — on
        // mobile the card is just tall in-flow content the overlay scrolls
        // to reveal, the same shape as scrolling a normal page. A card with
        // its own nested overflow, inside a flex-centered parent, still
        // scrolled fine by every DOM measurement (scrollHeight > clientHeight,
        // overflow: auto) but real touch drags starting on the embedded
        // cross-origin Whop iframe weren't reliably reaching it on a real
        // phone — fewer nested scroll containers is the standard fix for
        // that class of bug.
        //
        // Portaled to document.body — reported live on desktop: every
        // pricing card is wrapped in CometCard, whose tilt effect sets a
        // real inline `transform` on the card div (present at rest too,
        // post-hover: mouseleave resets it to an identity `rotateX(0deg)…`
        // string, not removes it) plus `overflow: hidden`. A `transform`
        // on an ancestor — any value, including an identity one — makes
        // that ancestor the containing block for a `position: fixed`
        // descendant per spec, so this modal was rendering "fixed" to the
        // CARD, then getting clipped by the card's own overflow:hidden,
        // instead of covering the real viewport. Never showed up on mobile
        // since CometCard's tilt only ever fires on mousemove, which touch
        // interaction never triggers. Rendering outside the card's DOM
        // subtree entirely is the only fix that holds regardless of what
        // any ancestor's CSS does.
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center',
          padding: isMobile ? 0 : 16,
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          <div style={{
            background: '#06070A',
            borderRadius: isMobile ? 0 : 16,
            maxWidth: isMobile ? 'none' : 480,
            width: '100%',
            minHeight: isMobile ? '100dvh' : undefined,
            position: 'relative',
            padding: 24,
            paddingTop: isMobile ? 'max(24px, env(safe-area-inset-top))' : 24,
            border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setSessionId(null)}
              aria-label="Close checkout"
              style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 4, zIndex: 1 }}
            >
              <X size={20} color="var(--text-3)" />
            </button>
            <WhopCheckoutEmbed
              sessionId={sessionId}
              // No ?status= of our own here — Whop appends the real
              // "success" or "error" outcome to this URL itself for the
              // redirect-based payment flows (3DS, etc). Hardcoding
              // "success" ourselves would make a failed payment redirect
              // to a URL that still claims success once Whop's own value
              // gets appended alongside/after ours.
              returnUrl={`${window.location.origin}/pricing`}
              theme="dark"
              themeOptions={{ accentColor: '#B4FF4D', backgroundColor: '#06070A' }}
              onComplete={() => {
                setSessionId(null)
                router.push('/pricing?status=success')
                router.refresh()
              }}
              fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading checkout…</div>}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
