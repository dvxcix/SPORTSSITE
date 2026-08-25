'use client'

import React, { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const subscribeToClient = () => () => {}

export function ModalSurface({
  open,
  onClose,
  label,
  labelledBy,
  describedBy,
  backdropClassName,
  backdropStyle,
  panelClassName,
  panelStyle,
  children,
}: {
  open: boolean
  onClose: () => void
  label?: string
  labelledBy?: string
  describedBy?: string
  backdropClassName?: string
  backdropStyle?: React.CSSProperties
  panelClassName?: string
  panelStyle?: React.CSSProperties
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false)
  const portalHost = isClient ? document.body : null

  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const alreadyModal = document.body.classList.contains('ss-modal-open')
    document.body.style.overflow = 'hidden'
    document.body.classList.add('ss-modal-open')

    const focusFrame = window.requestAnimationFrame(() => {
      const preferred = panelRef.current?.querySelector<HTMLElement>('[data-modal-autofocus]')
      ;(preferred ?? panelRef.current)?.focus({ preventScroll: true })
    })
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeRef.current()
    }
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      if (!alreadyModal) document.body.classList.remove('ss-modal-open')
      activeElement?.focus({ preventScroll: true })
    }
  }, [open])

  if (!open || !portalHost) return null

  return createPortal(
    <div
      className={backdropClassName}
      style={{ position: 'fixed', inset: 0, display: 'flex', ...backdropStyle }}
      onMouseDown={event => { if (event.target === event.currentTarget) closeRef.current() }}
    >
      <div
        ref={panelRef}
        className={panelClassName}
        style={{ outline: 'none', ...panelStyle }}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={event => {
          if (event.key !== 'Tab') return
          const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
            .filter(element => element.offsetParent !== null)
          if (focusable.length === 0) {
            event.preventDefault()
            panelRef.current?.focus()
            return
          }
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        {children}
      </div>
    </div>,
    portalHost,
  )
}
