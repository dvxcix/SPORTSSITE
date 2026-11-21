'use client'
/* eslint-disable @next/next/no-img-element -- Local SVGs retain their CSS/SMIL animation as image documents. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { decorationPath, type AvatarDecorationEntry } from '@/lib/avatarStyles'

const visibleListeners = new Map<Element, (visible: boolean) => void>()
let observer: IntersectionObserver | undefined
function watchVisibility(element: Element, listener: (visible: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) visibleListeners.get(entry.target)?.(entry.isIntersecting)
  }, { threshold: 0 })
  visibleListeners.set(element, listener)
  observer.observe(element)
  return () => {
    observer?.unobserve(element)
    visibleListeners.delete(element)
    if (!visibleListeners.size) { observer?.disconnect(); observer = undefined }
  }
}

const motionListeners = new Set<() => void>()
let motionMedia: MediaQueryList | undefined
const notifyMotion = () => { for (const listener of motionListeners) listener() }
function subscribeMotion(listener: () => void) {
  if (!motionListeners.size) {
    motionMedia = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    motionMedia?.addEventListener('change', notifyMotion)
    document.addEventListener('visibilitychange', notifyMotion)
  }
  motionListeners.add(listener)
  return () => {
    motionListeners.delete(listener)
    if (!motionListeners.size) {
      motionMedia?.removeEventListener('change', notifyMotion)
      document.removeEventListener('visibilitychange', notifyMotion)
    }
  }
}
const canAnimate = () => !document.hidden && !!window.matchMedia && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
const serverMotion = () => false

export function AvatarDecoration({ item, still = false }: { item: AvatarDecorationEntry; still?: boolean }) {
  return still ? <span className="ss-avatar-decoration" aria-hidden="true"><img src={decorationPath(item)} alt="" width={240} height={240} decoding="async" draggable={false} /></span> : <AnimatedDecoration item={item} />
}

function AnimatedDecoration({ item }: { item: AvatarDecorationEntry }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState('')
  const motion = useSyncExternalStore(subscribeMotion, canAnimate, serverMotion)
  useEffect(() => ref.current ? watchVisibility(ref.current, setVisible) : undefined, [])
  const animated = decorationPath(item, true)
  const staticPath = decorationPath(item)
  const src = motion && visible && failed !== animated ? animated : staticPath
  return <span ref={ref} className="ss-avatar-decoration" aria-hidden="true">
    {failed !== staticPath && <img src={src} alt="" width={240} height={240} decoding="async" draggable={false} onError={() => setFailed(src)} />}
  </span>
}
