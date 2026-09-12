import { chromium } from 'playwright-core'

const productionTarget = process.argv.includes('--production')
const baseUrl = (
  process.env.SMOKE_BASE_URL
  || (productionTarget ? 'https://www.slipsurge.com' : 'http://127.0.0.1:3000')
).replace(/\/$/, '')
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const isLocalTarget = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl)

const browser = await chromium.launch({ executablePath: edgePath, headless: true })
const failures = []

function excerpt(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220)
}

async function verifyPage(context, path, expectedText, options = {}) {
  const page = await context.newPage()
  const routeFailures = []
  const label = options.label ? `${options.label} ${path}` : path

  page.on('pageerror', error => routeFailures.push(`browser error: ${error.message}`))

  try {
    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    const status = response?.status() ?? 0

    if (expectedText) {
      try {
        await page.getByText(expectedText, { exact: false }).first().waitFor({
          state: 'visible',
          timeout: 10_000,
        })
      } catch {
        const body = await page.locator('body').innerText()
        routeFailures.push(
          `expected visible text "${expectedText}"; final URL ${page.url()}; body "${excerpt(body)}"`,
        )
      }
    }

    const body = (await page.locator('body').innerText()).trim()
    const hasOverlay = await page
      .locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
      .count()

    if (status >= 500 || status === 0) routeFailures.push(`HTTP ${status}`)
    if (body.length < 40) routeFailures.push('rendered body is unexpectedly empty')
    if (hasOverlay) routeFailures.push('framework error overlay is visible')

    if (options.checkOverflow) {
      const overflow = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }))
      if (overflow.content > overflow.viewport + 2) {
        routeFailures.push(`horizontal overflow ${overflow.content}px > ${overflow.viewport}px viewport`)
      }
    }

    if (routeFailures.length) {
      failures.push(...routeFailures.map(message => `${label}: ${message}`))
      console.error(`FAIL ${label} (${status})`)
    } else {
      console.log(`PASS ${label} (${status})`)
    }
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`FAIL ${label}`)
  } finally {
    await page.close()
  }
}

async function verifyProtectedPage(context, path, options = {}) {
  const page = await context.newPage()
  const label = options.label ? `${options.label} ${path}` : path

  try {
    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    const finalUrl = page.url()
    if ((response?.status() ?? 0) >= 500 || !finalUrl.includes('/auth/login')) {
      failures.push(`${label}: signed-out visitor was not redirected to login (${finalUrl})`)
      console.error(`FAIL ${label} access protection`)
    } else {
      console.log(`PASS ${label} protects signed-out access`)
    }
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`FAIL ${label}`)
  } finally {
    await page.close()
  }
}

async function runInBatches(items, size, worker) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker))
  }
}

try {
  const request = await browser.newContext()
  const healthResponse = await request.request.get(`${baseUrl}/api/health`)
  const health = await healthResponse.json()
  if (isLocalTarget && health.status === 'degraded' && health.database === 'unavailable') {
    console.log(`SKIP /api/health database reachability in local sandbox (${health.latencyMs}ms)`)
  } else if (!healthResponse.ok() || health.status !== 'ok' || health.database !== 'reachable') {
    failures.push(`/api/health: unhealthy response ${JSON.stringify(health)}`)
    console.error(`FAIL /api/health (${healthResponse.status()})`)
  } else {
    console.log(`PASS /api/health (${healthResponse.status()}, ${health.latencyMs}ms DB)`)
  }
  await request.close()

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
  })
  await runInBatches([
    ['/auth/login', 'Sign in'], ['/auth/register', 'Create'], ['/auth/forgot-password', 'Reset'], ['/pricing', 'Ultimate'], ['/creators/apply', 'Give your audience more'],
    ['/creators', 'Find the people behind the edge'], ['/blog', 'Blog'], ['/about', 'SlipSurge'],
    ['/faq', 'Is SlipSurge a sportsbook?'], ['/support', 'Support'], ['/responsible-gambling', 'Responsible'],
    ['/privacy', 'Privacy'], ['/terms', 'Terms'],
  ], 4, ([path, expected]) => verifyPage(desktop, path, expected, { checkOverflow: true }))
  await runInBatches([
    '/feed', '/explore', '/leaderboard', '/messages', '/notifications', '/bookmarks', '/settings', '/settings/profile', '/settings/account', '/settings/security', '/settings/privacy', '/settings/notifications', '/settings/blocked', '/settings/membership',
    '/community', '/channels', '/groups', '/forum', '/pages', '/events', '/marketplace', '/dugout', '/the-sideline',
    '/the-public', '/daily-recap', '/research', '/weather-lab',
  ], 4, path => verifyProtectedPage(desktop, path))
  await desktop.close()

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })
  await runInBatches([
    ['/auth/login', 'Sign in'], ['/auth/register', 'Create'], ['/auth/forgot-password', 'Reset'], ['/pricing', 'Ultimate'], ['/creators/apply', 'Give your audience more'],
    ['/creators', 'Find the people behind the edge'], ['/blog', 'Blog'], ['/about', 'SlipSurge'],
    ['/faq', 'Is SlipSurge a sportsbook?'], ['/support', 'Support'],
  ], 4, ([path, expected]) => verifyPage(mobile, path, expected, { label: 'mobile', checkOverflow: true }))
  await runInBatches([
    '/feed', '/messages', '/notifications', '/bookmarks', '/settings', '/settings/profile', '/settings/account', '/settings/security', '/settings/privacy', '/settings/notifications', '/settings/blocked', '/settings/membership', '/community', '/channels', '/groups', '/forum', '/pages',
    '/events', '/marketplace', '/dugout', '/the-sideline', '/the-public',
  ], 4, path => verifyProtectedPage(mobile, path, { label: 'mobile' }))
  await mobile.close()

  const fold = await browser.newContext({
    viewport: { width: 884, height: 1104 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })
  await runInBatches([
    ['/auth/login', 'Sign in'], ['/auth/register', 'Create'], ['/auth/forgot-password', 'Reset'], ['/pricing', 'Ultimate'], ['/creators', 'Find the people behind the edge'],
  ], 3, ([path, expected]) => verifyPage(fold, path, expected, { label: 'fold', checkOverflow: true }))
  await runInBatches([
    '/feed', '/settings', '/settings/profile', '/settings/account', '/settings/security', '/settings/privacy', '/settings/notifications', '/settings/blocked', '/settings/membership', '/community', '/channels', '/groups', '/forum', '/pages', '/events', '/marketplace', '/dugout',
    '/the-sideline', '/the-public',
  ], 3, path => verifyProtectedPage(fold, path, { label: 'fold' }))
  await fold.close()
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\nBrowser smoke failed (${failures.length}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('\nBrowser smoke passed.')
}
