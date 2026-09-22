import assert from 'node:assert/strict'
import test from 'node:test'
import { compareLadderValues, ladderHeatBackground } from '../src/app/the-sideline/ladderPresentation'
import { buildBoardHeat } from '../src/app/the-sideline/boardHeat'

test('Props sorts numeric values both ways, with zero real and missing last', () => {
  const values = [null, 4, 0, -3, undefined, NaN]
  assert.deepEqual([...values].sort((a,b) => compareLadderValues(a,b,'asc')).slice(0,3), [-3,0,4])
  assert.deepEqual([...values].sort((a,b) => compareLadderValues(a,b,'desc')).slice(0,3), [4,0,-3])
  assert.equal(compareLadderValues(null, 0, 'asc'), 1)
  assert.equal(compareLadderValues(null, 0, 'desc'), 1)
  assert.equal(compareLadderValues(0, 0, 'desc'), 0)
  assert.ok(compareLadderValues('Alpha','Beta','asc') < 0)
  assert.ok(compareLadderValues('Alpha','Beta','desc') > 0)
})
test('Props heat distinguishes scores, treats ties and missing as neutral', () => {
  const rows = [{id:'1',position:'WR',value:80},{id:'2',position:'WR',value:20},{id:'3',position:'WR',value:null}]
  const heat = buildBoardHeat([{id:'score',heat:'high',value:(r:typeof rows[number])=>r.value}], rows)
  assert.equal(heat.get('1:score'),1)
  assert.equal(heat.get('2:score'),0)
  assert.equal(ladderHeatBackground(heat.get('3:score')),undefined)
  assert.match(ladderHeatBackground(1)!.background,/80,220,142/)
  assert.match(ladderHeatBackground(0)!.background,/245,91,113/)
  assert.equal(buildBoardHeat([{id:'mm',heat:'high',value:()=>0}], rows).size,0)
})
