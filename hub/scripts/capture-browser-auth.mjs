import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputPath = resolve(process.env.SMOKE_AUTH_STORAGE || '.auth/smoke-state.json')

await mkdir(dirname(outputPath), { recursive: true })
const browser = await chromium.launch({ executablePath: edgePath, headless: false })
const context = await browser.newContext({ colorScheme: 'dark' })
const page = await context.newPage()

console.log('Complete sign-in in the browser window. Credentials and tokens are never printed.')
await page.goto(`${baseUrl}/auth/login?next=/feed`, { waitUntil: 'domcontentloaded', timeout: 30_000 })

try {
  await page.waitForURL(url => !url.pathname.startsWith('/auth/'), { timeout: 10 * 60_000 })
  await context.storageState({ path: outputPath })
  console.log(`Authenticated browser state saved locally to ${outputPath}`)
} catch {
  console.error('Sign-in was not completed within ten minutes. No reusable browser state was confirmed.')
  process.exitCode = 1
} finally {
  await browser.close()
}
