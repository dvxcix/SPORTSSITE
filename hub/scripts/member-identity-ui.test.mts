import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h } from 'react'
import { memberTone } from '../src/lib/memberIdentity.ts'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const win = new JSDOM('<!doctype html><html data-theme="light"><body></body></html>', { url:'https://slipsurge.invalid', pretendToBeVisual:true }).window
Object.assign(globalThis, { window:win, document:win.document, HTMLElement:win.HTMLElement, Event:win.Event, IS_REACT_ACT_ENVIRONMENT:true })
const { createRoot } = await import('react-dom/client')
const bundle = await build({
  stdin:{contents:'export { MemberAvatar } from "./src/components/social/MemberAvatar"',resolveDir:resolve('.'),loader:'tsx'},
  bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',
})
const bundled = {exports:{} as {MemberAvatar:React.ComponentType<{src?:string;name:string;size?:number;ringStyle?:'none'|'orbit';ringColor?:string;tone?:'ultimate'}>}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,bundled,bundled.exports)
const { MemberAvatar } = bundled.exports

test('theme changes retain the loaded photo, ring settings and stable dimensions', async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const props={name:'Test Member',src:'/member.png',size:44,ringStyle:'orbit' as const,ringColor:'#be65e9',tone:'ultimate' as const}
  try {
    await act(async()=>root.render(h(MemberAvatar,props)))
    const img=host.querySelector('img'),avatar=host.querySelector<HTMLElement>('[role=img]')!
    assert.ok(img);assert.equal(host.querySelector('.ss-member-avatar-initials')?.textContent,'TM')
    assert.equal(avatar.style.width,'44px');assert.equal(avatar.style.flexShrink,'0')
    for(const theme of ['dark','light','dark']) {
      document.documentElement.dataset.theme=theme
      await act(async()=>root.render(h(MemberAvatar,props)))
      assert.equal(host.querySelector('img'),img,'a theme swap must not recreate or reload the image')
      assert.ok(avatar.classList.contains('ring-orbit'));assert.ok(avatar.classList.contains('is-ultimate'))
      assert.equal(avatar.style.getPropertyValue('--member-custom-ring'),'#be65e9')
    }
  } finally {await act(async()=>root.unmount());host.remove()}
})

test('failed and changed image URLs keep the current member’s initials and recover',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  try {
    await act(async()=>root.render(h(MemberAvatar,{name:'First Person',src:'/expired.png'})))
    await act(async()=>host.querySelector('img')!.dispatchEvent(new win.Event('error')))
    assert.equal(host.querySelector('img'),null)
    assert.equal(host.querySelector('.ss-member-avatar-initials')?.textContent,'FP')
    await act(async()=>root.render(h(MemberAvatar,{name:'New Member',src:'/replacement.png',ringStyle:'none'})))
    assert.equal(host.querySelector('img')?.getAttribute('src'),'/replacement.png')
    assert.equal(host.querySelector('.ss-member-avatar-initials')?.textContent,'NM')
    assert.equal(host.querySelector('[role=img]')?.getAttribute('aria-label'),'New Member avatar')
    await act(async()=>root.render(h(MemberAvatar,{name:'New Member',src:'javascript:invalid'})))
    assert.equal(host.querySelector('img'),null)
    assert.equal(host.querySelector('.ss-member-avatar-initials')?.textContent,'NM')
  } finally {await act(async()=>root.unmount());host.remove()}
})

test('membership identity stays consistent without replacing a paid tier with creator styling',()=>{
  assert.equal(memberTone({tier:'ultimate',account_type:'creator'}),'ultimate')
  assert.equal(memberTone({tier:'advanced'}),'advanced')
  assert.equal(memberTone({tier:'basic',account_type:'creator'}),'creator')
  assert.equal(memberTone({tier:'free',account_type:'user'}),'default')
  assert.equal(memberTone(null),'default')
})
