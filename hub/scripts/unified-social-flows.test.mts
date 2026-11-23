import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { act, createElement as h, type ReactNode } from 'react'
import { build } from 'esbuild'

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/feed',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,requestAnimationFrame:win.requestAnimationFrame.bind(win),IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
type RequestReply={error:null|{message:string}}
const pending:Array<{resolve:(reply:RequestReply)=>void;reject:(reason:Error)=>void}>=[]
const state={path:'/messages',signedIn:true,profile:{id:'viewer',username:'viewer',display_name:'Viewer',account_type:'user',tier:'free'},client:{from:()=>({upsert:()=>new Promise<RequestReply>((resolve,reject)=>pending.push({resolve,reject}))})}}
Object.assign(globalThis,{unifiedSocialFixture:state})
const stubs:Record<string,string>={
  'next/link':`import{createElement as h}from'react';export default({children,...props})=>h('a',props,children)`,
  'next/navigation':`export const usePathname=()=>globalThis.unifiedSocialFixture.path;export const useRouter=()=>({push(){},refresh(){}})`,
  '@/lib/supabase/client':`export const createClient=()=>globalThis.unifiedSocialFixture.client`,
  '@/context/AuthContext':`export const useAuth=()=>({loading:false,authUnavailable:false,user:globalThis.unifiedSocialFixture.signedIn?{id:'viewer'}:null,profile:globalThis.unifiedSocialFixture.signedIn?globalThis.unifiedSocialFixture.profile:null})`,
  '@/lib/featureFlags':`export const FEATURE_FLAGS={blog:'feature_blog',forum:'feature_forum',pages:'feature_pages',events:'feature_events'};export const fetchFeatureFlagsClient=async()=>({feature_blog:true,feature_forum:true,feature_pages:true,feature_events:true})`,
  '@/lib/memberIdentity':`export const memberTone=()=> 'user'`,
  '@/lib/uploadMedia':`export const uploadMedia=async()=>({error:'Unavailable in test'})`,
  '@/lib/mentions':`export const notifyMentions=async()=>{}`,
  '@/lib/mlbOffseason':`export const MLB_HIBERNATING=true`,
  '@/lib/sportLogos':`export const sportLogoUrl=()=>null`,
  '@/components/layout/PageState':`import{createElement as h}from'react';export const PageState=({title,message,actionHref,actionLabel,onAction})=>h('section',{},h('h2',{},title),h('p',{},message),actionLabel?h(actionHref?'a':'button',actionHref?{href:actionHref}:{onClick:onAction},actionLabel):null)`,
  '@/components/social/MemberAvatar':`import{createElement as h}from'react';export const MemberAvatar=({name})=>h('span',{role:'img','aria-label':name+' avatar'})`,
  './MemberAvatar':`import{createElement as h}from'react';export const MemberAvatar=({name})=>h('span',{role:'img','aria-label':name+' avatar'})`,
  '@/components/social/EmojiText':`import{createElement as h}from'react';export const EmojiText=({text})=>h('span',{},text)`,
  '@/components/ui/tooltip-card':`export const Tooltip=({children})=>children`,
  '@/components/ui/SafeImage':`import{createElement as h}from'react';export const SafeImage=({alt,fallback})=>h('span',{'aria-label':alt},fallback)`,
  '@/components/ui/FloatingSurface':`import{createElement as h}from'react';export const FloatingSurface=({open,children,ariaLabel})=>open?h('div',{role:'dialog','aria-label':ariaLabel},children):null`,
  './MentionInput':`import{createElement as h,forwardRef}from'react';export const MentionInput=forwardRef(({onValueChange,currentUserId,...props},ref)=>h('textarea',{...props,ref,onChange:event=>onValueChange(event.target.value)}))`,
  './EmojiPicker':`export const EmojiPicker=()=>null`,
  './GifPicker':`export const GifPicker=()=>null`,
  './PickComposer':`import{createElement as h}from'react';const leg={sport:'NBA',player_id:'1',player_name:'Test player',team:'ATL',odds:100,book:'fanduel',prop_key:'points',line:'20+',market_side:'milestone'};export const PickComposer=({legs,onAddLeg,onClose})=>h('div',{},h('output',{'data-draft-legs':true},String(legs.length)),h('button',{type:'button',onClick:()=>onAddLeg(leg)},'Stage pick'),h('button',{type:'button',onClick:onClose},'Close pick builder'))`,
}
const bundle=await build({stdin:{contents:'export{MessageInbox}from"./src/components/social/MessageInbox";export{FeedComposer}from"./src/components/social/FeedComposer";export{CommunityNav,CommunityMore}from"./src/components/community/CommunityNav";export{CommunityDirectory}from"./src/components/groups/CommunityDirectory"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'unified-social.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'},tsconfig:'tsconfig.json',plugins:[{name:'isolated-social-fixtures',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:resolve('.')}))}}]})
const compiled={exports:{} as {
  MessageInbox:typeof import('../src/components/social/MessageInbox').MessageInbox
  FeedComposer:typeof import('../src/components/social/FeedComposer').FeedComposer
  CommunityNav:typeof import('../src/components/community/CommunityNav').CommunityNav
  CommunityMore:typeof import('../src/components/community/CommunityNav').CommunityMore
  CommunityDirectory:typeof import('../src/components/groups/CommunityDirectory').CommunityDirectory
}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)
async function mount(element:ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(element));return {host,async click(label:string){const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(item=>(item.getAttribute('aria-label')||item.textContent||'').trim().startsWith(label));assert.ok(button,label);await act(async()=>button.click())},async close(){await act(async()=>root.unmount());host.remove()}}}
async function enter(field:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new win.Event('input',{bubbles:true}))})}
const conversation={id:'requester',content:'Can I ask about your research?',createdAt:'2026-11-23T12:00:00Z',unreadCount:1,lastIsMine:false,isRequest:true,partner:{id:'requester',username:'requester',displayName:'Requesting member',avatarUrl:null,avatarRingStyle:null,avatarRingColor:null}}

