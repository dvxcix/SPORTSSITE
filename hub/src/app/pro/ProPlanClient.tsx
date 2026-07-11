'use client'
import { useState } from 'react'
import { CheckCircle2, Zap } from 'lucide-react'

const FEATURES = [
  'Full access to The Dugout — live odds deltas, Statcast splits, pitch-mix breakdowns',
  'Post unlimited picks and parlays',
  'Verified Pro badge on your profile',
  'Priority visibility in the feed',
]

export function ProPlanClient({ priceMonthly, priceConfigured, isActive, expiresAt, checkoutStatus }: {
  priceMonthly: number
  priceConfigured: boolean
  isActive: boolean
  expiresAt: string | null
  checkoutStatus: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function subscribe() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout/pro-plan', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message || String(e))
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 16px 80px' }}>
      {checkoutStatus === 'success' && (
        <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#4ade80', fontWeight: 700 }}>
          You're subscribed! It may take a few seconds for your Pro status to update.
        </div>
      )}
      {checkoutStatus === 'cancelled' && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text-3)' }}>
          Checkout cancelled — no charge was made.
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 999, marginBottom: 12 }}>
          <Zap size={12} /> SLIPSURGE PRO
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>
          {isActive ? "You're on Pro" : 'Go Pro'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)' }}>
          {isActive
            ? `Your Pro membership renews ${expiresAt ? new Date(expiresAt).toLocaleDateString() : ''}.`
            : 'Unlock the full Dugout and post without limits.'}
        </p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 18 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-1)' }}>${priceMonthly.toFixed(2)}</span>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>/month</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {FEATURES.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <CheckCircle2 size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>

        {error && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</p>}

        {isActive ? (
          <div style={{ textAlign: 'center', padding: '10px', fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
            ✓ Active membership
          </div>
        ) : !priceConfigured ? (
          <div style={{ textAlign: 'center', padding: '10px', fontSize: 12, color: 'var(--text-3)' }}>
            Pro Plan isn't available yet — check back soon.
          </div>
        ) : (
          <button
            onClick={subscribe}
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: loading ? 'default' : 'pointer',
              background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 800, fontSize: 14,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Redirecting…' : 'Subscribe with Stripe'}
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
        Billed monthly through Stripe. Cancel anytime from your account settings.
      </p>
    </div>
  )
}
