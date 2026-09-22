const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright-core')

const component = fs.readFileSync(path.join(__dirname, '../src/components/dugout/DugoutClient.tsx'), 'utf8')
const css = fs.readFileSync(path.join(__dirname, '../src/components/dugout/PlayerRow.module.css'), 'utf8')
assert.ok(component.includes('dg-player-matrix-matches ${playerRowStyles.matrixMatches}'))
assert.ok(component.includes('matrix_matches: (player.matrixMatches ?? [])'))
assert.ok(!component.includes('.dg-player-matrix-matches{'), 'No page-only badge styles')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const width of [375, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      // Direct Recap load: only the shared stylesheet, never Dugout page styles.
      await page.setContent(`<style>
        :root{--border:#26303b;--surface-2:#121820}*{box-sizing:border-box}
        ${css}
        </style><div class="actions"><button>Save</button><button>Details</button>
        <span class="matrixMatches" aria-label="2 Matrix matches">
        <span aria-label="Power" style="background:#b6ff3b"></span>
        <span aria-label="Contact" style="background:#a855f7"></span>
        </span></div>`)
      const dots = await page.locator('.matrixMatches > span').evaluateAll(elements =>
        elements.map(el => {
          const box = el.getBoundingClientRect()
          return { width: box.width, height: box.height, color: getComputedStyle(el).backgroundColor }
        }))
      assert.deepEqual(dots, [
        { width: 7, height: 7, color: 'rgb(182, 255, 59)' },
        { width: 7, height: 7, color: 'rgb(168, 85, 247)' },
      ], 'Visible matrix colors on direct Recap load at ' + width)
      await page.close()
    }
    console.log('PASS: direct Recap matrix markers visible at mobile, tablet and desktop widths')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
