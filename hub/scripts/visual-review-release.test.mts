import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { releaseStatus } from '../src/app/design-review/visual-audit/releaseStatus.ts'
const root=new URL('../src/app/design-review/visual-audit/',import.meta.url)
const rows=JSON.parse(await readFile(new URL('inventory.json',root),'utf8'))
const ledger=JSON.parse(await readFile(new URL('release-ledger.json',root),'utf8'))

test('verified completed surfaces are live, independently of owner visual approval',()=>{
  assert.equal(rows.length,238)
  assert.equal(new Set(ledger.items).size,ledger.items.length)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='Live').length,ledger.items.length)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='Ready to deploy').length,rows.length-ledger.items.length)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='Queued').length,0)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='In progress').length,0)
  for(const id of ledger.items){const row=rows.find((row:any)=>row.id===id);assert.ok(row,id);assert.ok(['Review ready','Approved'].includes(row.status));assert.deepEqual(row.release,ledger.production)}
  assert.equal(rows.filter((row:any)=>row.status==='Approved').length,10,'Do not invent additional owner approvals')
  for(const row of rows.filter((row:any)=>row.batch==='site-completion-2026-11-21')){
    assert.ok(Object.values(row.checks).every(Boolean),row.id)
    assert.ok(row.evidence.includes('docs/design/full-site-audit-2026-11-21.json#'+row.id),row.id)
  }
})
test('approval or implementation alone cannot falsely claim publication, and unfinished work stays visible',()=>{
  assert.equal(releaseStatus({status:'Approved'}),'Ready to deploy')
  assert.equal(releaseStatus({status:'Review ready'}),'Ready to deploy')
  assert.equal(releaseStatus({status:'Queued',release:ledger.production}),'Queued')
  assert.equal(releaseStatus({status:'In progress',release:ledger.production}),'In progress')
})

test('the completion batch has individual four-layout receipts and bounded narrow-phone evidence',async()=>{
  const audit=JSON.parse(await readFile(new URL('../docs/design/full-site-audit-2026-11-21.json',import.meta.url),'utf8'))
  const batch=rows.filter((row:any)=>row.batch==='site-completion-2026-11-21')
  assert.equal(batch.length,175)
  assert.equal(audit.items.length,175)
  for(const row of batch){
    const receipt=audit.items.find((item:any)=>item.id===row.id)
    assert.ok(receipt,row.id)
    for(const view of ['desktop-light','desktop-dark','phone-light','phone-dark']){
      assert.equal(receipt.layouts[view].overflow,false,row.id+' '+view)
      assert.equal(receipt.layouts[view].theme,view.endsWith('light')?'light':'dark',row.id+' '+view)
    }
  }
  assert.equal(audit.narrowSpotChecks.length,16)
  assert.ok(audit.narrowSpotChecks.every((view:any)=>view.width===320&&!view.overflow))
})
test('release ledger references a real production source ancestor and generated text agrees',async()=>{
  assert.match(ledger.production.commit,/^[a-f0-9]{40}$/)
  execFileSync('git',['merge-base','--is-ancestor',ledger.production.commit,'HEAD'])
  const text=await readFile(new URL('../docs/design/page-by-page-checklist.txt',import.meta.url),'utf8')
  assert.equal((text.match(/^\[Live\]/gm)??[]).length,ledger.items.length)
  assert.doesNotMatch(text,/^\[(?:Review ready|Approved)\]/m)
})
