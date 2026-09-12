'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, History, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'

const LOCAL_KEY = 'ss:last-context:v1'
const RESTORE_KEY = 'ss:restore-context:v1'
const SYNC_DELAY_MS = 30_000

type SavedContext = {
  path: string
  page_title: string | null
  scroll_y: number
  updated_at?: string
}

function isSafeProductPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || value.length > 900) return false
  const pathname = value.split(/[?#]/, 1)[0]
  return !/^\/(api|auth|admin)(\/|$)/.test(pathname)
}

function parseLocalContext(): SavedContext | null {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null') as SavedContext | null
    return value && isSafeProductPath(value.path) ? value : null
  } catch {
    return null
  }
}

function cleanTitle() {
  const title = document.title.replace(/\s*[|·-]\s*SlipSurge\s*$/i, '').trim()
  return (title || 'Your last view').slice(0, 160)
}

export function ContextHandoff() {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [remoteContext, setRemoteContext] = useState<SavedContext | null>(null)
  const [dismissedPath, setDismissedPath] = useState<string | null>(null)
  const latestRef = useRef<SavedContext | null>(null)
  const search = searchParams.toString()
  const currentPath = pathname + (search ? '?' + search : '')

  useEffect(() => {
    if (!isSafeProductPath(currentPath)) return
    const saved = parseLocalContext()
    const shouldRestore = sessionStorage.getItem(RESTORE_KEY) === currentPath
    if (saved?.path === currentPath && shouldRestore && saved.scroll_y > 0) {
      sessionStorage.removeItem(RESTORE_KEY)
      let attempts = 0
      const restore = () => {
        window.scrollTo({ top: saved.scroll_y, behavior: 'instant' })
        attempts += 1
        if (attempts < 4 && Math.abs(window.scrollY - saved.scroll_y) > 24) requestAnimationFrame(restore)
      }
      requestAnimationFrame(restore)
    }
  }, [currentPath])

  useEffect(() => {
    if (loading || !user || !isSafeProductPath(currentPath)) return
    let cancelled = false
    void supabase
      .from('member_context_handoff')
      .select('path,page_title,scroll_y,updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data || !isSafeProductPath(data.path) || data.path === currentPath) return
        setRemoteContext(data as SavedContext)
      })

    const saveLocal = () => {
      const context: SavedContext = {
        path: currentPath,
        page_title: cleanTitle(),
        scroll_y: Math.max(0, Math.round(window.scrollY)),
      }
      latestRef.current = context
      localStorage.setItem(LOCAL_KEY, JSON.stringify(context))
    }

    saveLocal()
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(saveLocal, 500)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', saveLocal)

    const syncTimer = setTimeout(() => {
      saveLocal()
      const context = latestRef.current
      if (!context || !navigator.onLine) return
      void supabase.from('member_context_handoff').upsert({
        user_id: user.id,
        path: context.path,
        page_title: context.page_title,
        scroll_y: context.scroll_y,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    }, SYNC_DELAY_MS)

    return () => {
      cancelled = true
      if (scrollTimer) clearTimeout(scrollTimer)
      clearTimeout(syncTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', saveLocal)
      saveLocal()
    }
  }, [currentPath, loading, supabase, user])

  function resume() {
    if (!remoteContext || !isSafeProductPath(remoteContext.path)) return
    localStorage.setItem(LOCAL_KEY, JSON.stringify(remoteContext))
    sessionStorage.setItem(RESTORE_KEY, remoteContext.path)
    setDismissedPath(remoteContext.path)
    router.push(remoteContext.path)
  }

  if (!remoteContext || dismissedPath === remoteContext.path) return null

  return (
    <aside className="ss-context-handoff" aria-label="Continue your last session">
      <span className="ss-context-handoff-icon"><History size={16} aria-hidden="true" /></span>
      <button type="button" className="ss-context-handoff-main" onClick={resume}>
        <small>Continue where you left off</small>
        <strong>{remoteContext.page_title || 'Your last view'}</strong>
      </button>
      <button type="button" className="ss-context-handoff-go" onClick={resume} aria-label="Continue your last session">
        <ArrowRight size={16} />
      </button>
      <button type="button" className="ss-context-handoff-close" onClick={() => setDismissedPath(remoteContext.path)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </aside>
  )
}
