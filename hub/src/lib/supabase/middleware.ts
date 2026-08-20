import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_REFRESH_RETRY_COOKIE = 'ss-auth-refresh-retry'

function markRefreshRetry(response: NextResponse) {
  response.cookies.set(AUTH_REFRESH_RETRY_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 20,
  })
}

function clearRefreshRetry(response: NextResponse) {
  response.cookies.set(AUTH_REFRESH_RETRY_COOKIE, '', { path: '/', maxAge: 0 })
}

function clearStaleSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
      response.cookies.set(cookie.name, '', { path: '/', maxAge: 0 })
    }
  }
}

export async function updateSession(request: NextRequest) {
  // Public liveness/readiness endpoint for external uptime monitoring. Its
  // response contains no user or infrastructure details.
  if (request.nextUrl.pathname === '/api/health') {
    return NextResponse.next({ request })
  }

  // Cron routes carry no browser session (Vercel invokes them directly with
  // a CRON_SECRET bearer header, which each route checks itself) — without
  // this, every cron hit got redirected to /auth/login before its handler
  // ever ran, since the proxy matcher covers /api too. That silently broke
  // both settle-picks and grade-live-picks; neither one has ever actually
  // executed in production until this exemption.
  if (request.nextUrl.pathname.startsWith('/api/cron/')) {
    return NextResponse.next({ request })
  }

  // Canonical contact events can wake the Discord media outbox immediately
  // through this server-to-server endpoint. It has no browser cookie, and
  // the route independently requires the same CRON_SECRET bearer token used
  // by the recovery cron, so let it reach its own authentication check.
  if (request.nextUrl.pathname === '/api/internal/contact-alert') {
    return NextResponse.next({ request })
  }

  // The Browserbase scrape-* cron routes POST here server-to-server via a
  // CRON_SECRET bearer header, no session cookie — same bug class as cron
  // above: the proxy redirected these to /auth/login (HTML) before each
  // route's own requireAdmin() (which independently checks for that bearer
  // header) ever got a chance to run. Confirmed live via Vercel logs: every
  // automated import has been silently 307ing instead of ever actually
  // writing anything, despite the scrapers themselves working fine. Each
  // route still requires either that bearer token or a real signed-in
  // admin session internally — this only skips the proxy's own cookie-only
  // check for these three exact paths, not auth itself.
  if (
    ['/api/admin/fanduel-import', '/api/admin/mgm-import', '/api/admin/pikkit-import', '/api/admin/browserbase-sessions', '/api/admin/pikkit-context-check', '/api/admin/whop-addon-reconcile', '/api/admin/whop-reconcile'].includes(request.nextUrl.pathname) &&
    /^Bearer\s+/i.test(request.headers.get('authorization') ?? '')
  ) {
    return NextResponse.next({ request })
  }

  // Share-image PNGs are meant to be fetched by whoever a pick got shared
  // to — the recipient's browser, an external site's link-preview crawler —
  // none of whom carry a SlipSurge session cookie. Same problem as cron:
  // the proxy matcher covers /api too, so this got redirected to
  // /auth/login (HTML) before the route handler ever ran.
  if (request.nextUrl.pathname.startsWith('/api/share-image/')) {
    return NextResponse.next({ request })
  }

  // Apple/Whop's domain-verification crawler fetches this well-known file
  // with no session cookie at all — same bug class as every other
  // exemption here: without it, the check got a 307 redirect to
  // /auth/login (HTML) instead of the actual file, and Apple Pay domain
  // verification for the embedded Whop checkout would silently never
  // succeed. startsWith (not an exact match) in case Whop/other future
  // verifications land other files under the same /.well-known/ path.
  if (request.nextUrl.pathname.startsWith('/.well-known/')) {
    return NextResponse.next({ request })
  }

  // Once registered, a service worker's script gets auto-refetched by the
  // browser on navigations within its scope (the whole origin here) to
  // check for updates — including from a logged-out tab. A redirect
  // response in place of the actual JS would just silently fail that
  // update check, but there's no reason to route it through auth at all.
  if (request.nextUrl.pathname === '/sw.js') {
    return NextResponse.next({ request })
  }

  // The native desktop updater checks and downloads through these endpoints
  // before a user can have
  // (or needs) a browser-cookie session. Redirecting it to /auth/login turns
  // the expected Tauri update JSON into HTML, so the installed app silently
  // treats every published release as an invalid update response. The route
  // only exposes the signed public release manifest; installation remains
  // protected by Tauri's embedded updater public key.
  if (
    request.nextUrl.pathname.startsWith('/api/desktop/update/') ||
    request.nextUrl.pathname.startsWith('/api/desktop/download/')
  ) {
    return NextResponse.next({ request })
  }

  // /api/push/send and /api/email/send-notification are called by Postgres
  // triggers (notifications_push_trigger / notifications_email_trigger) via
  // pg_net — server-to-server, no browser session cookie at all. Same bug
  // class as cron/share-image: without this, the trigger's webhook call got
  // redirected to /auth/login before the route ever ran, meaning push/email
  // delivery would silently never fire. Each route still authenticates
  // itself via a bearer secret. (/api/push/subscribe and /unsubscribe are
  // deliberately NOT covered here — those genuinely need a real signed-in
  // user and check for one internally.)
  if (request.nextUrl.pathname === '/api/push/send' || request.nextUrl.pathname === '/api/email/send-notification') {
    return NextResponse.next({ request })
  }

  // Provider webhooks are server-to-server POSTs with no browser session.
  // Each route verifies its own Standard Webhooks signature before accepting
  // the payload, so the cookie-session proxy must let the request reach it.
  if (
    request.nextUrl.pathname === '/api/webhooks/whop' ||
    request.nextUrl.pathname === '/api/webhooks/whop-addon' ||
    request.nextUrl.pathname === '/api/webhooks/resend'
  ) {
    return NextResponse.next({ request })
  }

  // Discord's Interactions endpoint — same bug class as the Whop webhooks
  // above: a server-to-server POST with no browser session, authenticated
  // via its own Ed25519 signature headers (see verifyDiscordSignature in
  // discord.ts), not a session cookie.
  if (request.nextUrl.pathname === '/api/discord/interactions') {
    return NextResponse.next({ request })
  }

  // The mobile app carries no browser cookies at all — just an
  // Authorization: Bearer <access_token> header from its own
  // @supabase/supabase-js client. Without this, every /api/* request from
  // mobile hit the cookie-session redirect below and got an HTML 307 to
  // /auth/login instead of ever reaching the route handler, where
  // requireTier()/getEffectiveTier() (see requireTier.ts) already know how
  // to validate that same bearer token themselves. This only skips the
  // proxy's own cookie-only gate for API routes carrying a bearer header —
  // it isn't a bypass of auth itself, since every gated route still calls
  // its own requireTier/requireAdmin check and returns a real 401/403 for
  // an invalid or missing token.
  if (request.nextUrl.pathname.startsWith('/api/') && /^Bearer\s+/i.test(request.headers.get('authorization') ?? '')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value)
          )
        },
      },
    }
  )

  // getClaims validates the access-token signature locally against the
  // project's published signing keys and only reaches Auth when a refresh is
  // actually needed. getUser made every page and parallel API request hit the
  // Auth service, multiplying refresh-token rotation races during a normal
  // page load. This is Supabase's current SSR proxy contract.
  const { data: authData, error: authError } = await supabase.auth.getClaims()
  const userId = typeof authData?.claims?.sub === 'string' ? authData.claims.sub : null
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')

  // Real incident (confirmed via Vercel logs: ~44 users/week hitting this):
  // @supabase/ssr rotates the refresh token on every use, so when a page
  // load fires several concurrent requests through this middleware (common
  // — a page and its parallel API calls all carry the same stale access
  // token), each one tries to refresh with the SAME cookie-borne refresh
  // token. The first to land wins and gets a new one; every other
  // concurrent request's refresh attempt fails with "already used" or "not
  // found" against a token that's already been rotated out from under it —
  // even though the user's session is perfectly valid. Before this check,
  // that failure left `user` null, which the block below (correctly, for a
  // truly logged-out visitor) treated as a hard redirect to /auth/login —
  // bouncing a real active session for what's actually a same-session race
  // with a sibling request, not an expired login. Passing this one request
  // A request with a failed refresh must never be allowed through a protected
  // route as if authentication succeeded. A sibling request that won the
  // rotation will repair the next request; a genuinely dead session stays
  // signed out. Do not clear cookies here because a losing concurrent
  // response could overwrite the valid cookies issued by the winner.
  if (authError && (authError.code === 'refresh_token_already_used' || authError.code === 'refresh_token_not_found')) {
    // Login/callback routes must remain reachable even when a dead auth
    // cookie is present. Clear only Supabase's auth-cookie family here so a
    // stale token cannot bounce the browser between login and middleware.
    if (isAuthRoute) {
      const response = NextResponse.next({ request })
      clearStaleSupabaseAuthCookies(request, response)
      clearRefreshRetry(response)
      return response
    }

    const alreadyRetried = request.cookies.get(AUTH_REFRESH_RETRY_COOKIE)?.value === '1'
    if (request.nextUrl.pathname.startsWith('/api/')) {
      const response = NextResponse.json({ error: 'Authentication required', code: 'SESSION_EXPIRED' }, { status: 401 })
      if (alreadyRetried && authError.code === 'refresh_token_not_found') {
        clearStaleSupabaseAuthCookies(request, response)
        clearRefreshRetry(response)
      } else {
        markRefreshRetry(response)
      }
      return response
    }
    if (!alreadyRetried) {
      const retryUrl = request.nextUrl.clone()
      const response = NextResponse.redirect(retryUrl)
      markRefreshRetry(response)
      return response
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    const response = NextResponse.redirect(loginUrl)
    if (authError.code === 'refresh_token_not_found') clearStaleSupabaseAuthCookies(request, response)
    return response
  }

  if (userId && request.cookies.has(AUTH_REFRESH_RETRY_COOKIE)) clearRefreshRetry(supabaseResponse)

  if (userId && request.nextUrl.pathname.startsWith('/api/admin/')) {
    const [{ data: profile }, { data: assurance }] = await Promise.all([
      supabase.from('users').select('account_type').eq('id', userId).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (profile?.account_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'Two-factor verification required', code: 'MFA_REQUIRED' }, { status: 403 })
    }
  }

  // Public discovery also includes published editorial content plus the
  // creator acquisition and catalog surface. Creator studios and payouts
  // remain gated below. The marketing homepage, legal/info pages, and pricing (no
  // real member data on any of them) are visible signed-out — /feed,
  // /channels, and /leaderboard used to be in this list too, which meant
  // anyone with the URL could browse real members' posts, picks, and
  // win/loss records without an account. Homepage handles its own signed-in
  // redirect to /feed itself (see app/page.tsx), so it stays public here.
  // /pricing must stay public too — it's the tier sign-up funnel, and a
  // prospective subscriber needs to see plans before they have an account
  // to log into; PricingCheckoutButton itself handles sending a logged-out
  // click to /auth/login.
  const pathname = request.nextUrl.pathname
  const creatorSlug = pathname.match(/^\/creators\/([^/]+)$/)?.[1]
  const blogSlug = pathname.match(/^\/blog\/([^/]+)$/)?.[1]
  const isPublicCreatorRoute = pathname === '/creators'
    || pathname === '/creators/apply'
    || pathname.startsWith('/creators/offers/')
    || (!!creatorSlug && !['studio', 'payouts'].includes(creatorSlug))
  const isPublicBlogRoute = pathname === '/blog'
    || (!!blogSlug && !['create', 'edit', 'my'].includes(blogSlug))
  const isPublicRoute = ['/', '/about', '/faq', '/terms', '/privacy', '/responsible-gambling', '/support', '/pricing'].some(p =>
    pathname === p
  ) || isPublicCreatorRoute || isPublicBlogRoute

  if (!userId && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Onboarding-completion gate — an authenticated account with
  // onboarding_completed_at still null (regardless of how they signed
  // up: email/password, Discord, X, or Whop) gets sent to /onboarding no
  // matter what page they try to visit, until they actually finish it.
  // Scoped to page navigations only (not /api/*) so this can't intercept
  // a fetch call the onboarding page itself — or any other page — makes
  // to a route handler and break it with an HTML redirect where JSON was
  // expected. Auth routes stay reachable throughout (password reset,
  // logout, the callback that creates the profile row in the first
  // place) — otherwise a not-yet-onboarded user could get stuck unable
  // to even sign out.
  if (
    userId &&
    !isAuthRoute &&
    !request.nextUrl.pathname.startsWith('/api/') &&
    request.nextUrl.pathname !== '/onboarding'
  ) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle()
    if (!profile?.onboarding_completed_at) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
