'use client'

import { useEffect } from 'react'
import { mobileViewportState } from '@/lib/mobileViewport'

/** Keep writing surfaces inside the visible area when a phone keyboard opens. */
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    let frame = 0
    const update = () => {
      frame = 0
      const active = document.activeElement
      const editable = active instanceof HTMLElement && active.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]),[contenteditable=true]')
      const state = mobileViewportState({ layoutHeight: window.innerHeight, height: viewport.height, top: viewport.offsetTop, scale: viewport.scale, editable, compact: window.matchMedia('(max-width: 1024px)').matches })
      document.body.classList.toggle('ss-keyboard-open', state.keyboard)
      root.style.setProperty('--ss-visible-height', `${state.height}px`)
      root.style.setProperty('--ss-visible-top', `${state.top}px`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
      window.removeEventListener('resize', schedule)
      document.body.classList.remove('ss-keyboard-open')
      root.style.removeProperty('--ss-visible-height')
      root.style.removeProperty('--ss-visible-top')
    }
  }, [])
}
