const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
require('tsx/cjs')
const css = []
require.extensions['.css'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const prefix = path.basename(filename).replace(/\W/g, '_') + '__'
  const names = Object.fromEntries([...source.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => [m[1], prefix + m[1]]))
  css.push(source.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + names[name]))
  module.exports = names
}
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MarketBaselineRead } = require('../src/components/dugout/MarketBaselineRead.tsx')
const row = require('../src/components/dugout/PlayerRow.module.css')
const { chromium } = require('playwright-core')
const source = fs.readFileSync(path.resolve(__dirname, '../src/components/dugout/DugoutClient.tsx'), 'utf8')
assert.ok(source.includes('playerRowStyles.cell') && source.includes('playerRowStyles.baseline'))
const legacy = [...source.matchAll(/<style jsx global>\{\x60([\s\S]*?)\x60\}<\/style>/g)].map(m => m[1]).join('\n')
const fixtures = [
  ['Tommy Pham', 750, 940, 1100, 1596],
  ['Christian Encarnacion-Strand', 790, 855, 1200, 1535],
  ['Petey Halpin', 1060, 829, 2200, 1766],
  ['Gabriel Moreno', 35000, 50000, 40000, 25000],
]
function content(pageStyles) {
  const rows = fixtures.map(([name, hr, hrBaseline, fhr, fhrBaseline]) => {
    const baseline = renderToStaticMarkup(React.createElement(MarketBaselineRead, {hr, hrBaseline, fhr, fhrBaseline, compact:true, className:'dg-player-baseline ' + row.baseline}))
    return '<tr><td class="dg-sticky-col '+row.cell+'"><div class="dg-player-cell-inner '+row.inner+'"><span>4 R</span><span style="width:34px;height:34px;background:#253243;border-radius:50%"></span><div class="dg-player-copy '+row.copy+'"><span class="dg-player-name '+row.name+'">'+name+'</span><small>DH · RHB</small></div><div class="dg-player-actions '+row.actions+'"><button class="dg-player-action"><span>☆</span><span>Save</span></button><button class="dg-player-action"><span>+</span><span>Compare</span></button><button class="dg-player-action dg-player-details-action"><span>Details</span><span>▼</span></button></div>'+baseline+'</div></td><td style="width:56px;min-width:56px">43</td><td style="width:100px;min-width:100px">+1100</td></tr>'
  }).join('')
  return '<style>:root{--bg:#06070a;--surface-2:#121820;--border:#26303b;--text-1:#f8fafc;--text-2:#cbd5e1;--accent:#b6ff3b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text-1);font-family:system-ui}td{border:1px solid #26303b;vertical-align:middle}'+pageStyles+'\n'+css.join('\n')+'</style><div class="daily-recap-board-scroll" style="overflow:auto;width:100%"><table class="dugout-dense-table" style="table-layout:fixed;border-collapse:collapse;width:max-content"><tbody>'+rows+'</tbody></table></div>'
}
;(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'})
  const output = path.resolve(__dirname, '../.artifacts/player-row')
  fs.mkdirSync(output, {recursive:true})
  try {
    for (const width of [375,390,430,768,1024,1440,1920]) {
      for (const mode of ['recap-only','dugout-and-recap']) {
        const page = await browser.newPage({viewport:{width,height:900}, reducedMotion:'reduce', hasTouch:width<=1024})
        await page.setContent(content(mode==='recap-only' ? '' : legacy))
        const errors = await page.evaluate(() => {
          const failures=[]
          const rect=e=>e.getBoundingClientRect()
          const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1
          for(const cell of document.querySelectorAll('td.dg-sticky-col')){
            const bounds=rect(cell)
            for(const el of cell.querySelectorAll('button,[data-market]')){
              const r=rect(el)
              if(r.left<bounds.left-1||r.right>bounds.right+1) failures.push('outside player cell: '+el.textContent)
            }
            const buttons=[...cell.querySelectorAll('button')]
            for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++)if(overlap(rect(buttons[i]),rect(buttons[j])))failures.push('overlapping buttons')
            for(const tile of cell.querySelectorAll('[data-market]')){
              const heading=tile.querySelector('b')
              const price=tile.querySelector('strong')
              if(overlap(rect(heading),rect(price)))failures.push('market label overlaps price')
              if(tile.scrollWidth>tile.clientWidth+1)failures.push('tile content clipped')
            }
          }
          return failures
        })
        assert.deepEqual(errors, [], width+' '+mode)
        if([390,768,1440].includes(width))await page.screenshot({path:path.join(output,width+'-'+mode+'.png')})
        await page.close()
      }
    }
    console.log('PASS: shared player layout and real HR/FHR component at 7 widths × 2 style contexts; screenshots: '+output)
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})

