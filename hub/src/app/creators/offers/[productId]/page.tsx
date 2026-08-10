'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'

export default function CreatorOfferCheckoutPage() {
  const { productId } = useParams<{ productId: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function checkout() {
    setLoading(true); setError('')
    const response = await fetch(`/api/creator/products/${productId}/checkout`, { method: 'POST' })
    const payload = await response.json()
    if (!response.ok) { setError(payload.error || 'Checkout could not be opened'); setLoading(false); return }
    window.location.assign(payload.url)
  }
  return <main className="creator-offer-confirm">
    <span className="creator-studio-eyebrow">Secure creator access</span>
    <h1>Continue to Whop checkout</h1>
    <p>Your purchase will be linked to this SlipSurge account. Access is granted automatically after Whop confirms payment.</p>
    {error && <div className="creator-studio-error">{error}</div>}
    <button className="creator-studio-primary" disabled={loading} onClick={checkout}>{loading ? 'Opening checkout...' : 'Continue securely'}</button>
  </main>
}
