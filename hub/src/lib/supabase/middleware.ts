import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Cron routes carry no browser session (Vercel invokes them directly with
  // a CRON_SECRET bearer header, which each route checks itself) — without
  // this, every cron hit got redirected to /auth/login before its handler
  // ever ran, since the proxy matcher covers /api too. That silently broke
  // both settle-picks and grade-live-picks; neither one has ever actually
  // executed in production until this exemption.
  if (request.nextUrl.pathname.startsWith('/api/cron/')) {
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

  // Once registered, a service worker's script gets auto-refetched by the
  // browser on navigations within its scope (the whole origin here) to
  // check for updates — including from a logged-out tab. A redirect
  // response in place of the actual JS would just silently fail that
  // update check, but there's no reason to route it through auth at all.
  if (request.nextUrl.pathname === '/sw.js') {
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

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  // Only the marketing homepage and static legal/info pages (no real member
  // data on any of them) are visible signed-out — /feed, /channels, and
  // /leaderboard used to be in this list too, which meant anyone with the
  // URL could browse real members' posts, picks, and win/loss records
  // without an account. Homepage handles its own signed-in redirect to
  // /feed itself (see app/page.tsx), so it stays public here.
  const isPublicRoute = ['/', '/about', '/faq', '/terms', '/privacy', '/responsible-gambling', '/support'].some(p =>
    request.nextUrl.pathname === p
  )

  if (!user && !isAuthRoute && !isPublicRoute) {
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
    user &&
    !isAuthRoute &&
    !request.nextUrl.pathname.startsWith('/api/') &&
    request.nextUrl.pathname !== '/onboarding'
  ) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_completed_at')
      .eq('id', user.id)
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
