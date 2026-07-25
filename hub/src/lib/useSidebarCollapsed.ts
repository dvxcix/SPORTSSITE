'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'sidebar-collapsed'

// Desktop/tablet-only icon-rail toggle for Sidebar.tsx, persisted per-browser
// so it stays collapsed across visits — same read-on-mount/write-on-change
// localStorage pattern as useDraggableFab.ts. Starts expanded on first paint
// (matches server-rendered markup) and flips after mount if the user had
// previously collapsed it, rather than trying to read localStorage during SSR.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true)
    } catch { /* ignore — stay expanded */ }
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return { collapsed, toggle }
}
