import { NextResponse } from 'next/server'
import Browserbase from '@browserbasehq/sdk'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { safeApiError } from '@/lib/safeApiError'

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

  try {
    const bb = new Browserbase({ apiKey })
    const configuredProjectId = process.env.BROWSERBASE_PROJECT_ID
    const projectId = configuredProjectId ?? (await bb.projects.list())[0]?.id
    if (!projectId) return NextResponse.json({ error: 'Browserbase project not found' }, { status: 502 })

    let timeout: ReturnType<typeof setTimeout> | undefined
    const [sessions, usage] = await Promise.race([
      Promise.all([
        bb.sessions.list({ status: 'RUNNING' }),
        bb.projects.usage(projectId),
      ]),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Browserbase request timed out')), 12_000)
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout)
    })

    const now = Date.now()
    const summarized = sessions.map(s => ({
      idSuffix: s.id.slice(-8),
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      keepAlive: s.keepAlive,
      region: s.region,
      proxyBytes: s.proxyBytes,
      ageMinutes: Math.round((now - new Date(s.createdAt).getTime()) / 60000),
    }))

    return NextResponse.json({
      projectIdSuffix: projectId.slice(-8),
      usage: {
        browserMinutes: usage.browserMinutes,
        browserHours: Number((usage.browserMinutes / 60).toFixed(2)),
        proxyBytes: usage.proxyBytes,
        proxyGigabytes: Number((usage.proxyBytes / 1_000_000_000).toFixed(3)),
      },
      runningCount: summarized.length,
      sessions: summarized,
    })
  } catch (cause) {
    return safeApiError('admin-browserbase-sessions', cause, 'Browser session check failed', 502)
  }
}
