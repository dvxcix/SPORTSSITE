import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_UNAVAILABLE_HEADERS, isRetryableAuthError } from './authErrors'

const AUTH_REFRESH_RETRY_COOKIE = 'ss-auth-refresh-retry'

function clearRefreshRetry(response: NextResponse) {
  response.cookies.set(AUTH_REFRESH_RETRY_COOKIE, '', { path: '/', maxAge: 0 })
}

function authUnavailable(request: NextRequest, code = 'AUTH_TEMPORARILY_UNAVAILABLE') {
  if (request.headers.get('accept')?.includes('text/html')) {
    return new NextResponse('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SlipSurge</title><body style="background:#09090b;color:#fafafa;font-family:system-ui;padding:32px"><h1>Connection interrupted</h1><p>Please try loading this page again.</p><p><a style="color:#b4ff4d" href="">Try again</a></p><p><a style="color:#a1a1aa" href="/auth/login">Sign in</a></p></body></html>', {
      status: 503, headers: { ...AUTH_UNAVAILABLE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  return NextResponse.json({ error: 'Account verification temporarily unavailable', code }, { status: 503, headers: AUTH_UNAVAILABLE_HEADERS })
}

export async function updateSession(request: NextRequest) {
  const isAuthRoute = request.nextUrl.pathname === '/auth' || request.nextUrl.pathname.startsWith('/auth/')
  // Login and token-exchange handlers authenticate themselves. A stale cookie
  // must not trigger a second proxy refresh or delete a newer browser session.
  if (isAuthRoute) return NextResponse.next({ request })
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
          const previousCookies = supabaseResponse.cookies.getAll()
          const previousHeaders = new Headers(supabaseResponse.headers)
          supabaseResponse = NextResponse.next({ request })
          previousCookies.forEach(cookie => supabaseResponse.cookies.set(cookie))
          for (const name of ['cache-control', 'expires', 'pragma']) {
            const value = previousHeaders.get(name)
            if (value) supabaseResponse.headers.set(name, value)
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers ?? {}).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value)
          )
        },
      },
    }
  )

  function finish(response: NextResponse) {
    // A redirect/403 must carry the refresh which preceded that decision.
    // Never forward middleware request-control headers onto a redirect.
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
    for (const name of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(name)
      if (value) response.headers.set(name, value)
    }
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return response
  }

  // getClaims validates the access-token signature locally against the
  // project's published signing keys and only reaches Auth when a refresh is
  // actually needed. getUser made every page and parallel API request hit the
  // Auth service, multiplying refresh-token rotation races during a normal
  // page load. This is Supabase's current SSR proxy contract.
  let authResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>
  try {
    authResult = await supabase.auth.getClaims()
  } catch {
    // Do not include any SDK cookie changes from a failed verification.
    return authUnavailable(request)
  }
  const { data: authData, error: authError } = authResult
  const userId = !authError && typeof authData?.claims?.sub === 'string' ? authData.claims.sub : null
  if (isRetryableAuthError(authError)) {
    const race = authError?.code === 'refresh_token_already_used' || authError?.code === 'refresh_token_not_found'
    // A retry marker shared by concurrent requests cannot prove expiry. The
    // browser owns recovery; this request stays blocked without deleting cookies.
    return authUnavailable(request, race ? 'SESSION_REFRESH_RETRY' : 'AUTH_TEMPORARILY_UNAVAILABLE')
  }
  if (authError) supabaseResponse = NextResponse.next({ request })
  if (userId && request.cookies.has(AUTH_REFRESH_RETRY_COOKIE)) clearRefreshRetry(supabaseResponse)

  if (userId && request.nextUrl.pathname.startsWith('/api/admin/')) {
    try {
    const [{ data: profile, error: profileError }, { data: assurance, error: assuranceError }] = await Promise.all([
      supabase.from('users').select('account_type').eq('id', userId).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (profileError || assuranceError) return finish(authUnavailable(request))
    if (profile?.account_type !== 'admin') {
      return finish(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    }
    if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      return finish(NextResponse.json({ error: 'Two-factor verification required', code: 'MFA_REQUIRED' }, { status: 403 }))
    }
    } catch {
      return finish(authUnavailable(request))
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
    if (pathname.startsWith('/api/') || /^\/the-sideline\/(market|results|touchdown-replay)$/.test(pathname)) {
      return finish(NextResponse.json({ error: 'Sign in required' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } }))
    }
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.search = ''
    url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return finish(NextResponse.redirect(url))
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
    try {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) return finish(authUnavailable(request))
    if (!profile?.onboarding_completed_at) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      url.search = ''
      return finish(NextResponse.redirect(url))
    }
    } catch {
      return finish(authUnavailable(request))
    }
  }

  if (userId) supabaseResponse.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return supabaseResponse
}
