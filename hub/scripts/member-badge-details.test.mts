import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h } from 'react'

const require=createRequire(import.meta.url)
const {JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const bundle=await build({stdin:{contents:'export {UserBadges} from "./src/components/social/UserBadges";export {ModalSurface} from "./src/components/ui/ModalSurface"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',plugins:[{name:'read-only-badges',setup(builder){builder.onResolve({filter:/^@\/lib\/badges$/},()=>({path:'badges',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useUserBadges=()=>[]',loader:'ts'}))}}]})
const module={exports:{} as {UserBadges:React.ComponentType<any>;ModalSurface:React.ComponentType<any>}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
const {UserBadges}=module.exports
const badges=[{id:'fdcf34d2-d7ea-469d-b697-06f2750c3c53',name:'Ultimate',description:'Ultimate membership',icon_url:'/ultimate.png'},{id:'beta',name:'Beta Tester',description:'First 200 members',icon_url:'/beta.png'},{id:'custom',name:'Founding member',description:'An earned custom achievement',icon_url:'/custom.png'}]

async function withHost(run:(host:HTMLElement,root:ReturnType<typeof createRoot>)=>Promise<void>){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);try{await run(host,root)}finally{await act(async()=>root.unmount());host.remove()}}

test('membership labels remain readable while all original art and overflow details stay accessible',()=>withHost(async(host,root)=>{
 await act(async()=>root.render(h(UserBadges,{userId:'member',badges,maxVisible:2,interactive:true})))
 const trigger=host.querySelector('button')!
 assert.match(trigger.textContent!,/UltimateBeta\+1/)
 assert.match(trigger.getAttribute('aria-label')!,/Founding member/)
 await act(async()=>trigger.click())
 const dialog=document.querySelector('[role="dialog"][aria-label="Member badges"]')!
 assert.equal(dialog.querySelectorAll('.ss-badge-tooltip').length,3)
 assert.deepEqual([...dialog.querySelectorAll('img')].map(i=>i.getAttribute('src')),badges.map(b=>b.icon_url))
 assert.match(dialog.textContent!,/First 200 members/)
 assert.equal(document.activeElement?.getAttribute('aria-label'),'Close member badges')
 await act(async()=>document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
 assert.equal(document.querySelector('[role="dialog"]'),null)
 assert.equal(document.activeElement,trigger)
}))

test('badge details close through the visible close control and outside pointer',()=>withHost(async(host,root)=>{
 await act(async()=>root.render(h(UserBadges,{userId:'member',badges,interactive:true})))
 const trigger=host.querySelector('button')!
 await act(async()=>trigger.click())
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Close member badges"]')!.click())
 assert.equal(trigger.getAttribute('aria-expanded'),'false')
 await act(async()=>trigger.click())
 await act(async()=>document.body.dispatchEvent(new win.Event('pointerdown',{bubbles:true})))
 assert.equal(document.querySelector('[role="dialog"]'),null)
 assert.equal(document.activeElement,trigger)
}))

test('badges inside mention buttons and profile links remain static without nested controls',()=>withHost(async(host,root)=>{
 await act(async()=>root.render(h('button',null,h(UserBadges,{userId:'member',badges}))))
 assert.equal(host.querySelectorAll('button').length,1)
 assert.equal(host.querySelectorAll('[tabindex]').length,0)
 assert.match(host.querySelector('[role="img"]')!.getAttribute('aria-label')!,/Ultimate, Beta Tester, Founding member/)
}))

test('renaming a membership preserves its stable presentation and custom failed artwork has a labelled fallback',()=>withHost(async(host,root)=>{
 await act(async()=>root.render(h(UserBadges,{userId:'member',badges:[{...badges[0],name:'Owner renamed membership'},badges[2]]})))
 assert.match(host.textContent!,/Ultimate/)
 assert.match(host.querySelector('[role="img"]')!.getAttribute('aria-label')!,/Owner renamed membership/)
 await act(async()=>host.querySelector('img')!.dispatchEvent(new win.Event('error')))
 assert.ok(host.querySelector('.ss-user-badge-fallback'))
 assert.match(host.querySelector('[role="img"]')!.getAttribute('aria-label')!,/Founding member/)
}))

test('theme changes retain badge artwork and an absent member exposes no stale badges',()=>withHost(async(host,root)=>{
 await act(async()=>root.render(h(UserBadges,{userId:'member',badges})))
 const img=host.querySelector('img')
 for(const theme of ['light','dark','light']){document.documentElement.dataset.theme=theme;await act(async()=>root.render(h(UserBadges,{userId:'member',badges})));assert.equal(host.querySelector('img'),img)}
 await act(async()=>root.render(h(UserBadges,{userId:null,badges})))
 assert.equal(host.childElementCount,0)
}))


test('Escape closes badge details without closing its parent saved-picks drawer',()=>withHost(async(host,root)=>{
 let parentCloses=0
 await act(async()=>root.render(h(module.exports.ModalSurface,{open:true,onClose:()=>parentCloses++,label:'My Picks'},h(UserBadges,{userId:'member',badges,interactive:true}))))
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25))})
 const trigger=document.querySelector<HTMLButtonElement>('.ss-user-badge-trigger')!
 await act(async()=>trigger.click())
 await act(async()=>document.activeElement!.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
 assert.equal(document.querySelector('[aria-label="Member badges"][role="dialog"]'),null)
 assert.ok(document.querySelector('[aria-label="My Picks"][role="dialog"]'))
 assert.equal(parentCloses,0)
 assert.equal(document.activeElement,trigger)
}))


test('membership and beta badges keep the same order without changing supplied assignments',()=>withHost(async(host,root)=>{
 const assignments=[badges[2],badges[1],badges[0]]
 await act(async()=>root.render(h(UserBadges,{userId:'member',badges:assignments})))
 assert.equal(host.querySelector('[role="img"]')!.getAttribute('aria-label'),'Member badges: Ultimate, Beta Tester, Founding member')
 assert.deepEqual(assignments.map(b=>b.id),['custom','beta','fdcf34d2-d7ea-469d-b697-06f2750c3c53'])
}))
