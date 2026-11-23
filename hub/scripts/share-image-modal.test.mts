import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h } from 'react'
import { build } from 'esbuild'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true})
Object.defineProperty(globalThis,'navigator',{configurable:true,value:win.navigator})
const {createRoot}=await import('react-dom/client')
const stubs:Record<string,string>={
 '@/components/ui/ModalSurface':`import React from 'react';export const ModalSurface=({children})=>React.createElement('div',{role:'dialog'},children)`,
 '@/components/ui/SafeImage':`import React from 'react';export const SafeImage=({onFailure,...props})=>React.createElement('img',props)`,
}
const bundle=await build({stdin:{contents:'export {ShareImageModal} from "./src/components/social/ShareImageModal"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'share-review.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'share-fixtures',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const compiled={exports:{} as {ShareImageModal:typeof import('../src/components/social/ShareImageModal').ShareImageModal}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)

async function fixture({status=200,clipboard=async()=>{},share}:{status?:number;clipboard?:(text:string)=>Promise<void>;share?:(input:unknown)=>Promise<void>}={}){
 const originalFetch=globalThis.fetch,originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,originalClick=win.HTMLAnchorElement.prototype.click
 let downloads=0,requests=0,revoked=0
 globalThis.fetch=async()=>{requests++;return new Response(status===200?'image bytes':'service unavailable',{status,headers:{'content-type':status===200?'image/png':'application/json'}})}
 Object.defineProperties(win.navigator,{clipboard:{configurable:true,value:{writeText:clipboard}},share:{configurable:true,value:share},canShare:{configurable:true,value:()=>false}})
 URL.createObjectURL=()=> 'blob:private-share';URL.revokeObjectURL=()=>{revoked++}
 win.HTMLAnchorElement.prototype.click=function(){downloads++}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(h(compiled.exports.ShareImageModal,{postId:'review-post',onClose(){}})))
 return {host,counts:()=>({downloads,requests,revoked}),async click(label:string){const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()===label);assert.ok(button,label);await act(async()=>button.click())},async close(){await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;win.HTMLAnchorElement.prototype.click=originalClick}}
}

test('failed share-image requests cannot download an error response as an image',async()=>{
 const ui=await fixture({status:503})
 try{await ui.click('Download');assert.equal(ui.counts().downloads,0);assert.match(ui.host.querySelector('[role=alert]')!.textContent!,/Could not download/);assert.ok([...ui.host.querySelectorAll<HTMLButtonElement>('button')].some(button=>button.textContent==='Download'&&!button.disabled))}finally{await ui.close()}
})

test('a clipboard denial offers a selectable link and retry clears that fallback',async()=>{
 let fail=true,copied=''
 const ui=await fixture({clipboard:async text=>{if(fail)throw Error('Denied');copied=text}})
 try{await ui.click('Copy Link');assert.equal(ui.host.querySelector<HTMLInputElement>('input')!.value,'https://slipsurge.invalid/posts/review-post');assert.match(ui.host.querySelector('[role=alert]')!.textContent!,/Select the post link/);fail=false;await ui.click('Copy Link');assert.equal(copied,'https://slipsurge.invalid/posts/review-post');assert.equal(ui.host.querySelector('input'),null);assert.match(ui.host.querySelector('[role=status]')!.textContent!,/Link copied/);assert.ok([...ui.host.querySelectorAll('button')].some(button=>button.textContent==='Copied'))}finally{await ui.close()}
})

test('browsers without native sharing copy the link with feedback',async()=>{
 let copied='';const ui=await fixture({clipboard:async text=>{copied=text}})
 try{await ui.click('More');assert.equal(copied,'https://slipsurge.invalid/posts/review-post');assert.equal(ui.counts().requests,0);assert.match(ui.host.querySelector('[role=status]')!.textContent!,/Link copied/)}finally{await ui.close()}
})

test('native-share cancellation stays quiet while a real sharing failure is reported',async()=>{
 for(const failure of [new DOMException('Cancelled','AbortError'),new Error('Share unavailable')]){
  const ui=await fixture({share:async()=>{throw failure}})
  try{await ui.click('More');assert.equal(!!ui.host.querySelector('[role=alert]'),failure.name!=='AbortError');assert.ok([...ui.host.querySelectorAll<HTMLButtonElement>('button')].some(button=>button.textContent==='More'&&!button.disabled))}finally{await ui.close()}
 }
})

test('successful image downloads release their object URL and report completion',async()=>{
 const ui=await fixture()
 try{await ui.click('Download');assert.deepEqual(ui.counts(),{downloads:1,requests:1,revoked:1});assert.match(ui.host.querySelector('[role=status]')!.textContent!,/Image downloaded/)}finally{await ui.close()}
})
