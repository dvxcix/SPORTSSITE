import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch()
await mkdir('.artifacts/nfl-public-results', { recursive: true })
try {
  for (const width of [375, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4188')
    await page.getByRole('heading', { name: 'The Public · NFL' }).waitFor()
    const first = page.locator('article').first()
    assert.match(await first.innerText(), /Live · pending/)
    await first.locator('summary').click()
    assert.match(await first.innerText(), /Reached · live/)
    assert.doesNotMatch(await first.innerText(), /Miss · final/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `.artifacts/nfl-public-results/live-${width}.png`, fullPage: true })
    await page.goto('http://127.0.0.1:4188?final')
    await page.locator('article').first().waitFor()
    assert.match(await page.locator('article').first().innerText(), /Miss · final/)
    assert.match(await page.locator('article').nth(1).innerText(), /Hit ✓/)
    await page.getByRole('textbox', { name: 'Search' }).fill('Receiver Two')
    assert.equal(await page.locator('article').count(), 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, [])
    console.log(`${width}px: PASS live pending/reached, final hit/miss, ladder expansion, search, no overflow/errors`)
    await page.close()
  }
} finally { await browser.close() }
