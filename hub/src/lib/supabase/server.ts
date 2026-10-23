import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { AuthTemporarilyUnavailableError, isRetryableAuthError } from './authErrors'

export async function createClient() {
  const cookieStore = await cookies()
  let authReads = 0
  let failedAuthRead = false
  let pendingCookies: { name: string; value: string; options: CookieOptions }[] = []
  function writeCookies(updates: typeof pendingCookies) {
    try {
      updates.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    } catch {
      // Server Components cannot write cookies; the proxy handles refreshes.
    }
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          // Failed reads can emit SIGNED_OUT inside the SDK. Do not let their
          // deletions erase a sibling request's successfully rotated session.
          if (authReads) pendingCookies.push(...cookiesToSet)
          else writeCookies(cookiesToSet)
        },
      },
    }
  )
  async function verifiedRead<T extends { error: unknown }>(read: () => Promise<T>): Promise<T> {
    authReads++
    try {
      const result = await read()
      if (result.error) failedAuthRead = true
      if (isRetryableAuthError(result.error)) throw new AuthTemporarilyUnavailableError()
      return result
    } catch (error) {
      failedAuthRead = true
      if (isRetryableAuthError(error)) throw new AuthTemporarilyUnavailableError()
      throw error
    } finally {
      authReads--
      if (!authReads) {
        if (!failedAuthRead) writeCookies(pendingCookies)
        pendingCookies = []
        failedAuthRead = false
      }
    }
  }
  const getUser = supabase.auth.getUser.bind(supabase.auth)
  const getClaims = supabase.auth.getClaims.bind(supabase.auth)
  supabase.auth.getUser = (...args: Parameters<typeof getUser>) => verifiedRead(() => getUser(...args))
  supabase.auth.getClaims = (...args: Parameters<typeof getClaims>) => verifiedRead(() => getClaims(...args))
  return supabase
}
