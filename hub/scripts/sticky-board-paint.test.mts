import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import sharp from 'sharp'

// Actual CSS Modules, long synthetic tables. No network, auth or production data.
const bundle = await build({
  stdin: { contents: 'import nfl from "./src/app/the-sideline/sidelineBoard.module.css";import mlb from "./src/components/dugout/PlayerRow.module.css";window.paintStyles={nfl,mlb}', resolveDir: process.cwd() },
  bundle: true, write: false, outdir: '.artifacts/paint', platform: 'browser',
})
const css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!.text
const js = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text
mkdirSync('.artifacts/paint', { recursive: true })
const browser = await chromium.launch()
try {
  for (const width of [390, 768, 1100, 1440]) for (const sport of ['nfl', 'mlb']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style>')
    await page.addScriptTag({ content: js })
    await page.evaluate(({ sport }) => {
      const s = (window as any).paintStyles[sport]
      const style = document.createElement('style')
      style.textContent = '*{box-sizing:border-box}body{margin:0;background:#080d13;color:#fff;font:14px Arial;--bg:#06070a;--border:#253343}header{height:120px}footer{height:500px}#scroll{width:100%;overflow-x:auto;overflow-y:hidden;touch-action:pan-x pan-y pinch-zoom}table{table-layout:fixed;border-collapse:separate;border-spacing:0;width:3600px}td{height:84px;padding:6px;border-bottom:1px solid #253343}td:first-child{position:sticky;left:0;z-index:6;background:#080d13}button{color:#fff;background:#101923;border:1px solid #253343;padding:4px} .portrait{display:block;width:28px;height:28px;background:#29b6d4;border-radius:50%}'
      document.head.append(style)
      document.body.innerHTML = '<header>Scroll test</header><div id="scroll" class="' + (s.tableScroller ?? '') + '"><table class="' + (s.boardTable ?? '') + '"><colgroup><col style="width:250px">' + '<col style="width:120px">'.repeat(28) + '</colgroup><tbody>' +
        Array.from({ length: 60 }, (_, i) => '<tr><td class="' + (s.stickyCell ?? s.cell) + '"><div class="' + (s.playerCell ?? s.inner) + '"><span>' + (i + 1) + '</span><i class="portrait"></i><button><b>Player ' + i + '</b><small> WR · #80</small></button><button>+</button><button>⌄</button></div></td>' +
          Array.from({ length: 28 }, (_, c) => '<td style="background:' + (c % 2 ? '#612234' : '#195542') + '">+' + (100 + c * 80) + '<br>OPEN +950</td>').join('') + '</tr>').join('') + '</tbody></table></div><footer>End</footer>'
    }, { sport })
    const cell = page.locator('tbody tr').nth(2).locator('td').first()
    const inner = cell.locator('div').first()
    const policy = await cell.evaluate(el => {
      const s = getComputedStyle(el)
      return { isolation: s.isolation, transform: s.transform, contentVisibility: s.contentVisibility, background: s.backgroundColor }
    })
    assert.equal(policy.isolation, 'isolate')
    assert.notEqual(policy.transform, 'none', 'promote whole pinned cell, including its background')
    assert.equal(policy.contentVisibility, 'visible')
    assert.equal(await inner.evaluate(el => getComputedStyle(el).transform), 'none', 'no independently promoted name layer')
    const before = await cell.screenshot()
    const cdp = await page.context().newCDPSession(page)
    for (let cycle = 0; cycle < 12; cycle++) {
      await page.locator('#scroll').evaluate((el, n) => { el.scrollLeft = n % 2 ? 1500 : 480 }, cycle)
      await page.evaluate(n => window.scrollTo(0, n % 2 ? 2800 : 750), cycle)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    }
    // Real touch gestures begin on the frozen column and must still move the page.
    await page.evaluate(() => window.scrollTo(0, 0))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: 650 }] })
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 110, y: 650 - i * 30 }] })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(500)
    assert(await page.evaluate(() => scrollY) > 100, 'vertical swipe on pinned identity must not trap scrolling')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator('#scroll').evaluate(el => { el.scrollLeft = 1320 })
    await page.waitForTimeout(200)
    assert.equal(await cell.evaluate(el => {
      const r = el.getBoundingClientRect()
      return document.elementFromPoint(r.left + 8, r.top + 8)?.closest('td') === el
    }), true, 'odds must not overpaint/hijack the pinned column')
    const after = await cell.screenshot({ path: '.artifacts/paint/' + sport + '-' + width + '.png' })
    const a = await sharp(before).removeAlpha().raw().toBuffer()
    const b = await sharp(after).removeAlpha().raw().toBuffer()
    assert.equal(a.length, b.length, 'pinned cell geometry stays stable')
    let changed = 0
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 12) changed++
    assert(changed / a.length < .005, sport + ': pinned background/name pixels changed after scroll')
    console.log(sport + ' ' + width + ': whole-cell paint, repeated scroll, touch escape, occlusion and pixel comparison PASS')
    await page.close()
  }
} finally { await browser.close() }
