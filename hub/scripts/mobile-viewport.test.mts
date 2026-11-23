import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement } from 'react'
import { build } from 'esbuild'
import { mobileViewportState } from '../src/lib/mobileViewport'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const win = new JSDOM('<body><textarea></textarea><div id="app"></div></body>', { pretendToBeVisual:true }).window
Object.assign(globalThis, { window:win, document:win.document, HTMLElement:win.HTMLElement, IS_REACT_ACT_ENVIRONMENT:true })
const frames = new Map<number, FrameRequestCallback>()
let sequence = 0
globalThis.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence }
globalThis.cancelAnimationFrame = id => { frames.delete(id) }
const viewport = new win.EventTarget()
Object.assign(viewport, { height:844, offsetTop:0, scale:1 })
Object.defineProperty(win, 'visualViewport', { configurable:true, value:viewport })
Object.defineProperty(win, 'innerHeight', { configurable:true, value:844 })
win.matchMedia = () => ({ matches:true })
const bundle = await build({ stdin:{ contents:"export{useMobileViewport}from'./src/components/layout/useMobileViewport'",resolveDir:resolve('.'),loader:'tsx' },bundle:true,write:false,platform:'node',format:'cjs',external:['react'],tsconfig:'tsconfig.json' })
const compiled = { exports:{} as { useMobileViewport:()=>void } }
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
const { createRoot } = await import('react-dom/client')
function Surface() { compiled.exports.useMobileViewport(); return null }
function flush() { for(const [id,callback] of frames){frames.delete(id);callback(0)} }

test('a software keyboard is distinct from zoom, browser chrome and a short landscape screen', () => {
 const base={layoutHeight:844,height:844,top:0,scale:1,editable:true,compact:true}
 assert.equal(mobileViewportState({...base,height:500}).keyboard,true)
 assert.equal(mobileViewportState({...base,height:780}).keyboard,false)
 assert.equal(mobileViewportState({...base,height:500,scale:2}).keyboard,false)
 assert.equal(mobileViewportState({...base,height:500,editable:false}).keyboard,false)
 assert.equal(mobileViewportState({...base,height:500,compact:false}).keyboard,false)
 assert.equal(mobileViewportState({...base,layoutHeight:390,height:390}).keyboard,false)
})

test('focus and viewport events hide navigation only while writing with a keyboard; cleanup restores the shell', async () => {
 const root=createRoot(document.getElementById('app')!)
 await act(async()=>root.render(createElement(Surface)))
 assert.equal(document.body.classList.contains('ss-keyboard-open'),false)
 document.querySelector('textarea')!.focus()
 Object.assign(viewport,{height:480,offsetTop:24})
 viewport.dispatchEvent(new win.Event('resize'));flush()
 assert.equal(document.body.classList.contains('ss-keyboard-open'),true)
 assert.equal(document.documentElement.style.getPropertyValue('--ss-visible-height'),'480px')
 assert.equal(document.documentElement.style.getPropertyValue('--ss-visible-top'),'24px')
 Object.assign(viewport,{scale:2});viewport.dispatchEvent(new win.Event('resize'));flush()
 assert.equal(document.body.classList.contains('ss-keyboard-open'),false)
 Object.assign(viewport,{scale:1});viewport.dispatchEvent(new win.Event('resize'));flush()
 assert.equal(document.body.classList.contains('ss-keyboard-open'),true)
 document.querySelector('textarea')!.blur();flush()
 assert.equal(document.body.classList.contains('ss-keyboard-open'),false)
 await act(async()=>root.unmount())
 assert.equal(document.documentElement.style.getPropertyValue('--ss-visible-height'),'')
 viewport.dispatchEvent(new win.Event('resize'))
 assert.equal(frames.size,0)
})
