import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require=createRequire(import.meta.url)
const {JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.slipsurge.com/feed',pretendToBeVisual:true})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
const {createRoot}=await import('react-dom/client')
type Account={user:{id:string}|null;profile:{id:string;username:string;tier:string}|null;loading:boolean;authUnavailable:boolean;retrySession:()=>Promise<void>;signOut:()=>Promise<void>}
const account=(id:string|null):Account=>({user:id?{id}:null,profile:id?{id,username:id,tier:'ultimate'}:null,loading:false,authUnavailable:false,retrySession:async()=>{},signOut:async()=>{}})
let auth=account(null),routes:string[]=[]
let notificationLoad:(id:string)=>Promise<{data:unknown[];error:null}>=async()=>({data:[],error:null})
const client={
  from:()=>{
    let userId='',head=false
    const query={
      select:(_columns:string,options?:{head?:boolean})=>{head=Boolean(options?.head);return query},
      eq:(column:string,value:string)=>{if(column==='user_id')userId=value;return query},
      not:()=>query,order:()=>query,limit:()=>query,
      then:<T,>(success:(value:unknown)=>T,failure?:(error:unknown)=>unknown)=>Promise.resolve(head?{count:0}:notificationLoad(userId)).then(success,failure),
    }
    return query
  },
  channel:()=>{const channel={on:()=>channel,subscribe:()=>channel};return channel},removeChannel:()=>{},
}
Object.assign(globalThis,{accountControlFixture:{client,useAuth:()=>auth,push:(url:string)=>routes.push(url)}})
const stubs:Record<string,string>={
  '@/context/AuthContext':'export const useAuth=()=>globalThis.accountControlFixture.useAuth()',
  '@/lib/supabase/client':'export const createClient=()=>globalThis.accountControlFixture.client',
  'next/navigation':'export const useRouter=()=>({push:globalThis.accountControlFixture.push})',
  'next/link':"import {createElement} from 'react';export default function Link({children,...props}){return createElement('a',props,children)}",
  '@/lib/emoji':'export const useCustomEmojis=()=>[]',
  '@/lib/blocks':'export const getBlockedEitherWayIds=async()=>[]',
  '@slipsurge/core/tiers':"export const effectiveTier=(tier)=>tier;export const hasFullAccessOverride=()=>false",
  '@slipsurge/core/mlb-api':'export const mlbHeadshot=()=>null;export const mlbTeamLogo=()=>null',
  '@/lib/nbaAccessPolicy':'export const hasNbaAccess=()=>false',
  '@/components/sports/PlayerAvatar':'export const PlayerAvatar=()=>null;export const TeamLogo=()=>null',
  '@/components/shared/NflTeamLogo':'export const NflTeamLogo=()=>null',
  '@/components/social/NotificationsList':'export const collapseConsecutiveFollows=(rows)=>rows',
  '@/components/ui/badge':'export const Badge=({children})=>children',
  '@/components/social/MemberAvatar':'export const MemberAvatar=()=>null',
  '@/components/ui/SafeImage':'export const SafeImage=()=>null',
  '@/components/ui/FloatingSurface':'export const FloatingSurface=({open,children})=>open?children:null',
  '@/components/social/EmojiText':'export const EmojiText=({text})=>text',
}
const bundle=await build({stdin:{contents:"export {TopBar} from './src/components/layout/TopBar'",resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','lucide-react'],tsconfig:'tsconfig.json',plugins:[{name:'account-controls-fixture',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:resolve('.')}))}}]})
const compiled={exports:{} as {TopBar:ComponentType}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
async function harness(initial:Account){
  auth=initial;routes=[];notificationLoad=async()=>({data:[],error:null})
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const render=async(next:Account)=>{auth=next;await act(async()=>root.render(createElement(compiled.exports.TopBar)))}
  await render(initial)
  const click=async(selector:string)=>{const button=host.querySelector<HTMLButtonElement>(selector);assert.ok(button,selector);await act(async()=>button.click())}
  return{host,render,click,close:async()=>{await act(async()=>root.unmount());host.remove()}}
}

test('account checking and unavailable states do not offer sign-in and Retry uses session recovery',async()=>{
  let retries=0
  const ui=await harness({...account(null),loading:true})
  try{
    assert.match(ui.host.textContent!,/Checking account/)
    assert.equal(ui.host.querySelector('a[href="/auth/login"]'),null)
    await ui.render({...account(null),authUnavailable:true,retrySession:async()=>{retries++}})
    assert.match(ui.host.textContent!,/Account connection unavailable/)
    assert.equal(ui.host.querySelector('a[href="/auth/login"]'),null)
    await ui.click('[role="status"] button')
    assert.equal(retries,1)
    await ui.render(account(null))
    assert.ok(ui.host.querySelector('a[href="/auth/login"]'))
  }finally{await ui.close()}
})

test('TopBar delegates logout to auth context and only navigates after success',async()=>{
  let calls=0
  const ui=await harness({...account('a'),signOut:async()=>{calls++;throw new Error('Temporary outage')}})
  try{
    await ui.click('[aria-label="Open account menu"]')
    await ui.click('.ss-dropdown-item.danger')
    assert.equal(calls,1);assert.deepEqual(routes,[])
    assert.match(ui.host.textContent!,/Sign out could not finish/)
    await ui.render({...account('a'),signOut:async()=>{calls++}})
    await ui.click('.ss-dropdown-item.danger')
    assert.equal(calls,2);assert.deepEqual(routes,['/auth/login'])
  }finally{await ui.close()}
})

test('a late notification response cannot show the previous member activity after account switching',async()=>{
  let complete!:(value:{data:unknown[];error:null})=>void
  const pending=new Promise<{data:unknown[];error:null}>(resolve=>{complete=resolve})
  const ui=await harness(account('a'))
  try{
    notificationLoad=id=>id==='a'?pending:Promise.resolve({data:[],error:null})
    await ui.click('[aria-label="Notifications"]')
    await ui.render(account('b'))
    await act(async()=>complete({data:[{id:'old-notification',type:'message',message:'Private account A activity',created_at:new Date().toISOString(),read:false}],error:null}))
    await ui.click('[aria-label="Notifications"]')
    assert.doesNotMatch(ui.host.textContent!,/Private account A activity/)
    assert.match(ui.host.textContent!,/You're all caught up/)
  }finally{await ui.close()}
})
