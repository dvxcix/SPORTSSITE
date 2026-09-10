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
    const [sessions, allSessions, usage] = await Promise.race([
      Promise.all([
        bb.sessions.list({ status: 'RUNNING' }),
        bb.sessions.list(),
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
    const workflow = new Map<string, { sessions: number; browserMinutes: number; proxyBytes: number; errors: number; timedOut: number }>()
    for (const session of allSessions) {
      const book = typeof session.userMetadata?.book === 'string' ? session.userMetadata.book : 'untagged'
      const sport = typeof session.userMetadata?.sport === 'string' ? session.userMetadata.sport : 'mlb'
      const mode = typeof session.userMetadata?.mode === 'string' ? session.userMetadata.mode : 'scrape'
      const key = `${book}:${sport}:${mode}`
      const startedAt = Date.parse(session.startedAt || session.createdAt)
      const endedAt = Date.parse(session.endedAt || session.updatedAt || session.expiresAt)
      const minutes = Number.isFinite(startedAt) && Number.isFinite(endedAt)
        ? Math.max(0, (endedAt - startedAt) / 60000)
        : 0
      const current = workflow.get(key) ?? { sessions: 0, browserMinutes: 0, proxyBytes: 0, errors: 0, timedOut: 0 }
      current.sessions++
      current.browserMinutes += minutes
      current.proxyBytes += session.proxyBytes || 0
      if (session.status === 'ERROR') current.errors++
      if (session.status === 'TIMED_OUT') current.timedOut++
      workflow.set(key, current)
    }
    const byWorkflow = [...workflow.entries()].map(([name, value]) => ({
      name,
      sessions: value.sessions,
      browserMinutes: Number(value.browserMinutes.toFixed(1)),
      browserHours: Number((value.browserMinutes / 60).toFixed(2)),
      proxyBytes: value.proxyBytes,
      proxyGigabytes: Number((value.proxyBytes / 1_000_000_000).toFixed(3)),
      errors: value.errors,
      timedOut: value.timedOut,
    })).sort((left, right) => right.proxyBytes - left.proxyBytes || right.browserMinutes - left.browserMinutes)

    const browserMinuteLimit = 500 * 60
    const proxyByteLimit = 5 * 1_000_000_000

    return NextResponse.json({
      projectIdSuffix: projectId.slice(-8),
      usage: {
        browserMinutes: usage.browserMinutes,
        browserHours: Number((usage.browserMinutes / 60).toFixed(2)),
        proxyBytes: usage.proxyBytes,
        proxyGigabytes: Number((usage.proxyBytes / 1_000_000_000).toFixed(3)),
        browserPlanUsedPct: Number((usage.browserMinutes / browserMinuteLimit * 100).toFixed(1)),
        proxyPlanUsedPct: Number((usage.proxyBytes / proxyByteLimit * 100).toFixed(1)),
      },
      automatedSafetyLimits: {
        browserMinutes: Number(process.env.BROWSERBASE_BROWSER_MINUTE_BUDGET) || 25_500,
        proxyBytes: Number(process.env.BROWSERBASE_PROXY_BYTE_BUDGET) || 4_250_000_000,
      },
      runningCount: summarized.length,
      sessions: summarized,
      retainedSessionCount: allSessions.length,
      byWorkflow,
    })
  } catch (cause) {
    return safeApiError('admin-browserbase-sessions', cause, 'Browser session check failed', 502)
  }
}
