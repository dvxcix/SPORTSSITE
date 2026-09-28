import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
const source = readFileSync('src/app/the-sideline/SidelineBoardClient.tsx','utf8')
assert(!source.includes('aria-label="Saved research"'))
assert(source.includes("vendor={fanduel?.vendor ?? 'fanduel'}"))
assert(source.includes('className={styles.matchupLogos}'))
const bundle = await build({stdin:{contents:'import s from "./src/app/the-sideline/sidelineBoard.module.css";window.s=s',resolveDir:process.cwd()},bundle:true,write:false,outdir:'.artifacts/game-lines',platform:'browser'})
const browser = await chromium.launch()
try {
 for(const width of [320,390,549,768,1100,1440]){
  const page=await browser.newPage({viewport:{width,height:900}})
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;color:white;background:#080e14;font:14px Arial}'+bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text+'</style>')
  await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text})
  await page.evaluate(()=>{
   const s=(window as any).s
   document.body.innerHTML='<div class="'+s.gameLineRail+'">'+[1,2,3].map(()=>'<article class="'+s.gameLineCard+'"><header>FanDuel</header><dl class="'+s.gameLineMarkets+'">'+['Moneyline','Spread','Total'].map((market)=>'<div class="'+s.gameLineMarket+'"><dt>'+market+'</dt><dd>'+['PHI','CHI'].map(team=>'<span><small>'+team+'</small><b>'+(market==='Spread'?'-13.5 -115':market==='Total'?'O 141.5 -110':'+10000')+'</b><em>Open +14.5 -118</em></span>').join('')+'</dd></div>').join('')+'</dl></article>').join('')+'</div>'
  })
  for(const quote of await page.locator('b, em').all()){
    assert(await quote.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'quote must not be clipped')
    assert.equal(await quote.evaluate(el=>getComputedStyle(el).textOverflow),'clip')
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'rail must not overflow page')
  console.log(width+'px: full current/opening prices fit; page stays within viewport')
  await page.close()
 }
}finally{await browser.close()}
