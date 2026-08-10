'use client'

import { useEffect, useState } from 'react'
import {
  AddPayoutMethodElement,
  BalanceElement,
  PayoutsSession,
  WithdrawButtonElement,
  WithdrawalsElement,
} from '@whop/embedded-components-react-js'

type CreatorPayoutProfile = { whop_connected_company_id: string | null }
type CommerceEvent = { id: string; event_type: string; created_at: string; amount: number | null; currency: string | null; status: string | null }

export function PayoutSetupClient({ profile, recentPayouts }: { profile: CreatorPayoutProfile; recentPayouts: CommerceEvent[] }) {
  const companyId = profile.whop_connected_company_id
  const connected = Boolean(companyId)
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected) return
    fetch('/api/creator/payout-token', { method: 'POST' })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not open payouts')
        setToken(payload.token)
      })
      .catch(reason => setError(reason.message))
  }, [connected])

  async function startOnboarding() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/creator/whop-onboard', { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not start onboarding')
      window.location.href = payload.url
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>Creator payouts</h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
        Complete verification, add a payout method, review your balance, and withdraw earnings without leaving SlipSurge.
      </p>

      <div className="creator-payout-status">
        <span className={`creator-payout-dot ${connected ? 'is-ready' : ''}`} />
        <div style={{ flex: 1 }}>
          <strong>{connected ? 'Whop account connected' : 'Setup required'}</strong>
          <p>{connected ? 'Your creator balance and payout tools are secured and operated by Whop.' : 'Create and verify your connected Whop account before publishing paid access.'}</p>
        </div>
        {!connected && <button className="creator-studio-primary" onClick={startOnboarding} disabled={loading}>{loading ? 'Opening Whop...' : 'Set up creator payments'}</button>}
      </div>

      {error && <div className="creator-studio-error">{error}</div>}
      {connected && !token && !error && <div className="creator-studio-empty">Loading secure payout tools...</div>}
      {companyId && token && (
        <PayoutsSession token={token} companyId={companyId} currency="usd" redirectUrl={`${window.location.origin}/creators/payouts`}>
          <div className="creator-payout-grid">
            <section className="creator-payout-card"><BalanceElement /></section>
            <section className="creator-payout-card"><WithdrawButtonElement /></section>
            <section className="creator-payout-card creator-payout-wide"><AddPayoutMethodElement /></section>
            <section className="creator-payout-card creator-payout-wide"><WithdrawalsElement /></section>
          </div>
        </PayoutsSession>
      )}

      <h2 className="creator-studio-eyebrow">Recent creator commerce</h2>
      <div className="creator-payout-history">
        {recentPayouts.length === 0 ? <div className="creator-studio-empty">No payout activity yet.</div> : recentPayouts.map(event => (
          <div className="creator-payout-row" key={event.id}>
            <div><strong>{String(event.event_type).replaceAll('_', ' ')}</strong><span>{new Date(event.created_at).toLocaleDateString()}</span></div>
            <div><strong>{event.amount == null ? 'Recorded' : `${String(event.currency || 'usd').toUpperCase()} ${Number(event.amount).toFixed(2)}`}</strong><span>{event.status || 'processed'}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}
