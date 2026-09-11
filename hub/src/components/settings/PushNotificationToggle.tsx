'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import {
  DESKTOP_NOTIFICATIONS_KEY,
  ensureDesktopNotificationPermission,
  isSlipSurgeDesktop,
  sendDesktopNotification,
} from '@/lib/desktopNotifications'
import { enableBrowserPushNotifications, syncBrowserPushSubscription } from '@/lib/browserPush'

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
      try {
        const pushStatus = await syncBrowserPushSubscription()
        if (!cancelled) setStatus(pushStatus)
      } catch (e: unknown) {
        console.error('[push] status check failed', e)
        if (!cancelled) {
          setError(messageFrom(e, 'Could not verify push notifications on this device.'))
          setStatus('off')
        }
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
      setStatus(await enableBrowserPushNotifications())
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
    <div className="ss-settings-card mb-4 flex items-center gap-3 !p-4">
      {status === 'on' ? <BellRing size={18} className="shrink-0 text-lime-300" />
        : <Bell size={18} className="shrink-0 text-zinc-500" />}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-white">
          {isSlipSurgeDesktop() ? 'Desktop notifications' : 'Push notifications'}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">
          {status === 'denied'
            ? isSlipSurgeDesktop()
              ? 'Blocked by Windows. Enable SlipSurge in Settings > System > Notifications.'
              : 'Blocked in your browser. Enable notifications for this site in your browser settings.'
            : status === 'on'
            ? 'Enabled on this device/browser.'
            : 'Get notified on this device even when SlipSurge isn\'t open.'}
        </p>
        {error && <p role="alert" className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      {status !== 'denied' && (
        <button
          onClick={status === 'on' ? disable : enable}
          disabled={status === 'working'}
          className={status === 'on' ? 'ss-settings-secondary' : 'ss-settings-primary'}>
          {status === 'on' ? <><BellOff size={12} /> Disable</> : 'Enable'}
        </button>
      )}
    </div>
  )
}
