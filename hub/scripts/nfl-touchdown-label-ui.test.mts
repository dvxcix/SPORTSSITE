import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright-core'
import { nflTouchdownQuoteLabel } from '../src/lib/nflTouchdownQuoteLabel.ts'

test('last-seen and opening quote times fit in the real tracker on mobile and desktop', async () => {
  const source=await readFile(new URL('../src/app/the-sideline/NflTouchdownTracker.tsx',import.meta.url),'utf8')
  const css=await readFile(new URL('../src/app/the-sideline/touchdownTracker.module.css',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const mod={exports:{} as {NflTouchdownTracker:React.ComponentType<{events:unknown[];onJumpToGame:()=>void}>}}
  const noop=()=>null
  const imports:Record<string,unknown>={ 'react':{useState:(initial:unknown)=>[initial===false?true:initial,noop],useEffect:noop,useMemo:(fn:()=>unknown)=>fn()},'react/jsx-runtime':jsxRuntime,'react-dom':{createPortal:(node:unknown)=>node},'next/image':{default:noop},'lucide-react':{Download:noop,Flame:noop,Radio:noop,X:noop},'@/lib/nflTouchdownQuoteLabel':{nflTouchdownQuoteLabel},'./touchdownTracker.module.css':{default:new Proxy({}, {get:(_target,key)=>key})} }
  new Function('require','module','exports',output)((id:string)=>{assert.ok(id in imports,id);return imports[id]},mod,mod.exports)
  const quotes=[{propType:'first_td',vendor:'fanduel',line:.5,odds:850,observedAt:'2026-11-02T16:57:07Z'}, {propType:'anytime_td',vendor:'fanduel',line:.5,odds:220,isOpeningOnly:true}]
  const event={id:'fixture',gameId:'game',gameDate:'2026-11-02',playerName:'Example Receiver',team:'KC',opponent:'SEA',kind:'receiving',isFirstTdOfGame:true,playerTdNumber:1,quarter:1,clock:'8:00',text:'Example Receiver 20 yard touchdown',awayScore:7,homeScore:0,marketQuotes:quotes}
  const priorDocument=globalThis.document
  Object.defineProperty(globalThis,'document',{value:{body:{}},configurable:true})
  let html:string
  try { html=renderToStaticMarkup(React.createElement(mod.exports.NflTouchdownTracker,{events:[event],onJumpToGame:noop})) }
  finally { if(priorDocument) Object.defineProperty(globalThis,'document',{value:priorDocument,configurable:true}); else Reflect.deleteProperty(globalThis,'document') }
  const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true})
  try {
    for(const width of [360,390,1440]) {
      const page=await browser.newPage({viewport:{width,height:800}})
      await page.route('**/*',route=>route.abort())
      await page.setContent(`<style>body{margin:0;color:white;background:#111} ${css}</style>${html}`)
      assert.equal(await page.getByText(/Last seen · Quote time/).count(),1)
      assert.equal(await page.getByText(/Opening · Time unavailable/).count(),1)
      const accessible = await page.locator('.eventButton').getAttribute('aria-label')
      assert.match(accessible ?? '', /Example Receiver.*First touchdown \+850.*Last seen.*Anytime touchdown \+220.*Opening.*Open KC versus SEA/)
      assert.equal(await page.locator('[title], [role=tooltip]').count(),0)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
      const allFit=await page.locator('.marketStrip > span').evaluateAll(nodes=>nodes.every(node=>{const rect=node.getBoundingClientRect(),parent=node.parentElement!.getBoundingClientRect();return rect.left>=parent.left-1 && rect.right<=parent.right+1 && node.scrollWidth<=node.clientWidth+1}))
      assert.ok(allFit,`quote label overflow at ${width}px`)
      if (process.env.TRACKER_VISUAL_OUTPUT) await page.screenshot({path:`${process.env.TRACKER_VISUAL_OUTPUT}-${width}.png`})
      await page.close()
    }
  } finally { await browser.close() }
})
