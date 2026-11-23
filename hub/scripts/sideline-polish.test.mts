import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {act,createElement as h,type ReactNode} from 'react'
import {makeLens,makeNflOdds,makeNflSlateEdge,getCachedSidelineCheatsheetLens,nflGames,storedGameState} from '../review/nfl'
import {filterNflMarkets,nflMarketExclusions} from '../src/lib/nflAvailability'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/the-sideline',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,location:win.location,localStorage:win.localStorage,HTMLElement:win.HTMLElement,HTMLImageElement:win.HTMLImageElement,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win)})
const {createRoot}=await import('react-dom/client')
const stubs:Record<string,string>={
 '@/components/social/SlateEdgeShareModal':'export const SlateEdgeShareModal=()=>null',
 'next/navigation':"export const useRouter=()=>({push(){},replace(){},refresh(){}});export const useSearchParams=()=>new URLSearchParams()",
 'next/dynamic':'export default ()=>()=>null',
 'next/image':"import {createElement as h} from 'react';export default function Image({fill,priority,unoptimized,...props}){return h('img',props)}",
 'next/link':"import {createElement as h} from 'react';export default function Link({prefetch,scroll,...props}){return h('a',props)}",
 '@/lib/nflPolling':'export const callbacks=[];export const startNflPolling=(fn,options)=>{callbacks.push(fn);if(options?.immediate)Promise.resolve(fn(new AbortController().signal)).catch(()=>{});return()=>{}}',
 '@/context/WatchlistContext':'const items=[];export const useWatchlist=()=>({items,add:async()=>{},remove:async()=>{},has:()=>false})',
}
const bundle=await build({stdin:{contents:`export {SidelineCheatsheets} from './src/app/the-sideline/SidelineCheatsheets';export {NflSlateEdgeOverlay} from './src/app/the-sideline/NflSlateEdgeOverlay';export {NflMatrixButton} from './src/components/sideline/NflMatrixButton';export {callbacks} from '@/lib/nflPolling';export {NflQuote} from './src/components/sideline/NflQuote';export {ResearchSectionNav} from './src/components/research/ResearchSectionNav';export {SidelinePlayerAvatar} from './src/app/the-sideline/SidelinePlayerAvatar';export {SidelineResearchClient} from './src/app/the-sideline/SidelineResearchClient';export {SidelineBoardClient} from './src/app/the-sideline/SidelineBoardClient';`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'sideline-polish.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'local-boundaries',setup(b){b.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const module={exports:{} as Record<string,any>}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
async function mount(component:ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(component));return{host,rerender:async(node:ReactNode)=>act(async()=>root.render(node)),close:async()=>{await act(async()=>root.unmount());host.remove()}}}
const quote={vendor:'fanduel',line:70,openingLine:70,type:'milestone',current:{odds:150},opening:{odds:200},updatedAt:null}

test('comparison separates implied probability from historical payout changes and shares every drawer metric',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({matrices:[]})
 const odds=makeNflOdds(),lens=makeLens(),josh=odds.players.find(p=>p.name==='Josh Allen')!
 for(const [propType,current,averageOdds,deltaPct] of [['first_td',850,2881.36,-.705],['anytime_td',290,906.25,-.68]] as const){
  const offer=josh.markets.find(m=>m.propType===propType)!.offers.find(o=>o.vendor==='fanduel')!;offer.current={odds:current}
  josh.tdBaselines??=[];josh.tdBaselines.push({propType,vendor:'fanduel',averageOdds,deltaPct,sampleGames:20,averageProbability:null,currentProbability:null,deltaProbabilityPoints:null,deltaOdds:null,firstSampleDate:null,throughDate:null})
 }
 lens.windows.l3.players.find(p=>p.name==='Josh Allen')!.geometry=29
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens,odds,gameState:storedGameState(),touchdowns:[],timeline:[]}))
 try{
  for(const name of ['Josh Allen','James Cook'])await act(async()=>ui.host.querySelector<HTMLButtonElement>(`button[aria-label="Compare ${name}"]`)!.click())
  const panel=ui.host.querySelector<HTMLElement>('[data-player-comparison]')!
  const row=(name:string)=>[...panel.querySelectorAll('tbody tr')].find(tr=>tr.querySelector('th')?.textContent===name)!
  for(const label of ['Volume','Geometry','Red zone','Breakaway','Evidence','RZ looks'])assert.ok(row(label),label)
  assert.doesNotMatch(panel.textContent!,/FTD%|ATD%|FTD PICKS|ATD PICKS/)
  const probabilities=[...panel.querySelectorAll('tbody tr')].filter(tr=>tr.querySelector('th')?.textContent==='Implied probability')
  assert.equal(probabilities[0].querySelector('td')!.textContent,'10.5%');assert.equal(probabilities[1].querySelector('td')!.textContent,'25.6%')
  const references=[...panel.querySelectorAll('tbody tr')].filter(tr=>tr.querySelector('th')?.textContent==='Payout vs avg')
  assert.match(references[0].querySelector('td')!.textContent!,/-70.5%.*20G avg \+2881/)
  assert.match(references[1].querySelector('td')!.textContent!,/-68.0%.*20G avg \+906/)
  await act(async()=>{const select=panel.querySelector<HTMLSelectElement>('select[aria-label="Comparison sample"]')!;select.value='l3';select.dispatchEvent(new win.Event('change',{bubbles:true}))})
  assert.equal(row('Geometry').querySelector('td b')!.textContent,'29')
  await act(async()=>panel.querySelector<HTMLButtonElement>('button[aria-label="Open Josh Allen details from comparison"]')!.click())
  const dialog=document.querySelector('[role="dialog"]')!,geometry=[...dialog.querySelectorAll('small')].find(el=>el.textContent==='Geometry')!.parentElement!
  assert.equal(geometry.querySelector('b')!.textContent,'29','the drawer and comparison use the same sample and metric value')
  await act(async()=>dialog.querySelector<HTMLButtonElement>('button[aria-label="Close player details"]')!.click())
  await act(async()=>[...panel.querySelectorAll<HTMLButtonElement>('nav button')].find(button=>button.textContent==='NFL Tracking')!.click())
  for(const label of ['Targets','Receptions','Target share','Carries','Carry share','aDOT','Separation','YACOE','RYOE/A','Explosives','Pass yards','CPOE'])assert.ok(row(label),label)
  await act(async()=>panel.querySelector<HTMLButtonElement>('button[aria-label="Remove James Cook from comparison"]')!.click())
  assert.match(panel.textContent!,/1 of 4 players/)
  await act(async()=>[...panel.querySelectorAll('button')].find(button=>button.textContent==='Clear')!.click())
  assert.equal(ui.host.querySelector('[data-player-comparison]'),null)
 }finally{await ui.close();globalThis.fetch=old}
})

