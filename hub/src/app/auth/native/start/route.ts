import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isNativeAuthValue, nativeHandoffKey } from '@/lib/nativeAuthHandoff'
import { nativeOAuthFailure, nativeOAuthOrigin, nativeProvider, saveNativeOAuthRequest, clearNativeOAuthRequest } from '@/lib/nativeOAuth'

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const state = searchParams.get('state')
  const challenge = searchParams.get('challenge')
  const provider = searchParams.get('provider')
  if (origin !== nativeOAuthOrigin || !isNativeAuthValue(state) || !isNativeAuthValue(challenge) || !nativeProvider(provider)) {
    return NextResponse.json({ error: 'Invalid native sign-in request' }, { status: 400 })
  }
  if (!nativeHandoffKey()) return nativeOAuthFailure(state, 'unavailable')
  await saveNativeOAuthRequest({ state, challenge, provider })
  if (provider === 'whop') {
    const target = new URL('/auth/whop/login', nativeOAuthOrigin)
    target.searchParams.set('native_state', state)
    return NextResponse.redirect(target, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const callback = new URL('/auth/callback', nativeOAuthOrigin)
  callback.searchParams.set('native_state', state)
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider, options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    })
    if (!error && data.url) {
      return NextResponse.redirect(data.url, { headers: { 'Cache-Control': 'private, no-store' } })
    }
  } catch {
    // The app receives a generic error and can retry with a new state.
  }
  await clearNativeOAuthRequest()
  return nativeOAuthFailure(state)
}
