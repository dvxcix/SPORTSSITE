import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
const browser=await chromium.launch()
await mkdir('.artifacts/research-navigation',{recursive:true})
try {
  for(const [width,touch] of [[360,true],[390,true],[768,true],[1024,true],[1280,false],[1920,false]] as const){
    const page=await browser.newPage({viewport:{width,height:900},hasTouch:touch})
    const errors:string[]=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto('http://127.0.0.1:4189/the-sideline?game=2026_03_ATL_GB&date=2026-09-24&sample=regular&mode=public')
    const sidebar=page.locator('aside')
    if(touch) await page.locator('#open-menu').click()
    await sidebar.getByRole('button',{name:'NFL',exact:true}).waitFor()
    assert.equal(await sidebar.getByRole('button',{name:'NFL',exact:true}).getAttribute('aria-pressed'),'true')
    const sideline=sidebar.getByRole('link',{name:'The Sideline',exact:true})
    const rect=await sideline.boundingBox()
    assert(rect && rect.y<420,'NFL board must be visible without scrolling')
    assert.equal(await sidebar.getByRole('link',{name:'The Dugout',exact:true}).count(),0)
    if(touch) assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden')
    await sidebar.getByRole('button',{name:'MLB',exact:true}).click()
    await sidebar.getByRole('link',{name:'The Dugout',exact:true}).waitFor()
    assert.equal(await sidebar.getByRole('link',{name:'The Sideline',exact:true}).count(),0)
    await sidebar.getByRole('textbox',{name:'Find a page or tool'}).fill('cheatsheets')
    assert.equal(await sidebar.locator('nav a').count(),1)
    const cheat=sidebar.getByRole('link',{name:'Cheatsheets',exact:true})
    assert.match(await cheat.getAttribute('href')??'',/game=2026_03_ATL_GB/)
    await sidebar.getByRole('button',{name:'Clear menu search'}).click()
    await sidebar.getByRole('button',{name:'NFL',exact:true}).click()
    await page.screenshot({path:`.artifacts/research-navigation/menu-${width}.png`})
    if(touch){
      await page.keyboard.press('Escape')
      await page.waitForFunction(()=>document.body.style.overflow!=='hidden')
      assert.equal(await page.locator('.ss-mobile-dock button[data-label="Research"]').getAttribute('aria-haspopup'),'dialog')
    }
    const tabs=page.getByRole('navigation',{name:'NFL tools'})
    assert.equal(await tabs.locator('[aria-current="page"]').count(),1)
    for(const link of await tabs.locator('a').all()){
      const box=await link.boundingBox()
      assert(box && box.width>0 && box.x>=0 && box.x+box.width<=width,'NFL tool visible and not clipped')
    }
    await tabs.getByRole('link',{name:'Cheatsheets',exact:true}).click()
    assert.match(page.url(),/mode=cheatsheets/)
    assert.match(page.url(),/game=2026_03_ATL_GB/)
    assert.equal(await tabs.locator('[aria-current="page"]').innerText(),'Cheatsheets')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow')
    await page.screenshot({path:`.artifacts/research-navigation/tools-${width}.png`})
    await page.goto('http://127.0.0.1:4189/feed')
    if(touch)await page.locator('#open-menu').click()
    assert.equal(await sidebar.getByRole('button',{name:'NFL',exact:true}).getAttribute('aria-pressed'),'true','remembers NFL off research pages')
    await page.goto('http://127.0.0.1:4189/feed?access=no')
    if(touch)await page.locator('#open-menu').click()
    assert.equal(await sidebar.getByRole('button',{name:'NFL',exact:true}).count(),0)
    await sidebar.getByRole('textbox',{name:'Find a page or tool'}).fill('NFL')
    assert.equal(await sidebar.locator('nav a').count(),0,'search cannot reveal restricted NFL links')
    assert.deepEqual(errors,[])
    console.log(`${width}px touch=${touch}: PASS reachability, sport switch, search, context, persistence, access, overflow`)
    await page.close()
  }
} finally { await browser.close() }
