import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { build } from 'esbuild'

const require=createRequire(import.meta.url), {JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/onboarding'}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,localStorage:win.localStorage,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const stubs:Record<string,string>={
 'next/navigation':`export const useRouter=()=>({push(){},replace(){}})`,
 'next/link':`import{createElement as h}from'react';export default({children,...props})=>h('a',props,children)`,
 'next/image':`import{createElement as h}from'react';export default({fill,preload,...props})=>h('img',props)`,
 'motion/react':`import{createElement as h}from'react';export const AnimatePresence=({children})=>children;export const motion=new Proxy({},{get:(_,tag)=>({children,initial,animate,exit,transition,variants,...props})=>h(tag,props,children)})`,
 '@/lib/uploadMedia':`export const uploadMedia=()=>{throw Error('Uploads must not run in this test')}`,
 '@/lib/productAnalytics':`export const trackProductEvent=()=>{}`,
 '@/components/social/SuggestedUsers':`export const SuggestedUsers=()=>null`,
 '@/components/ui/Switch':`export const Switch=()=>null`,
 '@/components/profile/FavoritePicker':`export const FavoritePicker=()=>null`,
 '@/components/ui/SafeImage':`import{createElement as h}from'react';export const SafeImage=({fallback,...props})=>props.src?h('img',props):fallback`,
}
const bundle=await build({stdin:{contents:`export{OnboardingFlow}from'./src/components/onboarding/OnboardingFlow'`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'onboarding-draft.cjs',format:'cjs',platform:'node',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'onboarding-fixtures',setup(b){b.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:resolve('.')}))}}]})
const compiled={exports:{} as Record<string,ComponentType<any>>};new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
const props={userId:'review-member',initialProfile:{display_name:'Original name'},accountType:'user',suggestedUsers:[],suggestedGroups:[]},key='slipsurge:onboarding:review-member'
async function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(h(compiled.exports.OnboardingFlow,props)));return{host,close:async()=>{await act(async()=>root.unmount());host.remove()}}}

test('setup is inert before draft restoration and opens the saved step without exposing a false welcome action',async()=>{
 localStorage.clear();localStorage.setItem(key,JSON.stringify({step:3,displayName:'Saved name',teams:['NBA:BOS'],sports:['NBA']}))
 const html=renderToString(h(compiled.exports.OnboardingFlow,props));assert.match(html,/Preparing your setup/);assert.doesNotMatch(html,/Get Started/)
 const ui=await mount();try{assert.equal(ui.host.querySelector('h2')?.textContent,'Your Sports');assert.equal(ui.host.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'),'4');assert.equal(JSON.parse(localStorage.getItem(key)!).displayName,'Saved name')}finally{await ui.close()}
})

test('unavailable browser storage still allows setup to open',async()=>{
 const prototype=Object.getPrototypeOf(localStorage),get=prototype.getItem,remove=prototype.removeItem,set=prototype.setItem
 prototype.getItem=prototype.removeItem=prototype.setItem=()=>{throw Error('Storage denied')}
 try{const ui=await mount();try{assert.match(ui.host.querySelector('h1')?.textContent??'',/Set up SlipSurge/);assert.ok([...ui.host.querySelectorAll('button')].some(button=>button.textContent?.includes('Get Started')))}finally{await ui.close()}}finally{prototype.getItem=get;prototype.removeItem=remove;prototype.setItem=set}
})

test('the final review can return to setup without finishing or losing the saved draft',async()=>{
 localStorage.clear();localStorage.setItem(key,JSON.stringify({step:7,displayName:'Saved name'}))
 const ui=await mount();try{assert.equal(ui.host.querySelector('h2')?.textContent,'Your account is ready');const back=[...ui.host.querySelectorAll('button')].find(button=>button.textContent==='Back')!;await act(async()=>back.click());assert.equal(ui.host.querySelector('h2')?.textContent,'Who to Follow');assert.equal(JSON.parse(localStorage.getItem(key)!).displayName,'Saved name');assert.equal(JSON.parse(localStorage.getItem(key)!).step,6)}finally{await ui.close()}
})