test('inbox keyboard tabs have one tab stop and a correctly named panel',async()=>{
  const ui=await mount(h(compiled.exports.MessageInbox,{conversations:[conversation],currentUserId:'viewer'}))
  try{
    const tabs=ui.host.querySelectorAll<HTMLButtonElement>('[role=tab]')
    tabs[0].focus();await act(async()=>tabs[0].dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})))
    assert.equal(tabs[1].getAttribute('aria-selected'),'true')
    assert.equal(tabs[0].tabIndex,-1);assert.equal(tabs[1].tabIndex,0)
    assert.equal(ui.host.querySelector('[role=tabpanel]')!.getAttribute('aria-labelledby'),tabs[1].id)
    assert.equal(tabs[1].getAttribute('aria-controls'),ui.host.querySelector('[role=tabpanel]')!.id)
  }finally{await ui.close()}
})

test('message requests stay visible while saving and failures leave a retryable request',async()=>{
  pending.length=0
  const ui=await mount(h(compiled.exports.MessageInbox,{conversations:[conversation],currentUserId:'viewer'}))
  try{
    await ui.click('Requests');await ui.click('Accept')
    assert.equal(pending.length,1);assert.ok(ui.host.textContent!.includes('Requesting member'))
    assert.ok([...ui.host.querySelectorAll<HTMLButtonElement>('.ss-message-request-actions button')].every(button=>button.disabled))
    await act(async()=>pending[0].resolve({error:{message:'Offline'}}))
    assert.match(ui.host.querySelector('[role=alert]')!.textContent!,/Could not update/)
    await ui.click('Accept');assert.equal(pending.length,2)
    await act(async()=>pending[1].resolve({error:null}))
    assert.match(ui.host.textContent!,/No message requests/)
    await ui.click('Inbox');assert.match(ui.host.textContent!,/Requesting member/)
  }finally{await ui.close()}
})

test('a thrown request failure is contained and does not silently remove a conversation',async()=>{
  pending.length=0
  const ui=await mount(h(compiled.exports.MessageInbox,{conversations:[conversation],currentUserId:'viewer'}))
  try{await ui.click('Requests');await ui.click('Decline');await act(async()=>pending[0].reject(new Error('Connection lost')));assert.match(ui.host.textContent!,/Requesting member/);assert.ok(ui.host.querySelector('[role=alert]'));assert.ok([...ui.host.querySelectorAll<HTMLButtonElement>('.ss-message-request-actions button')].every(button=>!button.disabled))}finally{await ui.close()}
})

test('switching post type or closing its builder preserves the staged pick and optional wager',async()=>{
  state.signedIn=true
  const ui=await mount(h(compiled.exports.FeedComposer,{}))
  try{
    await ui.click('Pick');await ui.click('Stage pick');await enter(ui.host.querySelector<HTMLInputElement>('input[type=number]')!,'25')
    await ui.click('Research');assert.equal(ui.host.querySelector('[data-draft-legs]'),null)
    await ui.click('Pick');assert.equal(ui.host.querySelector('[data-draft-legs]')!.textContent,'1');assert.equal(ui.host.querySelector<HTMLInputElement>('input[type=number]')!.value,'25')
    await ui.click('Close pick builder');assert.equal(ui.host.querySelector('[role=tab][aria-selected=true]')!.textContent,'Take')
    await ui.click('Pick');assert.equal(ui.host.querySelector('[data-draft-legs]')!.textContent,'1')
    const wager=ui.host.querySelector<HTMLInputElement>('input[type=number]')!;assert.equal(wager.labels?.length,1)
  }finally{await ui.close()}
})

