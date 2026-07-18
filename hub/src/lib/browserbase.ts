import Browserbase from '@browserbasehq/sdk'
import { chromium, type Browser, type Page } from 'playwright-core'

// Thin wrapper around the Browserbase SDK + Playwright's CDP connection —
// every scraper (FanDuel/BetMGM/Pikkit) goes through this so session
// creation/teardown and context persistence (Pikkit's login) only exist in
// one place.

function client(): Browserbase {
  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) throw new Error('BROWSERBASE_API_KEY is not configured')
  return new Browserbase({ apiKey })
}

function projectId(): string {
  const id = process.env.BROWSERBASE_PROJECT_ID
  if (!id) throw new Error('BROWSERBASE_PROJECT_ID is not configured')
  return id
}

export type BBSession = {
  page: Page
  sessionId: string
  close: () => Promise<void>
}

// Opens a fresh Browserbase-hosted browser and connects Playwright to it.
// Pass `contextId` to resume a persisted, already-authenticated context
// (Pikkit) instead of starting logged out every run — see
// createPersistentContext() below for how that context gets its login in
// the first place.
export async function openSession(opts: { contextId?: string; stealth?: boolean } = {}): Promise<BBSession> {
  const bb = client()
  const session = await bb.sessions.create({
    projectId: projectId(),
    browserSettings: {
      ...(opts.contextId ? { context: { id: opts.contextId, persist: true } } : {}),
      ...(opts.stealth ? { advancedStealth: true } : {}),
    },
  })
  const browser: Browser = await chromium.connectOverCDP(session.connectUrl)
  const context = browser.contexts()[0] ?? await browser.newContext()
  const page = context.pages()[0] ?? await context.newPage()
  return {
    page,
    sessionId: session.id,
    close: async () => { await browser.close() },
  }
}

// One-time setup, not called by the scrapers themselves — run this once
// (e.g. from a scratch script) to mint a durable Browserbase context, then
// open the returned Live View URL and sign into Pikkit yourself inside it.
// Browserbase persists that session's cookies against contextId afterward,
// so every future openSession({ contextId }) call for Pikkit starts already
// logged in. No password is ever read, stored, or typed by this codebase —
// you do the actual sign-in by hand, once, in the Live View.
export async function createPersistentContext(): Promise<{ contextId: string; liveViewUrl: string }> {
  const bb = client()
  const context = await bb.contexts.create({ projectId: projectId() })
  const session = await bb.sessions.create({
    projectId: projectId(),
    keepAlive: true,
    browserSettings: { context: { id: context.id, persist: true } },
  })
  const live = await bb.sessions.debug(session.id)
  return { contextId: context.id, liveViewUrl: live.debuggerFullscreenUrl }
}
