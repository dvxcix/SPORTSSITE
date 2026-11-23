import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

type Layout = { width:number; theme:string; overflow:boolean; error?:boolean; errors?:string[]; routeError?:boolean; loading:boolean|string[] }
type Receipt = { id:string; kind:string; methods:string[]; layouts:Record<string,Layout>; interactionCases:string[] }
const report=JSON.parse(await readFile(new URL('../docs/design/mobile-complete-2026-11-23.json',import.meta.url),'utf8'))
const inventory=JSON.parse(await readFile(new URL('../src/app/design-review/visual-audit/inventory.json',import.meta.url),'utf8'))
const items=report.items as Receipt[]

test('every current catalog item has fresh evidence without replacing earlier releases or owner approvals',()=>{
  assert.equal(items.length,240)
  assert.equal(new Set(items.map(item=>item.id)).size,inventory.length)
  assert.equal(inventory.filter((item:{status:string})=>item.status==='Approved').length,10)
  for(const item of inventory){
    const receipt=items.find(row=>row.id===item.id)
    assert.ok(receipt,item.id)
    assert.ok(receipt.methods.length,item.id)
    assert.ok(Object.keys(receipt.layouts).length||receipt.interactionCases.length,item.id)
    assert.equal(item.mobileReview.batch,report.batch,item.id)
    assert.ok(item.evidence.includes(`docs/design/${report.batch}.json#${item.id}`),item.id)
  }
})

test('all 157 routes have completed measurements in both themes at five widths',()=>{
  const pages=items.filter(item=>item.kind==='Page')
  assert.equal(pages.length,157)
  assert.equal(report.scope.standardRouteLayouts+report.scope.narrowRouteLayouts,1570)
  for(const item of pages){
    assert.equal(Object.keys(item.layouts).length,10,item.id)
    for(const [prefix,width] of Object.entries({desktop:1440,phone:390,small:320,tablet:820,landscape:844})){
      for(const theme of ['light','dark']){
        const layout=item.layouts[`${prefix}-${theme}`]
        assert.ok(layout,`${item.id} ${prefix}-${theme}`)
        assert.equal(layout.width,width,item.id)
        assert.equal(layout.theme,theme,item.id)
        assert.equal(layout.overflow,false,item.id)
        if('error' in layout)assert.equal(layout.error,false,item.id)
        else assert.deepEqual(layout.errors,[],item.id)
        assert.notEqual(layout.routeError,true,item.id)
        assert.deepEqual(layout.loading,Array.isArray(layout.loading)?[]:false,item.id)
      }
    }
  }
})

test('interaction evidence remains separate from route renders and records unfinished provider boundaries',()=>{
  assert.ok(report.scope.interactionObservations>=289)
  const cases=new Set(report.flowReceipts.map((flow:{case:string})=>flow.case))
  for(const item of items)for(const name of item.interactionCases)assert.ok(cases.has(name),`${item.id}: ${name}`)
  for(const name of ['shipping-short-chat-composer-clearance','free-community-completed-final-320-light','release-player-chart-scrubber-320-dark'])assert.ok(cases.has(name),name)
  assert.ok(report.limitations.some((value:string)=>value.includes('physical-device')))
  assert.ok(report.limitations.some((value:string)=>value.includes('financial operations')))
})
