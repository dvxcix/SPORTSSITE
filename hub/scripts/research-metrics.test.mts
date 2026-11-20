import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require=createRequire(import.meta.url)
const bundle=await build({entryPoints:['src/components/research/ResearchMetrics.tsx'],absWorkingDir:resolve('.'),bundle:true,write:false,outfile:'metrics.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'}})
const module={exports:{} as Record<string,React.ComponentType<any>>}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
const {PickCount,MarketMovement}=module.exports

test('counts distinguish observed, estimated, zero and unavailable without repeated visible labels',()=>{
  const observed=renderToStaticMarkup(h(PickCount,{value:71,observed:true}))
  assert.match(observed,/aria-label="Observed market picks: 71"/)
  assert.match(observed,/<svg/)
  assert.doesNotMatch(observed,/>observed market picks</i)
  const estimate=renderToStaticMarkup(h(PickCount,{value:3,estimated:true}))
  assert.match(estimate,/Estimated picks: 3/);assert.match(estimate,/≈3/)
  assert.match(renderToStaticMarkup(h(PickCount,{value:0})),/Recorded picks: 0/)
  assert.match(renderToStaticMarkup(h(PickCount,{value:null})),/Recorded picks: unavailable/)
})
test('movement preserves direction and probability-point meaning without relying on colour',()=>{
  for(const [value,direction,display] of [[2.4,'shortened','+2.4'],[-0.3,'lengthened','−0.3'],[0,'unchanged','0.0']] as const){
    const html=renderToStaticMarkup(h(MarketMovement,{value}))
    assert.ok(html.includes(`data-direction="${direction}"`));assert.ok(html.includes(`${display} probability points`));assert.match(html,/<svg/)
  }
  assert.match(renderToStaticMarkup(h(MarketMovement,{value:null})),/no comparable observation/)
})
