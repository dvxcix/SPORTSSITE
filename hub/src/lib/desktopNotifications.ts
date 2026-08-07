'use client'

import type { Options } from '@tauri-apps/plugin-notification'

export const DESKTOP_NOTIFICATIONS_KEY = 'slipsurge.desktop.notifications'

export type DesktopNotificationResult =
  | { ok: true }
  | { ok: false; reason: 'not-desktop' | 'denied' | 'native-error'; message: string }

export function isSlipSurgeDesktop() {
  if (typeof window === 'undefined') return false
  return /SlipSurgeDesktop/i.test(navigator.userAgent)
    || new URLSearchParams(window.location.search).get('platform') === 'desktop'
    || sessionStorage.getItem('slipsurge.platform.desktop') === '1'
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try { return JSON.stringify(error) } catch { return 'Unknown native notification error' }
}

export async function ensureDesktopNotificationPermission(): Promise<DesktopNotificationResult> {
  if (!isSlipSurgeDesktop()) return { ok: false, reason: 'not-desktop', message: 'Native alerts are only available in the SlipSurge desktop app.' }
  try {
    const notifications = await import('@tauri-apps/plugin-notification')
    let granted = await notifications.isPermissionGranted()
    if (!granted) granted = (await notifications.requestPermission()) === 'granted'
    if (!granted) return {
      ok: false, reason: 'denied',
      message: 'Windows has notifications disabled for SlipSurge. Enable SlipSurge in Settings > System > Notifications, then try again.',
    }
    window.localStorage.setItem(DESKTOP_NOTIFICATIONS_KEY, '1')
    return { ok: true }
  } catch (error) {
    const detail = errorMessage(error)
    console.error('[desktop] notification permission failed', error)
    return { ok: false, reason: 'native-error', message: `SlipSurge could not register with Windows notifications (${detail}). Install the latest signed desktop build and try again.` }
  }
}

export async function sendDesktopNotification(title: string, body: string, options: Omit<Options, 'title' | 'body'> = {}): Promise<DesktopNotificationResult> {
  const permission = await ensureDesktopNotificationPermission()
  if (!permission.ok) return permission
  try {
    const { sendNotification } = await import('@tauri-apps/plugin-notification')
    sendNotification({ title, body, autoCancel: true, ...options })
    return { ok: true }
  } catch (error) {
    const detail = errorMessage(error)
    console.error('[desktop] native notification delivery failed', error)
    return { ok: false, reason: 'native-error', message: `Windows could not display the alert (${detail}).` }
  }
}
