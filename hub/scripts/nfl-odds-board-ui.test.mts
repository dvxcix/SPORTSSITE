import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement, type ComponentType } from 'react'

const require=createRequire(import.meta.url), {JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com/the-sideline'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLSelectElement:dom.window.HTMLSelectElement,IS_REACT_ACT_ENVIRONMENT:true})
Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})
const {createRoot}=await import('react-dom/client')
type Phase={gameId:string;token:string|null;observedAt:string|null;checkedAt:number}
const compiled={exports:{} as {BoardHarness:ComponentType<{date:string;phase?:Phase|null}>}}
const bundled=await build({stdin:{contents:"import {useState} from 'react'; import {NflOddsBoard} from './src/app/the-sideline/NflOddsBoard'; export function BoardHarness(props){const [market,onMarket]=useState('receiving_yards');const [vendor,onVendor]=useState('draftkings');return <NflOddsBoard {...props} market={market} onMarket={onMarket} vendor={vendor} onVendor={onVendor}/>}",resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'nfl-board-ui.cjs',platform:'node',format:'cjs',jsx:'automatic',tsconfig:'tsconfig.json',external:['react','react-dom'],loader:{'.css':'empty'},plugins:[{name:'logo',setup(builder){builder.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'stub'}));builder.onResolve({filter:/^@\/components\/BookLogo$/},()=>({path:'logo',namespace:'stub'}));builder.onLoad({filter:/^logo$/,namespace:'stub'},()=>({contents:'export const BookLogo=()=>null',loader:'tsx'}));builder.onLoad({filter:/^image$/,namespace:'stub'},()=>({contents:'export default function Image({src,alt}) { return <img src={src} alt={alt}/> }',loader:'tsx'}))}}]})
new Function('module','exports','require',bundled.outputFiles[0].text)(compiled,compiled.exports,require)
const quote=(game:string,id:number,name:string,team:string,line:number,price:number,previous:number|null,opening:number|null=previous)=>[game,id,name,team,'WR','receiving_yards','draftkings',line,price,'2020-11-02T21:29:00.000Z',previous,previous==null?null:'2020-11-02T20:29:00.000Z',opening,false]
const payload={date:'2020-11-02',games:[{id:'one',away:'SEA',home:'CHI',status:'ready'},{id:'two',away:'MIA',home:'NYJ',status:'ready'}],markets:['receiving_yards'],books:['draftkings'],market:'receiving_yards',book:'draftkings',quotes:[quote('one',1,'Alpha','SEA',25,150,200),quote('one',1,'Alpha','SEA',50,100,200),quote('two',2,'Beta','MIA',25,-140,-110),quote('two',2,'Beta','MIA',50,300,200)],identities:[['one',1,'Alpha','SEA','https://static.www.nfl.com/alpha.png',[]]],teams:[['one','SEA','#002244','#69BE28','https://a.espncdn.com/sea.png'],['two','MIA','#008E97','#FC4C02','https://a.espncdn.com/mia.png']],phaseToken:'a'.repeat(64),phaseObservedAt:new Date().toISOString(),nextStart:null}
async function mount(value:typeof payload=payload,fetcher?:typeof fetch){const old=globalThis.fetch;globalThis.fetch=fetcher??(async()=>Response.json({...value,phaseObservedAt:new Date().toISOString()}));const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>{root.render(createElement(compiled.exports.BoardHarness,{date:'2020-11-02'}));await new Promise(resolve=>setTimeout(resolve,10))});return{host,phase:async(phase:Phase)=>{await act(async()=>{root.render(createElement(compiled.exports.BoardHarness,{date:'2020-11-02',phase}));await new Promise(resolve=>setTimeout(resolve,10))})},close:async()=>{await act(async()=>root.unmount());host.remove();globalThis.fetch=old}}}
async function select(host:HTMLElement,name:string,value:string){const node=host.querySelector<HTMLSelectElement>(`select[aria-label="${name}"]`)!;assert.ok(node);await act(async()=>{node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
test('the Market menu opens separate scorer boards with named columns', async () => {
  const ui = await mount(payload, async input => {
    const market = new URL(String(input), 'https://www.slipsurge.com').searchParams.get('market')
    const scorer = market === 'anytime_td' || market === 'first_td'
    const row = quote('one', 1, 'Alpha', 'SEA', 0.5, market === 'anytime_td' ? 125 : 900, null, 200)
    row[5] = market
    return Response.json({ ...payload, market, quotes: scorer ? [row] : payload.quotes, phaseObservedAt: new Date().toISOString() })
  })
  try {
    const menu = ui.host.querySelector<HTMLSelectElement>('[aria-label="Odds board market"]')!
    for (const [market, label, price] of [['anytime_td', 'Anytime Touchdown', 125], ['first_td', 'First Touchdown', 900]] as const) {
      assert.equal([...menu.options].find(option => option.value === market)?.text, label)
      await select(ui.host, 'Odds board market', market)
      const region = ui.host.querySelector(`[aria-label="${label} odds and movement"]`)!
      assert.equal(region.querySelector('thead th:last-child')?.textContent, label)
      assert.match(region.querySelector('tbody')?.textContent ?? '', new RegExp(`Last seen \\+${price}`))
      assert.equal(ui.host.querySelector('[aria-label="Sort odds board milestone"]'), null)
    }
  } finally {
    await ui.close()
  }
})
test('all games and exact milestones show prices, movement and no public timestamps',async()=>{const ui=await mount();try{const text=ui.host.textContent??'';assert.match(text,/25\+/);assert.match(text,/50\+/);assert.match(text,/Alpha/);assert.match(text,/Beta/);assert.match(text,/Open \+200/);assert.match(text,/Last seen/);assert.doesNotMatch(text,/2020-11-02|Nov 2|\d:\d\d (AM|PM)/);assert.ok(ui.host.querySelector('[aria-label="NFL milestone odds and movement"]'))}finally{await ui.close()}})
test('rungs show estimated counts, actual zero and unavailable picks independently',async()=>{const value={...payload,picks:[['one',1,'SEA','receiving_yards','draftkings',25,1234,true],['one',1,'SEA','receiving_yards','draftkings',50,0,false]]};const ui=await mount(value);try{const row=ui.host.querySelector('tbody tr')!;const cells=row.querySelectorAll('td');assert.match(cells[0].textContent??'',/Est\. 1[,.]234 picks/);assert.match(cells[1].textContent??'',/0 picks/);assert.doesNotMatch(cells[1].textContent??'',/Est\./);assert.match(ui.host.querySelectorAll('tbody tr')[1].textContent??'',/Picks —/)}finally{await ui.close()}})
test('saved player face, team logo and matching team gradient appear once per player',async()=>{const ui=await mount();try{const face=ui.host.querySelector<HTMLImageElement>('img[alt="Alpha headshot"]');assert.ok(face);const avatar=face.parentElement!;assert.match(avatar.style.background,/linear-gradient/);assert.match(avatar.style.background,/rgb\(0, 34, 68\)/);assert.ok(avatar.querySelector('img[alt="SEA logo"]'));assert.equal(ui.host.querySelectorAll('img[alt="Alpha headshot"]').length,1);assert.equal(ui.host.querySelectorAll('img[alt="Beta headshot"]').length,0)}finally{await ui.close()}})
test('sorting by a chosen milestone ranks the requested direction, not another rung',async()=>{const ui=await mount();try{await select(ui.host,'Sort odds board milestone','50');await select(ui.host,'Sort odds board','lengthened');assert.match(ui.host.querySelector('tbody tr th')?.textContent??'',/Beta/)}finally{await ui.close()}})
test('primary controls stay visible while optional filters show their active count',async()=>{const ui=await mount();try{const details=ui.host.querySelector('details');assert.ok(details);assert.equal(details.open,false);assert.ok(ui.host.querySelector('select[aria-label="Sort odds board"]')?.closest('details')==null);assert.ok(ui.host.querySelector('input[aria-label="Find odds board player"]')?.closest('details')==null);await act(async()=>{details.open=true});await select(ui.host,'Odds board team','SEA');await select(ui.host,'Compare odds to','earlier');assert.match(details.querySelector('summary')?.textContent??'',/2 active/);assert.match(ui.host.querySelector('tbody')?.textContent??'',/Alpha/);assert.doesNotMatch(ui.host.querySelector('tbody')?.textContent??'',/Beta/)}finally{await ui.close()}})
test('game filter works and partial games stay explicitly visible',async()=>{const value={...payload,games:[payload.games[0],{...payload.games[1],status:'incomplete'}]};const ui=await mount(value);try{assert.match(ui.host.textContent??'',/Some saved prices unavailable: MIA @ NYJ/);await select(ui.host,'Odds board game','one');assert.match(ui.host.textContent??'',/Alpha/);assert.doesNotMatch(ui.host.querySelector('tbody')?.textContent??'',/Beta/)}finally{await ui.close()}})
test('missing opening or earlier observations do not appear as zero movement',async()=>{const value={...payload,quotes:[quote('one',1,'Alpha','SEA',25,150,null)]};const ui=await mount(value);try{assert.match(ui.host.textContent??'',/Open —/);assert.doesNotMatch(ui.host.textContent??'',/Unchanged/);await select(ui.host,'Compare odds to','earlier');assert.match(ui.host.textContent??'',/Earlier —/);assert.doesNotMatch(ui.host.textContent??'',/Unchanged/)}finally{await ui.close()}})
test('opening and earlier compare different recorded baselines without inventing zeroes',async()=>{const value={...payload,quotes:[quote('one',1,'Alpha','SEA',25,-870,-870,-940)]};const ui=await mount(value);try{assert.match(ui.host.textContent??'',/Open -940/);assert.match(ui.host.textContent??'',/Lengthened/);assert.doesNotMatch(ui.host.textContent??'',/Unchanged/);await select(ui.host,'Compare odds to','earlier');assert.match(ui.host.textContent??'',/Earlier -870/);assert.match(ui.host.textContent??'',/0\.00 pp · Unchanged/)}finally{await ui.close()}})
test('a changed phase hides old prices while loading and restores filters and scroll',async()=>{
  let count=0,finish:((r:Response)=>void)|null=null
  const fetcher=async()=>{count++;if(count===1)return Response.json({...payload,phaseObservedAt:new Date().toISOString()});return await new Promise<Response>(resolve=>{finish=resolve})}
  const ui=await mount(payload,fetcher)
  try{
    await select(ui.host,'Odds board team','SEA')
    const area=ui.host.querySelector<HTMLElement>('[aria-label="NFL milestone odds and movement"]')!;area.scrollLeft=73;area.dispatchEvent(new dom.window.Event('scroll'))
    await new Promise(resolve=>setTimeout(resolve,5))
    const observedAt=new Date().toISOString();await ui.phase({gameId:'one',token:'b'.repeat(64),observedAt,checkedAt:Date.now()})
    assert.equal(ui.host.querySelector('table'),null);assert.match(ui.host.textContent??'',/Checking pregame prices/);assert.equal(count,2)
    assert.ok(finish);await act(async()=>{finish!(Response.json({...payload,phaseToken:'b'.repeat(64),phaseObservedAt:new Date().toISOString()}));await new Promise(resolve=>setTimeout(resolve,10))})
    assert.equal(ui.host.querySelector<HTMLSelectElement>('[aria-label="Odds board team"]')?.value,'SEA')
    assert.equal(ui.host.querySelector<HTMLElement>('[aria-label="NFL milestone odds and movement"]')?.scrollLeft,73)
  }finally{await ui.close()}
})
test('a failed phase check immediately hides old prices',async()=>{const ui=await mount();try{await new Promise(resolve=>setTimeout(resolve,5));await ui.phase({gameId:'one',token:null,observedAt:null,checkedAt:Date.now()});assert.equal(ui.host.querySelector('table'),null);assert.match(ui.host.textContent??'',/Checking pregame prices/)}finally{await ui.close()}})
test('resuming a throttled tab hides expired proof synchronously',async()=>{
  const original=Date.now;let now=original();Date.now=()=>now
  const ui=await mount(payload,async()=>Response.json({...payload,phaseObservedAt:new Date(now).toISOString()}))
  try{
    assert.ok(ui.host.querySelector('table'))
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));now+=49000
    await act(async()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new dom.window.Event('visibilitychange'))})
    assert.equal(ui.host.querySelector('table'),null);assert.match(ui.host.textContent??'',/Checking pregame prices/)
  }finally{await ui.close();Date.now=original;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})}
})
test('resume hides even an unexpired proof until a fresh server observation arrives',async()=>{
  let count=0
  const fetcher=async()=>{count++;return Response.json({...payload,phaseObservedAt:new Date().toISOString()})}
  const ui=await mount(payload,fetcher)
  try{
    await select(ui.host,'Odds board team','SEA')
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new dom.window.Event('visibilitychange'))
    await new Promise(resolve=>setTimeout(resolve,5))
    await act(async()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));await new Promise(resolve=>setTimeout(resolve,10))})
    assert.equal(ui.host.querySelector('table'),null);assert.equal(count,1)
    await new Promise(resolve=>setTimeout(resolve,5));await ui.phase({gameId:'one',token:'a'.repeat(64),observedAt:new Date().toISOString(),checkedAt:Date.now()})
    assert.equal(ui.host.querySelector<HTMLSelectElement>('[aria-label="Odds board team"]')?.value,'SEA');assert.ok(ui.host.querySelector('table'))
  }finally{await ui.close();Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})}
})
test('a phase change while a request is pending queues one follow-up',async()=>{
  let count=0,finish:((r:Response)=>void)|null=null
  const fetcher=async()=>{count++;if(count===1)return Response.json({...payload,phaseObservedAt:new Date().toISOString()});if(count===2)return await new Promise<Response>(resolve=>{finish=resolve});return Response.json({...payload,phaseToken:'b'.repeat(64),phaseObservedAt:new Date().toISOString()})}
  const ui=await mount(payload,fetcher)
  try{
    await new Promise(resolve=>setTimeout(resolve,5));await ui.phase({gameId:'one',token:'b'.repeat(64),observedAt:new Date().toISOString(),checkedAt:Date.now()});assert.equal(count,2)
    const observedAt=new Date().toISOString();await ui.phase({gameId:'one',token:'c'.repeat(64),observedAt,checkedAt:Date.now()})
    assert.equal(ui.host.querySelector('table'),null);assert.ok(finish)
    await act(async()=>{finish!(Response.json({...payload,phaseToken:'b'.repeat(64),phaseObservedAt:observedAt}));await new Promise(resolve=>setTimeout(resolve,20))})
    assert.equal(count,3)
  }finally{await ui.close();Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})}
})
test('a pre-resume response arriving late cannot satisfy the new proof requirement',async()=>{
  let count=0,first:((r:Response)=>void)|null=null
  const before=new Date().toISOString()
  const fetcher=async()=>{count++;return await new Promise<Response>(resolve=>{first=resolve})}
  const ui=await mount(payload,fetcher)
  try{
    assert.equal(count,1);Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));await new Promise(resolve=>setTimeout(resolve,5))
    await act(async()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));await new Promise(resolve=>setTimeout(resolve,10))})
    assert.ok(first);await act(async()=>{first!(Response.json({...payload,phaseObservedAt:before}));await new Promise(resolve=>setTimeout(resolve,10))})
    assert.equal(ui.host.querySelector('table'),null);assert.equal(count,1)
    await new Promise(resolve=>setTimeout(resolve,5));await ui.phase({gameId:'one',token:'a'.repeat(64),observedAt:new Date().toISOString(),checkedAt:Date.now()});assert.ok(ui.host.querySelector('table'))
  }finally{await ui.close();Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})}
})
test('offline hides prices and reconnect waits for a newly verified board',async()=>{
  let count=0
  const fetcher=async()=>{count++;return Response.json({...payload,phaseObservedAt:new Date().toISOString()})}
  const ui=await mount(payload,fetcher)
  try{
    await act(async()=>{window.dispatchEvent(new dom.window.Event('offline'))});assert.equal(ui.host.querySelector('table'),null)
    await new Promise(resolve=>setTimeout(resolve,5));await act(async()=>{window.dispatchEvent(new dom.window.Event('online'));await new Promise(resolve=>setTimeout(resolve,10))})
    assert.equal(ui.host.querySelector('table'),null);assert.equal(count,1)
    await new Promise(resolve=>setTimeout(resolve,5));await ui.phase({gameId:'one',token:'a'.repeat(64),observedAt:new Date().toISOString(),checkedAt:Date.now()});assert.ok(ui.host.querySelector('table'))
  }finally{await ui.close()}
})
test('changing market cancels a queued old-market refresh',async()=>{
  let count=0,finish:((r:Response)=>void)|null=null
  const initial={...payload,markets:['receiving_yards','rushing_yards']}
  const fetcher=async()=>{count++;if(count===1)return Response.json({...initial,phaseObservedAt:new Date().toISOString()});if(count===2)return await new Promise<Response>(resolve=>{finish=resolve});return Response.json({...initial,market:'rushing_yards',quotes:[],phaseObservedAt:new Date().toISOString()})}
  const ui=await mount(initial,fetcher)
  try{
    await new Promise(resolve=>setTimeout(resolve,5));await ui.phase({gameId:'one',token:'b'.repeat(64),observedAt:new Date().toISOString(),checkedAt:Date.now()});assert.equal(count,2)
    await ui.phase({gameId:'one',token:'c'.repeat(64),observedAt:new Date().toISOString(),checkedAt:Date.now()})
    await select(ui.host,'Odds board market','rushing_yards');assert.equal(count,3);assert.ok(finish)
    await act(async()=>{finish!(Response.json({...initial,phaseObservedAt:new Date().toISOString()}));await new Promise(resolve=>setTimeout(resolve,20))});assert.equal(count,3)
  }finally{await ui.close()}
})
