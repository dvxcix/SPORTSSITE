'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'
import { CreatorDialog } from '@/components/creator/CreatorDialog'
import { recordCreatorFunnelEvent } from '@/components/creator/CreatorFunnelSignal'
import styles from '@/components/creator/creatorCheckout.module.css'

const CreatorCheckoutEmbed = dynamic(() => import('@/components/creator/CreatorCheckoutEmbed').then(module => module.CreatorCheckoutEmbed), { ssr: false, loading: () => <div role="status" className={styles.loading}>Loading secure checkout…</div> })
export function CheckoutButton({ productId, creatorId, productTitle, label = 'Join membership' }: { productId: string; creatorId: string; productTitle?: string; label?: string }) {
  const router = useRouter()
  const request = useRef<AbortController | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkout, setCheckout] = useState<{id: string; url: string} | null>(null)
  const [error, setError] = useState('')
  useEffect(() => () => request.current?.abort(), [])
  function close() { request.current?.abort(); request.current = null; setLoading(false); setOpen(false) }
  async function start() {
    if (request.current) return
    const controller = new AbortController(); request.current = controller
    setOpen(true); setLoading(true); setError(''); setCheckout(null)
    try {
      void recordCreatorFunnelEvent(creatorId, 'checkout_started', productId)
      const response = await fetch(`/api/creator/products/${productId}/checkout`, { method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) })
      const payload = await response.json().catch(() => null)
      if (controller.signal.aborted) return
      if (response.status === 401) { close(); router.push('/auth/login?next=' + encodeURIComponent('/creators/offers/' + productId)); return }
      if (response.status === 409 && payload?.accessUrl === '/creators/access/complete?product=' + productId) { close(); router.push(payload.accessUrl); return }
      if (!response.ok) throw new Error(payload?.error || 'Checkout could not be opened.')
      if (!isTrustedWhopUrl(payload?.url) || typeof payload?.checkoutConfigurationId !== 'string' || !/^ch_[a-zA-Z0-9]+$/.test(payload.checkoutConfigurationId)) throw new Error('Secure checkout could not be opened. Please try again.')
      setCheckout({id: payload.checkoutConfigurationId, url: payload.url})
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Checkout could not be opened. Please try again.') }
    finally { if (request.current === controller) { request.current = null; setLoading(false) } }
  }
  return <><button className={styles.trigger} type="button" onClick={()=>void start()} disabled={loading} aria-busy={loading}>{label}<ArrowRight size={16}/></button>{open&&<CreatorDialog title={productTitle || 'Join membership'} description="Secure checkout with Whop. Your membership will be linked to this SlipSurge account." onClose={close} narrow>{loading?<div role="status" className={styles.loading}><Loader2 size={20} className="animate-spin"/>Preparing your checkout…</div>:checkout?<CreatorCheckoutEmbed configurationId={checkout.id} productId={productId} purchaseUrl={checkout.url}/>:<><p role="alert" className={styles.error}>{error}</p><button type="button" className={styles.retry} onClick={()=>void start()}>Try again</button></>}<p className={styles.secure}><ShieldCheck size={14}/>Payments handled securely by Whop</p></CreatorDialog>}</>
}
