import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { generatePkce, randomToken, buildAuthorizeUrl } from '@/lib/whop'

const STATE_COOKIE = 'whop_oauth_state'

// Kicks off "Sign in with Whop" — generates PKCE + CSRF state, stashes them
// in a short-lived httpOnly cookie (read back by the callback route below),
// then redirects to Whop's authorize screen. Mirrors the existing `next`
// redirect-target convention already used by /auth/login's Google button.
//
// ?mode=link is the other entry point: an ALREADY signed-in account (e.g.
// one that originally signed up via X/Discord) connecting Whop after the
// fact, so it can claim the free Discord-plan Advanced tier the same way a
// Whop-first login already does. This doesn't go through Supabase's native
// identity linking (linkIdentity/unlinkIdentity, see ProfileForm) because
// Supabase has no built-in Whop provider — this whole OAuth flow is
// hand-rolled for exactly that reason (see whop.ts's top comment). The
// signed-in user's id is captured HERE, server-side, from the real session —
// not trusted from anything client-supplied — so the callback route can
// later verify the same session is still the one completing the link.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const next = searchParams.get('next') || '/feed'
  const mode = searchParams.get('mode') === 'link' ? 'link' as const : undefined

  let linkUserId: string | undefined
  if (mode === 'link') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(`${origin}/auth/login?next=${encodeURIComponent('/settings/membership')}`)
    linkUserId = user.id
  }

  const { codeVerifier, codeChallenge } = generatePkce()
  const state = randomToken()
  const nonce = randomToken()
  const redirectUri = `${origin}/auth/whop/callback`

  const authorizeUrl = buildAuthorizeUrl({ redirectUri, state, codeChallenge, nonce })

  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, JSON.stringify({ state, codeVerifier, nonce, next, mode, linkUserId }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes — this is a short redirect round-trip, not a session
  })

  return NextResponse.redirect(authorizeUrl)
}
