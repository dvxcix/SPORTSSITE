import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, type ComponentType } from 'react'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const bundle=await build({entryPoints:['src/components/ui/DataGrid.tsx'],absWorkingDir:resolve('.'),bundle:true,write:false,outfile:'data-grid-test.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'}})
const module={exports:{} as {DataGrid:ComponentType<any>}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)

test('phone sorting retains both directions, original order and null-last behavior',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const rows=[{id:'b',name:'Beta',score:null},{id:'c',name:'Charlie',score:2},{id:'a',name:'Alpha',score:1}]
 const columns=[{id:'name',header:'Name',pinned:true,cell:(row:typeof rows[number])=>row.name},{id:'score',header:'Score',sortValue:(row:typeof rows[number])=>row.score,cell:(row:typeof rows[number])=>row.score??'—'}]
 const names=()=>[...host.querySelectorAll('tbody tr')].map(row=>row.querySelector('td')!.textContent)
 try{
  await act(async()=>root.render(h(module.exports.DataGrid,{ariaLabel:'Review results',rows,columns,getRowKey:(row:typeof rows[number])=>row.id,storageKey:'review-test'})))
  assert.equal(host.querySelector('[role="region"]')!.getAttribute('tabindex'),'0')
  assert.deepEqual(names(),['Beta','Charlie','Alpha'])
  const select=host.querySelector<HTMLSelectElement>('select[aria-label="Sort Review results"]')!
  await act(async()=>{select.value='score';select.dispatchEvent(new win.Event('change',{bubbles:true}))})
  assert.deepEqual(names(),['Alpha','Charlie','Beta'])
  assert.equal(host.querySelector('th[aria-sort]')!.getAttribute('aria-sort'),'ascending')
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Sort descending"]')!.click())
  assert.deepEqual(names(),['Charlie','Alpha','Beta'])
  assert.equal(host.querySelector('th[aria-sort]')!.getAttribute('aria-sort'),'descending')
  await act(async()=>{select.value='';select.dispatchEvent(new win.Event('change',{bubbles:true}))})
  assert.deepEqual(names(),['Beta','Charlie','Alpha'])
  assert.equal(host.querySelectorAll('tbody tr td').length,6,'every cell remains available')
  assert.deepEqual(rows.map(row=>row.id),['b','c','a'],'sorting does not mutate the supplied data')
 }finally{await act(async()=>root.unmount());host.remove()}
})
