import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h } from 'react'
import { build } from 'esbuild'
import type { ChangelogEntry } from '../src/lib/changelog'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/admin/changelog',pretendToBeVisual:true}).window
type WriteResult={error:{message:string}|null}
const fixture={auth:'ok' as 'ok'|'missing'|'throw',saveThrows:false,refreshes:0,authCalls:0,writes:[] as Array<{operation:string;payload:Record<string,unknown>}>,visibility:null as Promise<WriteResult>|null}
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Node:win.Node,NodeFilter:win.NodeFilter,MutationObserver:win.MutationObserver,CustomEvent:win.CustomEvent,getComputedStyle:win.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true,__changelogFixture:fixture})
Object.defineProperty(globalThis,'navigator',{configurable:true,value:win.navigator})
Object.defineProperty(win.HTMLElement.prototype,'offsetParent',{configurable:true,get(this:HTMLElement){return this.closest('[hidden]')?null:document.body}})
const {createRoot}=await import('react-dom/client')
const client=`const state=globalThis.__changelogFixture;class Query{constructor(operation,payload){this.operation=operation;this.payload=payload;state.writes.push({operation,payload})}eq(){return this}select(){return this}async single(){if(state.saveThrows)throw new Error('Network failed');return{data:{id:'saved-entry',...this.payload,created_at:'2026-11-23T00:00:00Z'},error:null}}then(resolve,reject){return(state.visibility||Promise.resolve({error:null})).then(resolve,reject)}}export const createClient=()=>({auth:{async getUser(){state.authCalls++;if(state.auth==='throw')throw new Error('Session request failed');return{data:{user:state.auth==='missing'?null:{id:'local-admin'}},error:null}}},from(){return{update:payload=>new Query('update',payload),insert:payload=>new Query('insert',payload)}}});`
const stubs:Record<string,string>={
  '@/lib/supabase/client':client,
  'next/navigation':`export const useRouter=()=>({refresh(){globalThis.__changelogFixture.refreshes++}});`,
  '@/lib/uploadMedia':`export async function uploadMedia(){return{error:'Uploads are outside this isolated component test.'}}`,
  '@/lib/productTelemetry':`export function recordProductInteraction(){}`,
}
const bundle=await build({stdin:{contents:'export {ChangelogManager} from "./src/app/admin/changelog/ChangelogManager";export {FeedbackProvider} from "./src/components/ui/FeedbackProvider";',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'changelog-publisher.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'changelog-isolation',setup(builder){builder.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}));builder.onLoad({filter:/\.module\.css$/},()=>({contents:'export default new Proxy({},{get:(_,key)=>String(key)})',loader:'js'}))}}]})
const compiled={exports:{} as {ChangelogManager:typeof import('../src/app/admin/changelog/ChangelogManager').ChangelogManager;FeedbackProvider:typeof import('../src/components/ui/FeedbackProvider').FeedbackProvider}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
const entry:ChangelogEntry={id:'entry-local',title:'Navigation update',description:'Find your communities and research.',how_to_use:null,screenshot_urls:[],is_active:false,audience_tier:'all',created_by:'local-admin',created_at:'2026-11-23T00:00:00Z',updated_at:'2026-11-23T00:00:00Z'}

async function mount(entries:ChangelogEntry[]=[]){
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  await act(async()=>root.render(h(compiled.exports.FeedbackProvider,null,h(compiled.exports.ChangelogManager,{initialEntries:entries}))))
  return {host,async close(){await act(async()=>root.unmount());host.remove();fixture.auth='ok';fixture.authCalls=0;fixture.saveThrows=false;fixture.refreshes=0;fixture.writes=[];fixture.visibility=null}}
}
async function click(element:Element){await act(async()=>element.dispatchEvent(new win.MouseEvent('click',{bubbles:true})))}
async function fill(input:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{const type=input.tagName==='TEXTAREA'?win.HTMLTextAreaElement:win.HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new win.Event('input',{bubbles:true}))})}
function button(scope:ParentNode,name:string){const found=[...scope.querySelectorAll<HTMLButtonElement>('button')].find(element=>element.textContent?.trim()===name);assert.ok(found,name);return found}
function field(scope:ParentNode,label:string){const found=[...scope.querySelectorAll<HTMLLabelElement>('label')].find(element=>element.textContent===label);assert.ok(found,label);const control=document.getElementById(found.htmlFor);assert.ok(control instanceof win.HTMLInputElement||control instanceof win.HTMLTextAreaElement,label+' control');return control as HTMLInputElement|HTMLTextAreaElement}
async function draft(host:HTMLElement){await click(button(host,'+ New Entry'));await fill(field(host,'Title'),'Member navigation');await fill(field(host,'What changed'),'Your communities and saved picks are easier to reach.');await fill(field(host,'How to use it (optional)'),'Use Communities from the main navigation.')}

test('a thrown save failure retains the labelled draft and resets the pending action',async()=>{
  const ui=await mount()
  try{
    await draft(ui.host);fixture.saveThrows=true
    await click(button(ui.host,'Save Entry'))
    assert.equal(field(ui.host,'Title').value,'Member navigation')
    assert.equal(field(ui.host,'What changed').value,'Your communities and saved picks are easier to reach.')
    assert.equal(field(ui.host,'How to use it (optional)').value,'Use Communities from the main navigation.')
    assert.match(ui.host.querySelector('[role=alert]')!.textContent!,/draft is still here/)
    assert.equal(button(ui.host,'Save Entry').disabled,false)
    assert.equal(fixture.refreshes,0)
    assert.equal(fixture.writes.length,1)
    assert.equal(fixture.writes[0].payload.is_active,false,'a new draft must not silently publish')
  }finally{await ui.close()}
})

test('missing or rejected session checks leave the draft intact without a database write',async()=>{
  for(const auth of ['missing','throw'] as const){
    const ui=await mount()
    try{
      await draft(ui.host);fixture.auth=auth
      await click(button(ui.host,'Save Entry'))
      assert.equal(field(ui.host,'Title').value,'Member navigation')
      assert.match(ui.host.querySelector('[role=alert]')!.textContent!,/draft is still here/)
      assert.equal(fixture.writes.length,0)
      assert.equal(fixture.refreshes,0)
      assert.equal(button(ui.host,'Save Entry').disabled,false)
    }finally{await ui.close()}
  }
})

test('a pending visibility change blocks duplicate clicks and a rejected update keeps its previous state',async()=>{
  let resolveVisibility:(value:WriteResult)=>void=()=>{}
  fixture.visibility=new Promise(resolve=>{resolveVisibility=resolve})
  const ui=await mount([entry])
  try{
    const toggle=ui.host.querySelector<HTMLButtonElement>('[role=switch]')!
    assert.equal(toggle.getAttribute('aria-checked'),'false')
    await click(toggle)
    assert.equal(toggle.disabled,true)
    assert.equal(toggle.getAttribute('aria-checked'),'false','pending publication must not be shown as active')
    await click(toggle);assert.equal(fixture.writes.length,1)
    await act(async()=>resolveVisibility({error:{message:'Publishing is temporarily unavailable.'}}))
    assert.equal(toggle.disabled,false)
    assert.equal(toggle.getAttribute('aria-checked'),'false')
    assert.match(document.querySelector('[role=alert]')!.textContent!,/Visibility unchanged.*Publishing is temporarily unavailable/)
  }finally{await ui.close()}
})

test('a thrown visibility request keeps an already active entry active and reports failure',async()=>{
  let rejectVisibility:(reason:Error)=>void=()=>{}
  fixture.visibility=new Promise((_resolve,reject)=>{rejectVisibility=reject})
  const ui=await mount([{...entry,is_active:true}])
  try{
    const toggle=ui.host.querySelector<HTMLButtonElement>('[role=switch]')!
    await click(toggle)
    assert.equal(toggle.disabled,true)
    await act(async()=>rejectVisibility(new Error('Connection lost')))
    assert.equal(toggle.disabled,false)
    assert.equal(toggle.getAttribute('aria-checked'),'true')
    assert.match(document.querySelector('[role=alert]')!.textContent!,/Visibility unchanged.*Please retry/)
  }finally{await ui.close()}
})

test('the real member popup preview opens, dismisses and closes with Escape without database activity',async()=>{
  const ui=await mount()
  try{
    await draft(ui.host)
    await click(button(ui.host,'Preview popup'))
    const popup=document.querySelector<HTMLElement>('[role=dialog]')!
    assert.ok(popup)
    assert.equal(popup.getAttribute('aria-label'),"What's new in SlipSurge")
    assert.match(popup.textContent!,/Member navigation/)
    assert.match(popup.textContent!,/Your communities and saved picks are easier to reach/)
    await click(button(popup,"Got it. Don't show again"))
    assert.equal(document.querySelector('[role=dialog]'),null)
    await click(button(ui.host,'Preview popup'))
    await act(async()=>document.querySelector('[role=dialog]')!.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})))
    assert.equal(document.querySelector('[role=dialog]'),null)
    assert.equal(field(ui.host,'Title').value,'Member navigation')
    assert.equal(fixture.writes.length,0)
    assert.equal(fixture.authCalls,0)
    assert.equal(fixture.refreshes,0)
  }finally{await ui.close()}
})
