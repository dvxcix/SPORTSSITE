'use client'

import { useEffect } from 'react'

type CreatorFunnelEvent = 'storefront_view' | 'offer_view' | 'checkout_started'

function sessionId() {
  const key = 'ss:creator-funnel-session'
  const stored = window.sessionStorage.getItem(key)
  if (stored) return stored
  const created = crypto.randomUUID()
  window.sessionStorage.setItem(key, created)
  return created
}

function sourceFromReferrer() {
  if (!document.referrer) return 'direct'
  try {
    const referrer = new URL(document.referrer)
    if (referrer.origin !== window.location.origin) return 'external'
    if (referrer.pathname.startsWith('/feed')) return 'feed'
    if (referrer.pathname.startsWith('/profile')) return 'profile'
    if (referrer.pathname.startsWith('/community') || referrer.pathname.startsWith('/groups')) return 'community'
    if (referrer.pathname.startsWith('/search') || referrer.pathname.startsWith('/explore')) return 'search'
  } catch {}
  return 'direct'
}

export function recordCreatorFunnelEvent(creatorId: string, eventType: CreatorFunnelEvent, productId?: string) {
  return fetch('/api/creator/funnel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creatorId, productId: productId || null, eventType, sessionId: sessionId(), source: sourceFromReferrer() }),
    keepalive: true,
  }).catch(() => null)
}

export function CreatorFunnelSignal({ creatorId, productId, eventType }: {
  creatorId: string
  productId?: string
  eventType: Exclude<CreatorFunnelEvent, 'checkout_started'>
}) {
  useEffect(() => {
    void recordCreatorFunnelEvent(creatorId, eventType, productId)
  }, [creatorId, eventType, productId])
  return null
}
