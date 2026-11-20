import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, type ComponentType } from 'react'

const require=createRequire(import.meta.url), {JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid'}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
let completed=false, naturalWidth=0
Object.defineProperties(win.HTMLImageElement.prototype,{complete:{get:()=>completed,configurable:true},naturalWidth:{get:()=>naturalWidth,configurable:true}})
const {createRoot}=await import('react-dom/client')
const bundle=await build({entryPoints:['src/components/ui/SafeImage.tsx'],absWorkingDir:resolve('.'),bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom']})
const module={exports:{} as {SafeImage:ComponentType<any>}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
const {SafeImage}=module.exports

test('cached failures and later image errors use the fallback; a new source recovers and theme rerenders preserve the loaded image',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const render=async(src:string,tone='dark')=>act(async()=>root.render(h('div',{'data-theme':tone},h(SafeImage,{src,alt:'Member artwork',fallback:h('span',null,'Member initials')}))))
  try {
    completed=true;naturalWidth=0
    await render('/cached-failure.jpg')
    assert.equal(host.querySelector('img'),null,'complete-but-broken image must not wait for a missed error event')
    assert.equal(host.textContent,'Member initials')
    completed=true;naturalWidth=320
    await render('/replacement.jpg')
    const loaded=host.querySelector('img')!
    assert.equal(loaded.getAttribute('src'),'/replacement.jpg')
    await render('/replacement.jpg','light')
    assert.equal(host.querySelector('img'),loaded,'theme changes retain the same loaded image node')
    completed=false;naturalWidth=0
    await render('/later-failure.jpg')
    assert.ok(host.querySelector('img'),'pending lazy images remain pending')
    await act(async()=>host.querySelector('img')!.dispatchEvent(new win.Event('error')))
    assert.equal(host.querySelector('img'),null)
    assert.equal(host.textContent,'Member initials')
  } finally {await act(async()=>root.unmount());host.remove();win.close()}
})
