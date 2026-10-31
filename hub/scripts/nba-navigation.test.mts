import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const state = { role: 'user', tier: 'free', granted: null as string | null, beta: false, path: '/the-paint', nfl: true, view: 'public', mode: '', collapsed: false }
;(globalThis as typeof globalThis & { nbaNavFixture: typeof state }).nbaNavFixture = state
const stubs: Record<string,string> = {
  'next/navigation': `export const usePathname=()=>globalThis.nbaNavFixture.path;export const useSearchParams=()=>new URLSearchParams('view='+globalThis.nbaNavFixture.view+'&game=123&mode='+globalThis.nbaNavFixture.mode);export const useRouter=()=>({push(){},back(){}});`,
  'next/link': `import React from 'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}`,
  'next/image': `import React from 'react';export default function Image({priority,...props}){return <img {...props}/>}`,
  '@/components/ui/SafeImage': `import React from 'react';export function SafeImage({fallback,...props}){return <img {...props}/>}`,
  '@/components/social/MemberAvatar': `import React from 'react';export const MemberAvatar=()=> <span>Avatar</span>`,
  '@/context/AuthContext': `export const useAuth=()=>({profile:{account_type:globalThis.nbaNavFixture.role,tier:globalThis.nbaNavFixture.tier,admin_granted_tier:globalThis.nbaNavFixture.granted,beta_access_active:globalThis.nbaNavFixture.beta,username:'tester'},loading:false})`,
  '@/lib/useNflAccess': `export const useNflAccess=()=>({allowed:globalThis.nbaNavFixture.nfl})`,
  '@/lib/useSidebarCollapsed': `export const useSidebarCollapsed=()=>({collapsed:globalThis.nbaNavFixture.collapsed,toggle(){}})`,
  '@/lib/featureFlags': `export const fetchFeatureFlagsClient=async()=>({})`,
}
const bundled = await build({ stdin: { contents: `export {Sidebar} from './src/components/layout/Sidebar';export {DesktopNavigation} from './src/components/desktop/DesktopNavigation';export {DesktopCommandBar} from './src/components/layout/DesktopCommandBar';export {MobileDock} from './src/components/layout/MobileDock';export {MobileResearchPicker} from './src/components/layout/MobileResearchPicker';export {ResearchSportSwitcher} from './src/components/layout/ResearchSportSwitcher';`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'navigation.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react','react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'auth-fixture', setup(builder) { builder.onResolve({filter: /^(next\/|@\/)/}, args => args.path in stubs ? {path:args.path,namespace:'stub'} : undefined);builder.onLoad({filter:/.*/,namespace:'stub'}, args=>({contents:stubs[args.path],loader:'tsx',resolveDir:resolve('.')})) } }] })
const compiled = {exports: {} as Record<string, React.ComponentType<Record<string, unknown>>>}
new Function('require','module','exports',bundled.outputFiles.find(file=>file.path.endsWith('.cjs'))!.text)(require,compiled,compiled.exports)
const noop = () => {}
const render = (name: string, props: Record<string,unknown> = {}) => renderToStaticMarkup(createElement(compiled.exports[name],props))

test('all navigation shells expose NBA while lower-tier tools link to Ultimate upgrade', () => {
  for (const tier of ['free','basic','advanced']) {
    state.role = 'user'; state.tier = tier; state.granted = null; state.beta = false
    for (const name of ['Sidebar','DesktopNavigation','DesktopCommandBar']) {
      const html=render(name,{open:true,onClose:noop,onMenuClick:noop})
      assert.doesNotMatch(html,/href="\/the-paint/,name+' '+tier)
      assert.match(html,/href="\/pricing#plan-ultimate"/,name+' '+tier)
      assert.match(html,/Ultimate required/,name+' '+tier)
      assert.equal((html.match(/aria-current="page"/g)??[]).length,0,name)
    }
    assert.match(render('MobileDock',{onMenuClick:noop}),/leagues\/500\/nba\.png/)
  }
})

test('Ultimate, granted Ultimate and admin shells expose each NBA tool once and mark the exact current tool', () => {
  for (const access of [{role:'admin',tier:'free',granted:null},{role:'user',tier:'ultimate',granted:null},{role:'user',tier:'free',granted:'ultimate'}]) {
    Object.assign(state,access,{beta:false})
    for (const name of ['Sidebar','DesktopNavigation']) {
      const html=render(name,{open:true,onClose:noop})
      assert.match(html,/href="\/the-paint/,name)
      assert.match(html,/leagues\/500\/nba\.png/,name)
      assert.equal((html.match(/aria-current="page"/g)??[]).length,1,name)
      assert.match(html,/view=public[^\"]*"[^>]*aria-current="page"/,name)
      for (const view of ['odds','ladders','movement','first-basket','cheatsheets','score','slate','public','divergence','dvp','usage','tracking','matchup','availability','game-markets']) assert.equal((html.match(new RegExp(`href="/the-paint\\?view=${view}&`,'g'))??[]).length,1,name+' '+view)
      assert.doesNotMatch(html,/>NBA (Odds|Ladders|SlipSurge Score)</)
      assert.doesNotMatch(html,/Ultimate required/)
      assert.doesNotMatch(html,/>ULTIMATE</)
    }
  }
})

test('mobile sport picker and switcher show every NBA tool with explicit Ultimate lock state', () => {
  for (const allowed of [false,true]) {
    const html=render('MobileResearchPicker',{path:'/the-paint',sport:'nba',nflAccess:true,nbaAccess:allowed,hasUltimate:true,onSport:noop,onClose:noop})
    const switcher=render('ResearchSportSwitcher',{sport:'nba',nflAccess:true,nbaAccess:allowed,onChange:noop})
    assert.match(html,/NBA tools/);assert.match(switcher,/>NBA<\/span>/)
    if (allowed) { assert.match(html,/href="\/the-paint\?view=ladders/);assert.doesNotMatch(html,/Ultimate required/) }
    else { assert.doesNotMatch(html,/href="\/the-paint/);assert.equal((html.match(/href="\/pricing#plan-ultimate"/g)??[]).length,16);assert.match(switcher,/aria-label="NBA research · Ultimate required"/) }
    assert.match(html,/NFL tools/)
    assert.doesNotMatch(html,/MLB tools/)
  }
})

test('unrelated beta override cannot unlock NBA navigation',()=>{
  Object.assign(state,{role:'user',tier:'free',granted:null,beta:true})
  for(const name of ['Sidebar','DesktopNavigation','DesktopCommandBar']) {
    const html=render(name,{open:true,onClose:noop})
    assert.doesNotMatch(html,/href="\/the-paint/)
    assert.match(html,/Ultimate required/)
  }
})

test('NBA navigation keeps accessible labels without native or branded guide tooltip triggers',()=>{
  const {JSDOM}=require('jsdom')
  try{
    for(const tier of ['free','ultimate'])for(const collapsed of [false,true]){
      Object.assign(state,{role:'user',tier,granted:null,beta:false,path:'/the-paint',collapsed})
      for(const name of ['Sidebar','DesktopNavigation','DesktopCommandBar']){
        const dom=new JSDOM(render(name,{open:true,onClose:noop,onMenuClick:noop}))
        try{
          const links=[...dom.window.document.querySelectorAll('a[href^="/the-paint"],a[aria-label$="· Ultimate required"]')] as Element[]
          assert.ok(links.length>0,name+' '+tier)
          for(const link of links){
            assert.equal(link.hasAttribute('title'),false,name+' '+link.textContent)
            assert.equal(link.hasAttribute('data-ss-native-tooltip'),false)
            assert.ok(link.getAttribute('aria-label')||link.textContent?.trim(),'link retains its accessible name')
          }
          const sport=dom.window.document.querySelector('button[aria-label^="NBA research"]')
          if(sport)assert.equal(sport.hasAttribute('title'),false)
        }finally{dom.window.close()}
      }
    }
  }finally{state.collapsed=false}
})

test('mobile NBA tab changes the actual tool menu and dismissing restores focus and page scroll',async()=>{
  const {JSDOM}=require('jsdom')
  const dom=new JSDOM('<!doctype html><html><body><button id="opener">Research</button></body></html>',{url:'https://www.slipsurge.com'})
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
  dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  const {createRoot}=await import('react-dom/client')
  const opener=document.getElementById('opener')!;opener.focus()
  const host=document.createElement('div');document.body.append(host)
  const root=createRoot(host)
  function Fixture(){
    const [sport,setSport]=useState('nfl'),[open,setOpen]=useState(true)
    return open?createElement(compiled.exports.MobileResearchPicker,{path:'/feed',sport,nflAccess:true,nbaAccess:false,hasUltimate:false,onSport:setSport,onClose:()=>setOpen(false)}):null
  }
  try{
    await act(async()=>root.render(createElement(Fixture)))
    assert.equal(document.body.style.overflow,'hidden')
    assert.ok(host.querySelector('nav[aria-label="NFL quick tools"]'))
    const tab=host.querySelector('button[aria-label="NBA tools · Ultimate required"]')!
    await act(async()=>tab.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
    assert.equal(tab.getAttribute('aria-pressed'),'true')
    const links=[...host.querySelectorAll('nav[aria-label="NBA quick tools"] a')]
    assert.equal(links.length,15)
    assert.ok(links.every(link=>link.getAttribute('href')==='/pricing#plan-ultimate'))
    await act(async()=>host.querySelector('dialog')!.dispatchEvent(new dom.window.Event('cancel',{bubbles:false,cancelable:true})))
    assert.equal(host.querySelector('dialog'),null)
    assert.equal(document.body.style.overflow,'')
    assert.equal(document.activeElement,opener)
  }finally{await act(async()=>root.unmount());host.remove();dom.window.close()}
})

 test('first-basket navigation marks its own destination active',()=>{
  state.view='first-basket';state.tier='ultimate';state.role='user';state.granted=null
  try {assert.match(render('Sidebar'),/href="\/the-paint\?view=first-basket[^"]*"[^>]*aria-current="page"/)}finally{state.view='public'}
 })


test('desktop, sidebar and mobile NBA tool links preserve Live across Court and entity pages', () => {
  Object.assign(state,{role:'user',tier:'ultimate',granted:null,beta:false,mode:'live'})
  try {
    for (const path of ['/the-paint','/nba/players/434']) {
      state.path=path
      for(const name of ['Sidebar','DesktopNavigation','DesktopCommandBar','MobileResearchPicker']) {
        const html=render(name,{path,sport:'nba',nflAccess:true,nbaAccess:true,hasUltimate:true,onSport:noop,onClose:noop})
        const links=[...html.matchAll(/href="(\/the-paint[^"]*)"/g)].map(match=>match[1].replaceAll('&amp;','&'))
        assert.ok(links.length>0,name+' '+path)
        assert.ok(links.every(href=>new URL(href,'https://www.slipsurge.com').searchParams.get('mode')==='live'),name+' '+JSON.stringify(links))
      }
    }
  } finally { state.path='/the-paint';state.mode='' }
})
