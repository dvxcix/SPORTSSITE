'use client'
import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import styles from './CreatorStudio.module.css'
type Health = { accountMatches: boolean; canReadCapabilities: boolean; deliveryReady: boolean }
export function CreatorPlatformPanel() {
 const [health, setHealth] = useState<Health | null>(null)
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 async function check(method = 'GET') {
   setBusy(true); setMessage('')
   try {
    const response = await fetch('/api/admin/creator-commerce', { method, cache: 'no-store', signal: AbortSignal.timeout(55_000) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Connection could not be checked.')
    if (method === 'POST') { setMessage(data.testPassed ? 'Creator events connected. Signed delivery test passed.' : 'Creator events connected, but the delivery test needs attention.'); setHealth(current => current ? { ...current, deliveryReady: true } : null) }
    else setHealth(data)
   } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Try again.') }
   finally { setBusy(false) }
 }
 useEffect(() => { let active = true; void fetch('/api/admin/creator-commerce', { cache: 'no-store' }).then(async response => { const data = await response.json(); if (active) { if (response.ok) setHealth(data); else setMessage(data.error) } }).catch(() => { if (active) setMessage('Connection could not be checked.') }); return () => { active = false } }, [])
 return <details className={styles.analyticsDisclosure}><summary>Platform connection · admin</summary><div className={styles.panel}>
  <p className={styles.setupNote}>{health ? `Whop account: ${health.accountMatches ? 'Connected' : 'Mismatch'} · Payment status access: ${health.canReadCapabilities ? 'Available' : 'Permission needed'} · Creator events: ${health.deliveryReady ? 'Connected' : 'Setup needed'}` : 'Checking Whop platform connection…'}</p>
  <div className={styles.launchActions}><button className={styles.secondaryButton} disabled={busy} onClick={() => void check()}>{busy ? <Loader2 className="animate-spin" size={15}/> : <RefreshCw size={15}/>} Check connection</button>{!health?.deliveryReady && <button className={styles.secondaryButton} disabled={busy} onClick={() => void check('POST')}>Connect creator events</button>}</div>
  {message && <p role="status" className={styles.setupNote}>{message}</p>}
 </div></details>
}
