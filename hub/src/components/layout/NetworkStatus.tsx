'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function NetworkStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (online) return null

  return (
    <div className="ss-network-status" role="status" aria-live="polite">
      <WifiOff size={15} aria-hidden="true" />
      <span>You are offline. Live data will resume when your connection returns.</span>
    </div>
  )
}
