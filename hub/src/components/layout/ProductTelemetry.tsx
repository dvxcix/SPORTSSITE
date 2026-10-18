'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { recordProductInteraction, type ProductEventName, type ProductOutcome } from '@/lib/productTelemetry'

export function ProductTelemetry() {
  const pathname = usePathname()

  useEffect(() => {
    const startedAt = performance.now()
    recordProductInteraction('route_view', { route: pathname })
    // Background frame throttling is not foreground route latency. Discard
    // this sample if the route starts hidden or becomes hidden before paint.
    let interrupted = document.visibilityState !== 'visible'
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') interrupted = true
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (interrupted || document.visibilityState !== 'visible') return
        const durationMs = performance.now() - startedAt
        recordProductInteraction(durationMs > 2_500 ? 'slow_interaction' : 'route_ready', { route: pathname, durationMs })
      })
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [pathname])

  useEffect(() => {
    const capture = (event: Event) => {
      const detail = (event as CustomEvent<{ eventName?: ProductEventName; outcome?: ProductOutcome; durationMs?: number }>).detail
      if (!detail?.eventName) return
      recordProductInteraction(detail.eventName, { outcome: detail.outcome, durationMs: detail.durationMs })
    }
    window.addEventListener('slipsurge:product-event', capture)
    return () => window.removeEventListener('slipsurge:product-event', capture)
  }, [])

  return null
}
