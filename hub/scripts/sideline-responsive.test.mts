// Run the local fixture first: npx tsx scripts/sideline-responsive-fixture.mts
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const output = resolve('.artifacts/sideline-responsive')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [360, 390, 549, 768, 1024, 1440, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024, isMobile: width < 768 })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:4187')
    await page.getByRole('button', { name: 'TDs', exact: true }).click()
    const tables = page.locator('table').filter({ has: page.getByRole('button', { name: 'Player, team and position', exact: true }) })
    await tables.first().waitFor()
    assert.equal(await tables.count(), 2)
    const checkGeometry = async () => {
      const failures = await page.evaluate(() => {
        const failures: string[] = []
        if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('page overflow')
        document.querySelectorAll('table tbody tr').forEach(row => {
          const cell = row.querySelector('td')
          if (!cell || !cell.querySelector('button[aria-label^="Compare"]')) return
          const rect = cell.getBoundingClientRect()
          const buttons = [...cell.querySelectorAll('button')]
          buttons.forEach(button => {
            const b = button.getBoundingClientRect()
            if (b.left < rect.left - 1 || b.right > rect.right + 1 || b.top < rect.top - 1 || b.bottom > rect.bottom + 1) failures.push('player control outside cell')
          })
          for (let a = 0; a < buttons.length; a++) for (let b = a + 1; b < buttons.length; b++) {
            const x = buttons[a].getBoundingClientRect(), y = buttons[b].getBoundingClientRect()
            if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) failures.push('player controls overlap')
          }
          const name = cell.querySelector('button b') as HTMLElement
          if (name.scrollWidth > name.clientWidth + 1) failures.push('player name clipped')
        })
        document.querySelectorAll('button[aria-label$="watchlist"]').forEach(button => {
          const cell = button.closest('td')
          if (!cell) return
          const parent = button.parentElement!
          const a = button.getBoundingClientRect(), c = cell.getBoundingClientRect()
          if (a.left < c.left || a.right > c.right || a.top < c.top || a.bottom > c.bottom) failures.push('favorite outside cell')
          parent.querySelectorAll('b,small').forEach(text => {
            const b = text.getBoundingClientRect()
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) failures.push('favorite overlaps odds')
            if (text.scrollWidth > text.clientWidth + 1) failures.push('odds clipped')
          })
        })
        return [...new Set(failures)]
      })
      assert.deepEqual(failures, [], width + ': geometry')
    }
    await checkGeometry()
    const slider = page.getByRole('slider', { name: 'Market Story capture' })
    await slider.fill('0')
    await page.getByText('OPENING CAPTURE', { exact: true }).waitFor()
    await slider.fill('2')
    await page.getByText('CURRENT', { exact: true }).waitFor()
    const saved = page.getByRole('button', { name: 'Add Bijan Robinson First TD fanduel to watchlist', exact: true })
    await saved.click()
    assert.equal(await page.getByRole('button', { name: 'Remove Bijan Robinson First TD fanduel from watchlist', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Compare Bijan Robinson', exact: true }).click()
    await tables.first().evaluate(table => { table.parentElement!.scrollLeft = 550 })
    await checkGeometry()
    await tables.first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(output, width + '-td-scrolled.png') })
    await tables.first().evaluate(table => { table.parentElement!.scrollLeft = 0 })
    await tables.first().scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, 150))
    if (width <= 1024) {
      const dock = await page.locator('.ss-mobile-dock').boundingBox()
      const story = await slider.locator('..').boundingBox()
      assert.ok(dock && story && story.y + story.height <= dock.y, width + ': story/nav overlap')
      assert.ok(story!.y > 750, width + ': story not bottom docked')
      assert.equal(await page.getByRole('navigation', { name: 'NFL board column groups' }).evaluate(el => getComputedStyle(el).position), 'static')
    }
    await page.screenshot({ path: resolve(output, width + '-td.png') })
    for (const view of ['Game Day', 'Props', 'Usage', 'Tracking', 'Team', 'All']) {
      await page.getByRole('button', { name: view, exact: true }).first().click()
      await checkGeometry()
    }
    assert.deepEqual(errors, [], width + ': browser errors')
    console.log(width + 'px PASS: all views, containment, timeline, favorite, compare, scroll')
    await context.close()
  }
} finally { await browser.close() }
