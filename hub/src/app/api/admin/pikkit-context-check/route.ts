import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { openPikkitSession } from '@/lib/browserbase'
import { safeApiError } from '@/lib/safeApiError'
import { acquirePikkitBrowserLease } from '@/lib/pikkitBrowserLease'
import { createClient } from '@/lib/supabase/server'
import type { Response as BrowserResponse } from 'playwright-core'

export const revalidate = 0
export const maxDuration = 120

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

async function requireDiagnosticAuth(req: Request) {
  if (!requireBrowserbaseCronAuth(req)) return null
  // Cookie-authenticated diagnostics may spend cloud browser time. Limit this
  // fallback to the owner's top-level navigation, never an embedded request.
  if (req.headers.get('sec-fetch-dest') !== 'document'
      || !['same-origin', 'none'].includes(req.headers.get('sec-fetch-site') ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    const { data: profile, error: profileError } = await supabase.from('users').select('account_type').eq('id', user.id).single()
    if (profileError) throw profileError
    return profile?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch (cause) {
    return safeApiError('admin-pikkit-context-auth', cause, 'Admin authorization is temporarily unavailable', 503)
  }
}

async function run(req: Request) {
  const authError = await requireDiagnosticAuth(req)
  if (authError) return authError

  const contextId = process.env.PIKKIT_CONTEXT_ID
  if (!contextId) {
    return NextResponse.json({ error: 'PIKKIT_CONTEXT_ID is not configured' }, { status: 500 })
  }

  const reqUrl = new URL(req.url)
  const requestedWaitMs = Number(reqUrl.searchParams.get('waitMs') ?? 2500)
  const waitMs = Number.isFinite(requestedWaitMs)
    ? Math.min(10_000, Math.max(0, Math.trunc(requestedWaitMs)))
    : 2500

  const lease = await acquirePikkitBrowserLease()
  if (!lease) return NextResponse.json({ error: 'Pikkit context is currently in use; retry shortly' }, { status: 423 })
  let bb: Awaited<ReturnType<typeof openPikkitSession>> | null = null
  let browserStarted = false, browserClosed = false
  const loginValidateStatuses: number[] = []
  const observeResponse = (response: BrowserResponse) => {
    try {
      const url = new URL(response.url())
      if (url.origin === 'https://prod-website.pikkit.app' && url.pathname === '/login/validate' && loginValidateStatuses.length < 16) {
        loginValidateStatuses.push(response.status())
      }
    } catch { /* No response bodies, headers or full URLs enter the diagnostic. */ }
  }
  try {
    try {
      browserStarted = true
      bb = await openPikkitSession(contextId, { mode: 'context-check' }, { requestTimeoutMs: 10000 })
      const sessionCookiesBefore = (await bb.page.context().cookies())
        .filter(cookie => cookie.name === 'session_id' && /(^|\.)pikkit\.(com|app)$/.test(cookie.domain))
        .map(cookie => ({
          domain: cookie.domain, path: cookie.path, expires: cookie.expires,
          secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite,
          present: cookie.value.length > 0,
        }))
      bb.page.on('response', observeResponse)
      await bb.page.goto('https://app.pikkit.com/leagues/nba', { waitUntil: 'domcontentloaded', timeout: 20_000 })
      // Pikkit can render its sidebar before the auth redirect settles. Never
      // let a short diagnostic wait recreate the false-positive auth check.
      await bb.page.waitForTimeout(Math.max(waitMs, 7000))
      const url = bb.page.url()
      const pathname = (() => {
        try {
          const parsed = new URL(url)
          return parsed.origin === 'https://app.pikkit.com' && /^\/(?:leagues\/nba|login|join|pro|auth|verify)\/?$/.test(parsed.pathname)
            ? parsed.pathname : '/other'
        } catch { return '/other' }
      })()
      const pageState = await bb.page.evaluate(() => {
        const text = document.body?.innerText?.toLowerCase() ?? ''
        return {
          hasLoginPrompt: /log in|sign in/.test(text),
          hasAuthenticatedShell: text.includes('your bets'),
          hasGameLinks: document.querySelectorAll('a[href*="/event/"], a[href*="game"], a[href*="matchup"]').length > 0,
        }
      }).catch(() => ({ hasLoginPrompt: false, hasAuthenticatedShell: false, hasGameLinks: false }))
      return NextResponse.json({
        sessionCookiesBefore, loginValidateStatuses, pathname,
        ...pageState,
      })
    } finally {
      bb?.page.off('response', observeResponse)
      try { if (bb) { await bb.close(); browserClosed = true } }
      finally { await lease.release(!browserStarted || browserClosed) }
    }
  } catch (cause) {
    return safeApiError('admin-pikkit-context-check', cause, 'Pikkit context check or browser release failed', 502)
  }
}

export async function GET(req: Request) {
  try { return privateResponse(await run(req)) }
  catch (cause) { return privateResponse(safeApiError('admin-pikkit-context-check', cause, 'Pikkit context check failed', 502)) }
}
