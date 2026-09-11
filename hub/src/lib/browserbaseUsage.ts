import 'server-only'

import Browserbase from '@browserbasehq/sdk'
import { unstable_cache } from 'next/cache'

export const BROWSERBASE_PLAN = {
  monthlyPriceUsd: 99,
  includedBrowserMinutes: 500 * 60,
  includedProxyBytes: 5_000_000_000,
  browserOverageUsdPerHour: 0.10,
  proxyOverageUsdPerGigabyte: 10,
} as const

export type BrowserbaseWorkflowUsage = {
  name: string
  book: string
  sport: string
  mode: string
  sessions: number
  browserMinutes: number
  proxyBytes: number
  errors: number
  timedOut: number
  completed: number
  running: number
  firstSeenAt: string
  lastSeenAt: string
}

export type BrowserbaseDailyUsage = {
  date: string
  sessions: number
  browserMinutes: number
  proxyBytes: number
  errors: number
}

export type BrowserbaseSessionUsage = {
  idSuffix: string
  workflow: string
  status: 'PENDING' | 'RUNNING' | 'ERROR' | 'TIMED_OUT' | 'COMPLETED'
  createdAt: string
  endedAt: string | null
  browserMinutes: number
  proxyBytes: number
  region: string
  keepAlive: boolean
}

export type BrowserbaseUsageSummary = {
  generatedAt: string
  browserMinutes: number
  proxyBytes: number
  runningSessions: number
  retainedSessionCount: number
  cycleSessionCount: number
  attributedBrowserMinutes: number
  attributedProxyBytes: number
  unaccountedBrowserMinutes: number
  unaccountedProxyBytes: number
  untaggedSessions: number
  byWorkflow: BrowserbaseWorkflowUsage[]
  byDay: BrowserbaseDailyUsage[]
  byStatus: Record<string, number>
  byRegion: Record<string, number>
  recentSessions: BrowserbaseSessionUsage[]
}

function sessionIdentity(userMetadata: Record<string, unknown> | undefined) {
  const book = typeof userMetadata?.book === 'string' ? userMetadata.book : 'untagged'
  const sport = typeof userMetadata?.sport === 'string' ? userMetadata.sport : 'unknown'
  const mode = typeof userMetadata?.mode === 'string' ? userMetadata.mode : 'scrape'
  return { book, sport, mode, name: `${book}:${sport}:${mode}` }
}

function sessionMinutes(session: { startedAt?: string; createdAt: string; endedAt?: string; updatedAt?: string; expiresAt: string; status: string }) {
  const startedAt = Date.parse(session.startedAt || session.createdAt)
  const endValue = session.status === 'RUNNING'
    ? new Date().toISOString()
    : session.endedAt || session.updatedAt || session.expiresAt
  const endedAt = Date.parse(endValue)
  return Number.isFinite(startedAt) && Number.isFinite(endedAt)
    ? Math.max(0, (endedAt - startedAt) / 60_000)
    : 0
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
  const cycleStart = new Date()
  cycleStart.setUTCDate(1)
  cycleStart.setUTCHours(0, 0, 0, 0)
  const cycleSessions = sessions.filter(session => Date.parse(session.createdAt) >= cycleStart.getTime())
  const workflows = new Map<string, BrowserbaseWorkflowUsage>()
  const days = new Map<string, BrowserbaseDailyUsage>()
  const byStatus: Record<string, number> = {}
  const byRegion: Record<string, number> = {}
  let attributedBrowserMinutes = 0
  let attributedProxyBytes = 0
  let untaggedSessions = 0
  for (const session of cycleSessions) {
    const identity = sessionIdentity(session.userMetadata)
    const minutes = sessionMinutes(session)
    const proxyBytes = session.proxyBytes || 0
    const createdAt = session.createdAt
    const day = createdAt.slice(0, 10)
    if (identity.book === 'untagged') untaggedSessions += 1
    attributedBrowserMinutes += minutes
    attributedProxyBytes += proxyBytes

    const row = workflows.get(identity.name) ?? {
      ...identity,
      sessions: 0,
      browserMinutes: 0,
      proxyBytes: 0,
      errors: 0,
      timedOut: 0,
      completed: 0,
      running: 0,
      firstSeenAt: createdAt,
      lastSeenAt: createdAt,
    }
    row.sessions += 1
    row.browserMinutes += minutes
    row.proxyBytes += proxyBytes
    row.firstSeenAt = createdAt < row.firstSeenAt ? createdAt : row.firstSeenAt
    row.lastSeenAt = createdAt > row.lastSeenAt ? createdAt : row.lastSeenAt
    if (session.status === 'ERROR') row.errors += 1
    if (session.status === 'TIMED_OUT') row.timedOut += 1
    if (session.status === 'COMPLETED') row.completed += 1
    if (session.status === 'RUNNING') row.running += 1
    workflows.set(identity.name, row)

    const daily = days.get(day) ?? { date: day, sessions: 0, browserMinutes: 0, proxyBytes: 0, errors: 0 }
    daily.sessions += 1
    daily.browserMinutes += minutes
    daily.proxyBytes += proxyBytes
    if (session.status === 'ERROR' || session.status === 'TIMED_OUT') daily.errors += 1
    days.set(day, daily)
    byStatus[session.status] = (byStatus[session.status] ?? 0) + 1
    byRegion[session.region] = (byRegion[session.region] ?? 0) + 1
  }

  const recentSessions = sessions
    .toSorted((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 100)
    .map(session => ({
      idSuffix: session.id.slice(-8),
      workflow: sessionIdentity(session.userMetadata).name,
      status: session.status,
      createdAt: session.createdAt,
      endedAt: session.endedAt ?? null,
      browserMinutes: sessionMinutes(session),
      proxyBytes: session.proxyBytes || 0,
      region: session.region,
      keepAlive: session.keepAlive,
    }))

  return {
    generatedAt: new Date().toISOString(),
    browserMinutes: usage.browserMinutes,
    proxyBytes: usage.proxyBytes,
    runningSessions: running.length,
    retainedSessionCount: sessions.length,
    cycleSessionCount: cycleSessions.length,
    attributedBrowserMinutes,
    attributedProxyBytes,
    unaccountedBrowserMinutes: Math.max(0, usage.browserMinutes - attributedBrowserMinutes),
    unaccountedProxyBytes: Math.max(0, usage.proxyBytes - attributedProxyBytes),
    untaggedSessions,
    byWorkflow: [...workflows.values()].sort((left, right) => right.proxyBytes - left.proxyBytes || right.browserMinutes - left.browserMinutes),
    byDay: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    byStatus,
    byRegion,
    recentSessions,
  }
}, ['browserbase-admin-usage-v2'], { revalidate: 300 })

