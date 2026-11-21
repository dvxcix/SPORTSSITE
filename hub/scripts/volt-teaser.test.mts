import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement } from 'react'
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com',pretendToBeVisual:true})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const stubs:Record<string,string>={
  'next/navigation':`let path='/the-paint';export const usePathname=()=>path;export const setPath=value=>{path=value}`,
  '@/context/WatchlistContext':`let signedIn=true;export const useWatchlist=()=>({signedIn});export const setSignedIn=value=>{signedIn=value}`,
}
const bundle=await build({stdin:{contents:`export {UtilityDock} from './src/components/layout/UtilityDock';export {VoltCharacter} from './src/components/volt/VoltCharacter';export {setPath} from 'next/navigation';export {setSignedIn} from '@/context/WatchlistContext'`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'volt.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'volt-fixture',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const target={exports:{} as any};new Function('require','module','exports',bundle.outputFiles.find(file=>file.path.endsWith('.cjs'))!.text)(require,target,target.exports)
const api=target.exports
async function fixture(signedIn=true){
  api.setSignedIn(signedIn);api.setPath('/the-paint');document.body.className=''
  const original=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('A coming-soon mascot must not call a backend')}
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const render=async(teaserOnly=false)=>act(async()=>root.render(createElement(api.UtilityDock,{teaserOnly},createElement('button',{},'Saved research'))))
  await render()
  const pointer=async(type:string,node:Element,relatedTarget:Element|null=null)=>act(async()=>{const event=new dom.window.MouseEvent(type,{bubbles:true,relatedTarget});Object.defineProperty(event,'pointerType',{value:'mouse'});node.dispatchEvent(event)})
  const close=async()=>{await act(async()=>root.unmount());host.remove();globalThis.fetch=original}
  return{host,get trigger(){return host.querySelector('button[aria-label="VOLT — Sparks coming soon"]') as HTMLButtonElement},render,pointer,close,network:()=>network}
}

test('VOLT is available to visitors while quick tools remain signed-in controls',async()=>{
  for(const signedIn of [false,true]){
    const h=await fixture(signedIn)
    try{assert.ok(h.trigger);assert.equal(h.host.querySelector('[aria-label="Open quick tools"]')!==null,signedIn)
      if(signedIn){await act(async()=>h.host.querySelector<HTMLButtonElement>('[aria-label="Open quick tools"]')!.click());assert.equal(h.host.querySelector('.ss-utility-dock-items')?.getAttribute('aria-hidden'),'false')}
      await h.render(true);assert.equal(h.host.querySelector('[aria-label="Open quick tools"]'),null);assert.equal(h.network(),0)
    }finally{await h.close()}
  }
})

test('hover is silent, hoverable and dismisses after leaving the character and tooltip',async()=>{
  const h=await fixture()
  try{
    await h.pointer('pointerover',h.trigger);assert.match(document.querySelector('[role="tooltip"]')?.textContent??'',/COMING SOON/)
    const tooltip=document.querySelector('[role="tooltip"]')!
    await h.pointer('pointerout',h.trigger,tooltip);await h.pointer('pointerover',tooltip,h.trigger)
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,180))});assert.ok(document.querySelector('[role="tooltip"]'))
    await h.pointer('pointerout',tooltip,document.body);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,180))})
    assert.equal(document.querySelector('[role="tooltip"]'),null);assert.equal(h.network(),0)
  }finally{await h.close()}
})

test('focus, Escape, tap toggle and outside dismissal work without enabling a chat or backend',async()=>{
  const h=await fixture()
  try{
    await act(async()=>h.trigger.focus());assert.equal(h.trigger.getAttribute('aria-expanded'),'true')
    await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(h.trigger.getAttribute('aria-expanded'),'false')
    await act(async()=>h.trigger.click());assert.equal(h.trigger.getAttribute('aria-expanded'),'true')
    await act(async()=>h.trigger.click());assert.equal(h.trigger.getAttribute('aria-expanded'),'false')
    await act(async()=>h.trigger.click());await act(async()=>document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true})))
    assert.equal(h.trigger.getAttribute('aria-expanded'),'false');assert.equal(h.network(),0)
  }finally{await h.close()}
})

test('route changes and full-screen dialogs dismiss the teaser; the supplied jersey rig keeps unique clip IDs',async()=>{
  const h=await fixture()
  const secondHost=document.createElement('div');document.body.append(secondHost);const secondRoot=createRoot(secondHost)
  try{
    assert.equal(h.host.querySelector('svg[data-jersey]')?.getAttribute('data-jersey'),'nba')
    await act(async()=>h.trigger.click());api.setPath('/the-sideline');await h.render()
    assert.equal(h.trigger.getAttribute('aria-expanded'),'false');assert.equal(h.host.querySelector('svg[data-jersey]')?.getAttribute('data-jersey'),'nfl')
    await act(async()=>h.trigger.click());await act(async()=>{document.body.classList.add('ss-modal-open');await Promise.resolve()})
    assert.equal(document.querySelector('[role="tooltip"]'),null);assert.equal(h.network(),0)
    await act(async()=>secondRoot.render(createElement(api.VoltCharacter,{jersey:'nba'})))
    const clips=[...document.querySelectorAll('clipPath[id]')].map(node=>node.id)
    assert.equal(clips.length,2);assert.equal(new Set(clips).size,2)
  }finally{await act(async()=>secondRoot.unmount());secondHost.remove();await h.close()}
})
