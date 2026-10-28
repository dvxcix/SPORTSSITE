import Browserbase from '@browserbasehq/sdk'
import { chromium, type Browser, type Page } from 'playwright-core'
import { acquirePikkitBrowserLease } from '@/lib/pikkitBrowserLease'
import { reserveNbaBrowserBudget, checkNbaBrowserBudgetUsage } from '@/lib/nbaBrowserBudget'

// Thin wrapper around the Browserbase SDK + Playwright's CDP connection —
// every scraper (FanDuel/BetMGM/Pikkit) goes through this so session
// creation/teardown and context persistence (Pikkit's login) only exist in
// one place.

function client(requestTimeoutMs?: number): Browserbase {
  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) throw new Error('BROWSERBASE_API_KEY is not configured')
  return new Browserbase({ apiKey, ...(requestTimeoutMs ? { timeout: requestTimeoutMs, maxRetries: 0 } : {}) })
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
const AUTOMATED_SESSION_TIMEOUT_SECONDS = 5 * 60
const PIKKIT_MANUAL_AUTH_TIMEOUT_SECONDS = 60 * 60
const PIKKIT_CONTEXT_REUSE_MS = 12 * 60 * 60 * 1000
const RELEASE_REQUEST_TIMEOUT_MS = 4000
export const FANDUEL_PROXY_DOMAIN_PATTERN = '^([a-zA-Z0-9-]+\\.)*fanduel\\.com$'
export const BETMGM_PROXY_DOMAIN_PATTERN = '^([a-zA-Z0-9-]+\\.)*betmgm\\.com$'
export const PIKKIT_PROXY_DOMAIN_PATTERN = '^([a-zA-Z0-9-]+\\.)*(pikkit\\.com|pikkit\\.app|cloudflare\\.com)$'

let projectIdCache: string | undefined

async function resolveProjectId(bb: Browserbase, configured?: string): Promise<string> {
  if (configured) return configured
  if (projectIdCache) return projectIdCache
  const project = (await bb.projects.list())[0]
  if (!project) throw new Error('Browserbase project not found')
  projectIdCache = project.id
  return project.id
}


function pikkitGeoState(): string | undefined {
  // Pikkit is authenticated manually from North Carolina. Browserbase's
  // generic proxies:true is only a best-effort US location and may even use
  // Canada when capacity is tight, which makes one persisted login appear
  // to jump regions. Keep every manual and automated resume in NC unless an
  // explicit two-letter override is configured.
  const value = (process.env.PIKKIT_BROWSER_GEO_STATE || 'NC').trim().toUpperCase()
  return value && /^[A-Z]{2}$/.test(value) ? value : undefined
}

export type BBSession = {
  page: Page
  sessionId: string
  close: () => Promise<void>
}

type CloudSession = Awaited<ReturnType<Browserbase['sessions']['list']>>[number]

async function activeContextSessions(bb: Browserbase, contextId: string): Promise<CloudSession[]> {
  const lists = await Promise.all([
    bb.sessions.list({ status: 'RUNNING' }),
    bb.sessions.list({ status: 'PENDING' }),
  ])
  return lists.flat().filter(session => session.contextId === contextId)
}

async function boundedClose(browser: Browser): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      browser.close(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Browser disconnect timed out')), RELEASE_REQUEST_TIMEOUT_MS) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// A CDP disconnect alone is not proof that the remote session ended. Confirm
// completion before callers release the shared context lease and its sync gap.
// Keep failures generic: SDK errors can include credential-bearing URLs.
async function releasePersistentSession(bb: Browserbase, sessionId: string, projectId: string | undefined, browser?: Browser, persisted = true): Promise<void> {
  const unverified = () => new Error(persisted ? 'Persisted browser release could not be verified; retain the shared context lease' : 'Cloud browser release could not be verified')
  const [disconnect, release] = await Promise.allSettled([
    browser ? boundedClose(browser) : Promise.resolve(),
    bb.sessions.update(sessionId, { status: 'REQUEST_RELEASE', ...(projectId ? { projectId } : {}) }, { timeout: RELEASE_REQUEST_TIMEOUT_MS, maxRetries: 0 }),
  ])
  let status = release.status === 'fulfilled' ? release.value.status : undefined
  // Release may race the normal disconnect. A read can confirm completion
  // even if the release endpoint returned an already-ended session error.
  for (let attempt = 0; status !== 'COMPLETED' && attempt < 3; attempt++) {
    if (status === 'ERROR' || status === 'TIMED_OUT') break
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 750))
    try {
      status = (await bb.sessions.retrieve(sessionId, { timeout: 2000, maxRetries: 0 })).status
    } catch {
      throw unverified()
    }
  }
  if (status !== 'COMPLETED') throw unverified()
  if (disconnect.status === 'rejected' || release.status === 'rejected') {
    console.warn('[browserbase] teardown request failed, but remote completion was verified')
  }
}

