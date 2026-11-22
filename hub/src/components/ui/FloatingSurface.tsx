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
  align?: 'start' | 'center' | 'end'
  side?: 'auto' | 'top'
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
  align = 'center',
  side = 'auto',
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
    const viewport = window.visualViewport
    const viewLeft = viewport?.offsetLeft ?? 0
    const viewTop = viewport?.offsetTop ?? 0
    const viewWidth = viewport?.width ?? window.innerWidth
    const viewHeight = viewport?.height ?? window.innerHeight
    const viewRight = viewLeft + viewWidth
    const viewBottom = viewTop + viewHeight
    const availableHeight = Math.max(1, viewHeight - GUTTER * 2)
    const update = (next: CSSProperties) => setPosition(previous =>
      Object.keys(previous).length === Object.keys(next).length && Object.entries(next).every(([key, value]) => previous[key as keyof CSSProperties] === value) ? previous : next)
    if (mobileSheet && window.matchMedia('(max-width: 620px)').matches) {
      const hiddenBottom = Math.max(0, window.innerHeight - viewBottom)
      update({
        '--ss-vp-bottom': `${hiddenBottom}px`,
        '--ss-vp-left': `${viewLeft}px`,
        '--ss-vp-right': `${Math.max(0, (document.documentElement.clientWidth || window.innerWidth) - viewRight)}px`,
        maxHeight: `calc(${availableHeight}px - max(0px, var(--mobile-dock-clearance, 76px) - ${hiddenBottom}px))`,
        overflowY: 'auto', opacity: 1, pointerEvents: 'auto',
      } as CSSProperties)
      return
    }

    const anchorRect = anchor.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const surfaceWidth = Math.max(1, Math.min(width, viewWidth - GUTTER * 2))
    const surfaceHeight = Math.min(surfaceRect.height, availableHeight)
    const roomBelow = viewBottom - anchorRect.bottom - GUTTER
    const roomAbove = anchorRect.top - viewTop - GUTTER
    const top = side !== 'top' && (roomBelow >= surfaceHeight || roomBelow >= roomAbove)
      ? Math.min(anchorRect.bottom + gap, viewBottom - surfaceHeight - GUTTER)
      : Math.max(viewTop + GUTTER, anchorRect.top - surfaceHeight - gap)
    const preferredLeft = align === 'start'
      ? anchorRect.left
      : align === 'end'
        ? anchorRect.right - surfaceWidth
        : anchorRect.left + anchorRect.width / 2 - surfaceWidth / 2

    update({
      left: Math.max(viewLeft + GUTTER, Math.min(preferredLeft, viewRight - surfaceWidth - GUTTER)),
      top: Math.max(viewTop + GUTTER, Math.min(top, viewBottom - surfaceHeight - GUTTER)),
      width: surfaceWidth,
      maxHeight: availableHeight,
      overflowY: 'auto',
      opacity: 1,
      pointerEvents: 'auto',
    })
  }, [align, anchorRef, gap, mobileSheet, side, width])

  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; place() })
    }
    place()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    if (surfaceRef.current) observer?.observe(surfaceRef.current)
    if (anchorRef.current) observer?.observe(anchorRef.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
    }
  }, [open, place, anchorRef])

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
