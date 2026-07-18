import { NextResponse } from 'next/server'
import Browserbase from '@browserbasehq/sdk'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'

export const revalidate = 0

// Ad-hoc diagnostic — lists currently RUNNING Browserbase sessions so we can
// spot anything left alive that shouldn't be (e.g. the one-time Pikkit login
// session, created with keepAlive:true and deliberately never explicitly
// closed by createPersistentContext(), since closing it would've ended the
// login before the admin got a chance to sign in). Browserbase bills for a
// session's full lifetime from creation until it's explicitly released or
// hits its timeout — a forgotten RUNNING session bills continuously the
// whole time, whether anything is using it or not.
export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'BROWSERBASE_API_KEY is not configured' }, { status: 500 })

  const bb = new Browserbase({ apiKey })
  const sessions = await bb.sessions.list({ status: 'RUNNING' })

  const now = Date.now()
  const summarized = sessions.map(s => ({
    id: s.id,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    keepAlive: s.keepAlive,
    region: s.region,
    proxyBytes: s.proxyBytes,
    ageMinutes: Math.round((now - new Date(s.createdAt).getTime()) / 60000),
  }))

  return NextResponse.json({ runningCount: summarized.length, sessions: summarized })
}
