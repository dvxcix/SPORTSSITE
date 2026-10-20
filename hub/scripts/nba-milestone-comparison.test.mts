import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaMilestoneSignals,nbaMilestonePeerRanks,compareMilestoneMoves } from '../src/lib/nbaMilestoneSignals.ts'
import type { PaintProp,PaintBoard } from '../src/lib/nbaPaint.ts'
import type { NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act,createElement,type ComponentType } from 'react'
const at='2026-10-20T12:00:00Z',firstAt='2026-10-19T12:00:00Z'
const prop=(id:number,market:string,line:number,odds:number,book='fanduel'):PaintProp=>({id,game_id:123,player_id:id,vendor:book,prop_type:market,line_value:String(line),market:{type:'milestone',odds},updated_at:at})
const current=[prop(1,'points',15,200),prop(2,'points',15,150),prop(3,'points',15,250),prop(1,'rebounds',6,100),prop(2,'assists',4,100),prop(3,'rebounds',6,100),prop(1,'points',20,200),prop(1,'rebounds',8,250),prop(1,'points',15,100,'draftkings')]
const old=current.map(p=>({...p,market:{type:'milestone' as const,odds:p.prop_type==='points'&&p.line_value==='15'?100:p.line_value==='20'||p.vendor==='draftkings'?500:p.line_value==='8'?200:150}}))
const frames=[{captured_at:firstAt,props:old},{captured_at:at,props:current}]
const moves=nbaMilestoneSignals(frames,[],123)
test('every exact milestone remains independent of another threshold, book, side or game',()=>{
  assert.equal(moves.length,current.length)
  const points=moves.find(m=>m.playerId===1&&m.market==='points'&&m.line===15&&m.book==='fanduel')!
  assert.ok(points.change!<0)
  assert.ok(moves.find(m=>m.playerId===1&&m.line===20)!.change!>0)
  assert.ok(moves.find(m=>m.playerId===1&&m.market==='rebounds'&&m.line===6)!.change!>0)
  assert.equal(nbaMilestoneSignals(frames,[],999).length,0)
  assert.equal(nbaMilestoneSignals([...frames,{captured_at:'2026-10-20T13:00:00Z',props:[]}],[],123).length,0)
  const opening:NbaQuoteOpeningRow={game_id:123,player_id:1,vendor:'fanduel',market:'points',market_type:'milestone',line:15,side:'over',odds:110,observed_at:'2026-10-18T12:00:00Z'}
  assert.equal(nbaMilestoneSignals(frames,[opening],123).find(m=>m.key===points.key)?.opening,110)
  for(const bad of [{...opening,line:20},{...opening,side:'under' as const},{...opening,vendor:'other'},{...opening,game_id:999},{...opening,observed_at:'2026-10-21T12:00:00Z'}])assert.equal(nbaMilestoneSignals(frames,[bad],123).find(m=>m.key===points.key)?.opening,100)
})
test('signed sorting and teammate ranks compare the same N+ contract and preserve unfiltered pools',()=>{
  const primary=moves.filter(m=>m.market==='points'&&m.line===15&&m.book==='fanduel')
  assert.deepEqual([...primary].sort((a,b)=>compareMilestoneMoves(a,b,'lengthened')).map(m=>m.playerId),[3,1,2])
  assert.deepEqual([...primary].sort((a,b)=>compareMilestoneMoves(a,b,'shortened')).map(m=>m.playerId),[2,1,3])
  const ranks=nbaMilestonePeerRanks(moves,new Map([[1,2],[2,2],[3,9]]))
  assert.deepEqual(ranks.get(primary.find(m=>m.playerId===2)!.key),{lengthened:2,shortened:1,players:2})
  assert.equal(ranks.get(primary.find(m=>m.playerId===3)!.key)?.players,1)
})

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com/the-paint'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const stubs:Record<string,string>={
  './PaintVisuals':`export const PlayerAvatar=()=>null`,
  './PaintEntitySelect':`import React from 'react';export const PaintBookSelect=({label,value,onChange,books})=><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}><option value="all">All books</option>{books.map(b=><option key={b} value={b}>{b}</option>)}</select>;export const PaintTeamSelect=({label,value,onChange,teams})=><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}><option value="all">All teams</option>{teams.map(t=><option key={t.id} value={t.id}>{t.abbreviation}</option>)}</select>`,
}
const bundle=await build({stdin:{contents:'export {PaintMilestoneSignals} from "./src/app/the-paint/PaintMilestoneSignals"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'milestones.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'milestone-ui',setup(b){b.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:resolve('.')}))}}]})
const compiled={exports:{} as {PaintMilestoneSignals:ComponentType<Record<string,unknown>>}}
new Function('require','module','exports',bundle.outputFiles.find(f=>f.path.endsWith('.cjs'))!.text)(require,compiled,compiled.exports)
const team={id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'},away={...team,id:9,abbreviation:'DET'}
const board={game:{id:123,date:'2026-10-20',home_team:team,visitor_team:away},players:[1,2,3].map(id=>({id,first_name:['Alex','Ben','Cal'][id-1],last_name:'Player',team:id===3?away:team,headshot:null}))} as PaintBoard
test('cross-market filters retain 15+ primary and opposing exact targets, signed order and teammate rank after search',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const select=async(label:string,value:string)=>act(async()=>{const node=host.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;assert.ok(node);node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  const cards=()=>[...host.querySelectorAll('article')]
  try{
    await act(async()=>root.render(createElement(compiled.exports.PaintMilestoneSignals,{board,moves,onOverUnder:()=>{},loading:false,error:'',retry:()=>{},stale:false})))
    assert.match(cards()[0].textContent!,/Cal Player/)
    assert.ok(cards().every(c=>c.querySelector('header a')?.getAttribute('href')?.includes('target=15')))
    await select('Cross-market team','2');assert.equal(cards().length,2);assert.match(cards()[0].textContent!,/Alex Player/)
    await select('Sort milestone cross-market','shortened');assert.match(cards()[0].textContent!,/Ben Player/)
    const input=host.querySelector('input[aria-label="Search milestone players"]') as HTMLInputElement
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'Ben');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
    assert.equal(cards().length,1)
    const ben=cards().find(c=>c.textContent?.includes('Ben Player'))!;assert.match(ben.textContent!,/Lengthen rank #2\/2/)
    const related=ben.querySelectorAll('a[href*="market=assists"]');assert.ok(related.length);assert.match(related[0].getAttribute('href')!,/target=4/)
    assert.ok(!ben.querySelector('a[href*="target=20"]'))
  }finally{await act(async()=>root.unmount());host.remove()}
})
