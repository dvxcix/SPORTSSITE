'use client'

export function isSlipSurgeDesktop() {
  if (typeof window === 'undefined') return false
  return /SlipSurgeDesktop/i.test(navigator.userAgent)
    || new URLSearchParams(window.location.search).get('platform') === 'desktop'
    || sessionStorage.getItem('slipsurge.platform.desktop') === '1'
}

export async function sendDesktopNotification(title: string, body: string) {
  if (!isSlipSurgeDesktop()) return false
  try {
    const notifications = await import('@tauri-apps/plugin-notification')
    let permission = await notifications.isPermissionGranted()
    if (!permission) permission = (await notifications.requestPermission()) === 'granted'
    if (!permission) return false
    notifications.sendNotification({ title, body })
    return true
  } catch {
    return false
  }
}
