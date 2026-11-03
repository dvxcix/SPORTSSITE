import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement, type ComponentType } from 'react'

const require=createRequire(import.meta.url), {JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com/the-sideline'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})
const {createRoot}=await import('react-dom/client')
const contents=`import {useState} from 'react';import {NflOddsBoard} from './src/app/the-sideline/NflOddsBoard';import {LadderBoard} from './src/app/the-sideline/LadderBoard';
const odds={players:[{id:1,name:'Test',team:'SEA',position:'WR',markets:[{propType:'receiving_yards',offers:[{vendor:'fanduel'},{vendor:'draftkings'}]},{propType:'rushing_yards',offers:[{vendor:'fanduel'},{vendor:'draftkings'}]}]}]};
export function Harness(){const [market,onMarket]=useState('receiving_yards');const [vendor,onVendor]=useState('fanduel');const [board,setBoard]=useState(false);return <><button onClick={()=>setBoard(!board)}>Switch view</button>{board?<NflOddsBoard date='2020-11-02' market={market} onMarket={onMarket} vendor={vendor} onVendor={onVendor}/>:<LadderBoard board={odds} prop={market} onProp={onMarket} vendor={vendor} onVendor={onVendor} onPlayer={()=>{}} scores={new Map()}/>}</>}`
const stubs:Record<string,string>={
  '@/components/BookLogo':'export const BookLogo=()=>null;export const normalizeVendor=x=>x',
  '@/components/sideline/NflScorerBadges':'export const NflScorerBadges=()=>null',
  '@/components/sideline/NflPropActions':'export const NflPropActions=()=>null',
  'next/image':'export default function Image(){return null}',
}
const bundled=await build({stdin:{contents,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'context.cjs',platform:'node',format:'cjs',jsx:'automatic',tsconfig:'tsconfig.json',external:['react','react-dom'],loader:{'.css':'empty'},plugins:[{name:'context-stubs',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const compiled={exports:{} as {Harness:ComponentType}}
new Function('module','exports','require',bundled.outputFiles[0].text)(compiled,compiled.exports,require)
async function choose(host:HTMLElement,aria:string,value:string){const el=host.querySelector<HTMLSelectElement>(`select[aria-label="${aria}"]`)!;assert.ok(el);await act(async()=>{el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,5))})}
async function switchView(host:HTMLElement){await act(async()=>{host.querySelector('button')!.click();await new Promise(resolve=>setTimeout(resolve,10))})}
test('Props and Odds Board preserve the same market and book in both directions',async()=>{
  const old=globalThis.fetch,calls:string[]=[]
  globalThis.fetch=async(input)=>{const url=new URL(String(input),'https://www.slipsurge.com');calls.push(url.search);return Response.json({date:'2020-11-02',games:[],markets:['receiving_yards','rushing_yards'],books:['fanduel','draftkings'],market:url.searchParams.get('market'),book:url.searchParams.get('book'),quotes:[],phaseToken:'a'.repeat(64),phaseObservedAt:new Date().toISOString(),nextStart:null})}
  const host=document.createElement('div'),root=createRoot(host);document.body.append(host)
  try{
    await act(async()=>root.render(createElement(compiled.exports.Harness)))
    await choose(host,'Market','rushing_yards');await choose(host,'Sportsbook','draftkings');await switchView(host)
    assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Odds board market"]')?.value,'rushing_yards')
    assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Odds board sportsbook"]')?.value,'draftkings')
    assert.match(calls[0],/market=rushing_yards&book=draftkings/)
    await choose(host,'Odds board market','receiving_yards');await choose(host,'Odds board sportsbook','fanduel');await switchView(host)
    assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Market"]')?.value,'receiving_yards')
    assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Sportsbook"]')?.value,'fanduel')
  }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=old}
})
test('production parent wires the same state to both views',async()=>{const source=await readFile('src/app/the-sideline/SidelineBoardClient.tsx','utf8');assert.match(source,/<NflOddsBoard[^>]*market=\{activeProp\}[^>]*vendor=\{activeBook\}/);assert.match(source,/<LadderBoard[\s\S]*?prop=\{activeProp\}[\s\S]*?vendor=\{activeBook\}/)})
