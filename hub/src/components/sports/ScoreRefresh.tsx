'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/** RSC refresh preserves tabs and scroll, unlike a full browser reload. */
export function ScoreRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      if (document.visibilityState === 'visible' && !pending) startTransition(() => router.refresh())
    }
    const timer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [enabled, pending, router])
  return null
}
