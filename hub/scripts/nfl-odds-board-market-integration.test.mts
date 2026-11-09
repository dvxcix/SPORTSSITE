import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement } from 'react'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com/the-sideline'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})
const {createRoot}=await import('react-dom/client')
const state={calls:0,bundleCalls:0,auth:0,clockCalls:0,failClock:false,missing:false,failRequest:false,token:'a'.repeat(64),observedAt:new Date(Date.now()-1000).toISOString(),poll:null as null|((signal:AbortSignal)=>Promise<void>),latest:null as null|{phase:{gameId:string;token:string|null;observedAt:string|null;checkedAt:number}|null;safe:boolean;reason:string}}
;(globalThis as typeof globalThis&{marketFixture:typeof state}).marketFixture=state
const stubs:Record<string,string>={
  'next/server':`export class NextResponse extends Response{static json(v,o={}){return new Response(JSON.stringify(v),{...o,headers:{'Content-Type':'application/json',...o.headers}})}}`,
  '@/lib/nflAccess':`export async function requireNflAccess(){globalThis.marketFixture.auth++;return {userId:'member'}}`,
  '@/app/the-sideline/data':``,
  '../data':`export const getSidelineGames=async()=>({games:[{id:'game',gameday:'2020-11-02'}]});export const getSidelineOddsBundle=async()=>{globalThis.marketFixture.bundleCalls++;return {odds:{players:[],capturedAt:null},gameState:null}};export const getSidelineTimeline=async()=>[];export const getSidelineCapture=async()=>null;export const storedGameState=()=>null`,
  '@/lib/nflTouchdownFeed':`export const getNflTouchdownFeed=async()=>[]`,
  '@/lib/nflPublicResultsServer':`export const getNflPublicResults=async()=>null`,
  '@/lib/nflPregameResearchData':`export const nflPregameOpen=()=>true`,
  '@/lib/nflOddsBoardClock':`export const sharedNflOddsBoardClocks=async()=>{const s=globalThis.marketFixture;s.clockCalls++;if(s.failClock)throw Error('clock unavailable');return {clocks:[],observedAt:s.observedAt}};export const nflOddsBoardClockToken=()=>globalThis.marketFixture.token`,
  '@/lib/sidelineWire':`export const packSidelineBoard=x=>x;export const unpackSidelineBoard=x=>x`,
  '@/lib/nflAvailability':`export const withGameAvailability=x=>x`,
  '@/lib/nflPolling':`export function startNflPolling(refresh){globalThis.marketFixture.poll=refresh;return()=>{if(globalThis.marketFixture.poll===refresh)globalThis.marketFixture.poll=null}}`,
}
const bundled=await build({stdin:{contents:`import {useSidelineMarket} from './src/app/the-sideline/useSidelineMarket';import {nflOddsBoardTrust} from './src/lib/nflOddsBoardTrust';export {GET} from './src/app/the-sideline/market/route';export function Harness({open,openedAt,proof}){const value=useSidelineMarket('game',{players:[],capturedAt:null},null,[],[],null,open);const result=nflOddsBoardTrust(proof,value.oddsBoardPhase,openedAt,Date.now());globalThis.marketFixture.latest={phase:value.oddsBoardPhase,safe:result.safe,reason:result.reason};return null}`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'market-integration.cjs',platform:'node',format:'cjs',jsx:'automatic',tsconfig:'tsconfig.json',external:['react','react-dom'],plugins:[{name:'fixtures',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}))}}]})
const compiled={exports:{} as {GET:(request:Request)=>Promise<Response>;Harness:React.ComponentType<{open:boolean;openedAt:number;proof:{phaseToken:string;phaseObservedAt:string;nextStart:null}}>}}
new Function('module','exports','require',bundled.outputFiles[0].text)(compiled,compiled.exports,require)

test('market route supplies original proof only for the open board and the client fails closed on changed, missing, or failed proof',async()=>{
  const oldFetch=globalThis.fetch,host=document.createElement('div'),root=createRoot(host),openedAt=Date.now()-100,proof={phaseToken:state.token,phaseObservedAt:new Date(Date.now()-2000).toISOString(),nextStart:null}
  document.body.append(host)
  globalThis.fetch=async(input)=>{state.calls++;if(state.failRequest)throw Error('network');const response=await compiled.exports.GET(new Request(new URL(String(input),'https://www.slipsurge.com')));if(!state.missing)return response;const value=await response.json();delete value.oddsBoardToken;return Response.json(value)}
  const render=async(open:boolean)=>{await act(async()=>{root.render(createElement(compiled.exports.Harness,{open,openedAt,proof}));await new Promise(resolve=>setTimeout(resolve,1))})}
  const poll=async()=>{assert.ok(state.poll);await act(async()=>{await state.poll!(new AbortController().signal).catch(()=>{});await new Promise(resolve=>setTimeout(resolve,1))})}
  const latest=()=>state.latest
  try{
    await render(false);await poll();assert.equal(state.clockCalls,0);assert.equal(latest()?.phase,null)
    await render(true);await poll();assert.equal(state.clockCalls,1);assert.equal(latest()?.phase?.observedAt,state.observedAt);assert.equal(latest()?.phase?.token,state.token);assert.equal(latest()?.safe,true)
    state.token='b'.repeat(64);state.observedAt=new Date().toISOString();await poll();assert.equal(latest()?.reason,'changed');assert.equal(latest()?.safe,false)
    state.missing=true;await poll();assert.equal(latest()?.phase?.token,null);assert.equal(latest()?.safe,false)
    state.missing=false;state.failClock=true;await poll();assert.equal(latest()?.phase?.token,null);assert.equal(latest()?.safe,false)
    state.failClock=false;state.failRequest=true;await poll();assert.equal(latest()?.phase?.token,null);assert.equal(latest()?.safe,false)
    assert.equal(state.auth,state.calls-1);assert.equal(state.bundleCalls,1,'the token-only path must not reload matchup research')
  }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=oldFetch}
})
