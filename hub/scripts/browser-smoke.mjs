import { chromium } from 'playwright-core'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
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
  await verifyPage(desktop, '/auth/login', 'Sign in')
  await verifyPage(desktop, '/pricing', 'Ultimate')
  await verifyProtectedPage(desktop, '/creators/apply')
  await verifyProtectedPage(desktop, '/feed')
  await verifyProtectedPage(desktop, '/settings/security')
  await desktop.close()

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  })
  await verifyPage(mobile, '/auth/login', 'Sign in', { label: 'mobile', checkOverflow: true })
  await verifyPage(mobile, '/pricing', 'Ultimate', { label: 'mobile', checkOverflow: true })
  await verifyProtectedPage(mobile, '/creators/apply', { label: 'mobile' })
  await verifyProtectedPage(mobile, '/feed', { label: 'mobile' })
  await mobile.close()
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
