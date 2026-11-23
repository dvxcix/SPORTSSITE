import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h } from 'react'
import { build } from 'esbuild'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/groups',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const disabled={feature_blog:false,feature_forum:false,feature_pages:false,feature_events:false}
const state={profile:null as {account_type:string}|null,flags:()=>Promise.resolve<Record<string,boolean>>(disabled)}
Object.assign(globalThis,{communityFlagFixture:state})
const stubs:Record<string,string>={
  'next/link':`import{createElement as h}from'react';export default({children,...props})=>h('a',props,children)`,
  'next/navigation':`export const usePathname=()=>'/groups'`,
  '@/context/AuthContext':`export const useAuth=()=>({profile:globalThis.communityFlagFixture.profile})`,
  '@/lib/featureFlags':`export const FEATURE_FLAGS={blog:'feature_blog',forum:'feature_forum',pages:'feature_pages',events:'feature_events'};export const fetchFeatureFlagsClient=()=>globalThis.communityFlagFixture.flags()`,
  '@/components/ui/FloatingSurface':`import{createElement as h}from'react';export const FloatingSurface=({open,children})=>open?h('div',{role:'dialog'},children):null`,
}
const bundle=await build({stdin:{contents:'export{CommunityMore}from"./src/components/community/CommunityNav"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'community-flags.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'},tsconfig:'tsconfig.json',plugins:[{name:'community-flag-fixtures',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const compiled={exports:{} as {CommunityMore:typeof import('../src/components/community/CommunityNav').CommunityMore}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
const required=['/channels','/messages','/bookmarks','/notifications']
const optional=['/forum','/pages','/events','/blog']
async function menu(profile:{account_type:string}|null,flags:()=>Promise<Record<string,boolean>>){
  state.profile=profile;state.flags=flags
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  await act(async()=>root.render(h(compiled.exports.CommunityMore)))
  await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click())
  return {links:()=>[...host.querySelectorAll('a')].map(link=>link.getAttribute('href')),async close(){await act(async()=>root.unmount());host.remove()}}
}

test('pending flags keep optional destinations off without hiding core community actions',async()=>{
  let finish!:(flags:Record<string,boolean>)=>void
  const result=new Promise<Record<string,boolean>>(resolve=>{finish=resolve})
  const ui=await menu(null,()=>result)
  try{
    assert.deepEqual(ui.links(),required)
    await act(async()=>finish({...disabled,feature_pages:true}))
    assert.deepEqual(ui.links(),[...required,'/pages'])
  }finally{await ui.close()}
})

test('disabled social features stay out of guest and regular-member navigation',async()=>{
  for(const profile of [null,{account_type:'user'}]){
    const ui=await menu(profile,async()=>disabled)
    try{assert.deepEqual(ui.links(),required)}finally{await ui.close()}
  }
})

test('administrators retain access to optional tools without changing their site flags',async()=>{
  const ui=await menu({account_type:'admin'},async()=>disabled)
  try{assert.deepEqual(ui.links(),[...required,...optional]);assert.ok(Object.values(disabled).every(value=>value===false))}finally{await ui.close()}
})

test('a rejected feature lookup preserves the initial off state and usable core destinations',async()=>{
  const ui=await menu({account_type:'user'},async()=>{throw Error('Feature lookup unavailable')})
  try{assert.deepEqual(ui.links(),required)}finally{await ui.close()}
})