test('comparison keeps missing metrics unavailable and opening-only prices out of the current summary',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({matrices:[]})
 const odds=makeNflOdds(),lens=makeLens()
 for(const window of Object.values(lens.windows))window.players.find(p=>p.name==='James Cook')!.unavailableMetrics=['geometry','separation']
 for(const market of odds.players.find(p=>p.name==='Josh Allen')!.markets)for(const offer of market.offers)if(offer.vendor==='fanduel')offer.isOpeningOnly=true
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens,odds,gameState:storedGameState(),touchdowns:[],timeline:[]}))
 try{
  for(const name of ['James Cook','Josh Allen'])await act(async()=>ui.host.querySelector<HTMLButtonElement>(`button[aria-label="Compare ${name}"]`)!.click())
  const panel=ui.host.querySelector<HTMLElement>('[data-player-comparison]')!
  const rows=[...panel.querySelectorAll('tbody tr')]
  assert.equal(rows.find(tr=>tr.querySelector('th')?.textContent==='Geometry')!.querySelector('td')!.textContent,'—')
  for(const row of rows.filter(tr=>['FanDuel odds','Implied probability','Payout vs avg','FTD / ATD ratio'].includes(tr.querySelector('th')?.textContent??'')))assert.equal(row.querySelectorAll('td')[1].textContent,'—')
  await act(async()=>[...panel.querySelectorAll<HTMLButtonElement>('nav button')].find(button=>button.textContent==='Sportsbooks')!.click())
  assert.ok(panel.querySelector('select[aria-label="Comparison market"]'))
  assert.match(panel.textContent!,/FanDuel|DraftKings/);assert.match(panel.textContent!,/Open/)
  assert.doesNotMatch(panel.textContent!,/NaN|Infinity|undefined/)
  const scroll=panel.querySelector('[aria-label="Player comparison table"]')!
  assert.equal(scroll.getAttribute('tabindex'),'0');assert.ok(panel.querySelector('caption'));assert.ok(panel.querySelector('th[scope="col"]'))
 }finally{await ui.close();globalThis.fetch=old}
})

