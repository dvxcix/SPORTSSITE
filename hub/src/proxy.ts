import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DESIGN_REVIEW === '1' && (process.env.NODE_ENV === 'development' || process.env.SLIPSURGE_UI_REVIEW_BUILD === '1') && !process.env.VERCEL) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(request.nextUrl.hostname)) return new NextResponse('Local design review only', { status: 403 })
    const role=request.nextUrl.searchParams.get('reviewRole')
    if (role && ['member','admin','guest','onboarding'].includes(role)) {
      const url=request.nextUrl.clone();url.searchParams.delete('reviewRole')
      const response=NextResponse.redirect(url)
      response.cookies.set('ss_ui_review_role',role,{sameSite:'strict',httpOnly:false,path:'/'})
      return response
    }
    const path=request.nextUrl.pathname
    if (path.startsWith('/api/') || /^\/the-paint\/(?!.*page).+/.test(path) || path==='/the-sideline/market') {
      return (await import('../review/http')).reviewHttp(request)
    }
    return NextResponse.next()
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    // Dynamic routes still need authentication even when a parameter ends
    // in an image-like suffix; the broad static-file exclusion above would
    // otherwise allow those requests to bypass the proxy.
    '/api/:path*', '/players/:path*', '/mlb/:path*', '/sports/mlb/:path*', '/marketplace/:path*',
  ],
}
