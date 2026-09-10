import 'server-only'

import Browserbase from '@browserbasehq/sdk'
import { unstable_cache } from 'next/cache'

const INCLUDED_BROWSER_MINUTES = 500 * 60
const INCLUDED_PROXY_BYTES = 5_000_000_000

export type BrowserbaseWorkflowUsage = {
  name: string
  sessions: number
  browserMinutes: number
  proxyBytes: number
  errors: number
  timedOut: number
}

export type BrowserbaseUsageSummary = {
  browserMinutes: number
  proxyBytes: number
  runningSessions: number
  byWorkflow: BrowserbaseWorkflowUsage[]
}

export const getBrowserbaseUsageSummary = unstable_cache(async (): Promise<BrowserbaseUsageSummary | null> => {
  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) return null

  const browserbase = new Browserbase({ apiKey })
  const projectId = process.env.BROWSERBASE_PROJECT_ID ?? (await browserbase.projects.list())[0]?.id
  if (!projectId) return null

  const [usage, running, sessions] = await Promise.all([
    browserbase.projects.usage(projectId),
    browserbase.sessions.list({ status: 'RUNNING' }),
    browserbase.sessions.list(),
  ])
  const workflows = new Map<string, BrowserbaseWorkflowUsage>()
  for (const session of sessions) {
    const book = typeof session.userMetadata?.book === 'string' ? session.userMetadata.book : 'untagged'
    const sport = typeof session.userMetadata?.sport === 'string' ? session.userMetadata.sport : 'mlb'
    const mode = typeof session.userMetadata?.mode === 'string' ? session.userMetadata.mode : 'scrape'
    const name = `${book}:${sport}:${mode}`
    const startedAt = Date.parse(session.startedAt || session.createdAt)
    const endedAt = Date.parse(session.endedAt || session.updatedAt || session.expiresAt)
    const minutes = Number.isFinite(startedAt) && Number.isFinite(endedAt)
      ? Math.max(0, (endedAt - startedAt) / 60_000)
      : 0
    const row = workflows.get(name) ?? { name, sessions: 0, browserMinutes: 0, proxyBytes: 0, errors: 0, timedOut: 0 }
    row.sessions += 1
    row.browserMinutes += minutes
    row.proxyBytes += session.proxyBytes || 0
    if (session.status === 'ERROR') row.errors += 1
    if (session.status === 'TIMED_OUT') row.timedOut += 1
    workflows.set(name, row)
  }

  return {
    browserMinutes: usage.browserMinutes,
    proxyBytes: usage.proxyBytes,
    runningSessions: running.length,
    byWorkflow: [...workflows.values()].sort((left, right) => right.proxyBytes - left.proxyBytes || right.browserMinutes - left.browserMinutes),
  }
}, ['browserbase-admin-usage-v1'], { revalidate: 300 })

export function browserbasePlanUsage(summary: BrowserbaseUsageSummary) {
  return {
    browserHours: summary.browserMinutes / 60,
    browserPercent: summary.browserMinutes / INCLUDED_BROWSER_MINUTES * 100,
    browserHoursRemaining: Math.max(0, (INCLUDED_BROWSER_MINUTES - summary.browserMinutes) / 60),
    proxyGigabytes: summary.proxyBytes / 1_000_000_000,
    proxyPercent: summary.proxyBytes / INCLUDED_PROXY_BYTES * 100,
    proxyGigabytesRemaining: Math.max(0, (INCLUDED_PROXY_BYTES - summary.proxyBytes) / 1_000_000_000),
  }
}
