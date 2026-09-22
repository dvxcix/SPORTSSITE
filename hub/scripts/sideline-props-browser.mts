import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
const output = resolve('.artifacts/sideline-props')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch()
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({viewport:{width,height:900},hasTouch:width<1024})
    const errors: string[] = []
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto('http://127.0.0.1:4187/props')
    const header = (name:string) => page.getByRole('columnheader').filter({has:page.getByRole('button',{name,exact:false})})
    const rows = page.locator('tbody tr')
    const names = () => rows.locator('td:first-child b').allTextContents()
    for (const [label, descending, ascending] of [
      ['Score','Bijan Robinson','Brian Robinson Jr.'],
      ['MM','Bijan Robinson','Brian Robinson Jr.'],
      ['Picks','Brian Robinson Jr.','Olamide Zaccheaus'],
      ['20+','Bijan Robinson','Charlie Woerner'],
    ]) {
      await header(label).getByRole('button').click()
      assert.equal(await header(label).getAttribute('aria-sort'),'descending')
      assert.equal((await names())[0],descending,label+' descending')
      assert.equal((await names()).at(-1),'Zachariah Branch',label+' missing last')
      await header(label).getByRole('button').click()
      assert.equal(await header(label).getAttribute('aria-sort'),'ascending')
      assert.equal((await names())[0],ascending,label+' ascending')
      assert.equal((await names()).at(-1),'Zachariah Branch',label+' missing last')
    }
    await header('Player').getByRole('button').click()
    assert.equal((await names())[0],'Bijan Robinson')
    await header('Player').getByRole('button').click()
    assert.equal((await names())[0],'Zachariah Branch')
    const high = rows.filter({hasText:'Bijan Robinson'}), low = rows.filter({hasText:'Brian Robinson Jr.'})
    for (const index of [1,2]) {
      assert.match(await high.locator('td').nth(index).getAttribute('style') ?? '',/80, 220, 142/)
      assert.match(await low.locator('td').nth(index).getAttribute('style') ?? '',/245, 91, 113/)
      assert.equal(await rows.filter({hasText:'Zachariah Branch'}).locator('td').nth(index).getAttribute('style'),null)
    }
    // Sort follows the selected comparison mode, with both directions available.
    for (const mode of ['move','ratio','picks','odds']) {
      await page.getByRole('combobox',{name:/^Compare/}).selectOption(mode)
      await header('20+').getByRole('button').click()
      await header('20+').getByRole('button').click()
      assert.equal(await header('20+').getAttribute('aria-sort'),'ascending')
    }
    await page.getByRole('button',{name:'Higher →',exact:true}).click()
    assert.equal(await header('Player').getAttribute('aria-sort'),'ascending')
    await header('70+').getByRole('button').click()
    await page.getByRole('combobox',{name:/^Book/}).selectOption('draftkings')
    assert.equal(await header('Player').getAttribute('aria-sort'),'ascending')
    await page.getByRole('combobox',{name:/^Contract/}).selectOption('over_under')
    await page.getByRole('combobox',{name:/^Side/}).selectOption('under')
    await header('20').getByRole('button').click()
    assert.equal((await names())[0],'Charlie Woerner') // Branch has no 20-yard contract.
    await header('20').getByRole('button').click()
    assert.equal((await names())[0],'Bijan Robinson')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.screenshot({path:resolve(output,width+'.png')})
    assert.deepEqual(errors,[])
    console.log(width+'px PASS: header toggles, missing values, heat, modes, books, pages, under-side')
    await page.close()
  }
} finally {await browser.close()}
