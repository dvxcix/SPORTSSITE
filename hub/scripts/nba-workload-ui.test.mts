import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsx from 'react/jsx-runtime'
import ts from 'typescript'
import type { NbaWorkload } from '../src/lib/nbaWorkload.ts'
async function cell() {
 const source=await readFile(new URL('../src/app/the-paint/PaintIntelligence.tsx',import.meta.url),'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const m={exports:{} as any}
 new Function('require','exports','module',js)((name:string)=>name==='react/jsx-runtime'?jsx:name==='./PaintVisuals'?{number:(n:number|null|undefined)=>n==null?'—':n.toFixed(1)}:name.endsWith('.css')?{default:{detail:'detail'}}:{},m.exports,m)
 return m.exports.PaintWorkloadCell
}
test('workload detail exposes actual sample, proxy and selected-side gap without a hit-probability claim',async()=>{
 const component=await cell(),value={status:'available',estimate:4.2,proxy:true,market:'assists',opportunityLabel:'Passes (proxy)',
  recentGames:2,priorGames:5,recentMinutes:30,priorMinutes:20,recentOpportunity:40,priorOpportunity:25,
  recentProduction:5,conversion:.105,teamRank:2,teamPool:8,teamShare:.22,observedAt:'2026-11-19T21:07:00Z'} as NbaWorkload
 const html=renderToStaticMarkup(createElement(component,{value,gap:-1.8}))
 for(const text of ['<details','<summary','4.2','Passes (proxy)','last 2 / prior 5','40.0 / 25.0','-1.8','2 / 8','22.0%','not potential assists','not a ceiling or a hit rate','Eastern'])assert.ok(html.includes(text),text)
})
test('unavailable workload renders missing evidence rather than zero',async()=>{
 const component=await cell(),html=renderToStaticMarkup(createElement(component,{value:{status:'unavailable',reason:'Missing rebound chances'},gap:null}))
 assert.ok(html.includes('Workload unavailable'));assert.ok(html.includes('Missing rebound chances'))
 assert.ok(!html.includes('<details'));assert.ok(!html.includes('0.0'))
})

