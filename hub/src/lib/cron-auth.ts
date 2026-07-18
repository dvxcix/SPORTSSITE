import { NextResponse } from 'next/server'

// Was copy-pasted identically across every cron route — extracted once
// there were enough of them (player-data sync adds several more) that a
// 4th-10th copy stopped making sense.
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Same as requireCronAuth, but also accepts SECOND_CRON_SECRET — a secret
// scoped to just the Browserbase scrape-* routes so a manual test run can
// use a value that isn't the shared CRON_SECRET every other cron on the
// site relies on. Vercel's own scheduled cron triggers only ever send
// CRON_SECRET (it's the one env var name Vercel auto-attaches as a Bearer
// token to scheduled invocations), so that path is left fully intact.
export function requireBrowserbaseCronAuth(req: Request): NextResponse | null {
  const primary = process.env.CRON_SECRET
  const secondary = process.env.SECOND_CRON_SECRET
  if (!primary && !secondary) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  const ok = (!!primary && auth === `Bearer ${primary}`) || (!!secondary && auth === `Bearer ${secondary}`)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
