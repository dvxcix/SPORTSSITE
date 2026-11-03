import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act,createElement,useState,type ComponentType } from 'react'
import type { PaintGame,PaintMarket } from '../src/lib/nbaPaint.ts'
import { nbaPackFullBoard,nbaSelectPackedBoard } from '../src/lib/nbaFullOddsBoard.ts'
import { NBA_ODDS_BOARD_PHASE_MAX_AGE,nbaOddsBoardPhaseSignature,type NbaOddsBoardPhaseCheck } from '../src/lib/nbaOddsBoardPhase.ts'
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com/the-paint'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
;(globalThis as typeof globalThis&{oddsBoardTestMode:string}).oddsBoardTestMode='pregame'
Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true})
const {createRoot}=await import('react-dom/client')
const built=await build({stdin:{contents:"export {PaintFullOddsBoard} from './src/app/the-paint/PaintFullOddsBoard'",resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'odds-ui-fixture.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'odds-ui',setup(builder){
  builder.onResolve({filter:/^(\.\/PaintEntitySelect|\.\/PaintVisuals|@\/components\/nba\/NbaOddsModeContext|next\/link)$/},args=>({path:args.path,namespace:'fixture'}))
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?`import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props} data-prefetch={String(prefetch)}>{children}</a>}`:args.path.includes('PaintVisuals')?`export function TeamLogo(){return null}`:args.path.includes('PaintEntitySelect')?`import React from 'react';export function PaintBookSelect({value,onChange,books}){return <select aria-label="Odds board sportsbook" value={value} onChange={e=>onChange(e.target.value)}>{[...new Set([value,...books])].map(book=><option key={book} value={book}>{book}</option>)}</select>}`:`export function useNbaOddsMode(){return globalThis.oddsBoardTestMode}`,loader:'tsx'}))
}}]})
const fixture={exports:{} as {PaintFullOddsBoard:ComponentType<{date:string;games:PaintGame[];phaseCheck?:NbaOddsBoardPhaseCheck|null;selectedMarket?:PaintMarket;selectedBook?:string;onMarketChange?:(market:PaintMarket)=>void;onBookChange?:(book:string)=>void}>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,require)
const team={id:1,abbreviation:'AAA',full_name:'Alpha',name:'Alpha'},away={id:2,abbreviation:'BBB',full_name:'Beta',name:'Beta'}
const game:PaintGame={id:12,date:'2026-11-02',season:2026,status:'Scheduled',status_state:'scheduled',datetime:new Date(Date.now()+3600000).toISOString(),period:0,home_team:team,visitor_team:away,home_team_score:0,visitor_team_score:0}
const otherGame={...game,id:13}
const players=[{id:1,gameId:12,first_name:'Amy',last_name:'Adams',position:'G',team},{id:2,gameId:12,first_name:'Bea',last_name:'Baker',position:'F',team:away},{id:3,gameId:13,first_name:'Cam',last_name:'Clark',position:'G',team}]
const base={gameId:12,vendor:'fanduel',market:'points',opening:{odds:200,at:'2026-11-02T15:00:00Z'},previous:{odds:175,at:'2026-11-02T16:00:00Z'}}
const data={date:'2026-11-02',games:[game,otherGame],players,failed:[],unavailable:[],complete:true,books:['fanduel'],selectedBook:'fanduel',cells:[{...base,playerId:1,line:15,current:{odds:150,at:'2026-11-02T17:00:00Z'}},{...base,playerId:1,line:20,current:{odds:220,at:'2026-11-02T17:00:00Z'}},{...base,playerId:2,line:15,current:{odds:300,at:'2026-11-02T17:00:00Z'}},{...base,gameId:13,playerId:3,line:15,current:{odds:250,at:'2026-11-02T17:00:00Z'}}]}
test('Court selections carry into the board and changes carry back',async()=>{
 const original=globalThis.fetch,requests:string[]=[]
 globalThis.fetch=async(input)=>{const url=new URL(String(input),'https://www.slipsurge.com');requests.push(`${url.searchParams.get('market')}:${url.searchParams.get('book')}`);return Response.json(nbaSelectPackedBoard(nbaPackFullBoard({...data,cells:[...data.cells,{...data.cells[0],vendor:'draftkings'}],phaseCheckedAt:Date.now()}),url.searchParams.get('book')!))}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 function Court(){const [market,setMarket]=useState<PaintMarket>('rebounds'),[book,setBook]=useState('draftkings');return createElement('div',null,createElement('output',{'data-testid':'selection'},`${market}:${book}`),createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games:[game,otherGame],selectedMarket:market,selectedBook:book,onMarketChange:setMarket,onBookChange:setBook}))}
 const select=async(label:string,value:string)=>{const input=host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;input.value=value;await act(async()=>{input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(done=>setTimeout(done,20))})}
 try{
  await act(async()=>{root.render(createElement(Court));await new Promise(done=>setTimeout(done,20))})
  assert.equal(requests[0],'rebounds:draftkings');assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Odds board sportsbook"]')?.value,'draftkings')
  await select('Odds board market','points');assert.match(host.querySelector('[data-testid="selection"]')!.textContent! ,/points:draftkings/);assert.ok(requests.includes('points:draftkings'))
  await select('Odds board sportsbook','fanduel');assert.match(host.querySelector('[data-testid="selection"]')!.textContent!,/points:fanduel/);assert.ok(requests.includes('points:fanduel'))
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=original}
})
test('an explicit absent book stays selected, while All chooses a displayed available default',async()=>{
 const original=globalThis.fetch,requests:string[]=[]
 globalThis.fetch=async(input)=>{const url=new URL(String(input),'https://www.slipsurge.com'),book=url.searchParams.get('book')!;requests.push(book);return Response.json(nbaSelectPackedBoard(nbaPackFullBoard({...data,cells:data.cells.map(cell=>({...cell,vendor:'draftkings'})),phaseCheckedAt:Date.now()}),book))}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 function Court({initial}:{initial:string}){const [book,setBook]=useState(initial);return createElement('div',null,createElement('output',{'data-testid':'selection'},book),createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games:[game,otherGame],selectedBook:book,onBookChange:setBook}))}
 try{
  await act(async()=>{root.render(createElement(Court,{initial:'fanduel'}));await new Promise(done=>setTimeout(done,20))})
  assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Odds board sportsbook"]')?.value,'fanduel');assert.match(host.textContent!,/No milestone prices/);assert.deepEqual(requests,['fanduel'])
  await act(async()=>root.unmount());host.remove()
  const host2=document.createElement('div');document.body.append(host2);const root2=createRoot(host2);requests.length=0
  try{
   await act(async()=>{root2.render(createElement(Court,{initial:'all'}));await new Promise(done=>setTimeout(done,20))})
   await act(async()=>{await new Promise(done=>setTimeout(done,20))})
   assert.deepEqual(requests,['fanduel','draftkings']);assert.equal(host2.querySelector<HTMLSelectElement>('[aria-label="Odds board sportsbook"]')?.value,'draftkings');assert.equal(host2.querySelector('[data-testid="selection"]')?.textContent,'all');assert.match(host2.textContent!,/Amy Adams/)
  }finally{await act(async()=>root2.unmount());host2.remove()}
 }finally{globalThis.fetch=original}
})
test('unsupported selected market is visible and does not fetch a different board',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected fetch')}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 try{await act(async()=>{root.render(createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games:[game],selectedMarket:'double_double'}));await new Promise(done=>setTimeout(done,20))});assert.equal(calls,0);assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Odds board market"]')?.value,'double_double');assert.match(host.textContent!,/No milestone prices for this market/)}finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=original}
})
test('full board exposes all posted rungs, exact comparisons, sorting, search and keyboard scroll',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json(nbaSelectPackedBoard(nbaPackFullBoard({...data,phaseCheckedAt:Date.now()}),'fanduel'))
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const select=async(label:string,value:string)=>{const el=host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;el.value=value;await act(async()=>el.dispatchEvent(new dom.window.Event('change',{bubbles:true})))}
 try{
  await act(async()=>{root.render(createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games:[game,otherGame]}));await new Promise(done=>setTimeout(done,20))})
  const region=host.querySelector('[aria-label="NBA milestone odds board"]')!;assert.equal(region.getAttribute('tabindex'),'0')
  assert.match(region.textContent??'',/15\+/);assert.match(region.textContent??'',/20\+/);assert.match(region.textContent??'',/Open \+200/);assert.match(region.textContent??'',/\+150/)
  assert.match(host.querySelector('[aria-label="Odds board sportsbook"]')?.parentElement?.textContent??'',/FanDuel/)
  assert.match(region.textContent??'',/Shortened/);assert.match(region.textContent??'',/Lengthened/)
  const link=region.querySelector<HTMLAnchorElement>('a[aria-label="Analyze Amy Adams 15+ Points, FanDuel, last seen +150"]')!;const target=new URL(link.href);assert.equal(target.searchParams.get('game'),'12');assert.equal(target.searchParams.get('book'),'fanduel');assert.equal(target.searchParams.get('line'),'15');assert.equal(target.searchParams.get('type'),'milestone');assert.equal(target.searchParams.get('mode'),'pregame');assert.equal(link.dataset.prefetch,'false')
  const firstCell=link.closest('td')!;assert.deepEqual([...firstCell.querySelectorAll('time')].map(time=>time.dateTime),['2026-11-02T15:00:00Z','2026-11-02T17:00:00Z'])
  const other=region.querySelector<HTMLAnchorElement>('a[aria-label="Analyze Cam Clark 15+ Points, FanDuel, last seen +250"]')!;const otherTarget=new URL(other.href);assert.equal(otherTarget.searchParams.get('game'),'13');assert.equal(otherTarget.searchParams.get('player'),'3');assert.equal(otherTarget.searchParams.get('line'),'15');assert.equal(other.dataset.prefetch,'false')
  await select('Compare odds to','previous');assert.match(region.textContent??'',/Earlier \+175/)
  await select('Sort odds board','lengthened');assert.match(region.querySelector('tbody tr')?.textContent??'',/Bea Baker/)
  await select('Sort by milestone','20');assert.match(region.querySelector('tbody tr')?.textContent??'',/Amy Adams/)
  assert.equal(host.querySelector('[role="tooltip"]'),null)
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=original}
})

