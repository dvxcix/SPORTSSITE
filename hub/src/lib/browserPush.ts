'use client'

export type BrowserPushStatus = 'unsupported' | 'denied' | 'off' | 'on'

function supportsBrowserPush() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(character => character.charCodeAt(0)))
}

function vapidApplicationServerKey() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) throw new Error('Push is not configured on this server yet.')
  return urlBase64ToUint8Array(publicKey)
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Could not save this push device.')
  }
}

async function isRegisteredForCurrentUser(subscription: PushSubscription) {
  const response = await fetch('/api/push/subscribe', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Could not verify this push device.')
  }
  const body = await response.json()
  return body.registered === true
}

async function freshSubscription(registration: ServiceWorkerRegistration) {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidApplicationServerKey(),
  })
}

/**
 * Verify that the browser's local subscription also exists in SlipSurge.
 * Browsers can retain a local subscription after a stale provider endpoint has
 * been removed server-side. When permission is already granted, rotate that
 * endpoint silently so alerts recover without asking the member again.
 */
export async function syncBrowserPushSubscription(): Promise<BrowserPushStatus> {
  if (!supportsBrowserPush()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'

  const registration = await navigator.serviceWorker.register('/sw.js')
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return 'off'
  if (await isRegisteredForCurrentUser(subscription)) return 'on'

  // The server no longer has this endpoint. Prefer rotating it because the
  // usual cause is a 404/410 response from the browser's push provider.
  const unsubscribed = await subscription.unsubscribe()
  const repaired = unsubscribed
    ? await freshSubscription(registration)
    : subscription
  await saveSubscription(repaired)
  return 'on'
}

export async function enableBrowserPushNotifications(): Promise<BrowserPushStatus> {
  if (!supportsBrowserPush()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'

  const registration = await navigator.serviceWorker.register('/sw.js')
  let subscription = await registration.pushManager.getSubscription()

  if (subscription && await isRegisteredForCurrentUser(subscription)) return 'on'
  if (subscription) {
    const unsubscribed = await subscription.unsubscribe()
    if (unsubscribed) subscription = null
  }
  subscription ??= await freshSubscription(registration)
  await saveSubscription(subscription)
  return 'on'
}
