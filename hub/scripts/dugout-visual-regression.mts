import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright-core'

const baseUrl = process.env.DUGOUT_VISUAL_BASE_URL ?? 'http://127.0.0.1:3000'
const storageState = process.env.DUGOUT_VISUAL_STORAGE_STATE
const outputDir = resolve(process.cwd(), '.artifacts', 'dugout-visual')
mkdirSync(outputDir, { recursive: true })

async function assertDugout(page: Page, label: string) {
  await page.goto(`${baseUrl}/dugout`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.locator('.dugout-command-bar').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator('.dugout-dense-table').first().waitFor({ state: 'visible', timeout: 30_000 })

  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.ok(pageOverflow <= 2, `${label}: page shell overflows horizontally by ${pageOverflow}px`)

  const allButton = page.getByRole('button', { name: /^All \d+$/ }).first()
  const marketsButton = page.getByRole('button', { name: /^Market \d+$/ }).first()
  await allButton.waitFor({ state: 'visible' })
  const allHeaderCount = await page.locator('.dugout-dense-table tr').nth(1).locator('th').count()
  await marketsButton.click()
  const marketHeaderCount = await page.locator('.dugout-dense-table tr').nth(1).locator('th').count()
  assert.ok(marketHeaderCount > 1 && marketHeaderCount < allHeaderCount, `${label}: Markets preset did not reduce rendered columns`)
  await allButton.click()
  assert.equal(await page.locator('.dugout-dense-table tr').nth(1).locator('th').count(), allHeaderCount, `${label}: All preset did not restore the saved board`)

  const timeline = page.getByRole('slider', { name: 'Market history' })
  await timeline.waitFor({ state: 'visible' })
  const timelineMax = Number(await timeline.getAttribute('max'))
  assert.ok(Number.isFinite(timelineMax) && timelineMax >= 0, `${label}: market history slider is invalid`)
}

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const executablePath = process.env.DUGOUT_VISUAL_BROWSER || (existsSync(edgePath) ? edgePath : undefined)
const viewports = [
  { label: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { label: 'mobile-430x932', width: 430, height: 932, mobile: true },
  { label: 'tablet-768x1024', width: 768, height: 1024, mobile: false },
  { label: 'desktop-1440x1000', width: 1440, height: 1000, mobile: false },
  { label: 'wide-1920x1080', width: 1920, height: 1080, mobile: false },
] as const

const browser = await chromium.launch({ executablePath, headless: true })
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      storageState: storageState || undefined,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await assertDugout(page, viewport.label)
    if (viewport.mobile) {
      await page.getByRole('button', { name: 'Open all games' }).click()
      await page.getByRole('dialog').or(page.locator('.dugout-game-picker-sheet')).first().waitFor({ state: 'visible' })
      await page.screenshot({ path: resolve(outputDir, `${viewport.label}-game-sheet.png`), fullPage: true })
      await page.getByRole('button', { name: 'Close game picker' }).click()
    }
    await page.screenshot({ path: resolve(outputDir, `${viewport.label}-board.png`), fullPage: true })
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(`Dugout visual regression passed: ${outputDir}`)