test('piggybacked phase checks preserve an unchanged grid, hide corrections, and fail closed on missing token and resume',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let clock=originalNow(),calls=0,release:((response:Response)=>void)|undefined
 Date.now=()=>clock
 const games=[game,otherGame],corrected={...game,datetime:new Date(Date.parse(game.datetime!)-60000).toISOString()},revised=[corrected,otherGame]
 const result=(items:PaintGame[],checkedAt:number)=>Response.json(nbaSelectPackedBoard(nbaPackFullBoard({...data,games:items,phaseCheckedAt:checkedAt}),'fanduel'))
 globalThis.fetch=async()=>{calls++;if(calls===1)return result(games,clock-1000);return await new Promise<Response>(resolve=>{release=resolve})}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const render=(phaseCheck:NbaOddsBoardPhaseCheck|null)=>root.render(createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games,phaseCheck}))
 const token=(items:PaintGame[],at:number):NbaOddsBoardPhaseCheck=>({date:data.date,mode:'pregame',receivedAt:at,phase:{date:data.date,checkedAt:at,signature:nbaOddsBoardPhaseSignature(items)!}})
 try{
  await act(async()=>{render(null);await new Promise(done=>setTimeout(done,20))})
  const original=host.querySelector<HTMLElement>('[aria-label="NBA milestone odds board"]');assert.ok(original);assert.equal(calls,1)
  original.scrollLeft=117;await act(async()=>original.dispatchEvent(new dom.window.Event('scroll',{bubbles:true})))
  clock+=10;await act(async()=>render(token(games,clock)))
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),original);assert.equal(calls,1,'matching phase must not reload the grid')
  clock+=10;await act(async()=>{render(token(revised,clock));await new Promise(done=>setTimeout(done,0))})
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null);assert.equal(calls,2);assert.ok(release)
  clock+=10;await act(async()=>{release!(result(revised,clock));await new Promise(done=>setTimeout(done,20))})
  assert.equal(host.querySelector<HTMLElement>('[aria-label="NBA milestone odds board"]')?.scrollLeft,117);assert.equal(calls,2,'correction must not cause a duplicate full fetch')
  clock+=10;await act(async()=>render({date:data.date,mode:'pregame',phase:null,receivedAt:clock}))
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null)
  clock+=10;await act(async()=>render(token(revised,clock)))
  assert.equal(host.querySelector<HTMLElement>('[aria-label="NBA milestone odds board"]')?.scrollLeft,117);assert.equal(calls,2)
  Object.defineProperty(dom.window.document,'visibilityState',{value:'hidden',configurable:true});await act(async()=>dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')))
  clock+=10;Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true});await act(async()=>dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')))
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null,'resume hides prior prices until a later successful phase check')
  const beforeResume=clock-5;clock+=5
  await act(async()=>render({date:data.date,mode:'pregame',receivedAt:clock,phase:{date:data.date,checkedAt:beforeResume,signature:nbaOddsBoardPhaseSignature(revised)!}}))
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null,'a request arriving after resume cannot reuse a pre-resume check')
  clock+=10;await act(async()=>render(token(revised,clock)));assert.equal(host.querySelector<HTMLElement>('[aria-label="NBA milestone odds board"]')?.scrollLeft,117);assert.equal(calls,2)
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;Date.now=originalNow;Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true})}
})