for(const [name,offer,side,expected] of [
 ['same contract',quote,'odds','Shortened: +6.7 probability points'],
 ['changed threshold',{...quote,openingLine:60},'odds','no comparable observation'],
 ['unknown opening threshold',{...quote,openingLine:null},'odds','no comparable observation'],
 ['under side',{...quote,type:'over_under',current:{over:-110,under:150},opening:{over:150,under:200}},'under','Shortened: +6.7 probability points'],
 ['opening-only capture',{...quote,isOpeningOnly:true},'odds','no comparable observation'],
 ['invalid American price',{...quote,current:{odds:0}},'odds','no comparable observation'],
] as const)test(`player quotes preserve ${name}`,async()=>{
 const ui=await mount(h(module.exports.NflQuote,{offer,side}))
 try{assert.match(ui.host.querySelector('[role="img"]')!.getAttribute('aria-label')!,new RegExp(expected.replace('+','\\+')));if(name==='changed threshold')assert.match(ui.host.textContent!,/Open 60\+ \+200/);if(name==='opening-only capture')assert.match(ui.host.textContent!,/—Open \+200/)}finally{await ui.close()}
})

test('section navigation exposes every option to phone and keyboard users without switching on focus',async()=>{
 const changes:string[]=[],items=[{value:'a',label:'Matchup'},{value:'b',label:'Tracking'},{value:'c',label:'Sportsbooks'}]
 const ui=await mount(h(module.exports.ResearchSectionNav,{label:'Player section',value:'a',items,onChange:(value:string)=>changes.push(value)}))
 try{const buttons=[...ui.host.querySelectorAll<HTMLButtonElement>('button')];assert.equal(buttons.length,3);assert.equal(ui.host.querySelectorAll('option').length,3);await act(async()=>{buttons[0].focus();buttons[0].dispatchEvent(new win.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))});assert.equal(document.activeElement,buttons[2]);assert.deepEqual(changes,[]);await act(async()=>buttons[2].click());assert.deepEqual(changes,['c']);await act(async()=>{const select=ui.host.querySelector('select')!;select.value='b';select.dispatchEvent(new win.Event('change',{bubbles:true}))});assert.deepEqual(changes,['c','b'])}finally{await ui.close()}
})

test('player portrait failures advance through saved fallbacks and preserve team artwork across rerenders',async()=>{
 const player={name:'Fixture Player',headshot:'/primary.png',headshotFallbacks:['/second.png']},team=nflGames[0].away
 const ui=await mount(h(module.exports.SidelinePlayerAvatar,{player,team}))
 try{let image=ui.host.querySelector<HTMLImageElement>('img[alt="Fixture Player headshot"]')!;assert.equal(image.getAttribute('src'),'/primary.png');await act(async()=>image.dispatchEvent(new win.Event('error')));image=ui.host.querySelector<HTMLImageElement>('img[alt="Fixture Player headshot"]')!;assert.equal(image.getAttribute('src'),'/second.png');await ui.rerender(h(module.exports.SidelinePlayerAvatar,{player:{...player},team:{...team}}));assert.equal(ui.host.querySelector('img[alt="Fixture Player headshot"]')!.getAttribute('src'),'/second.png');await act(async()=>image.dispatchEvent(new win.Event('error')));assert.match(ui.host.textContent!,/FP/);assert.ok(ui.host.querySelector('img[alt="Buffalo Bills logo"]'));assert.match(ui.host.querySelector('span')!.getAttribute('style')!,/linear-gradient/)}finally{await ui.close()}
})

