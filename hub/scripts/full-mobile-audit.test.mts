import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const inventory=JSON.parse(await readFile(new URL('../src/app/design-review/visual-audit/inventory.json',import.meta.url),'utf8'))
const audit=JSON.parse(await readFile(new URL('../docs/design/full-mobile-audit-2026-11-22.json',import.meta.url),'utf8'))

test('the mobile follow-up has an individual receipt for every catalog surface in all four layouts',()=>{
 assert.equal(audit.items.length,inventory.length)
 assert.equal(new Set(audit.items.map((item:any)=>item.id)).size,inventory.length)
 assert.equal(audit.layoutCount,inventory.length*4)
 for(const item of inventory){
  const receipt=audit.items.find((row:any)=>row.id===item.id)
  assert.ok(receipt,item.id)
  for(const view of ['desktop-dark','desktop-light','phone-dark','phone-light']){
   const result=receipt.layouts[view]
   assert.ok(result,item.id+' '+view)
   assert.equal(result.width,view.startsWith('phone')?390:1440,item.id+' '+view)
   assert.equal(result.theme,view.endsWith('light')?'light':'dark',item.id+' '+view)
   assert.equal(result.overflow,false,item.id+' '+view)
   assert.equal(result.error,false,item.id+' '+view)
   assert.equal(result.loading,false,item.id+' '+view)
   assert.deepEqual(result.legacyFloating,[],item.id+' '+view)
   assert.deepEqual(result.brokenImages,[],item.id+' '+view)
  }
  assert.ok(item.evidence.includes('docs/design/full-mobile-audit-2026-11-22.json#'+item.id))
 }
})

test('narrow and short-height checks preserve message clearance and owner approval history',()=>{
 assert.equal(audit.narrowChecks.length,40)
 assert.ok(audit.narrowChecks.some((row:any)=>row.width===320))
 assert.ok(audit.narrowChecks.some((row:any)=>row.height===390))
 for(const row of audit.narrowChecks){assert.equal(row.overflow,false);assert.equal(row.error,false);if(row.send)assert.ok(row.send.bottom<=row.dockTop)}
 assert.equal(inventory.filter((row:any)=>row.status==='Approved').length,10)
})

test('channel writing space and Send stay usable at desktop, phone and short landscape sizes',()=>{
 assert.equal(audit.channelComposerChecks.length,7)
 for(const row of audit.channelComposerChecks){
  assert.equal(row.theme,row.view.endsWith('light')?'light':'dark',row.view)
  assert.equal(row.overflow,false,row.view)
  assert.equal(row.error,false,row.view)
  assert.ok(row.writingWidth>=row.composerWidth*(row.width<=1024?0.9:0.7),row.view+' writing width')
  assert.ok(row.sendBottom<=row.dockTop,row.view+' Send clearance')
 }
})