test('an in-flight old grid is hidden and replaced when a newer token corrects tipoff',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let clock=originalNow(),calls=0;Date.now=()=>clock
 const games=[game,otherGame],corrected={...game,datetime:new Date(Date.parse(game.datetime!)-60000).toISOString()},revised=[corrected,otherGame]
 let releaseFirst:((response:Response)=>void)|undefined,releaseSecond:((response:Response)=>void)|undefined
 globalThis.fetch=async()=>{calls++;return await new Promise<Response>(resolve=>{if(calls===1)releaseFirst=resolve;else releaseSecond=resolve})}
 const result=(items:PaintGame[],checkedAt:number)=>Response.json(nbaSelectPackedBoard(nbaPackFullBoard({...data,games:items,phaseCheckedAt:checkedAt}),'fanduel'))
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const render=(phaseCheck:NbaOddsBoardPhaseCheck|null)=>root.render(createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games,phaseCheck}))
 const started=clock
 try{
  await act(async()=>render(null));assert.ok(releaseFirst)
  clock+=10;const phaseCheck:NbaOddsBoardPhaseCheck={date:data.date,mode:'pregame',receivedAt:clock,phase:{date:data.date,checkedAt:clock,signature:nbaOddsBoardPhaseSignature(revised)!}}
  await act(async()=>render(phaseCheck))
  clock+=10;await act(async()=>{releaseFirst!(result(games,started));await new Promise(done=>setTimeout(done,20))})
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null);assert.equal(calls,2);assert.ok(releaseSecond)
  clock+=10;await act(async()=>{releaseSecond!(result(revised,clock));await new Promise(done=>setTimeout(done,20))})
  assert.ok(host.querySelector('[aria-label="NBA milestone odds board"]'));assert.equal(calls,2)
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;Date.now=originalNow}
})