test('sportsbook comparisons isolate lines and sides, mark tied best prices, and never crown a single book',async()=>{
 const player={id:1,name:'Fixture Receiver',team:'BUF',position:'WR',markets:[{key:'receiving_yards',propType:'receiving_yards',label:'Receiving yards',category:'receiving',line:60,offers:[{...quote,type:'over_under',line:60,current:{over:150,under:-110}},{...quote,vendor:'draftkings',type:'over_under',line:60,current:{over:150,under:-115}},{...quote,vendor:'betmgm',type:'over_under',line:70,current:{over:200}}]}]}
 const ui=await mount(h(module.exports.SidelineResearchClient,{board:{...makeNflOdds(),players:[player]},boardHref:'/the-sideline',title:'BUF @ KC',mode:'markets',teams:[nflGames[0].away,nflGames[0].home]}))
 try{const cards=[...ui.host.querySelectorAll('article')];assert.equal(cards.length,3);const over=cards.find(card=>/60.*Over|Over.*60/i.test(card.textContent!))!;assert.ok(over);assert.equal(over.querySelectorAll('[aria-label="Best payout"]').length,2);const only=cards.find(card=>/70/.test(card.textContent!))!;assert.equal(only.querySelectorAll('[aria-label="Best payout"]').length,0)}finally{await ui.close()}
})

test('drawer never substitutes season production for an empty Last 1 sample; exact markets remain accessible',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({matrices:[]})
 const lens=makeLens();lens.windows.l1={...lens.windows.l1,players:[]}
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens,odds:makeNflOdds(),gameState:storedGameState(),touchdowns:[],timeline:[]}))
 try{await act(async()=>ui.host.querySelector<HTMLButtonElement>('button[aria-label="Open Josh Allen"]')!.click());let dialog=document.querySelector('[role="dialog"]')!;assert.ok(dialog);await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Last 1')!.click());assert.match(dialog.textContent!,/Sample unavailable/);assert.doesNotMatch(dialog.textContent!,/Passing/);assert.equal(dialog.querySelectorAll('meter').length,0);await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Sportsbooks')!.click());dialog=document.querySelector('[role="dialog"]')!;assert.match(dialog.textContent!,/\+165/);assert.ok(dialog.querySelector('a[href="/nfl/players/review-nfl-1"]'));assert.equal(dialog.querySelectorAll('nav button').length,3)}finally{await ui.close();globalThis.fetch=old}
})


test('team highlight cards retain player identity, use an observed alternate book and open the same drawer',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({matrices:[]})
 const odds=makeNflOdds()
 const player=odds.players.find(p=>p.name==='Josh Allen')!
 for(const market of player.markets){market.offers=market.offers.filter(o=>o.vendor!=='fanduel');if(market.propType==='anytime_td')market.offers.forEach(o=>{o.current={odds:200}})}
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens:makeLens(),odds,gameState:storedGameState(),touchdowns:[],timeline:[]}))
 try{
  const rail=ui.host.querySelector('[aria-label="Buffalo Bills player highlights"]')!
  const card=rail.querySelector<HTMLButtonElement>('button[data-signal="score"]')!
  assert.ok(card);assert.match(card.textContent!,/Josh Allen/);assert.match(card.textContent!,/QB/);assert.match(card.textContent!,/\+200/)
  assert.match(card.getAttribute('aria-label')!,/\+200/,'the accessible name retains the observed quote')
  assert.ok(card.querySelector('img[alt="Josh Allen headshot"]'))
  assert.ok(card.querySelector('img[alt="DraftKings logo"]')||card.querySelector('img[alt="BetMGM logo"]')||card.querySelector('img[alt="Caesars logo"]'))
  assert.equal(rail.getAttribute('tabindex'),'0','the phone highlight rail remains keyboard scrollable')
  await act(async()=>card.click())
  assert.equal(document.querySelector('[role="dialog"]')!.getAttribute('aria-label'),'Josh Allen NFL breakdown')
 }finally{await ui.close();globalThis.fetch=old}
})

