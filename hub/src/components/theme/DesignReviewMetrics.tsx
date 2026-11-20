'use client'

import { useEffect, useRef } from 'react'

/** Local fixture instrumentation, mounted only by the private review ribbon. */
export function DesignReviewMetrics() {
  const output = useRef<HTMLOutputElement>(null)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DESIGN_REVIEW !== '1') return
    const events: { type: string; label: string; ms: number }[] = []
    const frameGaps: number[] = [], tasks: number[] = []
    const pending = new Set<number>()
    const flush = () => {
      const scripts = performance.getEntriesByType('resource').filter(entry => entry instanceof PerformanceResourceTiming && entry.initiatorType === 'script') as PerformanceResourceTiming[]
      if (output.current) output.current.textContent = JSON.stringify({ events, frameGaps, longTasks: tasks, scripts: scripts.map(entry => ({ url: entry.name, bytes: entry.encodedBodySize, ms: entry.duration })) })
    }
    const frame = (callback: FrameRequestCallback) => {
      const id = requestAnimationFrame(time => { pending.delete(id); callback(time) })
      pending.add(id)
    }
    const interaction = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest('a,button,input,select') : null
      if (!target || target.closest('.ss-review-ribbon')) return
      const start = performance.now()
      const label = (target.getAttribute('aria-label') || target.textContent || target.tagName).trim().slice(0, 80)
      frame(() => frame(() => {
        events.push({ type: `${event.type}-to-frame`, label, ms: Math.round((performance.now() - start) * 10) / 10 })
        if (events.length > 60) events.shift()
        flush()
      }))
    }
    let until = 0, measuring = false
    const scroll = () => {
      until = performance.now() + 180
      if (measuring) return
      measuring = true
      let previous = performance.now()
      const sample: FrameRequestCallback = time => {
        frameGaps.push(Math.round((time - previous) * 10) / 10)
        if (frameGaps.length > 360) frameGaps.shift()
        previous = time
        if (time < until) frame(sample)
        else { measuring = false; flush() }
      }
      frame(sample)
    }
    const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (entry.entryType === 'longtask') tasks.push(Math.round(entry.duration * 10) / 10)
      flush()
    })
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')) observer?.observe({ type: 'longtask', buffered: true })
    for (const name of ['click','input','change','keydown']) document.addEventListener(name, interaction, true)
    document.addEventListener('scroll', scroll, { capture: true, passive: true })
    flush()
    return () => {
      observer?.disconnect()
      for (const name of ['click','input','change','keydown']) document.removeEventListener(name, interaction, true)
      document.removeEventListener('scroll', scroll, true)
      for (const id of pending) cancelAnimationFrame(id)
    }
  }, [])
  return <output ref={output} id="design-review-metrics" hidden aria-hidden="true"/>
}
