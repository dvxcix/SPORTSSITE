import assert from 'node:assert/strict'
import test from 'node:test'
import { teamMmHighlights } from '../src/app/the-sideline/teamHighlights'
test('highlights use extreme MM, not price movement or top score', () => {
 const rows = [
  {name:'Top score',mm:-1,move:-90},
  {name:'Advertised',mm:-5,move:10},
  {name:'Hidden',mm:11,move:-20},
  {name:'Big price increase',mm:3,move:300},
 ]
 assert.equal(teamMmHighlights(rows).advertised?.name,'Advertised')
 assert.equal(teamMmHighlights(rows).hidden?.name,'Hidden')
})
test('zero, missing and invalid MM do not become advertised or hidden', () => {
 assert.deepEqual(teamMmHighlights([{name:'Zero',mm:0},{name:'Missing',mm:null},{name:'Invalid',mm:NaN}]),{advertised:undefined,hidden:undefined})
})
test('ties are deterministic and category/window changes recompute', () => {
 assert.equal(teamMmHighlights([{name:'B',mm:4},{name:'A',mm:4}]).hidden?.name,'A')
 assert.equal(teamMmHighlights([{name:'B',mm:5},{name:'A',mm:-2}]).hidden?.name,'B')
 assert.equal(teamMmHighlights([{name:'B',mm:5},{name:'A',mm:-2}]).advertised?.name,'A')
})
