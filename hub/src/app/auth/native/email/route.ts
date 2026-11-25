import { NextResponse } from 'next/server'

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }

export function GET(request: Request) {
  const input = new URL(request.url).searchParams
  const state = input.get('state')
  const code = input.get('code')
  const error = input.get('error_code') ?? input.get('error')
  if (!state || input.getAll('state').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    return new NextResponse('Open the confirmation link from SlipSurge on the device that requested it.', { status: 400, headers })
  }

  const callback = new URL('slipsurge-ios-email://auth/complete')
  callback.searchParams.set('state', state)
  if (code && input.getAll('code').length === 1 && /^[A-Za-z0-9_-]{32,256}$/.test(code) && !error) {
    callback.searchParams.set('code', code)
  } else {
    callback.searchParams.set('error', 'invalid_link')
  }
  return new NextResponse(null, { status: 303, headers: { ...headers, Location: callback.toString() } })
}
