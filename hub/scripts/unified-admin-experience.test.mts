import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h, useState, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import { ADMIN_NAV_LINKS, ADMIN_QUICK_LINKS, adminLinksForQuery, adminRouteForPath } from '../src/components/admin/adminNavigation.ts'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/admin',pretendToBeVisual:true}).window
const fixture={path:'/admin/discord/compose',navigations:[] as string[],readError:false,writeError:false,adminError:null as string|null,settings:[{key:'site_name',value:'Saved SlipSurge name'}],writes:[] as Array<Array<{key:string;value:string}>>}
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true,__adminUiFixture:fixture})
Object.defineProperty(win.HTMLElement.prototype,'offsetParent',{configurable:true,get(this:HTMLElement){return this.closest('[hidden]')?null:document.body}})
let frameId=0
const frames=new Map<number,FrameRequestCallback>()
win.requestAnimationFrame=(callback:FrameRequestCallback)=>{const id=++frameId;frames.set(id,callback);return id}
win.cancelAnimationFrame=(id:number)=>{frames.delete(id)}
const {createRoot}=await import('react-dom/client')

const navigation=`const state=globalThis.__adminUiFixture;export const usePathname=()=>state.path;export const useRouter=()=>({push(href){state.navigations.push(href)}});export function redirect(href){throw new Error('Redirect '+href)}`
const client=`const state=globalThis.__adminUiFixture;export const createClient=()=>({from(){return{select(){return{async in(){return{data:state.readError?null:state.settings,error:state.readError?{message:'Read failed'}:null}}}},async upsert(rows){state.writes.push(rows);if(state.writeError)throw new Error('Network failed');return{error:null}}}}});`
const admin=`const state=globalThis.__adminUiFixture;class Query{constructor(name){this.name=name}select(){return this}eq(){return this}neq(){return this}or(){return this}in(){return this}gte(){return this}order(){return this}limit(){return this}then(resolve,reject){const failed=state.adminError===this.name;return Promise.resolve({data:[],count:failed?null:0,error:failed?{message:'Unavailable'}:null}).then(resolve,reject)}}export const createAdminClient=()=>({from:name=>new Query(name)});`
const stubs:Record<string,string>={
  'next/navigation':navigation,
  'next/link':`import {createElement} from 'react';export default function Link({href,...props}){return createElement('a',{href,...props})}`,
  'next/image':`import {createElement} from 'react';export default function Image({fill,unoptimized,preload,...props}){return createElement('img',props)}`,
  '@/lib/supabase/client':client,
  '@/lib/supabase/admin':admin,
  '@/components/layout/AccountMenu':`export function AccountMenu(){return null}`,
  '@/components/social/EmojiText':`export function EmojiText({text}){return text}`,
}
const bundle=await build({stdin:{contents:'export {AdminCommandPalette} from "./src/components/admin/AdminCommandPalette";export {AdminSidebar} from "./src/components/admin/AdminSidebar";export {AdminKeyValueSettings} from "./src/components/admin/AdminKeyValueSettings";export {TerminateMembershipTool} from "./src/components/admin/TerminateMembershipTool";export {default as AdminUsersPage} from "./src/app/admin/users/page";export {default as AdminDashboard} from "./src/app/admin/page"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'admin-experience.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-dom/server'],plugins:[{name:'admin-ui-fixture',setup(builder){builder.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}));builder.onLoad({filter:/\.module\.css$/},()=>({contents:'export default new Proxy({},{get:(_,key)=>String(key)})',loader:'js'}))}}]})
const compiled={exports:{} as {AdminCommandPalette:typeof import('../src/components/admin/AdminCommandPalette').AdminCommandPalette;AdminSidebar:typeof import('../src/components/admin/AdminSidebar').AdminSidebar;AdminKeyValueSettings:typeof import('../src/components/admin/AdminKeyValueSettings').AdminKeyValueSettings;TerminateMembershipTool:typeof import('../src/components/admin/TerminateMembershipTool').TerminateMembershipTool;AdminUsersPage:typeof import('../src/app/admin/users/page').default;AdminDashboard:typeof import('../src/app/admin/page').default}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)

async function mount(children:ReactNode){
  const opener=document.createElement('button');opener.textContent='Open tool';document.body.append(opener);opener.focus()
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  await act(async()=>root.render(children));await act(async()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(0))})
  return {host,opener,async close(){await act(async()=>root.unmount());host.remove();opener.remove();frames.clear();fixture.navigations=[];fixture.readError=false;fixture.writeError=false;fixture.writes=[];fixture.adminError=null}}
}
async function press(element:Element,key:string){await act(async()=>element.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})))}
async function click(element:Element){await act(async()=>element.dispatchEvent(new win.MouseEvent('click',{bubbles:true})))}
async function fill(input:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new win.Event('input',{bubbles:true}))})}
function Palette(){const[open,setOpen]=useState(true);return h(compiled.exports.AdminCommandPalette,{open,onClose:()=>setOpen(false)})}

