import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'
import type { Session } from '@supabase/supabase-js'

const require=createRequire(import.meta.url)
const {JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.slipsurge.com/feed',pretendToBeVisual:true})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
const {createRoot}=await import('react-dom/client')
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return{promise,resolve}}
const session=(id:string,token=id):Session=>({user:{id},access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600} as Session)
type AuthResult={data:{session:Session|null};error:Error|null}
type Snapshot={user:{id:string}|null;profile:{id:string}|null;session:Session|null;loading:boolean;authUnavailable:boolean;retrySession:()=>Promise<void>;refreshProfile:()=>Promise<void>;signOut:()=>Promise<void>}
type Fixture={getSession:()=>Promise<AuthResult>;refreshSession:()=>Promise<AuthResult>;signOut:(options:unknown)=>Promise<{error:Error|null}>;readProfile:(signal:AbortSignal)=>Promise<Response>;callbacks:Set<(event:string,next:Session|null)=>void>;sessionReads:number;refreshes:number;profileReads:number;scopes:unknown[];snapshot:Snapshot|null;signals:AbortSignal[]}
let fixture:Fixture
const client={auth:{
  getSession:()=>{fixture.sessionReads++;return fixture.getSession()},
  refreshSession:()=>{fixture.refreshes++;return fixture.refreshSession()},
  signOut:(options:unknown)=>{fixture.scopes.push(options);return fixture.signOut(options)},
  onAuthStateChange:(callback:(event:string,next:Session|null)=>void)=>{fixture.callbacks.add(callback);return{data:{subscription:{unsubscribe:()=>fixture.callbacks.delete(callback)}}}},
}}
;(globalThis as typeof globalThis & {authFixtureClient:typeof client}).authFixtureClient=client
const stubs:Record<string,string>={
  '@/lib/supabase/client':'export const createClient=()=>globalThis.authFixtureClient',
  '@/lib/desktopNotifications':'export const isSlipSurgeDesktop=()=>true',
  '@/lib/browserPush':'export const syncBrowserPushSubscription=async()=>{}',
}
const bundle=await build({stdin:{contents:"export {AuthProvider,useAuth} from './src/context/AuthContext'",resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',plugins:[{name:'auth-fixture',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:resolve('.')}))}}]})
const compiled={exports:{} as {AuthProvider:ComponentType<{children:React.ReactNode}>;useAuth:()=>Snapshot}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
const originalFetch=globalThis.fetch
function Probe(){const value=compiled.exports.useAuth();fixture.snapshot=value;return createElement('output',null,JSON.stringify({id:value.user?.id,profile:value.profile?.id,loading:value.loading,unavailable:value.authUnavailable}))}
async function harness(options:Partial<Fixture>={}){
  fixture={getSession:async()=>({data:{session:session('a')},error:null}),refreshSession:async()=>({data:{session:session('a')},error:null}),signOut:async()=>{for(const callback of fixture.callbacks)callback('SIGNED_OUT',null);return{error:null}},readProfile:async()=>Response.json({profile:{id:'a',tier:'ultimate'}}),callbacks:new Set(),sessionReads:0,refreshes:0,profileReads:0,scopes:[],snapshot:null,signals:[],...options}
  globalThis.fetch=async(_input,init)=>{fixture.profileReads++;fixture.signals.push(init!.signal as AbortSignal);return fixture.readProfile(init!.signal as AbortSignal)}
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  await act(async()=>root.render(createElement(compiled.exports.AuthProvider,null,createElement(Probe))))
  return{state:()=>fixture.snapshot!,emit:async(event:string,next:Session|null)=>{await act(async()=>{for(const callback of fixture.callbacks)callback(event,next)})},resume:async(event='online')=>{await act(async()=>window.dispatchEvent(new dom.window.Event(event)))},close:async()=>{await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch}}
}

test('cold auth outage is unavailable rather than signed out, then reconnect restores the profile',async()=>{
  const ui=await harness({getSession:async()=>({data:{session:null},error:new Error('AuthRetryableFetchError')})})
  try{
    await ui.emit('INITIAL_SESSION',null)
    assert.equal(ui.state().authUnavailable,true);assert.equal(ui.state().loading,false);assert.equal(ui.state().user,null)
    assert.equal(fixture.profileReads,0);assert.deepEqual(fixture.scopes,[])
    fixture.getSession=async()=>({data:{session:session('a')},error:null})
    await ui.resume()
    assert.equal(ui.state().user?.id,'a');assert.equal(ui.state().profile?.id,'a');assert.equal(ui.state().authUnavailable,false)
  }finally{await ui.close()}
})

test('empty initial event and transient background refresh keep the established identity and profile',async()=>{
  const ui=await harness()
  try{
    await ui.emit('INITIAL_SESSION',null)
    assert.equal(ui.state().profile?.id,'a')
    fixture.getSession=async()=>{throw new Error('Network unavailable')}
    await ui.resume('focus')
    assert.equal(ui.state().user?.id,'a');assert.equal(ui.state().profile?.id,'a');assert.equal(ui.state().session?.access_token,'a')
    assert.equal(ui.state().authUnavailable,true);assert.equal(ui.state().loading,false)
    await ui.emit('TOKEN_REFRESHED',session('a','new-token'))
    assert.equal(ui.state().session?.access_token,'new-token');assert.equal(fixture.profileReads,1)
  }finally{await ui.close()}
})

test('account 503 preserves identity and retries without forcing token rotation',async()=>{
  const ui=await harness({readProfile:async()=>Response.json({code:'AUTH_TEMPORARILY_UNAVAILABLE'},{status:503})})
  try{
    assert.equal(ui.state().user?.id,'a');assert.equal(ui.state().profile,null);assert.equal(ui.state().loading,false);assert.equal(ui.state().authUnavailable,true)
    assert.equal(fixture.refreshes,0)
    fixture.readProfile=async()=>Response.json({profile:{id:'a'}})
    await act(async()=>ui.state().retrySession())
    assert.equal(ui.state().profile?.id,'a');assert.equal(ui.state().authUnavailable,false)
  }finally{await ui.close()}
})

test('confirmed sign-out aborts a profile request and its late response cannot restore account data',async()=>{
  const profile=deferred<Response>(),ui=await harness({readProfile:()=>profile.promise})
  try{
    assert.equal(ui.state().loading,true, 'initial loading includes the pending profile hydration')
    await ui.emit('SIGNED_OUT',null)
    assert.equal(fixture.signals[0].aborted,true)
    await act(async()=>profile.resolve(Response.json({profile:{id:'a',tier:'ultimate'}})))
    assert.equal(ui.state().user,null);assert.equal(ui.state().profile,null);assert.equal(ui.state().session,null);assert.equal(ui.state().loading,false)
  }finally{await ui.close()}
})

test('a different signed-in user cannot receive the previous user delayed profile',async()=>{
  const profile=deferred<Response>(),ui=await harness({readProfile:()=>profile.promise})
  try{
    fixture.readProfile=async()=>Response.json({profile:{id:'b'}})
    await ui.emit('SIGNED_IN',session('b'))
    await act(async()=>profile.resolve(Response.json({profile:{id:'a'}})))
    assert.equal(ui.state().user?.id,'b');assert.equal(ui.state().profile?.id,'b')
  }finally{await ui.close()}
})

test('an older bootstrap read cannot undo a newer sign-in or confirmed logout',async()=>{
  for(const signedIn of [true,false]){
    const initial=deferred<AuthResult>(),ui=await harness({getSession:()=>initial.promise,readProfile:async()=>Response.json({profile:{id:'b'}})})
    try{
      await ui.emit(signedIn?'SIGNED_IN':'SIGNED_OUT',signedIn?session('b'):null)
      await act(async()=>initial.resolve({data:{session:session('a')},error:null}))
      assert.equal(ui.state().user?.id??null,signedIn?'b':null)
      assert.equal(ui.state().profile?.id??null,signedIn?'b':null)
    }finally{await ui.close()}
  }
})

test('ordinary logout uses local scope; a failed logout preserves account state',async()=>{
  const ui=await harness()
  try{
    fixture.signOut=async()=>({error:new Error('Service unavailable')})
    await act(async()=>{await assert.rejects(ui.state().signOut(),/Service unavailable/)})
    assert.equal(ui.state().user?.id,'a');assert.equal(ui.state().profile?.id,'a')
    fixture.signOut=async()=>{for(const callback of fixture.callbacks)callback('SIGNED_OUT',null);return{error:null}}
    await act(async()=>ui.state().signOut())
    assert.deepEqual(fixture.scopes,[{scope:'local'},{scope:'local'}])
    assert.equal(ui.state().user,null);assert.equal(ui.state().profile,null)
  }finally{await ui.close()}
})

test('foreground event bursts coalesce one session recovery and account 401 gets one bounded refresh',async()=>{
  const ui=await harness()
  try{
    const pending=deferred<AuthResult>();fixture.getSession=()=>pending.promise
    await act(async()=>{for(const event of ['focus','online','pageshow'])window.dispatchEvent(new dom.window.Event(event))})
    assert.equal(fixture.sessionReads,2)
    await act(async()=>pending.resolve({data:{session:session('a')},error:null}))
    fixture.readProfile=async()=>Response.json({},{status:401})
    await act(async()=>ui.state().refreshProfile())
    assert.equal(fixture.refreshes,1);assert.equal(fixture.profileReads,3)
    assert.equal(ui.state().profile?.id,'a');assert.equal(ui.state().authUnavailable,true)
  }finally{await ui.close()}
})
