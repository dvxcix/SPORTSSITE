import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, useState } from 'react'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.slipsurge.com',pretendToBeVisual:true}),win=dom.window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,NodeFilter:win.NodeFilter,Event:win.Event,MutationObserver:win.MutationObserver,getComputedStyle:win.getComputedStyle,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const bundle=await build({stdin:{contents:`export{Tooltip,NativeTooltipProvider,TooltipVisual}from'./src/components/ui/tooltip-card';export{ModalSurface}from'./src/components/ui/ModalSurface'`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'tooltip.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'tooltip-fixture',setup(b){b.onResolve({filter:/^next\/image$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import{createElement}from'react';export default({unoptimized,fill,priority,...props})=>createElement('img',props)`,loader:'tsx'}))}}]})
const target={exports:{} as any};new Function('require','module','exports',bundle.outputFiles.find(f=>f.path.endsWith('.cjs'))!.text)(require,target,target.exports)
const ui=target.exports
const pause=async(ms:number)=>act(async()=>{await new Promise(r=>setTimeout(r,ms))})
async function mount(node:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(node));return{host,close:async()=>{await act(async()=>root.unmount());host.remove()}}}
const event=async(node:Element,type:string,relatedTarget:Element|null=null)=>act(async()=>node.dispatchEvent(new win.MouseEvent(type,{bubbles:true,relatedTarget})))
const escape=async(node:Element)=>act(async()=>node.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})))

test('short labels remain plain while explicitly authored book, player and metric context is retained',async()=>{
  const m=await mount(h('div',{},h(ui.TooltipVisual,{content:'Compare books'}),h(ui.TooltipVisual,{content:{title:'Market context',book:'fanduel',image:{src:'/headshot.png',alt:'Fixture player'},metrics:[{label:'Open',value:'+120'},{label:'Current',value:'+110'}]}})))
  try{assert.equal(m.host.querySelector('.ss-tooltip-plain')?.textContent,'Compare books');assert.equal(m.host.querySelector('.ss-tooltip-plain .ss-tooltip-art'),null);assert.equal(m.host.querySelectorAll('.ss-tooltip-metrics>span').length,2);assert.ok(m.host.querySelector('img[alt="Fixture player"]'));assert.match(m.host.textContent!,/FanDuel/);assert.doesNotMatch(m.host.textContent!,/Guide|SlipSurge guide/)}finally{await m.close()}
})

test('native hints are hoverable across the gap and restore their title and existing accessible description',async()=>{
  const m=await mount(h('div',{},h(ui.NativeTooltipProvider),h('button',{title:'Observed market change','aria-describedby':'existing'},'Change')))
  try{const button=m.host.querySelector('button')!;await event(button,'mouseover');const hint=document.querySelector('[role="tooltip"]')!;assert.ok(hint);
    assert.ok(button.getAttribute('aria-describedby')!.startsWith('existing '));await event(button,'mouseout',document.body);await event(hint,'mouseover',button);await pause(160);assert.ok(document.querySelector('[role="tooltip"]'));await event(hint,'mouseout',document.body);await pause(150);assert.equal(document.querySelector('[role="tooltip"]'),null);assert.equal(button.getAttribute('title'),'Observed market change');assert.equal(button.getAttribute('aria-describedby'),'existing')
  }finally{await m.close()}
})

test('Escape dismisses a hint inside a real player-style dialog before dismissing the dialog; icon-only names survive',async()=>{
  function Fixture(){const[open,setOpen]=useState(true);return h('div',{},h(ui.NativeTooltipProvider),h(ui.ModalSurface,{open,onClose:()=>setOpen(false),label:'Player research'},h('button',{title:'Compare books','data-modal-autofocus':true},h('svg',{'aria-hidden':true}))))}
  const m=await mount(h(Fixture));try{const button=document.querySelector<HTMLButtonElement>('[role="dialog"] button')!;await act(async()=>button.focus());assert.equal(button.getAttribute('aria-label'),'Compare books');assert.ok(document.querySelector('[role="tooltip"]'));await escape(button);assert.equal(document.querySelector('[role="tooltip"]'),null);assert.ok(document.querySelector('[role="dialog"]'));assert.equal(button.getAttribute('title'),'Compare books');assert.equal(button.getAttribute('aria-label'),null);await escape(button);assert.equal(document.querySelector('[role="dialog"]'),null)}finally{await m.close()}
})

test('touch activates the original button once without a hint overlay; keyboard hints remain available',async()=>{
  let taps=0;const m=await mount(h('div',{},h(ui.NativeTooltipProvider),h('button',{title:'Open player',onClick:()=>taps++},'Player')))
  try{const button=m.host.querySelector('button')!;const down=new win.Event('pointerdown',{bubbles:true,cancelable:true});Object.defineProperty(down,'pointerType',{value:'touch'});await act(async()=>{button.dispatchEvent(down);button.focus();button.click()});assert.equal(down.defaultPrevented,false);assert.equal(taps,1);assert.equal(document.querySelector('[role="tooltip"]'),null);await act(async()=>{button.blur();button.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));button.focus()});assert.ok(document.querySelector('[role="tooltip"]'))}finally{await m.close()}
})

test('authored rich hints also dismiss before their parent dialog and retain every metric',async()=>{
  function Fixture(){const[open,setOpen]=useState(true);return h(ui.ModalSurface,{open,onClose:()=>setOpen(false),label:'Player research'},h(ui.Tooltip,{content:{title:'Role changes',description:'Recorded workload evidence',metrics:[{label:'Minutes',value:34}]}},h('button',{},'Workload')))}
  const m=await mount(h(Fixture));try{await pause(25);const button=document.querySelector<HTMLButtonElement>('[role="dialog"] button')!;await act(async()=>button.focus());await pause(15);assert.match(document.querySelector('[role="tooltip"]')?.textContent??'',/Minutes34/);await escape(button);await pause(5);assert.equal(document.querySelector('[role="tooltip"]'),null);assert.ok(document.querySelector('[role="dialog"]'));await escape(button);assert.equal(document.querySelector('[role="dialog"]'),null)}finally{await m.close()}
})