test('admin discovery includes distinct tools and picks only the deepest current destination',()=>{
  assert.equal(ADMIN_NAV_LINKS.length,new Set(ADMIN_NAV_LINKS.map(link=>link.href)).size)
  assert.equal(adminRouteForPath('/admin/discord/compose')?.href,'/admin/discord/compose')
  assert.ok(adminLinksForQuery('WHOP renewal').some(link=>link.href==='/admin/whop-renewal-shape'))
  assert.ok(adminLinksForQuery('member access').some(link=>link.href==='/admin/users'))
  assert.deepEqual(adminLinksForQuery('not-a-real-admin-workspace'),[])
  assert.ok(ADMIN_QUICK_LINKS.every(link=>ADMIN_NAV_LINKS.includes(link)))
})

test('palette arrow navigation selects the focused task instead of always opening the first result',async()=>{
  const ui=await mount(h(Palette))
  try{
    const input=document.querySelector<HTMLInputElement>('input[type=search]')!
    assert.equal(document.activeElement,input)
    await press(input,'ArrowDown');await press(document.activeElement!,'ArrowDown')
    assert.match(document.activeElement!.textContent!,/Creator operations/)
    await click(document.activeElement!)
    assert.deepEqual(fixture.navigations,['/admin/creators'])
    assert.equal(document.querySelector('[role=dialog]'),null)
    assert.equal(document.activeElement,ui.opener)
  }finally{await ui.close()}
})

test('palette reports no matches and Escape restores focus and document scrolling',async()=>{
  const ui=await mount(h(Palette))
  try{
    await fill(document.querySelector<HTMLInputElement>('input[type=search]')!,'nowhere-in-admin')
    assert.match(document.querySelector('[role=status]')!.textContent!,/No admin tools match/)
    await press(document.activeElement!,'Escape')
    assert.equal(document.querySelector('[role=dialog]'),null)
    assert.equal(document.body.style.overflow,'')
    assert.equal(document.activeElement,ui.opener)
  }finally{await ui.close()}
})

test('phone navigation uses the shared focus lifecycle and has one current route per navigation',async()=>{
  let closed=0
  const ui=await mount(h(compiled.exports.AdminSidebar,{open:true,onClose:()=>{closed++}}))
  try{
    const dialog=document.querySelector('[role=dialog]')!
    assert.equal(dialog.getAttribute('aria-label'),'Admin navigation')
    assert.equal(dialog.querySelectorAll('a[aria-current=page]').length,1)
    assert.equal(dialog.querySelector('a[aria-current=page]')!.getAttribute('href'),'/admin/discord/compose')
    await press(document.activeElement!,'Escape');assert.equal(closed,1)
  }finally{await ui.close()}
})

