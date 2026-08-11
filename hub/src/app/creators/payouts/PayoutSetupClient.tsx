'use client'

import { useEffect, useState } from 'react'
import {
  AddPayoutMethodElement,
  BalanceElement,
  PayoutsSession,
  WithdrawButtonElement,
  WithdrawalsElement,
} from '@whop/embedded-components-react-js'
import { isTrustedWhopUrl } from '@/lib/whopUrl'

type CreatorPayoutProfile = { whop_connected_company_id: string | null }
type CommerceEvent = { id: string; event_type: string; created_at: string; amount: number | null; currency: string | null; status: string | null }

export function PayoutSetupClient({ profile, recentPayouts, isTestAccount = false }: { profile: CreatorPayoutProfile; recentPayouts: CommerceEvent[]; isTestAccount?: boolean }) {
  const companyId = profile.whop_connected_company_id
  const connected = Boolean(companyId)
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected || isTestAccount) return
    const controller = new AbortController()
    fetch('/api/creator/payout-token', { method: 'POST', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not open payouts')
        setToken(payload.token)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Could not open payouts')
      })
    return () => controller.abort()
  }, [connected, isTestAccount])

  async function startOnboarding() {
    if (isTestAccount) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/creator/whop-onboard', { method: 'POST', signal: AbortSignal.timeout(20_000) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Could not start onboarding')
      if (!isTrustedWhopUrl(payload?.url)) throw new Error('Whop returned an invalid onboarding destination')
      window.location.assign(payload.url)
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

      {isTestAccount && (
        <div className="creator-studio-error" style={{ marginBottom: 18 }}>
          Test workspace. This account cannot connect a payout method, receive funds, or withdraw money.
        </div>
      )}

      <div className="creator-payout-status">
        <span className={`creator-payout-dot ${connected ? 'is-ready' : ''}`} />
        <div style={{ flex: 1 }}>
          <strong>{isTestAccount ? 'Payout sandbox' : connected ? 'Whop account connected' : 'Setup required'}</strong>
          <p>{isTestAccount ? 'Preview the creator payout experience with a fixed zero balance and no money movement.' : connected ? 'Your creator balance and payout tools are secured and operated by Whop.' : 'Create and verify your connected Whop account before publishing paid access.'}</p>
        </div>
        {!connected && !isTestAccount && <button className="creator-studio-primary" onClick={startOnboarding} disabled={loading}>{loading ? 'Opening Whop...' : 'Set up creator payments'}</button>}
      </div>

      {isTestAccount && (
        <div className="creator-payout-grid">
          <section className="creator-payout-card"><small>AVAILABLE BALANCE</small><h2>$0.00</h2><p>Test balance</p></section>
          <section className="creator-payout-card"><small>PAYOUT METHOD</small><h2>Not connected</h2><p>Disabled for this test account</p></section>
          <section className="creator-payout-card creator-payout-wide"><small>WITHDRAWALS</small><p>No test withdrawals. Real approved creators receive Whop&apos;s secure embedded payout portal here.</p></section>
        </div>
      )}

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
