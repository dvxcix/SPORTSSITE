import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act,createElement,type ComponentType } from 'react'
import type { PaintGame } from '../src/lib/nbaPaint.ts'
import { nbaPackFullBoard,nbaSelectPackedBoard } from '../src/lib/nbaFullOddsBoard.ts'
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com/the-paint'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true})
const {createRoot}=await import('react-dom/client')
const built=await build({stdin:{contents:"export {PaintFullOddsBoard} from './src/app/the-paint/PaintFullOddsBoard'",resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'odds-ui-fixture.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'odds-ui',setup(builder){
  builder.onResolve({filter:/^(\.\/PaintEntitySelect|@\/components\/nba\/NbaOddsModeContext|next\/link)$/},args=>({path:args.path,namespace:'fixture'}))
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?`import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props} data-prefetch={String(prefetch)}>{children}</a>}`:args.path.includes('PaintEntitySelect')?`import React from 'react';export function PaintBookSelect({value,onChange,books}){return <select aria-label="Odds board sportsbook" value={value} onChange={e=>onChange(e.target.value)}>{books.map(book=><option key={book} value={book}>{book}</option>)}</select>}`:`export function useNbaOddsMode(){return 'pregame'}`,loader:'tsx'}))
}}]})
const fixture={exports:{} as {PaintFullOddsBoard:ComponentType<{date:string;games:PaintGame[]}>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,require)
const team={id:1,abbreviation:'AAA',full_name:'Alpha',name:'Alpha'},away={id:2,abbreviation:'BBB',full_name:'Beta',name:'Beta'}
const game:PaintGame={id:12,date:'2026-11-02',season:2026,status:'Scheduled',status_state:'scheduled',datetime:new Date(Date.now()+3600000).toISOString(),period:0,home_team:team,visitor_team:away,home_team_score:0,visitor_team_score:0}
const otherGame={...game,id:13}
const players=[{id:1,gameId:12,first_name:'Amy',last_name:'Adams',position:'G',team},{id:2,gameId:12,first_name:'Bea',last_name:'Baker',position:'F',team:away},{id:3,gameId:13,first_name:'Cam',last_name:'Clark',position:'G',team}]
const base={gameId:12,vendor:'fanduel',market:'points',opening:{odds:200,at:'2026-11-02T15:00:00Z'},previous:{odds:175,at:'2026-11-02T16:00:00Z'}}
const data={date:'2026-11-02',games:[game,otherGame],players,failed:[],unavailable:[],complete:true,books:['fanduel'],selectedBook:'fanduel',cells:[{...base,playerId:1,line:15,current:{odds:150,at:'2026-11-02T17:00:00Z'}},{...base,playerId:1,line:20,current:{odds:220,at:'2026-11-02T17:00:00Z'}},{...base,playerId:2,line:15,current:{odds:300,at:'2026-11-02T17:00:00Z'}},{...base,gameId:13,playerId:3,line:15,current:{odds:250,at:'2026-11-02T17:00:00Z'}}]}
test('full board exposes all posted rungs, exact comparisons, sorting, search and keyboard scroll',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json(nbaSelectPackedBoard(nbaPackFullBoard(data),'fanduel'))
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const select=async(label:string,value:string)=>{const el=host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;el.value=value;await act(async()=>el.dispatchEvent(new dom.window.Event('change',{bubbles:true})))}
 try{
  await act(async()=>{root.render(createElement(fixture.exports.PaintFullOddsBoard,{date:data.date,games:[game,otherGame]}));await new Promise(done=>setTimeout(done,20))})
  const region=host.querySelector('[aria-label="NBA milestone odds board"]')!;assert.equal(region.getAttribute('tabindex'),'0')
  assert.match(region.textContent??'',/15\+/);assert.match(region.textContent??'',/20\+/);assert.match(region.textContent??'',/Open \+200/);assert.match(region.textContent??'',/\+150/)
  assert.match(region.textContent??'',/Shortened/);assert.match(region.textContent??'',/Lengthened/)
  const link=region.querySelector<HTMLAnchorElement>('a[aria-label="Analyze Amy Adams 15+"]')!;const target=new URL(link.href);assert.equal(target.searchParams.get('game'),'12');assert.equal(target.searchParams.get('book'),'fanduel');assert.equal(target.searchParams.get('line'),'15');assert.equal(target.searchParams.get('type'),'milestone');assert.equal(target.searchParams.get('mode'),'pregame');assert.equal(link.dataset.prefetch,'false')
  const other=region.querySelector<HTMLAnchorElement>('a[aria-label="Analyze Cam Clark 15+"]')!;const otherTarget=new URL(other.href);assert.equal(otherTarget.searchParams.get('game'),'13');assert.equal(otherTarget.searchParams.get('player'),'3');assert.equal(otherTarget.searchParams.get('line'),'15');assert.equal(other.dataset.prefetch,'false')
  await select('Compare odds to','previous');assert.match(region.textContent??'',/Prev \+175/)
  await select('Sort odds board','lengthened');assert.match(region.querySelector('tbody tr')?.textContent??'',/Bea Baker/)
  await select('Sort by milestone','20');assert.match(region.querySelector('tbody tr')?.textContent??'',/Amy Adams/)
  assert.equal(host.querySelector('[role="tooltip"]'),null)
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=original}
})