// Opens a fresh Browserbase-hosted browser and connects Playwright to it.
// Pass `contextId` to resume a persisted, already-authenticated context
// (Pikkit) instead of starting logged out every run — see
// createPersistentContext() below for how that context gets its login in
// the first place. Proxies default OFF so a future caller cannot
// accidentally route an entire third-party page through metered residential
// bandwidth. Every sportsbook/auth workflow opts into a narrow domain rule.
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
export async function openSession(opts: { contextId?: string; stealth?: boolean; proxies?: boolean; geoState?: string; proxyDomainPattern?: string; timeoutSeconds?: number; requestTimeoutMs?: number; solveCaptchas?: boolean; verifyRelease?: boolean; metadata?: Record<string, unknown> } = {}): Promise<BBSession> {
  const timeoutSeconds = opts.timeoutSeconds ?? AUTOMATED_SESSION_TIMEOUT_SECONDS
  const nba = opts.metadata?.sport === 'nba'
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 450) {
    throw new Error('Automated browser timeout must be between 60 and 450 seconds')
  }
  // A retried session-create POST can leave two writers on one profile when
  // the first response was lost. Persisted launches use one bounded attempt.
  const bb = client(opts.requestTimeoutMs ?? (opts.contextId || nba ? 10000 : undefined))
  const configuredProjectId = optionalProjectId()
  const pid = await resolveProjectId(bb, configuredProjectId)
  if (opts.contextId && (await activeContextSessions(bb, opts.contextId)).length) {
    throw new Error('The persisted browser context is already in use; wait for its active session to finish')
  }
  const proxied = {
    type: 'browserbase' as const,
    ...(opts.geoState ? { geolocation: { country: 'US' as const, state: opts.geoState } } : {}),
    ...(opts.proxyDomainPattern ? { domainPattern: opts.proxyDomainPattern } : {}),
  }
  const proxies = opts.geoState
    ? [proxied, ...(opts.proxyDomainPattern ? [{ type: 'none' as const }] : [])]
    : opts.proxyDomainPattern
      ? [proxied, { type: 'none' as const }]
      : (opts.proxies ?? false)
  const proxyMode = opts.proxyDomainPattern ? 'domain-routed' : proxies ? 'full' : 'off'
  const userMetadata = Object.fromEntries(Object.entries({
    ...opts.metadata,
    proxyMode,
    region: BROWSERBASE_REGION,
  }).map(([key, value]) => [key, String(value)]))
  // Each partition reserves its own durable allowance BEFORE a paid create.
  // Unknown usage or a failed/ambiguous reservation must never allow a launch.
  const budgetInput = {
    projectId: pid,
    workflow: opts.metadata?.book === 'pikkit' ? 'public' as const : 'direct' as const,
    // Preserve the exact capture scope for admission and every active check.
    // The database alone decides whether a dated task allowance applies.
    ...(opts.metadata?.gameIds !== undefined ? { gameIds: opts.metadata.gameIds as readonly number[] } : {}),
    readUsage: () => bb.projects.usage(pid, { timeout: 5000, maxRetries: 0 }),
  }
  const reservation = nba ? await reserveNbaBrowserBudget({ ...budgetInput, timeoutSeconds }) : null
  if (reservation?.allowanceExpiresAt && Date.now() >= Date.parse(reservation.allowanceExpiresAt)) {
    throw new Error('NBA public task allowance expired before browser creation')
  }
  if (reservation) userMetadata.budgetReservation = reservation.id
  const session = await bb.sessions.create({
    ...(pid ? { projectId: pid } : {}),
    region: BROWSERBASE_REGION,
    timeout: timeoutSeconds,
    proxies,
    browserSettings: {
      blockAds: true,
      ...(nba ? { solveCaptchas: false } : opts.solveCaptchas == null ? {} : { solveCaptchas: opts.solveCaptchas }),
      ...(opts.contextId ? { context: { id: opts.contextId, persist: true } } : {}),
      ...(opts.stealth ? { advancedStealth: true } : {}),
    },
    userMetadata,
  })
  let browser: Browser | undefined
  let page: Page
  try {
    browser = opts.requestTimeoutMs ? await chromium.connectOverCDP(session.connectUrl, { timeout: opts.requestTimeoutMs }) : await chromium.connectOverCDP(session.connectUrl)
    const existingContext = browser.contexts()[0]
    if (!existingContext && opts.contextId) throw new Error('The persisted browser context was not restored')
    const context = existingContext ?? await browser.newContext()
    page = context.pages()[0] ?? await context.newPage()
  } catch (failure) {
    if (opts.contextId || opts.verifyRelease || nba) await releasePersistentSession(bb, session.id, pid, browser, !!opts.contextId)
    else {
      await browser?.close().catch(() => {})
      await bb.sessions.update(session.id, { status: 'REQUEST_RELEASE', ...(pid ? { projectId: pid } : {}) }).catch(() => {})
    }
    throw failure
  }
  const connectedBrowser = browser
  let closing: Promise<void> | undefined
  let monitorStopped = false
  let monitorTimer: ReturnType<typeof setTimeout> | undefined
  let budgetStopped = false
  const close = () => {
    monitorStopped = true
    if (monitorTimer) clearTimeout(monitorTimer)
    return closing ??= (async () => {
      if (opts.contextId || opts.verifyRelease || nba) {
        await releasePersistentSession(bb, session.id, pid, connectedBrowser, !!opts.contextId)
        if (budgetStopped) throw new Error('NBA browser stopped by its usage limit')
        return
      }
      await connectedBrowser.close().catch(() => {})
      await bb.sessions.update(session.id, {
        status: 'REQUEST_RELEASE', ...(pid ? { projectId: pid } : {}),
      }).catch(() => {})
    })()
  }
  // This stops further activity on unknown/exceeded provider usage. It is not
  // an invoice guarantee: already-transferred bytes and provider telemetry lag
  // cannot be undone. Permanent launch/runtime quotas bound repeated exposure.
  const monitor = async () => {
    try {
      if (reservation?.allowanceExpiresAt && Date.now() >= Date.parse(reservation.allowanceExpiresAt)) {
        throw new Error('NBA public task allowance expired')
      }
      await checkNbaBrowserBudgetUsage(budgetInput)
    } catch {
      if (!monitorStopped) {
        budgetStopped = true
        await close().catch(() => { console.warn('[browserbase] NBA usage stop requested; reservation retained') })
      }
    } finally {
      if (!monitorStopped) monitorTimer = setTimeout(() => { void monitor() }, 5000)
    }
  }
  if (nba) monitorTimer = setTimeout(() => { void monitor() }, 5000)
  return {
    page,
    sessionId: session.id,
    close,
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
export async function openPikkitSession(contextId: string, metadata: Record<string, unknown> = {}, options: { requestTimeoutMs?: number } = {}): Promise<BBSession> {
  return openSession({
    contextId,
    requestTimeoutMs: options.requestTimeoutMs,
    geoState: pikkitGeoState(),
    // Preserve one proxied identity for Pikkit and its Cloudflare challenge,
    // while analytics/CDN traffic bypasses the metered residential proxy.
    proxyDomainPattern: PIKKIT_PROXY_DOMAIN_PATTERN,
    metadata: { book: 'pikkit', ...metadata },
  })
}

// One-time setup, not called by the scrapers themselves — run this once
// (e.g. from a scratch script) to mint a durable Browserbase context, then
// open the returned Live View URL and sign into Pikkit yourself inside it.
// Browserbase persists that session's cookies against contextId afterward,
// so every future openSession({ contextId }) call for Pikkit starts already
// logged in. No password is ever read, stored, or typed by this codebase —
// you do the actual sign-in by hand in Live View whenever the site requires it.
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
  const configuredContext = process.env.PIKKIT_CONTEXT_ID?.trim()
  if (configuredContext) {
    // The configured context is the production identity, regardless of how
    // long ago its last manual login occurred. Never silently replace it.
    await bb.contexts.retrieve(configuredContext)
    const active = await activeContextSessions(bb, configuredContext)
    if (active.length > 1 || active.some(session => !isPikkitManualAuthSession(session))) {
      throw new Error('The configured context is in use by automation; retry manual setup after it finishes')
    }
    if (active[0]?.status === 'PENDING') throw new Error('Manual authentication is still starting; retry shortly')
    return { contextId: configuredContext, running: active[0] }
  }
  const running = newestFirst(
    (await bb.sessions.list({ status: 'RUNNING' })).filter(isPikkitManualAuthSession),
  )[0]
  if (running?.contextId) {
    const active = await activeContextSessions(bb, running.contextId)
    if (active.length !== 1) throw new Error('The manual browser context is already in use')
    return { running, contextId: running.contextId }
  }

  const cutoff = Date.now() - PIKKIT_CONTEXT_REUSE_MS
  const recent = newestFirst(
    (await bb.sessions.list()).filter((session) => (
      isPikkitManualAuthSession(session)
        && Date.parse(session.updatedAt) >= cutoff
    )),
  )[0]
  if (recent?.contextId && (await activeContextSessions(bb, recent.contextId)).length) {
    throw new Error('The manual browser context is already in use')
  }
  return recent?.contextId ? { contextId: recent.contextId } : {}
}

