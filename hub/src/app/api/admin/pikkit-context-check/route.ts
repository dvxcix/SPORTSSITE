import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { openSession } from '@/lib/browserbase'

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
  const waitMs = Number(reqUrl.searchParams.get('waitMs') ?? 2500)

  const bb = await openSession({ contextId })
  try {
    await bb.page.goto('https://app.pikkit.com/leagues/mlb', { waitUntil: 'domcontentloaded' })
    await bb.page.waitForTimeout(waitMs)
    const url = bb.page.url()
    const title = await bb.page.title().catch(() => null)
    const bodyText = await bb.page.evaluate(() => document.body?.innerText?.slice(0, 800) ?? '').catch(() => null)
    return NextResponse.json({ contextId, url, title, bodyText })
  } finally {
    await bb.close()
  }
}
