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
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import styles from './CreatorPayouts.module.css'

type CreatorPayoutProfile = { whop_connected_company_id: string | null }
type CommerceEvent = { id: string; event_type: string; created_at: string; amount: number | null; currency: string | null; status: string | null }

export function PayoutSetupClient({ profile, recentPayouts, isTestAccount = false }: { profile: CreatorPayoutProfile; recentPayouts: CommerceEvent[]; isTestAccount?: boolean }) {
  const companyId = profile.whop_connected_company_id
  const connected = Boolean(companyId)
  const [loading, setLoading] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(connected && !isTestAccount)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadPayoutTools(signal?: AbortSignal) {
    try {
      const response = await fetch('/api/creator/payout-token', { method: 'POST', cache: 'no-store', signal })
      const payload = await response.json().catch(() => null)
      if (!response.ok || typeof payload?.token !== 'string') throw new Error('payout_session_failed')
      setToken(payload.token)
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError('Secure payout tools could not load. Please try again.')
    } finally {
      if (!signal?.aborted) setTokenLoading(false)
    }
  }

  async function retryPayoutTools() {
    setTokenLoading(true)
    setError(null)
    await loadPayoutTools(AbortSignal.timeout(20_000))
  }

  useEffect(() => {
    if (!connected || isTestAccount) return
    const controller = new AbortController()
    fetch('/api/creator/payout-token', { method: 'POST', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok || typeof payload?.token !== 'string') throw new Error('payout_session_failed')
        setToken(payload.token)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError('Secure payout tools could not load. Please try again.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setTokenLoading(false)
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
      if (!response.ok) throw new Error('onboarding_failed')
      if (!isTrustedWhopUrl(payload?.url)) throw new Error('invalid_destination')
      window.location.assign(payload.url)
    } catch {
      setError('Could not start payment setup. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}><div><span>CREATOR COMMERCE</span><h1>Creator payouts</h1><p>Complete verification, add a payout method, review your balance, and withdraw earnings without leaving SlipSurge.</p></div><Link href="/creators/studio" className={styles.back}><ArrowLeft size={13}/> Creator Studio</Link></header>

      {isTestAccount && (
        <div className={styles.notice}>
          Test workspace. This account cannot connect a payout method, receive funds, or withdraw money.
        </div>
      )}

      <div className={styles.status}>
        <span className={`${styles.dot} ${connected ? styles.ready : ''}`} />
        <div className={styles.statusCopy}>
          <strong>{isTestAccount ? 'Payout sandbox' : connected ? 'Whop account connected' : 'Setup required'}</strong>
          <p>{isTestAccount ? 'Preview the creator payout experience with a fixed zero balance and no money movement.' : connected ? 'Your creator balance and payout tools are secured and operated by Whop.' : 'Create and verify your connected Whop account before publishing paid access.'}</p>
        </div>
        {!connected && !isTestAccount && <button className={styles.primary} onClick={startOnboarding} disabled={loading}>{loading ? 'Opening Whop...' : 'Set up creator payments'}</button>}
      </div>

      {isTestAccount && (
        <div className={styles.grid}>
          <section className={styles.card}><small>AVAILABLE BALANCE</small><h2>$0.00</h2><p>Test balance</p></section>
          <section className={styles.card}><small>PAYOUT METHOD</small><h2>Not connected</h2><p>Disabled for this test account</p></section>
          <section className={`${styles.card} ${styles.wide}`}><small>WITHDRAWALS</small><p>No test withdrawals. Real approved creators receive Whop&apos;s secure embedded payout portal here.</p></section>
        </div>
      )}

      {error && <div role="alert" className={styles.error}>{error}{connected && <button type="button" className={styles.primary} onClick={() => void retryPayoutTools()} disabled={tokenLoading}>Try again</button>}</div>}
      {connected && !token && !error && <div role="status" className={styles.loading}>Loading secure payout tools…</div>}
      {companyId && token && (
        <PayoutsSession token={token} companyId={companyId} currency="usd" redirectUrl={`${window.location.origin}/creators/payouts`}>
          <div className={styles.grid}>
            <section className={styles.card}><BalanceElement /></section>
            <section className={styles.card}><WithdrawButtonElement /></section>
            <section className={`${styles.card} ${styles.wide}`}><AddPayoutMethodElement /></section>
            <section className={`${styles.card} ${styles.wide}`}><WithdrawalsElement /></section>
          </div>
        </PayoutsSession>
      )}

      <h2 className={`${styles.eyebrow} ${styles.sectionTitle}`}>Recent creator commerce</h2>
      <div className={styles.history}>
        {recentPayouts.length === 0 ? <div className={styles.empty}>No payout activity yet.</div> : recentPayouts.map(event => (
          <div className={styles.row} key={event.id}>
            <div><strong>{String(event.event_type).replaceAll('_', ' ')}</strong><span>{new Date(event.created_at).toLocaleDateString()}</span></div>
            <div><strong>{event.amount == null ? 'Recorded' : `${String(event.currency || 'usd').toUpperCase()} ${Number(event.amount).toFixed(2)}`}</strong><span>{event.status || 'processed'}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}