export function browserbasePlanUsage(summary: BrowserbaseUsageSummary, now = new Date()) {
  const browserHours = summary.browserMinutes / 60
  const proxyGigabytes = summary.proxyBytes / 1_000_000_000
  const browserOverageHours = Math.max(0, browserHours - BROWSERBASE_PLAN.includedBrowserMinutes / 60)
  const proxyOverageGigabytes = Math.max(0, proxyGigabytes - BROWSERBASE_PLAN.includedProxyBytes / 1_000_000_000)
  const browserOverageUsd = browserOverageHours * BROWSERBASE_PLAN.browserOverageUsdPerHour
  const proxyOverageUsd = proxyOverageGigabytes * BROWSERBASE_PLAN.proxyOverageUsdPerGigabyte
  const dayOfMonth = now.getUTCDate()
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  const elapsedMonthFraction = Math.max(1 / daysInMonth, dayOfMonth / daysInMonth)
  const projectedBrowserHours = browserHours / elapsedMonthFraction
  const projectedProxyGigabytes = proxyGigabytes / elapsedMonthFraction
  const projectedBrowserOverageUsd = Math.max(0, projectedBrowserHours - 500) * BROWSERBASE_PLAN.browserOverageUsdPerHour
  const projectedProxyOverageUsd = Math.max(0, projectedProxyGigabytes - 5) * BROWSERBASE_PLAN.proxyOverageUsdPerGigabyte

  return {
    browserHours,
    browserPercent: summary.browserMinutes / BROWSERBASE_PLAN.includedBrowserMinutes * 100,
    browserHoursRemaining: Math.max(0, (BROWSERBASE_PLAN.includedBrowserMinutes - summary.browserMinutes) / 60),
    browserOverageHours,
    browserOverageUsd,
    proxyGigabytes,
    proxyPercent: summary.proxyBytes / BROWSERBASE_PLAN.includedProxyBytes * 100,
    proxyGigabytesRemaining: Math.max(0, (BROWSERBASE_PLAN.includedProxyBytes - summary.proxyBytes) / 1_000_000_000),
    proxyOverageGigabytes,
    proxyOverageUsd,
    estimatedCurrentBillUsd: BROWSERBASE_PLAN.monthlyPriceUsd + browserOverageUsd + proxyOverageUsd,
    projectedBrowserHours,
    projectedProxyGigabytes,
    projectedBillUsd: BROWSERBASE_PLAN.monthlyPriceUsd + projectedBrowserOverageUsd + projectedProxyOverageUsd,
    averageProxyGigabytesPerCalendarDay: proxyGigabytes / Math.max(1, dayOfMonth),
    includedProxyGigabytesPerCalendarDay: 5 / daysInMonth,
  }
}
