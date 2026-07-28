import { supabase } from './supabase'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!

// Every gated hub/ route reads auth via requireTier()/getEffectiveTier()
// (see hub/src/lib/requireTier.ts), which now accepts an Authorization:
// Bearer <access_token> header as an alternative to the cookie session web
// visitors carry — this is that header, attached to every call through
// this helper so screens never have to think about it individually.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init?.headers)
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}
