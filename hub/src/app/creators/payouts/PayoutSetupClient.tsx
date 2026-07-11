'use client'
import React, { useState } from 'react'

export function PayoutSetupClient({ profile, recentPayouts }: { profile: any; recentPayouts: any[] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startOnboarding = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/creator/connect-onboard', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start onboarding')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message || String(e))
      setLoading(false)
    }
  }

  const ready = profile.stripe_connect_charges_enabled
  const started = !!profile.stripe_account_id

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>Creator Payouts</h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
        Connect a Stripe account to receive money from your subscribers. Independent-tier subscriptions pay out on Stripe's own schedule (usually every 2 days); the platform keeps a fee automatically — no manual invoicing needed.
      </p>

      <div style={{
        padding: 20, borderRadius: 12, border: '1px solid var(--border)',
        background: 'var(--surface)', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: ready ? '#4ade80' : started ? '#f59e0b' : 'var(--text-3)',
          }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
            {ready ? 'Payouts active' : started ? 'Onboarding in progress' : 'Not connected'}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
          {ready
            ? 'Your Stripe account is verified. You can start selling subscription tiers.'
            : started
              ? 'You started Stripe onboarding but haven\'t finished verification yet.'
              : 'Connect your bank details through Stripe\'s secure onboarding flow to start getting paid.'}
        </p>
        {error && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{error}</p>}
        <button
          onClick={startOnboarding}
          disabled={loading}
          style={{
            padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 800, fontSize: 13,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Redirecting…' : ready ? 'Manage Stripe account' : started ? 'Continue setup' : 'Connect with Stripe'}
        </button>
      </div>

      <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-2)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
        Recent Payouts
      </h2>
      <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {recentPayouts.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>No payouts yet</div>
        ) : recentPayouts.map(p => (
          <div key={p.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12,
          }}>
            <div>
              <div style={{ color: 'var(--text-1)', fontWeight: 700 }}>
                {p.source === 'pro_plan_pool' ? 'Pro Plan Pool' : 'Independent Subscription'}
              </div>
              <div style={{ color: 'var(--text-3)' }}>{new Date(p.created_at).toLocaleDateString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#4ade80', fontWeight: 800 }}>${Number(p.creator_amount).toFixed(2)}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 10 }}>of ${Number(p.gross_amount).toFixed(2)} gross</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
