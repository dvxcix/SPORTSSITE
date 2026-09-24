import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const browser = await chromium.launch()
try {
 for (const width of [360,390,549,768,1024,1280,1440,1920]) {
  const page = await browser.newPage({viewport:{width,height:1000}})
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:4187/props')
  const panel = page.getByRole('region',{name:'NFL full market ladders'})
  await panel.waitFor()
  assert.equal(await panel.getByText('Estimated pick distribution',{exact:true}).count(),0)
  assert.equal(await panel.getByText(/relative to displayed players/).count(),0)
  assert.equal(await page.getByLabel('Market',{exact:true}).locator('option:checked').textContent(),'Receiving Yards')
  assert.equal(await page.getByLabel('Sportsbook',{exact:true}).locator('option:checked').textContent(),'FanDuel')
  assert.ok(await page.getByLabel('Market',{exact:true}).locator('optgroup').count()>0)
  assert.equal(await page.getByLabel('Line Type',{exact:true}).isVisible(),false)
  await page.getByText('Display Options',{exact:true}).click()
  await page.getByLabel('Line Type',{exact:true}).selectOption('over_under')
  await page.getByLabel('Side',{exact:true}).selectOption('under')
  await page.getByLabel('Line Type',{exact:true}).selectOption('milestone')
  assert.equal(await page.getByLabel('Side',{exact:true}).count(),0)
  for (const value of ['move','ratio','picks','odds']) await page.getByLabel('Compare',{exact:true}).selectOption(value)
  await page.getByRole('button',{name:/^Score/}).click()
  assert.equal(await page.getByRole('columnheader',{name:/Score/}).getAttribute('aria-sort'),'descending')
  const problems = await page.evaluate(() => {
   const problems: string[] = []
   if(document.documentElement.scrollWidth>innerWidth+1) problems.push('page overflow')
   for(const el of document.querySelectorAll('select')) {
    const r=el.getBoundingClientRect()
    if(r.width && (r.left<0 || r.right>innerWidth || r.height<44)) problems.push('select bounds')
   }
   return problems
  })
  assert.deepEqual(problems,[])
  assert.deepEqual(errors,[])
  await page.getByText('Display Options',{exact:true}).click()
  await page.screenshot({path:'.artifacts/sideline-responsive/props-controls-'+width+'.png'})
  console.log(width+' PASS: labels, groups, controls, sorting, containment')
  await page.close()
 }
} finally {await browser.close()}
