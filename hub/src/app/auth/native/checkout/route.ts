import { NextResponse } from 'next/server'

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }

export function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const state = query.get('state')
  if (!state || query.getAll('state').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    return new NextResponse('Return to SlipSurge to check your membership.', { status: 400, headers })
  }
  const callback = new URL('slipsurge-ios://checkout/complete')
  callback.searchParams.set('state', state)
  return new NextResponse(null, { status: 303, headers: { ...headers, Location: callback.toString() } })
}
