import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {createRoot} from 'react-dom/client'
import {renderToStaticMarkup} from 'react-dom/server'
import * as jsx from 'react/jsx-runtime'
import {createRequire} from 'node:module'
import ts from 'typescript'
import type {NbaWorkload} from '../src/lib/nbaWorkload.ts'
const {JSDOM}=createRequire(import.meta.url)('jsdom')
async function compiled(path:string,imports:Record<string,unknown>={}){
 const source=await readFile(new URL(path,import.meta.url),'utf8'),js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,m={exports:{} as any}
 new Function('require','exports','module',js)((n:string)=>n==='react/jsx-runtime'?jsx:n==='react'?React:n in imports?imports[n]:n.endsWith('.css')?{default:new Proxy({},{get:(_t,k)=>String(k)}),__esModule:true}:{},m.exports,m)
 return m.exports
}
async function components(){
 const image={default:(p:any)=>React.createElement('img',p),__esModule:true}
 const ring=await compiled('../src/components/ui/MechanicsScoreRing.tsx',{'next/image':image})
 const cells=await compiled('../src/app/the-paint/PaintResearchCells.tsx',{'@/components/ui/MechanicsScoreRing':ring,'next/image':image})
 const modal=await compiled('../src/components/ui/ModalSurface.tsx',{'react-dom':ReactDOM})
 return compiled('../src/app/the-paint/PaintScoreDetails.tsx',{'./PaintResearchCells':cells,'@/components/ui/MechanicsScoreRing':ring,'@/lib/nbaPaint':await import('../src/lib/nbaPaint.ts'),'@/components/ui/ModalSurface':modal,'./PaintVisuals':{number:(n:number|null|undefined)=>n==null?'—':n.toFixed(1)},'lucide-react':{X:()=>null}})
}
const value={status:'available',estimate:4.2,proxy:true,market:'assists',opportunityLabel:'Passes (proxy)',recentGames:2,priorGames:5,recentMinutes:30,priorMinutes:20,recentOpportunity:40,priorOpportunity:25,recentProduction:5,conversion:.105,teamRank:2,teamPool:8,teamShare:.22,observedAt:'2026-11-19T21:07:00Z'} as NbaWorkload
test('workload detail exposes samples and the selected-side gap as context',async()=>{
 const {PaintWorkloadDetails}=await components(),html=renderToStaticMarkup(React.createElement(PaintWorkloadDetails,{value,gap:-1.8}))
 for(const text of ['4.2','Passes (proxy)','last 2 / prior 5','40.0 / 25.0','-1.8','2 / 8','22.0%','proxy for assist opportunity','not hit probabilities'])assert.ok(html.includes(text),text)
})
test('unavailable workload renders missing evidence rather than zero',async()=>{
 const {PaintWorkloadDetails}=await components(),html=renderToStaticMarkup(React.createElement(PaintWorkloadDetails,{value:{status:'unavailable',reason:'Missing rebound chances'},gap:null}))
 assert.ok(html.includes('Workload unavailable'));assert.ok(html.includes('Missing rebound chances'));assert.ok(!html.includes('0.0'))
})
test('score entry reuses the real radial component and its existing color thresholds',async()=>{
 const {PaintScoreWorkloadCell}=await components()
 for(const [score,tone]of [[39,'cold'],[40,'neutral'],[58,'positive'],[70,'elite']] as const){
  const html=renderToStaticMarkup(React.createElement(PaintScoreWorkloadCell,{score,value,playerName:'Example Player'}))
  assert.ok(html.includes('data-tone="'+tone+'"'));assert.ok(html.includes('data-size="small"'));assert.ok(html.includes('aria-haspopup="dialog"'));assert.ok(html.includes('aria-expanded="false"'));assert.ok(!html.includes('4.2'))
 }
 const source=await readFile(new URL('../src/app/the-paint/PaintIntelligence.tsx',import.meta.url),'utf8');assert.ok(!source.includes("header('Workload'"))
})
test('radial opens details; Escape closes and restores keyboard focus',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://example.test',pretendToBeVisual:true}),saved=new Map<string,PropertyDescriptor|undefined>()
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true})}
 const {PaintScoreWorkloadCell}=await components(),root=createRoot(dom.window.document.getElementById('root')!)
 try{
  await React.act(async()=>root.render(React.createElement(PaintScoreWorkloadCell,{score:72,value,gap:-1.8,playerName:'Example Player'})))
  const button=dom.window.document.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;button.focus();await React.act(async()=>button.click())
  const dialog=dom.window.document.querySelector('[role="dialog"]');assert.ok(dialog);assert.ok(dialog.textContent?.includes('4.2'));assert.ok(!dialog.textContent?.includes('does not change this score'));assert.ok(dialog.textContent?.includes('no recorded calculation breakdown'));assert.equal(button.getAttribute('aria-expanded'),'true')
  await React.act(async()=>{dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))})
  assert.equal(dom.window.document.querySelector('[role="dialog"]'),null);assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(dom.window.document.activeElement,button)
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k)}
})


test('score drawer shows the real market-specific weighted breakdown and workload effect',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://example.test',pretendToBeVisual:true}),saved=new Map<string,PropertyDescriptor|undefined>()
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true})}
 const {PaintScoreWorkloadCell}=await components(),root=createRoot(dom.window.document.getElementById('root')!)
 const details={market:'assists',score:72,baseScore:69,beforeWorkload:63,marketAdjustment:3,games:20,marketGames:10,coverage:.9,frozen:true,observedAt:'2026-11-19T21:07:00Z',parts:[{key:'opportunity',label:'Production & workload',value:80,beforeWorkload:60,weight:.35}],workload:{components:[{market:'assists',change:1.2,workload:value,absent:[],pool:8}],status:'available',availabilityKnown:true,opportunityFactor:1.2,availabilityFactor:1}}
 try{
  await React.act(async()=>root.render(React.createElement(PaintScoreWorkloadCell,{score:72,details,market:'assists',contract:'Over 5.5',playerName:'Example Player'})))
  await React.act(async()=>(dom.window.document.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click())
  const dialog=dom.window.document.querySelector('[role="dialog"]')!
  for(const label of ['Assists','Over 5.5','Saved pregame inputs','35%','60.0 → 80.0','+6.0 pts','+20.0%'])assert.ok(dialog.textContent?.includes(label),label)
  assert.equal(dialog.querySelector('[data-size="large"] strong')?.textContent,'72')
  assert.doesNotMatch(dialog.textContent??'',/does not change this score|Workload inputs unavailable/)
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k)}
})
