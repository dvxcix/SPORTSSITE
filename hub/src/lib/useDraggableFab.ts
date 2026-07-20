'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const DRAG_THRESHOLD = 6 // px of pointer movement before a press counts as a drag, not a tap

type Pos = { x: number; y: number }

function clamp(pos: Pos, width: number, height: number, margin = 8): Pos {
  const maxX = Math.max(margin, window.innerWidth - width - margin)
  const maxY = Math.max(margin, window.innerHeight - height - margin)
  return { x: Math.min(Math.max(pos.x, margin), maxX), y: Math.min(Math.max(pos.y, margin), maxY) }
}

// Makes a fixed-position FAB button draggable anywhere on screen, with its
// position persisted per-browser so it stays put across visits. Falls back to
// wherever the button's own CSS (e.g. `right`/`bottom`) placed it until the
// user actually drags it — that first read comes straight off the rendered
// element, so it already accounts for things like safe-area insets without
// this hook needing to know about them.
export function useDraggableFab(storageKey: string) {
  const elRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const dragState = useRef<{ startClientX: number; startClientY: number; startLeft: number; startTop: number; dragging: boolean } | null>(null)
  const wasDragged = useRef(false)

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let initial: Pos = { x: rect.left, y: rect.top }
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try { initial = JSON.parse(saved) } catch { /* ignore corrupt value, use rendered position */ }
    }
    setPos(clamp(initial, rect.width, rect.height))
  }, [storageKey])

  useEffect(() => {
    function onResize() {
      const el = elRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos(p => p ? clamp(p, rect.width, rect.height) : p)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const el = elRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragState.current = { startClientX: e.clientX, startClientY: e.clientY, startLeft: rect.left, startTop: rect.top, dragging: false }
    el.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current
    const el = elRef.current
    if (!drag || !el) return
    const dx = e.clientX - drag.startClientX
    const dy = e.clientY - drag.startClientY
    if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    drag.dragging = true
    wasDragged.current = true
    const rect = el.getBoundingClientRect()
    setPos(clamp({ x: drag.startLeft + dx, y: drag.startTop + dy }, rect.width, rect.height))
  }, [])

  const endDrag = useCallback(() => {
    const drag = dragState.current
    if (drag?.dragging) {
      setPos(p => {
        if (p) localStorage.setItem(storageKey, JSON.stringify(p))
        return p
      })
    }
    dragState.current = null
  }, [storageKey])

  // Capture-phase so a real drag can swallow the click before it ever reaches
  // the button's own onClick (which opens the panel) — a tap with no
  // meaningful movement still opens it normally.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (wasDragged.current) {
      wasDragged.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  return {
    ref: elRef,
    style: pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', touchAction: 'none' } as React.CSSProperties : { touchAction: 'none' } as React.CSSProperties,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture },
  }
}
