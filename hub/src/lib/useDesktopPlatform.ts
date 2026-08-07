'use client'

import { useEffect, useState } from 'react'

const DESKTOP_STORAGE_KEY = 'slipsurge.platform.desktop'

function detectDesktopClient() {
  if (typeof window === 'undefined') return false

  const params = new URLSearchParams(window.location.search)
  const launchedAsDesktop = params.get('platform') === 'desktop'
  const desktopUserAgent = navigator.userAgent.includes('SlipSurgeDesktop/')

  if (launchedAsDesktop || desktopUserAgent) {
    window.sessionStorage.setItem(DESKTOP_STORAGE_KEY, '1')
    return true
  }

  return window.sessionStorage.getItem(DESKTOP_STORAGE_KEY) === '1'
}

export function useDesktopPlatform() {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const detected = detectDesktopClient()
    setIsDesktop(detected)
    document.documentElement.dataset.platform = detected ? 'desktop' : 'web'

    return () => {
      delete document.documentElement.dataset.platform
    }
  }, [])

  return isDesktop
}