test('an expired phase check hides the grid on its timer without starting another request',async()=>{
 const originalFetch=globalThis.fetch;let calls=0
 const checkedAt=Date.now()-NBA_ODDS_BOARD_PHASE_MAX_AGE+1200
 globalThis.fetch=async()=>{calls++;return Response.json(nbaSelectPackedBoard(nbaPackFullBoard({...data,phaseCheckedAt:checkedAt}),'fanduel'))}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 try{
  await act(async()=>{root.render(createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games:[game,otherGame]}));await new Promise(done=>setTimeout(done,30))})
  assert.ok(host.querySelector('[aria-label="NBA milestone odds board"]'))
  await act(async()=>{await new Promise(done=>setTimeout(done,1350))})
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null);assert.equal(calls,1)
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch}
})

test('Live defaults to first seen, offers earlier comparison, and cached pre-resume proof cannot unhide the board',async()=>{
 const priorFetch=globalThis.fetch,priorNow=Date.now;let now=priorNow();Date.now=()=>now
 ;(globalThis as typeof globalThis&{oddsBoardTestMode:string}).oddsBoardTestMode='live'
 const games=[game,otherGame],host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 globalThis.fetch=async()=>Response.json(nbaSelectPackedBoard(nbaPackFullBoard({...data,phaseCheckedAt:now-15000}),'fanduel'))
 const render=(phaseCheck:NbaOddsBoardPhaseCheck|null)=>root.render(createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games,phaseCheck}))
 try{
  await act(async()=>{render(null);await new Promise(done=>setTimeout(done,20))})
  const grid=host.querySelector('[aria-label="NBA milestone odds board"]');assert.ok(grid);assert.match(grid.textContent??'',/Last seen/);assert.match(grid.textContent??'',/First seen \+200/)
  const comparison=host.querySelector<HTMLSelectElement>('[aria-label="Compare odds to"]')!;assert.equal(comparison.value,'opening');comparison.value='previous';await act(async()=>comparison.dispatchEvent(new dom.window.Event('change',{bubbles:true})));assert.match(grid.textContent??'',/Earlier \+175/)
  Object.defineProperty(dom.window.document,'visibilityState',{value:'hidden',configurable:true});await act(async()=>dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')))
  now+=10;Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true});await act(async()=>dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')))
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null)
  now+=10;await act(async()=>render({date:data.date,mode:'live',receivedAt:now,phase:{date:data.date,checkedAt:now-15000,signature:nbaOddsBoardPhaseSignature(games)!}}))
  assert.equal(host.querySelector('[aria-label="NBA milestone odds board"]'),null,'cached phase proof from before resume cannot restore the grid')
  now+=10;await act(async()=>render({date:data.date,mode:'live',receivedAt:now,phase:{date:data.date,checkedAt:now,signature:nbaOddsBoardPhaseSignature(games)!}}));assert.ok(host.querySelector('[aria-label="NBA milestone odds board"]'))
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=priorFetch;Date.now=priorNow;(globalThis as typeof globalThis&{oddsBoardTestMode:string}).oddsBoardTestMode='pregame';Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true})}
})
