'use client'

import { useEffect, useState } from 'react'
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

  // Reported live: on mobile, the embedded checkout form can run taller than
  // the viewport, and the global Watchlist/My Picks FABs (mounted site-wide,
  // not just on Dugout — see RootLayoutShell) sat on top of it right where a
  // lower field needed to be reached. This body class hides them for as long
  // as the modal is actually open (see globals.css), not just while this
  // component happens to be mounted.
  useEffect(() => {
    if (!sessionId) return
    document.body.classList.add('ss-modal-open')
    return () => { document.body.classList.remove('ss-modal-open') }
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
      {sessionId && (
        <>
          {/* On mobile, the embedded form can run taller than a centered
              90vh card leaves room for — reported live as a field that
              couldn't be scrolled up to. Below the breakpoint this goes
              edge-to-edge and full-height instead, so the browser's own
              scroll (not a squeezed inner box) is what reaches every field. */}
          <style>{`
            @media (max-width: 640px) {
              .ss-checkout-overlay { padding: 0 !important; align-items: stretch !important; }
              .ss-checkout-card { max-width: none !important; max-height: none !important; height: 100dvh !important; border-radius: 0 !important; padding-top: max(24px, env(safe-area-inset-top)) !important; }
            }
          `}</style>
          <div className="ss-checkout-overlay" style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div className="ss-checkout-card" style={{
              background: '#06070A', borderRadius: 16, maxWidth: 480, width: '100%',
              maxHeight: '90vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative', padding: 24,
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
          </div>
        </>
      )}
    </>
  )
}
