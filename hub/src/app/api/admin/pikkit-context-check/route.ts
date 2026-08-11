import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { openSession } from '@/lib/browserbase'
import { safeApiError } from '@/lib/safeApiError'

export const revalidate = 0
export const maxDuration = 60

// Ad-hoc diagnostic — opens a session against the CURRENT PIKKIT_CONTEXT_ID,
// navigates to the MLB listing page, and reports back what actually rendered
// (URL after navigation, page title, and a text snippet) instead of relying
// on scrape-pikkit's generic "game link not found" error to guess whether
// the persisted login is still valid. Built while diagnosing a re-auth that
// scrape-pikkit kept reporting as failed even after a fresh manual login.
export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
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

  let bb: Awaited<ReturnType<typeof openSession>> | null = null
  try {
    bb = await openSession({ contextId })
    await bb.page.goto('https://app.pikkit.com/leagues/mlb', { waitUntil: 'domcontentloaded' })
    await bb.page.waitForTimeout(waitMs)
    const url = bb.page.url()
    const title = await bb.page.title().catch(() => null)
    const pageState = await bb.page.evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() ?? ''
      return {
        hasLoginPrompt: /log in|sign in/.test(text),
        hasGameLinks: document.querySelectorAll('a[href*="game"], a[href*="matchup"]').length > 0,
      }
    }).catch(() => ({ hasLoginPrompt: false, hasGameLinks: false }))
    return NextResponse.json({
      origin: (() => { try { return new URL(url).origin } catch { return null } })(),
      title: typeof title === 'string' ? title.slice(0, 160) : null,
      ...pageState,
    })
  } catch (cause) {
    return safeApiError('admin-pikkit-context-check', cause, 'Pikkit context check failed', 502)
  } finally {
    if (bb) await bb.close().catch(() => undefined)
  }
}
