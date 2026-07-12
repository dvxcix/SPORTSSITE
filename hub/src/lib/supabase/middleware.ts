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
  const isPublicRoute = ['/', '/feed', '/channels', '/leaderboard'].some(p =>
    request.nextUrl.pathname === p
  )

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