test('highlight cards never promote opening-only observations to a current quote',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({matrices:[]})
 const odds=makeNflOdds()
 for(const player of odds.players)for(const market of player.markets)for(const offer of market.offers)offer.isOpeningOnly=true
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens:makeLens(),odds,gameState:storedGameState(),touchdowns:[],timeline:[]}))
 try{for(const card of ui.host.querySelectorAll('button[data-signal]')){assert.match(card.textContent!,/Price unavailable/);assert.equal(card.querySelector('img[alt$=" logo"]:not([alt$="Bills logo"]):not([alt$="Chiefs logo"])'),null)}}finally{await ui.close();globalThis.fetch=old}
})

test('out and unlisted players stay below priced research, retain drawers, and cannot win highlights',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({matrices:[]})
 const odds=makeNflOdds(),out=odds.players.find(p=>p.name==='Khalil Shakir')!,unlisted=odds.players.find(p=>p.name==='Josh Allen')!,questionable=odds.players.find(p=>p.name==='James Cook')!
 out.availability={gameStatus:'out',active:false,injury:'Hamstring',starter:null,didNotPlay:null,updatedAt:'2030-11-20T10:00:00Z'}
 unlisted.markets=[]
 questionable.availability={...out.availability,gameStatus:'questionable',active:null,injury:'Knee'}
 const props={games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens:makeLens(),odds:filterNflMarkets(odds,nflMarketExclusions(odds.players,2030)),gameState:storedGameState(),touchdowns:[],timeline:[]}
 const ui=await mount(h(module.exports.SidelineBoardClient,props))
 try{
  const highlights=ui.host.querySelector('[aria-label="Buffalo Bills player highlights"]')!
  assert.doesNotMatch(highlights.textContent!,/Josh Allen|Khalil Shakir/)
  assert.ok(ui.host.querySelector('button[aria-label="Open James Cook"]'))
  assert.equal(ui.host.querySelector('button[aria-label="Open Khalil Shakir"]'),null)
  assert.equal(ui.host.querySelector('button[aria-label="Open Josh Allen"]'),null)
  const groups=[...ui.host.querySelectorAll<HTMLButtonElement>('tbody button[aria-expanded]')]
  const unavailable=groups.find(button=>button.textContent!.includes('Unavailable for this game'))!
  await act(async()=>unavailable.click())
  assert.equal(unavailable.getAttribute('aria-expanded'),'true')
  await act(async()=>ui.host.querySelector<HTMLButtonElement>('button[aria-label="Open Khalil Shakir"]')!.click())
  const dialog=document.querySelector('[role="dialog"]')!
  assert.match(dialog.textContent!,/Out/);assert.match(dialog.textContent!,/Hamstring/)
  assert.doesNotMatch(dialog.textContent!,/INJURY/)
  await act(async()=>dialog.querySelector<HTMLButtonElement>('button[aria-label="Close player details"]')!.click())
  await act(async()=>groups.find(button=>button.textContent!.includes('Unlisted in this market'))!.click())
  assert.ok(ui.host.querySelector('button[aria-label="Open Josh Allen"]'))
  out.availability={...out.availability,gameStatus:null,active:true,injury:null}
  await ui.rerender(h(module.exports.SidelineBoardClient,{...props,key:'cleared',odds}))
  assert.ok(ui.host.querySelector('button[aria-label="Open Khalil Shakir"]'),'a newly cleared quoted player returns to the main table')
 }finally{await ui.close();globalThis.fetch=old}
})

test('switching NFL player sections starts the next section at its beginning',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({matrices:[]})
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens:makeLens(),odds:makeNflOdds(),gameState:storedGameState(),touchdowns:[],timeline:[]}))
 try{
  await act(async()=>ui.host.querySelector<HTMLButtonElement>('button[aria-label="Open Josh Allen"]')!.click())
  const dialog=document.querySelector('[role="dialog"]')!
  const body=dialog.querySelector('nav')!.parentElement!.nextElementSibling as HTMLElement
  body.scrollTop=640
  await act(async()=>[...dialog.querySelectorAll<HTMLButtonElement>('nav button')].find(button=>button.textContent==='Sportsbooks')!.click())
  assert.equal(body.scrollTop,0,'a shorter or longer section must not inherit the previous section scroll')
  assert.match(body.textContent!,/\+165/,'the sportsbook quotes remain accessible')
 }finally{await ui.close();globalThis.fetch=old}
})

