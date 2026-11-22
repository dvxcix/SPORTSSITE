'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Loader2, WalletCards } from 'lucide-react'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import styles from '../studio/CreatorStudio.module.css'
type CommerceEvent = { id: string; event_type: string; created_at: string; amount: number | null; currency: string | null; status: string | null }
export function PayoutSetupClient({ profile, recentPayouts, isTestAccount = false }: { profile: { connected: boolean }; recentPayouts: CommerceEvent[]; isTestAccount?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function openPortal() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/creator/payout-portal', { method: 'POST', signal: AbortSignal.timeout(35_000) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Payouts could not be opened.')
      if (!isTrustedWhopUrl(payload.url)) throw new Error('Invalid payout destination.')
      window.location.assign(payload.url)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Try again.') }
    finally { setBusy(false) }
  }
  return <div className={styles.page}>
    <Link href="/creators/studio" className={styles.textLink}><ArrowLeft size={15}/> Creator Studio</Link>
    <header className={styles.hero}><div><h1>Balance & payouts</h1><p>Manage your creator earnings through Whop.</p></div><WalletCards size={26}/></header>
    <section className={styles.spacedPanel}><header><div><h2>Your Whop payout account</h2><p>View your balance, complete verification, add a payout method and manage withdrawals in Whop’s secure portal.</p></div></header>
      {profile.connected ? <button className={styles.primaryButton} disabled={busy || isTestAccount} onClick={openPortal}>{busy ? <Loader2 className="animate-spin" size={16}/> : <ExternalLink size={16}/>} Open Whop payouts</button> : <Link href="/creators/studio" className={styles.primaryButton}>Set up payments in Studio</Link>}
      {isTestAccount && <p className={styles.setupNote}>Financial actions are disabled for this test account.</p>}{error && <p role="alert" className={styles.setupError}>{error}</p>}
    </section>
    <section className={styles.spacedPanel}><header><h2>Recent commerce activity</h2></header><div className={styles.events}>{recentPayouts.length ? recentPayouts.map(event => <div key={event.id}><span><b>{event.event_type.replaceAll('.', ' ').replaceAll('_', ' ')}</b><small>{new Date(event.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}</small></span><strong>{event.amount != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: event.currency || 'USD' }).format(event.amount) : event.status || 'Recorded'}</strong></div>) : <p>No commerce activity yet.</p>}</div></section>
  </div>
}
