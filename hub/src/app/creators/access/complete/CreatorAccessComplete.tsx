'use client'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import styles from '../../studio/CreatorStudio.module.css'
export function CreatorAccessComplete({ productId }: { productId: string }) {
 const [result, setResult] = useState<{ active: boolean; status: string; destination: string | null; name: string | null } | null>(null)
 const [checking, setChecking] = useState(true)
 const [error, setError] = useState('')
 const check = useCallback(async (signal?: AbortSignal) => {
   try {
    const response = await fetch(`/api/creator/products/${productId}/access`, { cache: 'no-store', signal })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error)
    setResult(payload); setError('')
   } catch { if (!signal?.aborted) setError('Access could not be checked. Please refresh.') }
   finally { if (!signal?.aborted) setChecking(false) }
 }, [productId])
 useEffect(() => {
   const controller = new AbortController()
   void fetch(`/api/creator/products/${productId}/access`, { cache: 'no-store', signal: controller.signal }).then(async response => {
     const payload = await response.json()
     if (!response.ok) throw new Error('Access could not be checked.')
     if (!controller.signal.aborted) { setResult(payload); setError(''); setChecking(false) }
   }).catch(() => { if (!controller.signal.aborted) { setError('Access could not be checked. Please refresh.'); setChecking(false) } })
   let count = 0
   const timer = setInterval(() => { if (++count <= 10) void check(controller.signal); else clearInterval(timer) }, 4000)
   return () => { controller.abort(); clearInterval(timer) }
 }, [check, productId])
 async function manage() {
   setError('')
   try {
     const response = await fetch('/api/creator/products/' + productId + '/manage', { method: 'POST', signal: AbortSignal.timeout(20_000) })
     const data = await response.json()
     if (!response.ok || !isTrustedWhopUrl(data.url)) throw new Error(data.error || 'Billing could not be opened.')
     window.location.assign(data.url)
   } catch (cause) { setError(cause instanceof Error ? cause.message : 'Try again.') }
 }
 return <div className={styles.page}><section className={styles.launch} aria-live="polite">
  {result?.active ? <CheckCircle2 size={30} className="text-[var(--accent)]"/> : <Loader2 size={30} className={checking ? 'animate-spin text-[var(--text-2)]' : 'text-[var(--text-2)]'}/>}
  <h1 className="mt-4 text-2xl font-semibold">{result?.active ? 'Your access is ready' : result && result.status !== 'pending' ? 'Access ended' : 'Checking your membership'}</h1>
  <p>{result?.active ? 'Your membership is linked to this SlipSurge account.' : result && result.status !== 'pending' ? 'Your membership is no longer active. You can still manage billing through Whop.' : 'Access opens after Whop confirms your membership. This can take a moment; you do not need to pay again.'}</p>
  <div className={styles.launchActions} style={{ marginTop: 20 }}>{result?.active && result.destination ? <Link className={styles.primaryButton} href={result.destination}>Open {result.name || 'community'} <ArrowRight size={15}/></Link> : <button className={styles.secondaryButton} disabled={checking} onClick={() => void check()}><RefreshCw size={15}/> Refresh access</button>}{result && result.status !== 'pending' && <button className={styles.secondaryButton} onClick={() => void manage()}>Manage billing</button>}<Link href="/groups">My communities <ArrowRight size={15}/></Link></div>
  {error && <p role="alert" className={styles.setupError}>{error}</p>}
 </section></div>
}
