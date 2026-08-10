'use client'
import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

export function CheckoutButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function checkout() {
    setLoading(true); setError('')
    const response = await fetch(`/api/creator/products/${productId}/checkout`, { method: 'POST' })
    const payload = await response.json()
    if (!response.ok) { setError(payload.error || 'Checkout could not be opened'); setLoading(false); return }
    window.location.assign(payload.url)
  }
  return <>{error && <div role="alert" style={{ color: 'var(--red)', fontSize: 10, lineHeight: 1.4 }}>{error}</div>}<button onClick={checkout} disabled={loading}>{loading ? <><Loader2 className="animate-spin" size={16} /> Opening checkout</> : <>Continue to checkout <ArrowRight size={16} /></>}</button></>
}
