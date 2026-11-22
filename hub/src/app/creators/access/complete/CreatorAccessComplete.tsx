'use client'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import styles from '../../studio/CreatorStudio.module.css'
export function CreatorAccessComplete({ productId }: { productId: string }) {
 const [result, setResult] = useState<{ active: boolean; status: string; destination: string | null; name: string | null } | null>(null)
 const [checking, setChecking] = useState(true)
 const [error, setError] = useState('')
 const [managing,setManaging]=useState(false)
 const request=useRef<AbortController|null>(null)
 const check = useCallback(async (signal?: AbortSignal) => {
   request.current?.abort();const controller=new AbortController();request.current=controller;setChecking(true)
   const aborted=()=>signal?.aborted||controller.signal.aborted
   try {
    const response = await fetch(`/api/creator/products/${productId}/access`, { cache: 'no-store', signal: AbortSignal.any([controller.signal,AbortSignal.timeout(15000),...(signal?[signal]:[])]) })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error)
    if(!aborted()){setResult(payload); setError('')};return payload as {active:boolean;status:string}
   } catch { if (!aborted()) setError('Access could not be checked. Please refresh.');return null }
   finally { if (!aborted()) setChecking(false) }
 }, [productId])
 useEffect(() => {
   const controller = new AbortController()
   let count=0,timer:ReturnType<typeof setTimeout>|undefined
   async function poll(){const access=await check(controller.signal);if(!controller.signal.aborted&&access?.status==='pending'&&++count<10)timer=setTimeout(()=>void poll(),4000)}
   void poll()
   return () => { controller.abort(); request.current?.abort(); clearTimeout(timer) }
 }, [check, productId])
 async function manage() {
   if(managing)return;setManaging(true)
   setError('')
   try {
     const response = await fetch('/api/creator/products/' + productId + '/manage', { method: 'POST', signal: AbortSignal.timeout(20_000) })
     const data = await response.json()
     if (!response.ok || !isTrustedWhopUrl(data.url)) throw new Error(data.error || 'Billing could not be opened.')
     window.location.assign(data.url)
   } catch (cause) { setError(cause instanceof Error ? cause.message : 'Try again.') }finally{setManaging(false)}
 }
 return <div className={styles.page}><section className={styles.launch} aria-live="polite">
  {result?.active ? <CheckCircle2 size={30} className="text-[var(--accent)]"/> : <Loader2 size={30} className={checking ? 'animate-spin text-[var(--text-2)]' : 'text-[var(--text-2)]'}/>}
  <h1 className="mt-4 text-2xl font-semibold">{result?.active ? 'Your access is ready' : result?.status==='revoked'?'Community access paused': result && result.status !== 'pending' ? 'Access ended' : 'Checking your membership'}</h1>
  <p>{result?.active ? 'Your membership is linked to this SlipSurge account.' : result?.status==='revoked'?'Contact SlipSurge support about community access. You can still manage billing through Whop.':result && result.status !== 'pending' ? 'Your membership is no longer active. You can still manage billing through Whop.' : 'Access opens after Whop confirms your membership. This can take a moment; you do not need to pay again.'}</p>
  <div className={styles.launchActions} style={{ marginTop: 20 }}>{result?.active && result.destination ? <Link className={styles.primaryButton} href={result.destination}>Open {result.name || 'community'} <ArrowRight size={15}/></Link> : <button className={styles.secondaryButton} disabled={checking} onClick={() => void check()}><RefreshCw size={15}/> Refresh access</button>}{result && result.status !== 'pending' && <button className={styles.secondaryButton} disabled={managing} onClick={() => void manage()}>{managing ? 'Opening…' : 'Manage billing'}</button>}<Link href="/groups">My communities <ArrowRight size={15}/></Link></div>
  {error && <p role="alert" className={styles.setupError}>{error}</p>}
 </section></div>
}
