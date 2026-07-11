import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { generatePkce, randomToken, buildAuthorizeUrl } from '@/lib/whop'

const STATE_COOKIE = 'whop_oauth_state'

// Kicks off "Sign in with Whop" — generates PKCE + CSRF state, stashes them
// in a short-lived httpOnly cookie (read back by the callback route below),
// then redirects to Whop's authorize screen. Mirrors the existing `next`
// redirect-target convention already used by /auth/login's Google button.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const next = searchParams.get('next') || '/feed'

  const { codeVerifier, codeChallenge } = generatePkce()
  const state = randomToken()
  const nonce = randomToken()
  const redirectUri = `${origin}/auth/whop/callback`

  const authorizeUrl = buildAuthorizeUrl({ redirectUri, state, codeChallenge, nonce })

  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, JSON.stringify({ state, codeVerifier, nonce, next }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes — this is a short redirect round-trip, not a session
  })

  return NextResponse.redirect(authorizeUrl)
}
