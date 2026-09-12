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
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, session: null, loading: true,
  signOut: async () => {}, refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const pushSyncedForUser = useRef<string | null>(null)
  const profileLoadedForUser = useRef<string | null>(null)
  const profileRequest = useRef<{ userId: string; promise: Promise<void> } | null>(null)
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
    if (!force && profileLoadedForUser.current === userId) return
    if (!force && profileRequest.current?.userId === userId) return profileRequest.current.promise
    const promise = (async () => {
      let response = await fetch('/api/account/me', { cache: 'no-store', credentials: 'same-origin' })
      if (response.status === 401) {
        const { data } = await supabase.auth.refreshSession()
        if (data.session?.user.id === userId) {
          setSession(data.session)
          setUser(data.session.user)
          response = await fetch('/api/account/me', { cache: 'no-store', credentials: 'same-origin' })
        }
      }
      if (!response.ok) {
        console.error('[auth] account profile request failed', { status: response.status })
        return
      }
      const { profile } = await response.json()
      if (profile?.id === userId) {
        setProfile(profile)
        profileLoadedForUser.current = userId
      }
    })().finally(() => {
      if (profileRequest.current?.promise === promise) profileRequest.current = null
    })
    profileRequest.current = { userId, promise }
    return promise
  }, [supabase])

  async function refreshProfile() {
    if (user) await fetchProfile(user.id, true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id)
        repairPushRegistration(session.user.id)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setLoading(true)
        void fetchProfile(session.user.id).finally(() => setLoading(false))
        repairPushRegistration(session.user.id)
      } else {
        setProfile(null)
        profileLoadedForUser.current = null
        profileRequest.current = null
        pushSyncedForUser.current = null
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile, repairPushRegistration, supabase.auth])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
    profileLoadedForUser.current = null
    profileRequest.current = null
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
