import 'server-only'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isNativeAuthValue, nativeHandoffKey, sealNativeHandoff } from './nativeAuthHandoff'

const cookieName = '__Host-slipsurge-native-oauth'
const duration = 600

export const nativeOAuthOrigin = 'https://www.slipsurge.com'

export function nativeProvider(value: unknown): value is 'discord' | 'x' | 'whop' {
  return value === 'discord' || value === 'x' || value === 'whop'
}

type NativeRequest = {
  state: string
  challenge: string
  provider: 'discord' | 'x' | 'whop'
  expiresAt: number
}

export async function saveNativeOAuthRequest(value: Omit<NativeRequest, 'expiresAt'>) {
  const jar = await cookies()
  jar.set(cookieName, JSON.stringify({ ...value, expiresAt: Date.now() + duration * 1000 }), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: duration,
  })
}

export async function readNativeOAuthRequest(state: string | null) {
  if (!isNativeAuthValue(state)) return null
  const jar = await cookies()
  try {
    const value = JSON.parse(jar.get(cookieName)?.value ?? 'null') as NativeRequest | null
    return value && value.state === state && isNativeAuthValue(value.challenge) && nativeProvider(value.provider) &&
      Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() ? value : null
  } catch {
    return null
  }
}

export async function clearNativeOAuthRequest() {
  const jar = await cookies()
  jar.set(cookieName, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

function nativeRedirect(state: string, name: 'handoff' | 'error', value: string) {
  const url = new URL('slipsurge-ios://auth/complete')
  if (isNativeAuthValue(state)) url.searchParams.set('state', state)
  url.searchParams.set(name, value)
  return NextResponse.redirect(url, {
    headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

export function nativeOAuthFailure(state: string, reason = 'sign-in-failed') {
  return nativeRedirect(state, 'error', reason)
}

export function nativeOAuthComplete(request: NativeRequest, tokenHash: string, userId: string) {
  const key = nativeHandoffKey()
  if (!key) return nativeOAuthFailure(request.state, 'unavailable')
  const handoff = sealNativeHandoff(key, {
    state: request.state, challenge: request.challenge, tokenHash, userId,
  })
  return nativeRedirect(request.state, 'handoff', handoff)
}
