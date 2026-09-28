// Run sideline-responsive-fixture.mts first. Synthetic UI only; no live account writes.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

mkdirSync('.artifacts/nfl-navigation', { recursive: true })
const browser = await chromium.launch()
try {
  for (const width of [360, 390, 549, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width <= 1024 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:' + (process.env.SIDELINE_FIXTURE_PORT ?? 4187) + '/navigation')
    await page.getByRole('region', { name: 'NFL workspace' }).waitFor()
    const issues = await page.getByRole('region', { name: 'NFL workspace' }).evaluate(shell => {
      const issues: string[] = []
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page overflow')
      for (const control of shell.querySelectorAll('select, button')) {
        const bounds = control.getBoundingClientRect()
        if (bounds.height < 44) issues.push('small touch target')
        if (bounds.left < 0 || bounds.right > innerWidth + 1) issues.push('control outside viewport')
      }
      for (const label of shell.querySelectorAll('[class*="matchupCenter"] small')) {
        if (parseFloat(getComputedStyle(label).fontSize) < 11) issues.push('game time too small')
        if (label.scrollWidth > label.clientWidth + 1) issues.push('game time clipped')
      }
      return issues
    })
    assert.deepEqual(issues, [], width + 'px geometry')
    const links = page.getByRole('navigation', { name: 'NFL tools' }).getByRole('link')
    assert.equal(await links.count(), 5)
    for (const link of await links.all()) {
      const url = new URL((await link.getAttribute('href'))!, 'https://www.slipsurge.com')
      assert.equal(url.searchParams.get('game'), 'fixture')
      assert.equal(url.searchParams.get('sample'), 'regular')
    }
    await page.getByRole('combobox', { name: 'NFL week' }).focus()
    assert.equal(await page.getByRole('combobox', { name: 'NFL week' }).evaluate(el => document.activeElement === el), true)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: '.artifacts/nfl-navigation/' + width + '.png' })
    console.log(width + 'px PASS: navigation bounds, readable game time, touch targets, contextual links')
    await page.close()
  }
} finally {
  await browser.close()
}
