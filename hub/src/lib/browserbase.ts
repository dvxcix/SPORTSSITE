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

const BROWSERBASE_REGION = 'us-east-1' as const
const PIKKIT_MANUAL_AUTH_TIMEOUT_SECONDS = 60 * 60
const PIKKIT_CONTEXT_REUSE_MS = 12 * 60 * 60 * 1000

function pikkitGeoState(): string | undefined {
  const value = process.env.PIKKIT_BROWSER_GEO_STATE?.trim().toUpperCase()
  return value && /^[A-Z]{2}$/.test(value) ? value : undefined
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
// NOTE: opts.stealth maps to Browserbase's `advancedStealth` session flag,
// which turned out to BE "Verified" mode itself, not a lesser included
// tier of it — confirmed live: passing it 403s with "Verified mode is only
// available on the Enterprise plan" on this Startup-plan project. Don't
// pass stealth:true from anywhere until/unless the plan changes.
// geoState (2-letter US state code) requests a proxy IP physically located
// in that state via Browserbase's proxy geolocation config — needed for
// state-gated regulated sportsbooks (BetMGM's nc.betmgm.com only serves
// real odds to what it believes is a North Carolina IP; a generic proxy
// location reads as out-of-state and the page body never renders real
// content). Overrides the plain proxies:true/false default when set.
//
// region is hardcoded to us-east-1 — Browserbase's own docs call region
// localization "the most impactful" latency lever, citing an 8-9x gain,
// and we were never setting it at all (defaulting away from wherever
// Vercel actually runs these functions from — iad1, US East). Every CDP
// round-trip for every click/goto/evaluate crosses the country otherwise;
// since session cost bills by duration, that's paying for cross-country
// latency on every single one of these scrapes for no reason.
//
// metadata is opt-in session tagging (book, mode, gamePk) — shows up in
// Browserbase's own dashboard/Usage API so cost can be broken down by
// which book/workflow is actually driving spend, per their own guidance
// on measuring usage.
export async function openSession(opts: { contextId?: string; stealth?: boolean; proxies?: boolean; geoState?: string; metadata?: Record<string, unknown> } = {}): Promise<BBSession> {
  const bb = client()
  const pid = optionalProjectId()
  const proxies = opts.geoState
    ? [{ type: 'browserbase' as const, geolocation: { country: 'US', state: opts.geoState } }]
    : (opts.proxies ?? true)
  const session = await bb.sessions.create({
    ...(pid ? { projectId: pid } : {}),
    region: BROWSERBASE_REGION,
    proxies,
    browserSettings: {
      ...(opts.contextId ? { context: { id: opts.contextId, persist: true } } : {}),
      ...(opts.stealth ? { advancedStealth: true } : {}),
    },
    ...(opts.metadata ? { userMetadata: opts.metadata } : {}),
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

// Pikkit's manual authentication and every later context resume must use
// the same Browserbase identity posture. In particular, do not mint the
// authenticated context in Browserbase's default west/no-proxy session and
// then resume it from east/proxied scraper sessions. That abrupt network and
// region change is especially hostile to security-sensitive login sessions.
// Set PIKKIT_BROWSER_GEO_STATE to a two-letter state code only when a stable
// state is important; otherwise both setup and reuse use Browserbase's
// managed proxy in us-east-1.
export async function openPikkitSession(contextId: string, metadata: Record<string, unknown> = {}): Promise<BBSession> {
  return openSession({
    contextId,
    geoState: pikkitGeoState(),
    metadata: { book: 'pikkit', ...metadata },
  })
}

// One-time setup, not called by the scrapers themselves — run this once
// (e.g. from a scratch script) to mint a durable Browserbase context, then
// open the returned Live View URL and sign into Pikkit yourself inside it.
// Browserbase persists that session's cookies against contextId afterward,
// so every future openSession({ contextId }) call for Pikkit starts already
// logged in. No password is ever read, stored, or typed by this codebase —
// you do the actual sign-in by hand, once, in the Live View.
export type PersistentContextSetup = {
  contextId: string
  sessionId: string
  liveViewUrl: string
  region: typeof BROWSERBASE_REGION
  proxyMode: 'managed' | 'geolocated'
  expiresAt: string
  continuity: 'running-session' | 'persisted-context' | 'new-context'
}

function isPikkitManualAuthSession(session: {
  contextId?: string
  userMetadata?: Record<string, unknown>
}): boolean {
  return Boolean(
    session.contextId
      && session.userMetadata?.book === 'pikkit'
      && session.userMetadata?.mode === 'manual-auth',
  )
}

function newestFirst<T extends { updatedAt: string }>(sessions: T[]): T[] {
  return [...sessions].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  )
}

// Pikkit and Cloudflare should see one durable browser identity throughout
// the human login flow. Repeatedly minting a new context for every retry
// changes the browser storage and proxy session at exactly the point where
// Cloudflare is trying to establish trust. Reuse a still-running manual
// session first; otherwise resume the most recent persisted context.
async function findPikkitManualAuthIdentity(bb: Browserbase): Promise<{
  running?: Awaited<ReturnType<typeof bb.sessions.list>>[number]
  contextId?: string
}> {
  const running = newestFirst(
    (await bb.sessions.list({ status: 'RUNNING' })).filter(isPikkitManualAuthSession),
  )[0]
  if (running?.contextId) return { running, contextId: running.contextId }

  const cutoff = Date.now() - PIKKIT_CONTEXT_REUSE_MS
  const recent = newestFirst(
    (await bb.sessions.list()).filter((session) => (
      isPikkitManualAuthSession(session)
        && Date.parse(session.updatedAt) >= cutoff
    )),
  )[0]
  return recent?.contextId ? { contextId: recent.contextId } : {}
}

export async function createPersistentContext(
  navigateUrl = 'https://app.pikkit.com/leagues/mlb',
  options: { fresh?: boolean } = {},
): Promise<PersistentContextSetup> {
  const bb = client()
  const pid = optionalProjectId()
  const geoState = pikkitGeoState()
  const proxies = geoState
    ? [{ type: 'browserbase' as const, geolocation: { country: 'US', state: geoState } }]
    : true
  const existing = options.fresh ? {} : await findPikkitManualAuthIdentity(bb)
  if (existing.running?.contextId) {
    const live = await bb.sessions.debug(existing.running.id)
    return {
      contextId: existing.running.contextId,
      sessionId: existing.running.id,
      liveViewUrl: live.debuggerFullscreenUrl,
      region: BROWSERBASE_REGION,
      proxyMode: geoState ? 'geolocated' : 'managed',
      expiresAt: existing.running.expiresAt,
      continuity: 'running-session',
    }
  }

  const contextId = existing.contextId
    ?? (await bb.contexts.create(pid ? { projectId: pid } : {})).id
  const session = await bb.sessions.create({
    ...(pid ? { projectId: pid } : {}),
    region: BROWSERBASE_REGION,
    proxies,
    keepAlive: true,
    timeout: PIKKIT_MANUAL_AUTH_TIMEOUT_SECONDS,
    browserSettings: {
      context: { id: contextId, persist: true },
      // This session is deliberately handed to a human in Live View. Do not
      // let Browserbase's automatic CAPTCHA interaction compete with the
      // admin while Cloudflare is asking for an ordinary manual verification.
      solveCaptchas: false,
    },
    userMetadata: { book: 'pikkit', mode: 'manual-auth' },
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
  return {
    contextId,
    sessionId: session.id,
    liveViewUrl: live.debuggerFullscreenUrl,
    region: BROWSERBASE_REGION,
    proxyMode: geoState ? 'geolocated' : 'managed',
    expiresAt: session.expiresAt,
    continuity: existing.contextId ? 'persisted-context' : 'new-context',
  }
}
