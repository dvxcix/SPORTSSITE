import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
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
