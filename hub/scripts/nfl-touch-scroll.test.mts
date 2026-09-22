import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

// Use production CSS with a long/wide table; exercise native touch input, not scrollTop assignments.
const browser = await chromium.launch()
try {
  for (const width of [375, 768, 1100]) for (const [file, className] of [
    ['sidelineCheatsheets.module.css', 'tableWrap'], ['ladderBoard.module.css', 'scroll'], ['sidelineBoard.module.css', 'tableScroller'],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, isMobile: true, hasTouch: true })
    const css = readFileSync(`src/app/the-sideline/${file}`, 'utf8')
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}*{box-sizing:border-box}body{margin:0}header,footer{height:400px}table{width:1800px!important}td{height:70px!important;min-width:120px}th{height:40px}</style><header>Page above</header><section class="panel"><div class="${className}"><table><thead><tr><th>Player</th><th>Market</th></tr></thead><tbody>${Array.from({ length: 30 }, (_, i) => `<tr><td>Player ${i}</td><td>Market ${i}</td></tr>`).join('')}</tbody></table></div></section><footer>Page below</footer>`)
    const cdp = await page.context().newCDPSession(page)
    const swipe = async (x: number, y: number, dx: number, dy: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] })
        await page.waitForTimeout(20)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(400)
    }
    const scroller = page.locator('.' + className)
    assert.equal(await scroller.evaluate(el => getComputedStyle(el).overscrollBehaviorY), 'auto')
    assert.equal(await scroller.evaluate(el => el.scrollHeight - el.clientHeight < 3), true)
    await swipe(width / 2, 720, 0, -260)
    const down = await page.evaluate(() => scrollY)
    assert(down > 100, `${file} ${width}: vertical swipe inside table did not move page`)
    await swipe(width - 45, 600, -(width - 100), 0)
    assert(await scroller.evaluate(el => el.scrollLeft) > 30, `${file}: horizontal swipe failed`)
    const right = await scroller.evaluate(el => el.scrollLeft)
    await swipe(45, 600, width - 100, 0)
    assert(await scroller.evaluate(el => el.scrollLeft) < right, `${file}: reverse horizontal swipe failed`)
    const beforeUp = await page.evaluate(() => scrollY)
    await swipe(width / 2, 320, 0, 280)
    assert(await page.evaluate(() => scrollY) < beforeUp - 50, `${file}: cannot swipe back out`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    console.log(`${width}px ${file}: native up/down/left/right swipe and page escape PASS`)
    await page.close()
  }
} finally { await browser.close() }
