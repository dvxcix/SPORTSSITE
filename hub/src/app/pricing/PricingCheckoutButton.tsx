'use client'

import { useState } from 'react'
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
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: '#06070A', borderRadius: 16, maxWidth: 480, width: '100%',
            maxHeight: '90vh', overflow: 'auto', position: 'relative', padding: 24,
            border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setSessionId(null)}
              aria-label="Close checkout"
              style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <X size={20} color="var(--text-3)" />
            </button>
            <WhopCheckoutEmbed
              sessionId={sessionId}
              returnUrl={`${window.location.origin}/pricing?status=success`}
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
      )}
    </>
  )
}
