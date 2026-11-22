'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { ArrowRight, Loader2 } from 'lucide-react'
import { recordCreatorFunnelEvent } from '@/components/creator/CreatorFunnelSignal'

export function CheckoutButton({ productId, creatorId }: { productId: string; creatorId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function checkout() {
    setLoading(true)
    setError('')
    try {
      void recordCreatorFunnelEvent(creatorId, 'checkout_started', productId)
      const response = await fetch(`/api/creator/products/${productId}/checkout`, { method: 'POST', signal: AbortSignal.timeout(20_000) })
      const payload = await response.json().catch(() => null)
      if (response.status === 401) { router.push('/auth/login?next=' + encodeURIComponent('/creators/offers/' + productId)); return }
      if (response.status === 409 && payload?.accessUrl === '/creators/access/complete?product=' + productId) { router.push(payload.accessUrl); return }
      if (!response.ok) throw new Error(payload?.error || 'Checkout could not be opened.')
      if (!isTrustedWhopUrl(payload?.url)) throw new Error('invalid_destination')
      window.location.assign(payload.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Checkout could not be opened. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  return <>{error ? <div role="alert" className="ss-checkout-error">{error}</div> : null}<button type="button" onClick={checkout} disabled={loading} aria-busy={loading}>{loading ? <><Loader2 className="animate-spin" size={16} /> Opening checkout</> : <>Continue to checkout <ArrowRight size={16} /></>}</button></>
}
