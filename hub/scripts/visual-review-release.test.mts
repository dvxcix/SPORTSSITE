import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { releaseStatus } from '../src/app/design-review/visual-audit/releaseStatus.ts'
const root=new URL('../src/app/design-review/visual-audit/',import.meta.url)
const rows=JSON.parse(await readFile(new URL('inventory.json',root),'utf8'))
const ledger=JSON.parse(await readFile(new URL('release-ledger.json',root),'utf8'))

test('verified completed surfaces are live, independently of owner visual approval',()=>{
  assert.equal(new Set(ledger.items).size,63)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='Live').length,63)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='Ready to deploy').length,0)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='Queued').length,174)
  assert.equal(rows.filter((row:any)=>releaseStatus(row)==='In progress').length,1)
  for(const id of ledger.items){const row=rows.find((row:any)=>row.id===id);assert.ok(row,id);assert.ok(['Review ready','Approved'].includes(row.status));assert.deepEqual(row.release,ledger.production)}
  assert.equal(rows.filter((row:any)=>row.status==='Approved').length,10,'Do not invent additional owner approvals')
})
test('approval or implementation alone cannot falsely claim publication, and unfinished work stays visible',()=>{
  assert.equal(releaseStatus({status:'Approved'}),'Ready to deploy')
  assert.equal(releaseStatus({status:'Review ready'}),'Ready to deploy')
  assert.equal(releaseStatus({status:'Queued',release:ledger.production}),'Queued')
  assert.equal(releaseStatus({status:'In progress',release:ledger.production}),'In progress')
})
test('release ledger references a real production source ancestor and generated text agrees',async()=>{
  assert.match(ledger.production.commit,/^[a-f0-9]{40}$/)
  execFileSync('git',['merge-base','--is-ancestor',ledger.production.commit,'HEAD'])
  const text=await readFile(new URL('../docs/design/page-by-page-checklist.txt',import.meta.url),'utf8')
  assert.equal((text.match(/^\[Live\]/gm)??[]).length,63)
  assert.doesNotMatch(text,/^\[(?:Review ready|Approved)\]/m)
})