test('closing a poll returns to Take while its options remain available on reopening',async()=>{
  const ui=await mount(h(compiled.exports.FeedComposer,{}))
  try{await ui.click('Poll');await enter(ui.host.querySelector<HTMLInputElement>('input[aria-label="Poll option 1"]')!,'Home team');await ui.click('Close poll');assert.equal(ui.host.querySelector('[role=tab][aria-selected=true]')!.textContent,'Take');await ui.click('Poll');assert.equal(ui.host.querySelector<HTMLInputElement>('input[aria-label="Poll option 1"]')!.value,'Home team')}finally{await ui.close()}
})

test('community roots do not repeat primary navigation and nested pages return to the right area',async()=>{
  for(const [path,href] of [['/groups',null],['/messages/member','/messages'],['/channels/game-chat','/channels'],['/groups/research-room/settings','/groups/research-room']]){
    state.path=path!
    const ui=await mount(h(compiled.exports.CommunityNav,{}))
    try{assert.equal(ui.host.querySelector('a')?.getAttribute('href')??null,href)}finally{await ui.close()}
  }
  state.path='/groups';const ui=await mount(h(compiled.exports.CommunityMore,{}))
  try{await ui.click('More community options');const links=[...ui.host.querySelectorAll('a')].map(link=>link.getAttribute('href'));for(const href of ['/messages','/channels','/bookmarks','/notifications','/forum','/pages','/events','/blog'])assert.ok(links.includes(href),href)}finally{await ui.close()}
})

test('anonymous feed, profile and group previews never advertise protected pagination',async()=>{
  for(const [path,expression] of [['src/app/feed/page.tsx','initialHasMore={Boolean(user) && hasMore}'],['src/app/profile/[username]/page.tsx','initialHasMore={Boolean(authUser) && hasMore}'],['src/app/groups/[slug]/page.tsx','initialHasMore={Boolean(user) && postPage.hasMore}']]){
    assert.ok((await readFile(path!,'utf8')).includes(expression!),path!)
  }
  const group=await readFile('src/app/groups/[slug]/page.tsx','utf8')
  assert.ok(group.includes("Boolean(user) && (isMember || (group.is_public && group.access_type !== 'paid'))"))
  assert.ok(group.includes('Join the conversation'))
})

test('community discovery reports filtered results, clears them and keeps the guest opt-in specific',async()=>{
  const groups:Parameters<typeof compiled.exports.CommunityDirectory>[0]['groups']=[
    {id:'nba-room',slug:'nba-room',name:'Basketball room',description:'Basketball conversation',sport:'NBA',avatar_url:null,emoji:null,member_count:12,owner_id:'nba-owner',creator_product_id:null,access_type:'free',is_public:true},
    {id:'nfl-room',slug:'nfl-room',name:'Football room',description:'Football conversation',sport:'NFL',avatar_url:null,emoji:null,member_count:8,owner_id:'nfl-owner',creator_product_id:null,access_type:'free',is_public:true},
  ]
  const ui=await mount(h(compiled.exports.CommunityDirectory,{groups,joinedIds:[],invitations:[],userId:null}))
  try{
    assert.equal(ui.host.querySelector('[role=status]')!.textContent,'2 communities')
    await enter(ui.host.querySelector<HTMLInputElement>('input[type=search]')!,'Basketball')
    assert.equal(ui.host.querySelector('[role=status]')!.textContent,'1 community matches your filters')
    assert.equal(ui.host.querySelectorAll('article').length,1)
    await ui.click('Clear filters');assert.equal(ui.host.querySelectorAll('article').length,2)
    await ui.click('Your communities');assert.match(ui.host.textContent!,/Create a free account to keep the communities you join/)
    assert.ok(ui.host.querySelector('a[href="/auth/register?next=%2Fgroups"]'))
    await ui.click('Discover communities');assert.equal(ui.host.querySelectorAll('article').length,2)
  }finally{await ui.close()}
  const storefront=await mount(h(compiled.exports.CommunityDirectory,{groups,joinedIds:[],invitations:[],userId:null,variant:'storefront',headingLevel:3}))
  try{assert.equal(storefront.host.querySelectorAll('article h3').length,2);assert.equal(storefront.host.querySelectorAll('h2').length,0)}finally{await storefront.close()}
})
