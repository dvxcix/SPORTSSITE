'use client'

import { type CSSProperties, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type FloatingSurfaceProps = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  className?: string
  width?: number
  gap?: number
  mobileSheet?: boolean
  role?: 'dialog' | 'menu' | 'tooltip'
  ariaLabel?: string
  onPointerEnter?: () => void
  onPointerLeave?: () => void
}

const GUTTER = 10

/** Body-level anchored surface immune to timeline clipping and transforms. */
export function FloatingSurface({
  open,
  anchorRef,
  onClose,
  children,
  className = '',
  width = 300,
  gap = 9,
  mobileSheet = false,
  role = 'dialog',
  ariaLabel,
  onPointerEnter,
  onPointerLeave,
}: FloatingSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({ opacity: 0, pointerEvents: 'none' })

  const place = useCallback(() => {
    const anchor = anchorRef.current
    const surface = surfaceRef.current
    if (!anchor || !surface) return
    if (mobileSheet && window.matchMedia('(max-width: 620px)').matches) {
      setPosition({})
      return
    }

    const anchorRect = anchor.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const surfaceWidth = Math.min(width, window.innerWidth - GUTTER * 2)
    const roomBelow = window.innerHeight - anchorRect.bottom - GUTTER
    const roomAbove = anchorRect.top - GUTTER
    const top = roomBelow >= surfaceRect.height || roomBelow >= roomAbove
      ? Math.min(anchorRect.bottom + gap, window.innerHeight - surfaceRect.height - GUTTER)
      : Math.max(GUTTER, anchorRect.top - surfaceRect.height - gap)
    const preferredLeft = anchorRect.left + anchorRect.width / 2 - surfaceWidth / 2

    setPosition({
      left: Math.max(GUTTER, Math.min(preferredLeft, window.innerWidth - surfaceWidth - GUTTER)),
      top: Math.max(GUTTER, top),
      width: surfaceWidth,
      opacity: 1,
      pointerEvents: 'auto',
    })
  }, [anchorRef, gap, mobileSheet, width])

  useLayoutEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, { capture: true, passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      const target = event.target as Node
      if (!anchorRef.current?.contains(target) && !surfaceRef.current?.contains(target)) onClose()
    }
    function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', keyboard)
    }
  }, [anchorRef, onClose, open])

  if (typeof document === 'undefined' || !open) return null

  return createPortal(
    <div
      ref={surfaceRef}
      className={`ss-floating-surface${mobileSheet ? ' is-mobile-sheet' : ''} ${className}`.trim()}
      style={position}
      role={role}
      aria-label={ariaLabel}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body,
  )
}
