import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h } from 'react'
import { build } from 'esbuild'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/groups/review-club',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true})
let mobile=true,scrolls=0
let scrollTargets:Array<{target:string;block?:ScrollLogicalPosition}>=[]
win.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}})
win.HTMLElement.prototype.scrollIntoView=function(this:HTMLElement,options?:ScrollIntoViewOptions){scrolls++;scrollTargets.push({target:this.className,block:options?.block})}
const {createRoot}=await import('react-dom/client')
const navigation=`import {useSyncExternalStore} from 'react';let query='';const listeners=new Set();export function setSearch(value){query=value;listeners.forEach(listener=>listener())}export const usePathname=()=>'/groups/review-club';export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener)},()=>query,()=>query));export const useRouter=()=>({replace(href){setSearch(href.split('?')[1]||'')}});`
const bundle=await build({stdin:{contents:'export {GroupWorkspaceTabs} from "./src/components/groups/GroupWorkspaceTabs";export {setSearch} from "next/navigation"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'group-mobile.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'navigation-fixture',setup(builder){builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:navigation,loader:'tsx'}))}}]})
const compiled={exports:{} as {GroupWorkspaceTabs:typeof import('../src/components/groups/GroupWorkspaceTabs').GroupWorkspaceTabs;setSearch:(value:string)=>void}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
async function fixture(initial:'posts'|'picks'|'chat'='posts',phone=true){
 mobile=phone;scrolls=0;scrollTargets=[];compiled.exports.setSearch('view='+initial)
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(h(compiled.exports.GroupWorkspaceTabs,{posts:h('div',{},'Post content'),chat:h('div',{},'Chat content',h('form',{className:'ss-chat-composer'})),postCount:3,initialTab:initial})))
 return {host,async click(label:string){const button=[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(button=>button.textContent!.trim().startsWith(label))!;assert.ok(button,label);await act(async()=>button.click())},async close(){await act(async()=>root.unmount());host.remove()}}
}

test('selecting mobile chat aligns the chat workspace, while other tabs retain page position',async()=>{
 const ui=await fixture()
 try{
  assert.equal(scrolls,0)
  await ui.click('Live chat')
  assert.equal(ui.host.querySelector('section')!.dataset.view,'chat')
  assert.equal(scrolls,1)
  assert.equal(ui.host.querySelector('[role=tabpanel]:not([hidden])')!.textContent,'Chat content')
  await ui.click('Picks');assert.equal(scrolls,1)
  assert.equal(ui.host.querySelector('section')!.dataset.view,'picks')
  assert.equal(ui.host.querySelector('[role=tabpanel]:not([hidden])')!.textContent,'Post content')
 }finally{await ui.close()}
})

test('initial chat loading does not override a saved page position',async()=>{
 const ui=await fixture('chat')
 try{assert.equal(ui.host.querySelector('section')!.dataset.view,'chat');assert.equal(scrolls,0)}finally{await ui.close()}
})

test('desktop chat selection retains the existing page scroll behavior and tab relationships',async()=>{
 const ui=await fixture('posts',false)
 try{
  await ui.click('Live chat');assert.equal(scrolls,0)
  const selected=ui.host.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')!
  const panel=ui.host.querySelector('[role=tabpanel]:not([hidden])')!
  assert.equal(selected.getAttribute('aria-controls'),panel.id)
  assert.equal(panel.getAttribute('aria-labelledby'),selected.id)
 }finally{await ui.close()}
})

test('short phone chat selection reveals the composer instead of clipping it below navigation',async()=>{
 const previousHeight=win.innerHeight
 Object.defineProperty(win,'innerHeight',{configurable:true,value:390})
 const ui=await fixture()
 try{
  await ui.click('Live chat')
  assert.deepEqual(scrollTargets,[{target:'ss-chat-composer',block:'end'}])
 }finally{await ui.close();Object.defineProperty(win,'innerHeight',{configurable:true,value:previousHeight})}
})
