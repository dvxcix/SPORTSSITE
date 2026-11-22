'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ExternalLink, Loader2, RefreshCw, Users } from 'lucide-react'
import type { CreatorPaymentState } from '@/lib/creatorCommerce'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import styles from './CreatorStudio.module.css'

const labels = { not_connected: 'Set up payments', onboarding: 'Finish verification', pending: 'Whop is reviewing your account', ready: 'Ready to accept payments', restricted: 'Payments restricted', unavailable: 'Payment status unavailable' }
export function CreatorLaunchPanel({ groupCount, liveOffers, testAccount, onReadiness }: { groupCount: number; liveOffers: number; testAccount: boolean; onReadiness: (state: CreatorPaymentState | null) => void }) {
  const [state, setState] = useState<CreatorPaymentState | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/creator/status', { cache: 'no-store', signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Payment status could not be verified.')
      setState(data); onReadiness(data); setError('')
    } catch (cause) {
      if (signal?.aborted) return
      setState(null); onReadiness(null); setError(cause instanceof Error ? cause.message : 'Payment status could not be verified.')
    } finally { if (!signal?.aborted) setChecking(false) }
  }, [onReadiness])
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/creator/status', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Payment status could not be verified.')
      if (!controller.signal.aborted) { setState(data); onReadiness(data); setError(''); setChecking(false) }
    }).catch(cause => {
      if (!controller.signal.aborted) { setState(null); onReadiness(null); setError(cause instanceof Error ? cause.message : 'Payment status could not be verified.'); setChecking(false) }
    })
    const visible = () => { if (document.visibilityState === 'visible') { setChecking(true); void refresh(controller.signal) } }
    document.addEventListener('visibilitychange', visible)
    return () => { controller.abort(); document.removeEventListener('visibilitychange', visible) }
  }, [refresh, onReadiness])
  async function connect() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/creator/whop-onboard', { method: 'POST', signal: AbortSignal.timeout(55_000) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Whop setup could not be opened.')
      if (!isTrustedWhopUrl(payload.url)) throw new Error('Payment setup returned an invalid destination.')
      window.location.assign(payload.url)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Try again.') }
    finally { setBusy(false) }
  }
  return <section className={styles.launch} aria-label="Community setup">
    <div className={styles.launchTitle}><div><h2>{groupCount ? 'Your next step' : 'Start with your community'}</h2><p>A home for your picks, research and conversations.</p></div><Link href="/groups/create" className={styles.primaryButton}><Users size={16}/>{groupCount ? 'New community' : 'Create a free community'}<ArrowRight size={15}/></Link></div>
    <div className={styles.setupSteps}>
      <div><span data-done={groupCount > 0}>{groupCount ? <Check size={16}/> : '1'}</span><div><strong>Build your space</strong><p>Free to create. Add your branding and invite members.</p></div></div>
      <div><span data-done={state?.canCharge}>{state?.canCharge ? <Check size={16}/> : '2'}</span><div><strong>{checking ? 'Checking payments…' : state ? labels[state.state] : 'Check payment setup'}</strong><p>Want to charge? Complete Whop verification. No SlipSurge application required.</p>{state?.actions.map((action, i) => <p key={i}>{action.title}{action.pending ? ' · In review' : ''}</p>)}</div></div>
      <div><span data-done={liveOffers > 0}>{liveOffers ? <Check size={16}/> : '3'}</span><div><strong>Create an offer and launch</strong><p>Choose your price, create its member community, then publish.</p></div></div>
    </div>
    <div className={styles.launchActions}><button type="button" className={styles.secondaryButton} onClick={connect} disabled={busy || testAccount}>{busy ? <Loader2 className="animate-spin" size={16}/> : <ExternalLink size={15}/>} {state?.canCharge ? 'Manage verification' : state?.state === 'not_connected' ? 'Set up paid access' : 'Continue Whop setup'}</button><button className={styles.secondaryButton} disabled={checking || busy} onClick={() => { setChecking(true); void refresh() }}><RefreshCw size={14}/> Refresh status</button>{state && state.state !== 'not_connected' && <Link href="/creators/payouts">Balance & payouts <ArrowRight size={14}/></Link>}</div>
    {testAccount && <p className={styles.setupNote}>Test workspace. Financial actions are disabled.</p>}
    {error && <p role="alert" className={styles.setupError}>{error}</p>}
  </section>
}
