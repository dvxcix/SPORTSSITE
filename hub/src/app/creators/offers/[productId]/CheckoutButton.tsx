'use client'
import { useState } from 'react'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { ArrowRight, Loader2 } from 'lucide-react'

export function CheckoutButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function checkout() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/creator/products/${productId}/checkout`, { method: 'POST', signal: AbortSignal.timeout(20_000) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Checkout could not be opened')
      if (!isTrustedWhopUrl(payload?.url)) throw new Error('Checkout returned an invalid destination')
      window.location.assign(payload.url)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Checkout could not be opened')
    } finally {
      setLoading(false)
    }
  }
  return <>{error ? <div role="alert" style={{ color: 'var(--red)', fontSize: 10, lineHeight: 1.4 }}>{error}</div> : null}<button type="button" onClick={checkout} disabled={loading}>{loading ? <><Loader2 className="animate-spin" size={16} /> Opening checkout</> : <>Continue to checkout <ArrowRight size={16} /></>}</button></>
}
