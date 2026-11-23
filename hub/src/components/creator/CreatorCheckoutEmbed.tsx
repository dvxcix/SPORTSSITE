'use client'

import { useState } from 'react'
import { WhopElements, Checkout, CheckoutElement } from '@whop/elements-react'
import { loadWhop } from '@whop/elements'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/ThemeProvider'
import styles from './creatorCheckout.module.css'

let elements: ReturnType<typeof loadWhop> | undefined
export function CreatorCheckoutEmbed({ configurationId, productId, purchaseUrl }: { configurationId: string; productId: string; purchaseUrl: string }) {
  const { theme } = useTheme()
  const router = useRouter()
  const [error, setError] = useState(false)
  // This module is loaded only after the member opens checkout.
  elements ??= loadWhop()
  return <div className={styles.embed}>{!error&&<WhopElements elements={elements} appearance={{ theme: { appearance: theme, accentColor: 'lime' } }} onLoadError={() => setError(true)}><Checkout checkoutConfiguration={configurationId} returnUrl={window.location.origin + '/creators/access/complete?product=' + productId} onComplete={result => {
    // Browser completion only navigates. Signed webhooks and the access API
    // remain the sole authority for membership fulfillment.
    if (result.result === 'payment') router.push('/creators/access/complete?product=' + productId)
  }}><CheckoutElement onError={() => setError(true)} fallback={<div role="status" className={styles.loading}>Loading secure checkout…</div>}/></Checkout></WhopElements>}{error&&<p role="alert" className={styles.error}>The embedded checkout could not load. You can continue securely on Whop.</p>}<a className={styles.hostedLink} href={purchaseUrl}>Continue on Whop ↗</a></div>
}
