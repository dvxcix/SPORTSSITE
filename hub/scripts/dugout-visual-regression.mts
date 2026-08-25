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
  const marketsButton = page.getByRole('button', { name: /^Markets \d+$/ }).first()
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
const browser = await chromium.launch({ executablePath, headless: true })
try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: storageState || undefined,
    reducedMotion: 'reduce',
  })
  const desktopPage = await desktop.newPage()
  await assertDugout(desktopPage, 'desktop')
  await desktopPage.screenshot({ path: resolve(outputDir, 'desktop.png'), fullPage: true })
  await desktop.close()

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: storageState || undefined,
    reducedMotion: 'reduce',
  })
  const mobilePage = await mobile.newPage()
  await assertDugout(mobilePage, 'mobile')
  await mobilePage.getByRole('button', { name: 'Open all games' }).click()
  await mobilePage.getByRole('dialog').or(mobilePage.locator('.dugout-game-picker-sheet')).first().waitFor({ state: 'visible' })
  await mobilePage.screenshot({ path: resolve(outputDir, 'mobile-game-sheet.png'), fullPage: true })
  await mobilePage.getByRole('button', { name: 'Close game picker' }).click()
  await mobilePage.screenshot({ path: resolve(outputDir, 'mobile-board.png'), fullPage: true })
  await mobile.close()
} finally {
  await browser.close()
}

console.log(`Dugout visual regression passed: ${outputDir}`)
