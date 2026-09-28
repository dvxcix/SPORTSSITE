import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

// Real production stylesheet and the Run Gaps header structure; no live data.
const bundle = await build({
  stdin: { contents: 'import s from "./src/app/the-sideline/sidelineCheatsheets.module.css";window.cardStyles=s', resolveDir: process.cwd() },
  bundle: true, write: false, outdir: '.artifacts/gap-cards', platform: 'browser',
})
const css = bundle.outputFiles.find(f => f.path.endsWith('.css'))!.text
const js = bundle.outputFiles.find(f => f.path.endsWith('.js'))!.text
const source = readFileSync('src/app/the-sideline/SidelineCheatsheets.tsx', 'utf8')
assert(source.includes('className={styles.gapTitle}'))
assert(source.includes('aria-label={`Rank ${index + 1}`}'))
mkdirSync('.artifacts/gap-cards', { recursive: true })
const browser = await chromium.launch()
try {
  for (const width of [320, 390, 549, 768, 1100, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#060a0f}' + css + '</style>')
    await page.addScriptTag({ content: js })
    await page.evaluate(() => {
      const s = (window as any).cardStyles
      document.body.innerHTML = '<main class="' + s.root + '"><section class="' + s.cards + '">' +
        [1, 2, 12].map(n => '<article style="--team:#e95420"><header><span class="' + s.teamBadge + '"><i>CHI</i><b>CHI</b></span><div class="' + s.gapTitle + '"><span>Middle Runs</span><strong>+61.9 Edge</strong></div><span class="' + s.cardRank + '" aria-label="Rank ' + n + '">' + n + '</span></header><div class="' + s.gapMetrics + '"><span><b>6.4</b><small>CHI YPC</small></span><span><b>7.9</b><small>PHI Allowed YPC</small></span><span><b>64.7%</b><small>Success</small></span><span><b>17.6%</b><small>Explosive</small></span></div></article>').join('') + '</section></main>'
    })
    for (const badge of await page.locator('[aria-label^="Rank "]').all()) {
      const result = await badge.evaluate(el => {
        const r = el.getBoundingClientRect()
        const header = el.parentElement!.getBoundingClientRect()
        const title = el.previousElementSibling!.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(el)
        const text = range.getBoundingClientRect()
        return {
          display: getComputedStyle(el).display,
          dx: Math.abs((text.left + text.right - r.left - r.right) / 2),
          dy: Math.abs((text.top + text.bottom - r.top - r.bottom) / 2),
          fits: r.right <= header.right && r.left >= title.right && title.width > 100,
        }
      })
      assert.equal(result.display, 'grid', 'header span styles must not override rank centering')
      assert(result.dx < 2 && result.dy < 3, JSON.stringify(result))
      assert(result.fits, 'rank must sit after title without overlap or clipping')
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow')
    await page.screenshot({ path: '.artifacts/gap-cards/' + width + '.png' })
    console.log(width + 'px: ranks centered, right-aligned, no overlap/overflow')
    await page.close()
  }
} finally { await browser.close() }