export async function createPersistentContext(
  navigateUrl = 'https://app.pikkit.com/leagues/mlb',
  options: { fresh?: boolean } = {},
): Promise<PersistentContextSetup> {
  const lease = await acquirePikkitBrowserLease()
  if (!lease) throw new Error('Shared browser setup is busy; retry after the current session finishes')
  let safeToReleaseLease = true
  try {
    const bb = client(10000)
    const pid = optionalProjectId()
    const geoState = pikkitGeoState()
    const proxies = [
      {
        type: 'browserbase' as const,
        domainPattern: PIKKIT_PROXY_DOMAIN_PATTERN,
        ...(geoState ? { geolocation: { country: 'US' as const, state: geoState } } : {}),
      },
      { type: 'none' as const },
    ]
    const existing = options.fresh ? {} : await findPikkitManualAuthIdentity(bb)
    const configuredContext = process.env.PIKKIT_CONTEXT_ID?.trim()
    if (options.fresh && configuredContext && (await activeContextSessions(bb, configuredContext)).length) {
      throw new Error('The configured context is in use; wait before starting a fresh manual login')
    }
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
    // An uncertain creation result can still leave a cloud browser running.
    // Retain the lease on that path instead of immediately permitting reuse.
    safeToReleaseLease = false
    const session = await bb.sessions.create({
      ...(pid ? { projectId: pid } : {}),
      region: BROWSERBASE_REGION,
      proxies,
      keepAlive: true,
      timeout: PIKKIT_MANUAL_AUTH_TIMEOUT_SECONDS,
      browserSettings: {
        blockAds: true,
        context: { id: contextId, persist: true },
        // This session is deliberately handed to a human in Live View. Do not
        // let Browserbase's automatic CAPTCHA interaction compete with the
        // admin while Cloudflare is asking for an ordinary manual verification.
        solveCaptchas: false,
      },
      userMetadata: { book: 'pikkit', sport: 'auth', mode: 'manual-auth', proxyMode: 'domain-routed', region: BROWSERBASE_REGION },
    })
    // The Live View has no address bar — it's just a viewport onto whatever
    // page the remote browser is already on. Without navigating it first, the
    // admin opens Live View to a dead-end about:blank tab with no way to reach
    // Pikkit's login screen. Navigate here, then hand off the Live View URL.
    // Disconnect CDP after preparing Live View. keepAlive explicitly preserves
    // the remote session for the human; a local JS reference is not its lifetime.
    let browser: Browser | undefined
    try {
      browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 10000 })
      const bctx = browser.contexts()[0]
      if (!bctx) throw new Error('The persisted browser context was not restored')
      const page = bctx.pages()[0] ?? await bctx.newPage()
      await page.goto(navigateUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      const live = await bb.sessions.debug(session.id)
      await boundedClose(browser)
      const ready = await bb.sessions.retrieve(session.id)
      if (ready.status !== 'RUNNING' || ready.contextId !== contextId) throw new Error('Manual authentication browser is not available')
      safeToReleaseLease = true
      return {
        contextId,
        sessionId: session.id,
        liveViewUrl: live.debuggerFullscreenUrl,
        region: BROWSERBASE_REGION,
        proxyMode: geoState ? 'geolocated' : 'managed',
        expiresAt: session.expiresAt,
        continuity: existing.contextId ? 'persisted-context' : 'new-context',
      }
    } catch (failure) {
      await releasePersistentSession(bb, session.id, pid, browser)
      safeToReleaseLease = true
      throw failure
    }
  } finally {
    if (safeToReleaseLease && !await lease.release()) {
      console.warn('[browserbase] manual setup lease release could not be confirmed; safety expiry remains enabled')
    }
  }
}