test('an open game loses current rankings and quotes when availability expires, including after a failed refresh',async(context)=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:503})
 const now=Date.now(),odds=makeNflOdds()
 odds.availabilityObservedAt=new Date(now-89000).toISOString()
 odds.availabilityCutoffAt=new Date(now+600000).toISOString()
 context.mock.timers.enable({apis:['setTimeout','Date'],now})
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:nflGames,selectedId:nflGames[0].id,sample:'regular',lens:makeLens(),odds,gameState:storedGameState(),touchdowns:[],timeline:[]}))
 try{
  assert.ok(ui.host.querySelector('button[data-signal="score"]'))
  await act(async()=>context.mock.timers.tick(1001))
  assert.equal(ui.host.querySelector('button[data-signal="score"]'),null)
  assert.equal(ui.host.querySelector('button[aria-label^="Add Josh Allen"]'),null)
  assert.match(ui.host.textContent!,/Checking current player availability/)
  await act(async()=>context.mock.timers.tick(600000))
  assert.equal(ui.host.querySelector('button[data-signal="score"]'),null,'crossing kickoff cannot resurrect a board that already expired')
 }finally{await ui.close();context.mock.timers.reset();globalThis.fetch=old}
})

test('Sideline Edge retains the last good slate on refresh failure and Retry recovers it',async()=>{
 const old=globalThis.fetch;let fail=false;globalThis.fetch=async()=>fail?new Response('{}',{status:503}):Response.json(makeNflSlateEdge())
 const ui=await mount(h(module.exports.NflSlateEdgeOverlay,{open:true,date:'2030-11-20',sample:'regular',onClose:()=>{}}))
 try{assert.match(document.body.textContent!,/Patrick Mahomes/);fail=true;await act(async()=>{await module.exports.callbacks.at(-1)(new AbortController().signal).catch(()=>{})});assert.match(document.body.textContent!,/Refresh unavailable/);assert.match(document.body.textContent!,/Patrick Mahomes/);fail=false;await act(async()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Retry')!.click());assert.doesNotMatch(document.body.textContent!,/Refresh unavailable/);assert.match(document.body.textContent!,/Patrick Mahomes/)}finally{await ui.close();globalThis.fetch=old}
})

test('Sideline Edge explains a timeout without exposing raw browser errors and can recover', async () => {
 const old=globalThis.fetch;let fail=true;globalThis.fetch=async()=>{if(fail)throw new DOMException('signal timed out','TimeoutError');return Response.json(makeNflSlateEdge())}
 const ui=await mount(h(module.exports.NflSlateEdgeOverlay,{open:true,date:'2030-11-20',sample:'regular',onClose:()=>{}}))
 try{assert.match(document.body.textContent!,/full slate is taking longer than usual/);assert.doesNotMatch(document.body.textContent!,/signal timed out/);fail=false;await act(async()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Retry')!.click());assert.match(document.body.textContent!,/Patrick Mahomes/);assert.doesNotMatch(document.body.textContent!,/taking longer/)}finally{await ui.close();globalThis.fetch=old}
})

test('Matrix editor preserves every condition category and pipeline rank control without submitting a mutation',async()=>{
 const old=globalThis.fetch,calls:string[]=[];globalThis.fetch=async(input,init)=>{calls.push(init?.method??'GET');return Response.json({matrices:[],listings:[]})}
 const ui=await mount(h(module.exports.NflMatrixButton))
 try{await act(async()=>[...ui.host.querySelectorAll('button')].find(el=>el.textContent?.includes('NFL Matrix'))!.click());await act(async()=>[...document.querySelectorAll('button')].find(el=>el.textContent===' New NFL Matrix'||el.textContent==='New NFL Matrix')!.click());let dialog=document.querySelector('[role="dialog"]')!;assert.ok(dialog.querySelector('select[aria-label="Condition category"]'));assert.equal(dialog.querySelectorAll('select[aria-label="Condition category"] option').length,7);await act(async()=>[...dialog.querySelectorAll('button')].find(el=>el.textContent==='Pipeline')!.click());dialog=document.querySelector('[role="dialog"]')!;const step=dialog.querySelector<HTMLSelectElement>('select[aria-label="Pipeline step type"]')!;await act(async()=>{step.value='rank';step.dispatchEvent(new win.Event('change',{bubbles:true}))});assert.ok(dialog.querySelector('input[aria-label="Number of ranked players to keep"]'));assert.ok(dialog.querySelector('select[aria-label="Rank scope"]'));assert.ok(calls.every(method=>method==='GET'))}finally{await ui.close();globalThis.fetch=old}
})


test('Both Teams DvP contains only the selected matchup, while single-team filtering retains its complete sample',async()=>{
 const lens=await getCachedSidelineCheatsheetLens();lens.dvp.push({...lens.dvp[0],defense:'DEN'})
 const ui=await mount(h(module.exports.SidelineCheatsheets,{lens,board:makeNflOdds()}))
 try{await act(async()=>[...ui.host.querySelectorAll<HTMLButtonElement>('nav button')].find(el=>el.textContent==='Defense / DvP')!.click());const rows=()=>ui.host.querySelectorAll('[aria-label="Defense / DvP table"] tbody tr');assert.equal(rows().length,8);assert.equal(lens.dvp.length,9,'the league comparison pool stays unchanged');const team=ui.host.querySelector<HTMLSelectElement>('[aria-label="Cheatsheet controls"] select')!;await act(async()=>{team.value='KC';team.dispatchEvent(new win.Event('change',{bubbles:true}))});assert.equal(rows().length,4);await act(async()=>{team.value='all';team.dispatchEvent(new win.Event('change',{bubbles:true}))});assert.equal(rows().length,8)}finally{await ui.close()}
})

test('Sideline final totals, compact injury marks and rookie portrait ribbons reach the board and player drawer',async()=>{
 const game={...nflGames[0],awayScore:21,homeScore:24},board=makeNflOdds(game)
 board.players[2].rookieSeason=2030
 board.players[3].availability={gameStatus:'questionable',active:null,injury:'Knee',starter:null,didNotPlay:null,updatedAt:'2030-11-20T12:00:00Z'}
 const results={status:'final',updatedAt:'2030-11-20T23:00:00Z',firstTd:null,firstTdKnown:true,players:board.players.map((p,i)=>({id:p.id,gsisId:p.gsisId,name:p.name,team:p.team,stats:{receiving_yards:76,rushing_yards:84,passing_yards:264,anytime_td:i===2?0:1}}))}
 const ui=await mount(h(module.exports.SidelineBoardClient,{games:[game],selectedId:game.id,sample:'regular',lens:makeLens(game),odds:board,gameState:{...storedGameState(),status:'Final',statusState:'final'},touchdowns:[],timeline:[],initialFinalResults:results}))
 try{
  const mark=ui.host.querySelector('abbr[aria-label="Questionable · Knee"]')
  assert.equal(mark?.textContent,'Q');assert.equal(mark?.getAttribute('title'),'Questionable · Knee')
  assert.ok(ui.host.querySelector('[data-rookie="true"]')?.textContent?.includes('Rookie'))
  assert.equal(ui.host.querySelectorAll('[data-nfl-final]').length,board.players.length)
  assert.match(ui.host.querySelector('[data-nfl-final][aria-label^="Travis Kelce"]')?.textContent??'',/Final76 rec yds0 TD/)
  await act(async()=>ui.host.querySelector<HTMLButtonElement>('button[aria-label="Open James Cook"]')!.click())
  const dialog=document.querySelector('[role="dialog"]')!
  assert.match(dialog.textContent!,/QuestionableKnee/)
  assert.match(dialog.querySelector('[data-nfl-final]')?.textContent??'',/Final84 rush yds1 TD/)
 }finally{await ui.close()}
})
