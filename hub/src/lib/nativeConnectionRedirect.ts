import { isNativeAuthValue } from './nativeAuthHandoff'

export function nativeConnectionRedirect(state: string, kind: 'code' | 'proof' | 'error', value: string) {
  const callback = new URL('slipsurge-ios://auth/connection')
  if (isNativeAuthValue(state)) callback.searchParams.set('state', state)
  callback.searchParams.set(kind, value)
  return new Response(null, {
    status: 303,
    headers: { Location: callback.href, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
