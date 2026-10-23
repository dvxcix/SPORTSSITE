'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import type { User } from '@/lib/supabase/types'
import { isSlipSurgeDesktop } from '@/lib/desktopNotifications'
import { syncBrowserPushSubscription } from '@/lib/browserPush'

interface AuthContextType {
  user: SupabaseUser | null
  profile: User | null
  session: Session | null
  loading: boolean
  authUnavailable: boolean
  retrySession: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, session: null, loading: true, authUnavailable: false, retrySession: async () => {},
  signOut: async () => {}, refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authUnavailable, setAuthUnavailable] = useState(false)
  const mounted = useRef(false)
  const sessionRef = useRef<Session | null>(null)
  const authRevision = useRef(0)
  const profileEpoch = useRef(0)
  const sessionRequest = useRef<Promise<void> | null>(null)
  const pushSyncedForUser = useRef<string | null>(null)
  const profileLoadedForUser = useRef<string | null>(null)
  const profileRequest = useRef<{ userId: string; promise: Promise<void>; controller: AbortController } | null>(null)
  const [supabase] = useState(() => createClient())

  const repairPushRegistration = useCallback((userId: string) => {
    if (pushSyncedForUser.current === userId || isSlipSurgeDesktop()) return
    pushSyncedForUser.current = userId
    void syncBrowserPushSubscription().catch(error => {
      // A transient verification failure should not affect authentication.
      console.warn('[push] automatic device repair failed', error)
      pushSyncedForUser.current = null
    })
  }, [])

  const fetchProfile = useCallback(async (userId: string, force = false) => {
    if (sessionRef.current?.user.id !== userId) return
    if (!force && profileLoadedForUser.current === userId) return
    if (profileRequest.current?.userId === userId) return profileRequest.current.promise
    const epoch = profileEpoch.current, controller = new AbortController()
    const current = () => mounted.current && profileEpoch.current === epoch && sessionRef.current?.user.id === userId && !controller.signal.aborted
    const timeout = setTimeout(() => controller.abort(), 15000)
    const promise = (async () => {
      let response = await fetch('/api/account/me', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      if (!current()) return
      if (response.status === 401) {
        const { data } = await supabase.auth.refreshSession()
        if (current() && data.session?.user.id === userId) {
          response = await fetch('/api/account/me', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
        }
      }
      if (!current()) return
      if (!response.ok) {
        console.error('[auth] account profile request failed', { status: response.status })
        setAuthUnavailable(true)
        return
      }
      const { profile } = await response.json()
      if (current() && profile?.id === userId) {
        setProfile(profile)
        profileLoadedForUser.current = userId
        setAuthUnavailable(false)
      } else if (current()) {
        setAuthUnavailable(true)
      }
    })().catch(() => {
      if (mounted.current && profileEpoch.current === epoch && sessionRef.current?.user.id === userId) setAuthUnavailable(true)
    }).finally(() => {
      clearTimeout(timeout)
      if (profileRequest.current?.promise === promise) profileRequest.current = null
    })
    profileRequest.current = { userId, promise, controller }
    return promise
  }, [supabase])

  async function refreshProfile() {
    if (user) await fetchProfile(user.id, true)
  }

  const acceptSession = useCallback((next: Session | null) => {
    if (!mounted.current) return
    if (!next || sessionRef.current?.user.id !== next.user.id) {
      profileEpoch.current++
      profileRequest.current?.controller.abort()
      profileRequest.current = null
      profileLoadedForUser.current = null
      pushSyncedForUser.current = null
      setProfile(null)
    }
    sessionRef.current = next
    setSession(next); setUser(next?.user ?? null); setAuthUnavailable(false)
    if (!next) { setLoading(false); return }
    const epoch = profileEpoch.current
    setLoading(profileLoadedForUser.current !== next.user.id)
    void fetchProfile(next.user.id).finally(() => {
      if (mounted.current && epoch === profileEpoch.current) setLoading(false)
    })
    repairPushRegistration(next.user.id)
  }, [fetchProfile, repairPushRegistration])

  const retrySession = useCallback((): Promise<void> => {
    if (sessionRequest.current) return sessionRequest.current
    const revision = authRevision.current
    const pending = (async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!mounted.current || revision !== authRevision.current) return
        if (error) { setAuthUnavailable(true); setLoading(false); return }
        acceptSession(data.session)
      } catch {
        if (mounted.current && revision === authRevision.current) { setAuthUnavailable(true); setLoading(false) }
      }
    })().finally(() => { if (sessionRequest.current === pending) sessionRequest.current = null })
    sessionRequest.current = pending
    return pending
  }, [acceptSession, supabase.auth])

  const cancelPendingRequests = useCallback(() => {
    authRevision.current++
    profileEpoch.current++
    profileRequest.current?.controller.abort()
    profileRequest.current = null
    sessionRequest.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted.current) return
      // INITIAL_SESSION can be null when the SDK could not read/refresh it.
      // Only an error-free session read or SIGNED_OUT confirms an empty session.
      if (event === 'SIGNED_OUT' || next) {
        authRevision.current++
        acceptSession(event === 'SIGNED_OUT' ? null : next)
      }
    })
    void retrySession()
    const resume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) void retrySession()
    }
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      mounted.current = false
      cancelPendingRequests()
      subscription.unsubscribe()
      window.removeEventListener('online', resume); window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [acceptSession, cancelPendingRequests, retrySession, supabase.auth])

  useEffect(() => {
    if (!authUnavailable) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) void retrySession()
    }, 30000)
    return () => clearInterval(timer)
  }, [authUnavailable, retrySession])

  async function signOut() {
    const userId = sessionRef.current?.user.id
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
    if (sessionRef.current?.user.id === userId) { authRevision.current++; acceptSession(null) }
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, authUnavailable, retrySession, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
