import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PUBLIC_PREVIEW_EXAMPLES } from '../src/lib/publicResearchPreviewExamples'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true})
const globals=globalThis as typeof globalThis & {
  visitorEvents?:Array<{name:string;properties:Record<string,string|number|boolean|null>}>
  visitorAnalyticsFails?:boolean
  visitorData?:{rows:Record<string,unknown>[];error?:object;reject?:boolean;selected?:string;filters?:Array<[string,unknown]>;limit?:number;signal?:AbortSignal}
}
globals.visitorEvents=[]
const {createRoot}=await import('react-dom/client')
const sharedStubs={
  'next/link':`import React from 'react';export default function Link({href,prefetch,children,onClick,...props}){return <a {...props} href={href} onClick={event=>{event.preventDefault();onClick?.(event)}}>{children}</a>}`,
  'next/image':`import React from 'react';export default function Image({preload,unoptimized,...props}){return <img {...props}/>}`,
  '@/components/theme/ThemeToggle':`import React from 'react';export function ThemeToggle(){return <div role="group" aria-label="Colour theme"><button type="button" aria-label="Use light theme">Light</button><button type="button" aria-label="Use dark theme">Dark</button></div>}`,
  '@vercel/analytics':`export function track(name,properties){if(globalThis.visitorAnalyticsFails)throw Error('analytics unavailable');globalThis.visitorEvents.push({name,properties})}`,
  './PublicCommunities':`import React from 'react';export function PublicCommunities(){return <div>Public directory</div>}export function PublicCommunitiesLoading(){return <div role="status">Loading public communities</div>}`,
}
async function compile(contents:string,stubs:Record<string,string>){
  const result=await build({stdin:{contents,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'visitor-tests.cjs',platform:'node',format:'cjs',jsx:'automatic',tsconfig:'tsconfig.json',external:['react','react-dom','react-dom/server'],loader:{'.css':'empty','.module.css':'empty'},plugins:[{name:'visitor-fixtures',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
  const compiled={exports:{}}
  new Function('require','module','exports',result.outputFiles[0].text)(require,compiled,compiled.exports)
  return compiled.exports
}
const components=await compile('export {ResearchShowcase} from "./src/components/marketing/ResearchShowcase";export {PublicSiteHeader} from "./src/components/marketing/PublicSiteHeader";export {DiscoveryLink} from "./src/components/marketing/DiscoveryLink";export {LandingPage} from "./src/components/marketing/LandingPage"',sharedStubs) as {
  ResearchShowcase:typeof import('../src/components/marketing/ResearchShowcase').ResearchShowcase
  PublicSiteHeader:typeof import('../src/components/marketing/PublicSiteHeader').PublicSiteHeader
  DiscoveryLink:typeof import('../src/components/marketing/DiscoveryLink').DiscoveryLink
  LandingPage:typeof import('../src/components/marketing/LandingPage').LandingPage
}
async function mount(content:ReactNode){
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  await act(async()=>root.render(content))
  return {host,async click(label:string){const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(item=>(item.getAttribute('aria-label')||item.textContent?.trim())===label);assert.ok(button,label);await act(async()=>button.click())},async close(){await act(async()=>root.unmount());host.remove()}}
}
function selectedPreview(host:HTMLElement){return new URL([...host.querySelectorAll<HTMLAnchorElement>('a')].find(link=>/^Open .* preview/.test(link.textContent||''))!.href)}

test('the working archive lets visitors select a player and milestone before any account prompt',async()=>{
  const ui=await mount(h(components.ResearchShowcase))
  try{
    assert.match(ui.host.textContent!,/Saved Nov 8, 2026/)
    assert.equal(ui.host.querySelectorAll('tbody tr').length,3)
    assert.ok(!ui.host.querySelector('a[href*="auth/"]'))
    await ui.click('Inspect Collin Sexton')
    assert.equal(ui.host.querySelector('aside h3')?.textContent,'Collin Sexton')
    assert.equal(selectedPreview(ui.host).searchParams.get('player'),'413')
    await ui.click('20+')
    assert.equal(selectedPreview(ui.host).searchParams.get('line'),'20')
    assert.equal(selectedPreview(ui.host).searchParams.get('game'),PUBLIC_PREVIEW_EXAMPLES.nba.game.id)
    assert.equal(selectedPreview(ui.host).searchParams.get('date'),'2026-11-08')
    assert.equal(selectedPreview(ui.host).pathname,'/preview/nba')
    assert.equal(ui.host.querySelector('button[aria-label="Inspect Collin Sexton"]')?.getAttribute('aria-pressed'),'true')
    assert.ok(!ui.host.querySelector('a[href*="nba.com/game"]'),'Do not show another player’s box score as this player’s result')
  }finally{await ui.close()}
})

test('a missing archived quote stays unavailable rather than looking like a current zero price',async()=>{
  const ui=await mount(h(components.ResearchShowcase))
  try{
    await ui.click('Inspect Collin Sexton');await ui.click('35+')
    assert.match(ui.host.querySelector('aside')!.textContent!,/No saved price for this milestone/)
    assert.deepEqual([...ui.host.querySelectorAll('aside dd')].map(node=>node.textContent),['–','–'])
    assert.equal(selectedPreview(ui.host).searchParams.get('line'),'35')
  }finally{await ui.close()}
})

test('sport switching resets incompatible player and rung selections and keeps source labels honest',async()=>{
  const ui=await mount(h(components.ResearchShowcase))
  try{
    await ui.click('Inspect Collin Sexton');await ui.click('35+');await ui.click('NFL')
    assert.equal(ui.host.querySelector('aside h3')?.textContent,'Cade Otton')
    assert.equal(selectedPreview(ui.host).pathname,'/preview/nfl')
    assert.equal(selectedPreview(ui.host).searchParams.get('line'),'40')
    assert.equal(selectedPreview(ui.host).searchParams.get('player'),'903')
    assert.match(ui.host.textContent!,/25 receiving yards/)
    await ui.click('NBA')
    assert.equal(ui.host.querySelector('aside h3')?.textContent,'Austin Reaves')
    assert.equal(selectedPreview(ui.host).searchParams.get('line'),'25')
    assert.match(ui.host.textContent!,/43 points/)
  }finally{await ui.close()}
})

test('shared public navigation retains browse destinations and safe sign-in return paths',()=>{
  const html=renderToStaticMarkup(h(components.PublicSiteHeader,{mode:'browse',pathname:'/groups/parlayparty',returnTo:'/groups?access=free'}))
  const document:Document=new JSDOM(html).window.document
  const links=[...document.querySelectorAll<HTMLAnchorElement>('nav a')]
  assert.deepEqual(links.map(link=>link.getAttribute('href')),['/feed','/#research','/groups','/creators','/sports','/leaderboard'])
  assert.equal(document.querySelector('a[href="/groups"]')?.getAttribute('aria-current'),'page')
  assert.ok(document.querySelector('a[href="/auth/login?next=%2Fgroups%3Faccess%3Dfree"]'))
  for(const returnTo of ['//elsewhere.test','/\\elsewhere.test','/feed\r\n']){
    const invalid=new JSDOM(renderToStaticMarkup(h(components.PublicSiteHeader,{returnTo}))).window.document
    assert.equal(invalid.querySelector('a[href*="/auth/login"]')?.getAttribute('href'),'/auth/login')
  }
})

test('homepage presents the working board and public destinations before the account/paid offer',()=>{
  const document=new JSDOM(renderToStaticMarkup(h(components.LandingPage))).window.document
  assert.equal(document.querySelectorAll('h1').length,1)
  assert.equal(document.querySelectorAll('main').length,1)
  assert.ok(!document.querySelector('main header'))
  assert.ok(!document.querySelector('main footer'))
  assert.ok(document.querySelector('a[href="#main-content"]'))
  assert.ok(document.querySelector('#research table'))
  assert.ok(document.querySelector('#community'))
  for(const href of ['/feed','/groups','/creators','/sports','/leaderboard'])assert.ok(document.querySelector(`a[href="${href}"]`),href)
  assert.ok(document.querySelector('#research')!.compareDocumentPosition(document.querySelector('#membership')!)&4)
  assert.ok(document.querySelector('img[src*="1630559.png"]'),'Preserve the existing basketball portrait')
  assert.ok(document.querySelector('img[src*="yanr6h9aplae3jyzimf7"]'),'Preserve the existing football portrait')
  assert.ok(!document.body.textContent?.includes('implied probability'))
  assert.match(document.body.textContent!,/\$19\.99/)
})

test('a failing analytics provider cannot interrupt a normal browse link',async()=>{
  globals.visitorAnalyticsFails=true
  const ui=await mount(h(components.DiscoveryLink,{href:'/groups',destination:'communities',children:'Browse communities'}))
  try{
    await act(async()=>ui.host.querySelector('a')!.click())
    assert.equal(ui.host.querySelector('a')!.getAttribute('href'),'/groups')
  }finally{globals.visitorAnalyticsFails=false;await ui.close()}
})

const directory=await compile('export {PublicCommunities} from "./src/components/marketing/PublicCommunities"',{
  ...sharedStubs,
  '@/lib/supabase/server':`export async function createClient(){const state=globalThis.visitorData;const query={select(value){state.selected=value;return query},eq(key,value){state.filters??=[];state.filters.push([key,value]);return query},or(value){state.filters??=[];state.filters.push(['or',value]);return query},order(){return query},limit(value){state.limit=value;return query},abortSignal(signal){state.signal=signal;return state.reject?Promise.reject(Error('unavailable')):Promise.resolve({data:state.rows,error:state.error})}};return {from(name){if(name!=='groups')throw Error('Unexpected private table');return query}}}`,
  '@/components/groups/CommunityDirectory':`import React from 'react';export function CommunityDirectory({groups}){return <div>{groups.map(group=><a key={group.id} href={'/groups/'+group.slug}>{group.name}</a>)}</div>}`,
}) as {PublicCommunities:typeof import('../src/components/marketing/PublicCommunities').PublicCommunities}

test('homepage community proof uses bounded public/free metadata and excludes private, paid and off-season entries',async()=>{
  globals.visitorData={rows:[{id:'a',slug:'open',name:'Public NBA',is_public:true,access_type:'free',sport:'NBA'},{id:'b',slug:'private',name:'Private leak',is_public:false,access_type:'free',sport:'NFL'},{id:'c',slug:'paid',name:'Paid member content',is_public:true,access_type:'paid',sport:'NFL'},{id:'d',slug:'mlb',name:'Hidden baseball',is_public:true,access_type:'free',sport:'MLB'}]}
  const html=renderToStaticMarkup(await directory.PublicCommunities())
  assert.match(html,/Public NBA/)
  assert.doesNotMatch(html,/Private leak|Paid member content|Hidden baseball/)
  assert.equal(globals.visitorData.limit,3)
  assert.ok(globals.visitorData.signal instanceof AbortSignal)
  assert.ok(globals.visitorData.filters?.some(([key,value])=>key==='is_public'&&value===true))
  assert.ok(globals.visitorData.filters?.some(([key,value])=>key==='access_type'&&value==='free'))
  assert.ok(!globals.visitorData.selected?.includes('*'))
  assert.doesNotMatch(globals.visitorData.selected!,/posts|members\(|rules|email|permissions/)
})

test('empty and failed community reads keep useful public navigation without fabricated people',async()=>{
  for(const state of [{rows:[]},{rows:[],error:{message:'read unavailable'}},{rows:[],reject:true}]){
    globals.visitorData=state
    const html=renderToStaticMarkup(await directory.PublicCommunities())
    assert.match(html,/href="\/groups"/)
    if('error'in state||'reject'in state)assert.match(html,/unavailable right now/)
    else assert.match(html,/Find a community for your sport/)
  }
})
