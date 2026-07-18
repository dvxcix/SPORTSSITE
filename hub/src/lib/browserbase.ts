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

// projectId is genuinely optional on every Browserbase SDK call — omitted,
// the project is inferred from the API key itself (confirmed directly in
// @browserbasehq/sdk's own SessionCreateParams/ContextCreateParams type
// comments: "Optional - if not provided, the project will be inferred from
// the API key"). Pass it through if it happens to be set, but never require
// it — this used to throw when BROWSERBASE_PROJECT_ID wasn't configured,
// which was an unnecessary extra setup step that isn't actually needed.
function optionalProjectId(): string | undefined {
  return process.env.BROWSERBASE_PROJECT_ID || undefined
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
// the first place. Proxies default ON — this is exactly the "bypass basic
// bot detection" capability the paid plan exists for, and FanDuel/BetMGM
// are the sites most likely to actually need it; pass proxies:false to
// disable for a specific call if it turns out not to be needed there.
export async function openSession(opts: { contextId?: string; stealth?: boolean; proxies?: boolean } = {}): Promise<BBSession> {
  const bb = client()
  const pid = optionalProjectId()
  const session = await bb.sessions.create({
    ...(pid ? { projectId: pid } : {}),
    proxies: opts.proxies ?? true,
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
export async function createPersistentContext(navigateUrl = 'https://app.pikkit.com/leagues/mlb'): Promise<{ contextId: string; liveViewUrl: string }> {
  const bb = client()
  const pid = optionalProjectId()
  const context = await bb.contexts.create(pid ? { projectId: pid } : {})
  const session = await bb.sessions.create({
    ...(pid ? { projectId: pid } : {}),
    keepAlive: true,
    browserSettings: { context: { id: context.id, persist: true } },
  })
  // The Live View has no address bar — it's just a viewport onto whatever
  // page the remote browser is already on. Without navigating it first, the
  // admin opens Live View to a dead-end about:blank tab with no way to reach
  // Pikkit's login screen. Navigate here, then hand off the Live View URL.
  // Deliberately not closing this Playwright/CDP connection afterward —
  // doing so would tear down the remote session before the admin gets a
  // chance to log in. The connection just drops when this function returns;
  // the Browserbase-hosted browser (keepAlive: true) keeps running on its own.
  const browser: Browser = await chromium.connectOverCDP(session.connectUrl)
  const bctx = browser.contexts()[0] ?? await browser.newContext()
  const page = bctx.pages()[0] ?? await bctx.newPage()
  await page.goto(navigateUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})
  const live = await bb.sessions.debug(session.id)
  return { contextId: context.id, liveViewUrl: live.debuggerFullscreenUrl }
}
