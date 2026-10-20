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
  if (!value.startsWith('/') || value.startsWith('//') || value.length > 900 || /[\u0000-\u001f\u007f]/.test(value)) return false
  const pathname = value.split(/[?#]/, 1)[0]
  return !/^\/(api|auth|admin)(\/|$)/.test(pathname)
}

function readContext(storage: 'sessionStorage' | 'localStorage', key: string): SavedContext | null {
  try {
    const value: unknown = JSON.parse(window[storage].getItem(key) || 'null')
    if (!value || typeof value !== 'object') return null
    const context = value as SavedContext
    return typeof context.path === 'string' && isSafeProductPath(context.path)
      && Number.isFinite(context.scroll_y) && context.scroll_y >= 0 && context.scroll_y <= 10_000_000
      && (context.page_title === null || typeof context.page_title === 'string') ? context : null
  } catch {
    return null
  }
}

function writeContext(storage: 'sessionStorage' | 'localStorage', key: string, context: SavedContext) {
  try { window[storage].setItem(key, JSON.stringify(context)) } catch { /* Cloud sync still works when browser storage is unavailable. */ }
}

function scrollContainer() {
  return document.querySelector<HTMLElement>('.ss-desktop-shell main')
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
  const [remoteResult, setRemoteResult] = useState<{ userId: string; sourcePath: string; context: SavedContext } | null>(null)
  const [dismissedPath, setDismissedPath] = useState<string | null>(null)
  const latestRef = useRef<SavedContext | null>(null)
  const restoringRef = useRef(false)
  const userId = user?.id
  const search = searchParams.toString()
  const currentPath = pathname + (search ? '?' + search : '')
  const remoteContext = remoteResult && remoteResult.userId === userId && remoteResult.sourcePath === currentPath ? remoteResult.context : null

  useEffect(() => {
    if (!userId || !isSafeProductPath(currentPath)) return
    const restoreKey = `${RESTORE_KEY}:${userId}`
    // Store the complete destination in session storage: outgoing route cleanup
    // must not overwrite the position chosen by the member before navigation.
    const saved = readContext('sessionStorage', restoreKey)
    if (saved?.path === currentPath) {
      restoringRef.current = true
      let frame = 0
      let retry = 0
      let timeout = 0
      let settled = 0
      const stop = (consume: boolean) => {
        cancelAnimationFrame(frame)
        window.clearInterval(retry)
        window.clearTimeout(timeout)
        restoringRef.current = false
        removeListeners()
        if (consume) {
          try { sessionStorage.removeItem(restoreKey) } catch { /* Optional browser storage. */ }
        }
      }
      const cancel = () => stop(true)
      const removeListeners = () => {
        window.removeEventListener('wheel', cancel)
        window.removeEventListener('touchstart', cancel)
        window.removeEventListener('keydown', cancel)
      }
      const restore = () => {
        // Next commits the destination URL before streamed route content arrives.
        // Keep the intent until the loading placeholder has actually gone away.
        if (document.querySelector('.ss-route-loading[aria-busy="true"]')) return
        const container = scrollContainer()
        if (container) container.scrollTo({ top: saved.scroll_y, behavior: 'instant' })
        else window.scrollTo({ top: saved.scroll_y, behavior: 'instant' })
        settled = Math.abs((container?.scrollTop ?? window.scrollY) - saved.scroll_y) <= 24 ? settled + 1 : 0
        if (settled >= 2) stop(true)
      }
      window.addEventListener('wheel', cancel, { passive: true })
      window.addEventListener('touchstart', cancel, { passive: true })
      window.addEventListener('keydown', cancel)
      retry = window.setInterval(restore, 100)
      timeout = window.setTimeout(cancel, 15_000)
      frame = requestAnimationFrame(restore)
      return () => stop(false)
    }
  }, [currentPath, userId])

  useEffect(() => {
    if (loading || !userId || !isSafeProductPath(currentPath)) return
    let cancelled = false
    let lastSynced = ''
    const localKey = `${LOCAL_KEY}:${userId}`
    const loadRemote = () => {
      void Promise.resolve(supabase
        .from('member_context_handoff')
        .select('path,page_title,scroll_y,updated_at')
        .eq('user_id', userId)
        .maybeSingle())
        .then(({ data }) => {
          if (cancelled) return
          if (!data || typeof data.path !== 'string' || !isSafeProductPath(data.path) || data.path === currentPath) {
            setRemoteResult(null)
            return
          }
          if (!Number.isFinite(data.scroll_y) || data.scroll_y < 0 || data.scroll_y > 10_000_000) return
          setRemoteResult({ userId, sourcePath: currentPath, context: data as SavedContext })
        })
        .catch(() => { if (!cancelled) console.warn('[context-handoff] load failed') })
    }
    loadRemote()

    const saveLocal = () => {
      const context: SavedContext = {
        path: currentPath,
        page_title: cleanTitle(),
        scroll_y: Math.min(10_000_000, Math.max(0, Math.round(scrollContainer()?.scrollTop ?? window.scrollY))),
      }
      latestRef.current = context
      writeContext('localStorage', localKey, context)
    }

    saveLocal()
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(saveLocal, 500)
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    const sync = async (leaving = false) => {
      if (restoringRef.current || (!leaving && document.visibilityState === 'hidden')) return
      saveLocal()
      const context = latestRef.current
      if (!context || !navigator.onLine) return
      const signature = JSON.stringify([context.path, context.page_title, context.scroll_y])
      if (signature === lastSynced) return
      try {
        const { error } = await supabase.from('member_context_handoff').upsert({
          user_id: userId,
          ...context,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (error) console.warn('[context-handoff] sync failed', error.code)
        else lastSynced = signature
      } catch { console.warn('[context-handoff] sync failed') }
    }
    const flush = () => { void sync() }
    const onLeave = () => { void sync(true) }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave()
      else loadRemote()
    }
    // Keep capturing later scroll changes, and retry transient/offline failures.
    const syncTimer = setInterval(flush, SYNC_DELAY_MS)
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('online', flush)
    window.addEventListener('focus', loadRemote)
    window.addEventListener('pageshow', loadRemote)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      if (scrollTimer) clearTimeout(scrollTimer)
      clearInterval(syncTimer)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('online', flush)
      window.removeEventListener('focus', loadRemote)
      window.removeEventListener('pageshow', loadRemote)
      document.removeEventListener('visibilitychange', onVisibility)
      // Do not recapture scroll/title here: Next may already show the next route.
    }
  }, [currentPath, loading, supabase, userId])

  function resume() {
    if (!userId || !remoteContext || !isSafeProductPath(remoteContext.path)) return
    writeContext('localStorage', `${LOCAL_KEY}:${userId}`, remoteContext)
    writeContext('sessionStorage', `${RESTORE_KEY}:${userId}`, remoteContext)
    setDismissedPath(remoteContext.path)
    router.push(remoteContext.path, { scroll: false })
  }

  if (!userId || !remoteContext || dismissedPath === remoteContext.path) return null

  return (
    <aside className="ss-context-handoff" aria-label="Continue your last session">
      <span className="ss-context-handoff-icon"><History size={16} aria-hidden="true" /></span>
      <button type="button" className="ss-context-handoff-main" onClick={resume}>
        <small>Continue where you left off</small>
        <strong>{/^\/the-paint(?:[/?#]|$)/.test(remoteContext.path) ? 'The Court • SlipSurge' : remoteContext.page_title || 'Your last view'}</strong>
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
