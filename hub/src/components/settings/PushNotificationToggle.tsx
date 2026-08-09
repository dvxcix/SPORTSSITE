'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import {
  DESKTOP_NOTIFICATIONS_KEY,
  ensureDesktopNotificationPermission,
  isSlipSurgeDesktop,
  sendDesktopNotification,
} from '@/lib/desktopNotifications'

// VAPID public keys are delivered base64url-encoded; PushManager.subscribe
// needs a raw Uint8Array applicationServerKey — same conversion every
// Web Push integration needs, no library required for it.
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'on' | 'working'

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (isSlipSurgeDesktop()) {
        if (!cancelled) setStatus(localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === '1' ? 'on' : 'off')
        return
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported'); return
      }
      if (Notification.permission === 'denied') {
        setStatus('denied'); return
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) setStatus(sub ? 'on' : 'off')
      } catch {
        if (!cancelled) setStatus('unsupported')
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  async function enable() {
    setError('')
    setStatus('working')
    try {
      if (isSlipSurgeDesktop()) {
        const result = await ensureDesktopNotificationPermission()
        if (!result.ok) {
          setError(result.message)
          setStatus(result.reason === 'denied' ? 'denied' : 'off')
          return
        }
        setStatus('on')
        await sendDesktopNotification('SlipSurge notifications enabled', 'You will receive native alerts on this device.')
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'denied' : 'off'); return }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) throw new Error('Push isn\'t configured on this server yet.')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not save subscription.')
      setStatus('on')
    } catch (e: unknown) {
      console.error('[push] enable failed', e)
      setError(messageFrom(e, 'Could not enable push notifications. Please try again.'))
      setStatus('off')
    }
  }

  async function disable() {
    setError('')
    setStatus('working')
    try {
      if (isSlipSurgeDesktop()) {
        localStorage.removeItem(DESKTOP_NOTIFICATIONS_KEY)
        setStatus('off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setStatus('off')
    } catch (e: unknown) {
      console.error('[push] disable failed', e)
      setError(messageFrom(e, 'Could not disable push notifications.'))
      setStatus('on')
    }
  }

  if (status === 'checking') return null
  if (status === 'unsupported') return null // e.g. Safari on iOS without the app added to the home screen

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
    }}>
      {status === 'on' ? <BellRing size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        : <Bell size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
          {isSlipSurgeDesktop() ? 'Desktop notifications' : 'Push notifications'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          {status === 'denied'
            ? isSlipSurgeDesktop()
              ? 'Blocked by Windows. Enable SlipSurge in Settings > System > Notifications.'
              : 'Blocked in your browser. Enable notifications for this site in your browser settings.'
            : status === 'on'
            ? 'Enabled on this device/browser.'
            : 'Get notified on this device even when SlipSurge isn\'t open.'}
        </p>
        {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{error}</p>}
      </div>
      {status !== 'denied' && (
        <button
          onClick={status === 'on' ? disable : enable}
          disabled={status === 'working'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700,
            border: status === 'on' ? '1px solid var(--border)' : 'none',
            background: status === 'on' ? 'transparent' : 'var(--accent)',
            color: status === 'on' ? 'var(--text-2)' : 'var(--accent-fg)',
            cursor: status === 'working' ? 'default' : 'pointer', opacity: status === 'working' ? 0.6 : 1,
          }}>
          {status === 'on' ? <><BellOff size={12} /> Disable</> : 'Enable'}
        </button>
      )}
    </div>
  )
}