test('member search submits name, account type and membership together with explicit empty feedback',async()=>{
  const markup=renderToStaticMarkup(await compiled.exports.AdminUsersPage({searchParams:Promise.resolve({q:'A & B',type:'creator',tier:'ultimate'})}))
  const page:Document=new JSDOM(markup).window.document
  const form=page.querySelector<HTMLFormElement>('form[aria-label="Find member accounts"]')!
  assert.equal(form.getAttribute('method'),'get')
  assert.equal(form.getAttribute('action'),'/admin/users')
  assert.equal(form.querySelector<HTMLInputElement>('[name=q]')!.value,'A & B')
  assert.equal(form.querySelector<HTMLSelectElement>('[name=type]')!.value,'creator')
  assert.equal(form.querySelector<HTMLSelectElement>('[name=tier]')!.value,'ultimate')
  assert.match(page.body.textContent!,/No accounts match these filters/)
  assert.ok(page.querySelector('details summary')!.textContent!.includes('Advanced membership'))
})

test('failed dashboard reads stay unavailable and cannot become an all-clear zero',async()=>{
  fixture.adminError='reports'
  try{
    const markup=renderToStaticMarkup(await compiled.exports.AdminDashboard())
    const page=new JSDOM(markup).window.document
    assert.match(page.body.textContent!,/Status incomplete/)
    assert.match(page.body.textContent!,/Status unavailable/)
    assert.doesNotMatch(page.body.textContent!,/All clear|All queues clear/)
  }finally{fixture.adminError=null}
})

const settingsFields=[{key:'site_name',label:'Site name',type:'text' as const,default:'Default name'}]
test('failed settings reads never expose editable defaults or allow an overwrite, and retry loads saved values',async()=>{
  fixture.readError=true
  const ui=await mount(h(compiled.exports.AdminKeyValueSettings,{fields:settingsFields}))
  try{
    assert.equal(ui.host.querySelector('input'),null)
    assert.match(ui.host.querySelector('[role=alert]')!.textContent!,/Saved settings could not be loaded/)
    assert.equal(fixture.writes.length,0)
    fixture.readError=false
    await click(ui.host.querySelector('button')!)
    assert.equal(ui.host.querySelector<HTMLInputElement>('input')!.value,'Saved SlipSurge name')
    assert.equal(ui.host.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled,true)
  }finally{await ui.close()}
})

test('settings save failures retain edits and a successful retry confirms the actual saved values',async()=>{
  const ui=await mount(h(compiled.exports.AdminKeyValueSettings,{fields:settingsFields}))
  try{
    const input=ui.host.querySelector<HTMLInputElement>('input')!
    assert.equal(ui.host.querySelector('label')!.htmlFor,input.id)
    await fill(input,'Updated SlipSurge name')
    fixture.writeError=true
    await act(async()=>ui.host.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(input.value,'Updated SlipSurge name')
    assert.match(ui.host.querySelector('[role=alert]')!.textContent!,/Your edits are still here/)
    fixture.writeError=false
    await act(async()=>ui.host.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true})))
    assert.deepEqual(fixture.writes.at(-1),[{key:'site_name',value:'Updated SlipSurge name'}])
    assert.match(ui.host.querySelector('[role=status]')!.textContent!,/Changes saved/)
  }finally{await ui.close()}
})

test('membership cancellation has a reversible confirmation step before any request',async()=>{
  const ui=await mount(h(compiled.exports.TerminateMembershipTool))
  try{
    await fill(ui.host.querySelector('input')!,'mem_local_review')
    await click([...ui.host.querySelectorAll('button')].find(button=>button.textContent==='Terminate')!)
    assert.ok([...ui.host.querySelectorAll('button')].some(button=>button.textContent==='Confirm cancellation'))
    await click([...ui.host.querySelectorAll('button')].find(button=>button.textContent==='Keep membership')!)
    assert.ok([...ui.host.querySelectorAll('button')].some(button=>button.textContent==='Terminate'))
  }finally{await ui.close()}
})
