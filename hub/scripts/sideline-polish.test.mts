import assert from 'node:assert/strict'
import test from 'node:test'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {act,createElement as h,type ReactNode} from 'react'
import {makeLens,makeNflOdds,makeNflSlateEdge,nflGames,storedGameState} from '../review/nfl'

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
const bundle=await build({stdin:{contents:`export {NflSlateEdgeOverlay} from './src/app/the-sideline/NflSlateEdgeOverlay';export {NflMatrixButton} from './src/components/sideline/NflMatrixButton';export {callbacks} from '@/lib/nflPolling';export {NflQuote} from './src/components/sideline/NflQuote';export {ResearchSectionNav} from './src/components/research/ResearchSectionNav';export {SidelinePlayerAvatar} from './src/app/the-sideline/SidelinePlayerAvatar';export {SidelineResearchClient} from './src/app/the-sideline/SidelineResearchClient';export {SidelineBoardClient} from './src/app/the-sideline/SidelineBoardClient';`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'sideline-polish.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'local-boundaries',setup(b){b.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const module={exports:{} as Record<string,any>}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
async function mount(component:ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(component));return{host,rerender:async(node:ReactNode)=>act(async()=>root.render(node)),close:async()=>{await act(async()=>root.unmount());host.remove()}}}
const quote={vendor:'fanduel',line:70,openingLine:70,type:'milestone',current:{odds:150},opening:{odds:200},updatedAt:null}

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


test('Sideline Edge retains the last good slate on refresh failure and Retry recovers it',async()=>{
 const old=globalThis.fetch;let fail=false;globalThis.fetch=async()=>fail?new Response('{}',{status:503}):Response.json(makeNflSlateEdge())
 const ui=await mount(h(module.exports.NflSlateEdgeOverlay,{open:true,date:'2030-11-20',sample:'regular',onClose:()=>{}}))
 try{assert.match(document.body.textContent!,/Patrick Mahomes/);fail=true;await act(async()=>{await module.exports.callbacks.at(-1)(new AbortController().signal).catch(()=>{})});assert.match(document.body.textContent!,/Refresh unavailable/);assert.match(document.body.textContent!,/Patrick Mahomes/);fail=false;await act(async()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Retry')!.click());assert.doesNotMatch(document.body.textContent!,/Refresh unavailable/);assert.match(document.body.textContent!,/Patrick Mahomes/)}finally{await ui.close();globalThis.fetch=old}
})

test('Matrix editor preserves every condition category and pipeline rank control without submitting a mutation',async()=>{
 const old=globalThis.fetch,calls:string[]=[];globalThis.fetch=async(input,init)=>{calls.push(init?.method??'GET');return Response.json({matrices:[],listings:[]})}
 const ui=await mount(h(module.exports.NflMatrixButton))
 try{await act(async()=>[...ui.host.querySelectorAll('button')].find(el=>el.textContent?.includes('NFL Matrix'))!.click());await act(async()=>[...document.querySelectorAll('button')].find(el=>el.textContent===' New NFL Matrix'||el.textContent==='New NFL Matrix')!.click());let dialog=document.querySelector('[role="dialog"]')!;assert.ok(dialog.querySelector('select[aria-label="Condition category"]'));assert.equal(dialog.querySelectorAll('select[aria-label="Condition category"] option').length,7);await act(async()=>[...dialog.querySelectorAll('button')].find(el=>el.textContent==='Pipeline')!.click());dialog=document.querySelector('[role="dialog"]')!;const step=dialog.querySelector<HTMLSelectElement>('select[aria-label="Pipeline step type"]')!;await act(async()=>{step.value='rank';step.dispatchEvent(new win.Event('change',{bubbles:true}))});assert.ok(dialog.querySelector('input[aria-label="Number of ranked players to keep"]'));assert.ok(dialog.querySelector('select[aria-label="Rank scope"]'));assert.ok(calls.every(method=>method==='GET'))}finally{await ui.close();globalThis.fetch=old}
})
