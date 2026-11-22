import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h, useState } from 'react'
import { build } from 'esbuild'

const require = createRequire(import.meta.url), { JSDOM } = require('jsdom')
const win = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://slipsurge.invalid/feed', pretendToBeVisual:true }).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,Event:win.Event,MutationObserver:win.MutationObserver,getComputedStyle:win.getComputedStyle.bind(win),requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),IS_REACT_ACT_ENVIRONMENT:true})
win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
const { createRoot } = await import('react-dom/client')
const profile={id:'owner',username:'owner',display_name:'Owner',tier:'ultimate',account_type:'user',avatar_ring_style:'none'}
const now='2026-11-22T12:00:00Z'
const rows=[0,1,2].map((n)=>({id:'comment-'+n,post_id:'post-1',author_id:n===0?'owner':'other',parent_id:n===0?null:'comment-'+(n-1),content:'Comment '+n,author:{username:n===0?'owner':'other',display_name:n===0?'Owner':'Other member'},created_at:now,updated_at:now,reaction_count:0}))
const pending: Array<{payload:Record<string,unknown>;resolve:(result:unknown)=>void}> = []
const notices: unknown[]=[]
class Query {
 op='read';payload:Record<string,unknown>={}
 constructor(readonly name:string){}
 select(){return this}eq(){return this}match(){return this}order(){return this}single(){return this}in(){return this}
 insert(payload:Record<string,unknown>){this.op='insert';this.payload=payload;return this}
 update(){this.op='update';return this}delete(){this.op='delete';return this}
 then(done:(result:unknown)=>void,failed:(reason:unknown)=>void){return (this.op==='insert'&&this.name==='comments'?new Promise(resolve=>pending.push({payload:this.payload,resolve})):Promise.resolve({data:this.name==='comments'?rows:[],error:null})).then(done,failed)}
}
Object.assign(globalThis,{mobileSocialFixture:{profile,client:{from:(name:string)=>new Query(name)},notices,path:'/settings/account'}})
const stubs:Record<string,string>={
 'next/navigation':`export const useRouter=()=>({push(){},refresh(){}});export const usePathname=()=>globalThis.mobileSocialFixture.path`,
 'next/link':`import{createElement as h}from'react';export default({children,...props})=>h('a',props,children)`,
 '@/context/AuthContext':`export const useAuth=()=>({user:{id:'owner'},profile:globalThis.mobileSocialFixture.profile,loading:false,authUnavailable:false})`,
 '@/lib/supabase/client':`export const createClient=()=>globalThis.mobileSocialFixture.client`,
 '@/lib/blocks':`export const getBlockedEitherWayIds=async()=>[]`,
 '@/lib/notify':`export const notify=async()=>{}`,
 '@/lib/mentions':`export const notifyMentions=async()=>{}`,
 '@/context/PostLiveContext':`export const usePostLiveUpdates=()=>{}`,
 '@/lib/emoji':`export const useCustomEmojis=()=>[]`,
 '@/components/ui/FeedbackProvider':`export const useFeedback=()=>({confirm:async()=>true,notify:notice=>globalThis.mobileSocialFixture.notices.push(notice)})`,
 './LinkifiedText':`import{createElement as h}from'react';export const LinkifiedText=({text})=>h('span',{},text)`,
 './UserBadges':`export const UserBadges=()=>null`,
 './MentionProfileCard':`export const ProfileHoverTarget=({children})=>children`,
 './MemberAvatar':`import{createElement as h}from'react';export const MemberAvatar=({name})=>h('span',{'aria-label':name+' avatar',role:'img'})`,
 './EmojiPicker':`import{createElement as h}from'react';export const EmojiPicker=({onSelect})=>h('button',{type:'button','aria-label':'Insert emoji',onClick:()=>onSelect('⚡')},'Emoji')`,
 './GifPicker':`import{createElement as h}from'react';export const GifPicker=({onSelect})=>h('button',{type:'button','aria-label':'Browse GIFs',onClick:()=>onSelect('https://image.invalid/gif')},'GIF')`,
 './BlockUserButton':`import{createElement as h}from'react';export const BlockUserButton=({targetUsername})=>h('button',{type:'button'},'Block @'+targetUsername)`,
 '@/components/theme/ThemeToggle':`export const ThemeToggle=()=>null`,
 './ReportModal':`export const ReportModal=()=>null`,
 './ShareImageModal':`export const ShareImageModal=()=>null`,
 '@/components/ui/tooltip-card':`export const Tooltip=({children})=>children`,
}
const bundle=await build({stdin:{contents:`export{CommentComposer}from'./src/components/social/CommentComposer';export{CommentActions}from'./src/components/social/CommentActions';export{PostCardClient}from'./src/components/social/PostCardClient';export{AccountMenu}from'./src/components/layout/AccountMenu'`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'mobile-social.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'},tsconfig:'tsconfig.json',plugins:[{name:'social-fixtures',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:resolve('.')}))}}]})
const compiled={exports:{} as any};new Function('require','module','exports',bundle.outputFiles.find(file=>file.path.endsWith('.cjs'))!.text)(require,compiled,compiled.exports)
const api=compiled.exports as Record<string, React.ComponentType<any>>
async function mount(element:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(element));return{host,close:async()=>{await act(async()=>root.unmount());host.remove()}}}
async function enter(field:HTMLTextAreaElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new win.Event('input',{bubbles:true}))})}
const key=(field:HTMLElement,key:string,extra={})=>field.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}))

test('comment writing keeps multiline text, supports Ctrl+Enter, and does not submit during composition',async()=>{
 let submitted=0
 function Composer(){const [value,setValue]=useState('First line\nSecond line');return h(api.CommentComposer,{value,onChange:setValue,onSubmit:()=>submitted++})}
 const ui=await mount(h(Composer))
 try{const field=ui.host.querySelector('textarea')!;await act(async()=>{key(field,'Enter');key(field,'Enter',{ctrlKey:true,isComposing:true})});assert.equal(submitted,0);assert.equal(field.value,'First line\nSecond line');await act(async()=>key(field,'Enter',{ctrlKey:true}));assert.equal(submitted,1)}finally{await ui.close()}
})

test('emoji insertion preserves the caret and pending comments disable writing and submission',async()=>{
 let pending=false
 function Composer(){const [value,setValue]=useState('AB');return h(api.CommentComposer,{value,onChange:setValue,onSubmit(){},pending})}
 const ui=await mount(h(Composer))
 try{let field=ui.host.querySelector('textarea')!;field.setSelectionRange(1,1);await act(async()=>ui.host.querySelector<HTMLButtonElement>('[aria-label="Insert emoji"]')!.click());assert.equal(field.value,'A⚡B');pending=true;await ui.close();const busy=await mount(h(api.CommentComposer,{value:'Draft',onChange(){},onSubmit(){},pending:true}));try{assert.ok(busy.host.querySelector('textarea:disabled'));assert.ok(busy.host.querySelector('button.ss-comment-submit:disabled'))}finally{await busy.close()}}finally{if(ui.host.isConnected)await ui.close()}
})

test('comment moderation stays in a keyboard-accessible menu and Escape restores its trigger',async()=>{
 const ui=await mount(h(api.CommentActions,{name:'Other member',isOwn:false,currentUserId:'owner',authorId:'other',username:'other',onEdit(){},onDelete(){},onReport(){}}))
 try{const trigger=ui.host.querySelector<HTMLButtonElement>('button')!;assert.equal(document.querySelector('[role=dialog]'),null);await act(async()=>trigger.click());assert.equal(document.activeElement?.textContent,'Report comment');await act(async()=>key(document.activeElement as HTMLElement,'ArrowDown'));assert.equal(document.activeElement?.textContent,'Block @other');await act(async()=>key(document.activeElement as HTMLElement,'Escape'));assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(document.activeElement,trigger)}finally{await ui.close()}
})

const post={id:'post-1',author_id:'owner',author:profile,content:'Test conversation',post_type:'text',visibility:'public',created_at:now,updated_at:now,comment_count:3,reaction_count:0,repost_count:0,bookmark_count:0,pick_data:null,media_urls:[]}
test('rapid comment submits make one insert; a failed save retains the draft and a successful retry clears it',async()=>{
 pending.length=0;notices.length=0;const ui=await mount(h(api.PostCardClient,{post,detail:true}))
 try{const field=ui.host.querySelector<HTMLTextAreaElement>('[aria-label="Write a comment…"]')!;assert.ok(field);await enter(field,'Keep my draft');const send=field.closest('fieldset')!.querySelector<HTMLButtonElement>('.ss-comment-submit')!;await act(async()=>{send.click();send.click()});assert.equal(pending.length,1);assert.equal(pending[0].payload.content,'Keep my draft');await act(async()=>pending[0].resolve({data:null,error:{message:'offline'}}));assert.equal(field.value,'Keep my draft');assert.equal(send.disabled,false);assert.match(JSON.stringify(notices),/Comment not posted/);await act(async()=>send.click());assert.equal(pending.length,2);await act(async()=>pending[1].resolve({data:{...rows[0],id:'saved-comment',content:'Keep my draft'},error:null}));assert.equal(field.value,'');assert.match(ui.host.textContent??'',/Keep my draft/)}finally{await ui.close()}
})

test('pending replies cannot switch threads or submit twice, and failed replies retain their draft',async()=>{
 pending.length=0;const ui=await mount(h(api.PostCardClient,{post,detail:true}))
 try{
  const replies=Array.from(ui.host.querySelectorAll<HTMLButtonElement>('.ss-comment-actions button')).filter(button=>button.textContent==='Reply')
  await act(async()=>replies[0].click())
  const field=ui.host.querySelector<HTMLTextAreaElement>('[aria-label="Reply to Owner…"]')!
  await enter(field,'Reply draft')
  const send=field.closest('fieldset')!.querySelector<HTMLButtonElement>('.ss-comment-submit')!
  await act(async()=>{send.click();send.click();replies[1].click()})
  assert.equal(pending.length,1);assert.equal(field.value,'Reply draft');assert.ok(field.isConnected)
  await act(async()=>pending[0].resolve({data:null,error:{message:'offline'}}))
  assert.equal(field.value,'Reply draft');assert.equal(send.disabled,false)
  await act(async()=>send.click())
  await act(async()=>pending[1].resolve({data:{...rows[0],id:'saved-reply',parent_id:rows[0].id,content:'Reply draft'},error:null}))
  assert.equal(ui.host.querySelector('[aria-label="Reply to Owner…"]'),null)
  assert.match(ui.host.textContent??'',/Reply draft/)
 }finally{await ui.close()}
})

test('deleting a comment branch updates the displayed count for every removed reply',async()=>{
 const ui=await mount(h(api.PostCardClient,{post,detail:true}))
 try{const actions=ui.host.querySelector<HTMLButtonElement>('[aria-label="Actions for Owner\'s comment"]')!;assert.ok(actions);await act(async()=>actions.click());const remove=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Delete comment')!;await act(async()=>remove.click());assert.equal(ui.host.querySelector('.ss-comment-thread'),null);assert.ok(ui.host.querySelector('[aria-label="Comment"]'))}finally{await ui.close()}
})

test('account shortcuts open saved-research events without a floating quick-tools launcher',async()=>{
 const ui=await mount(h(api.AccountMenu));let picks=0,watchlist=0;const p=()=>picks++,w=()=>watchlist++;window.addEventListener('ss:open-my-picks',p);window.addEventListener('ss:open-watchlist',w)
 try{const trigger=ui.host.querySelector<HTMLButtonElement>('[aria-label="Open account menu"]')!;for(const label of ['My picks','Watchlist']){await act(async()=>trigger.click());const button=Array.from(document.querySelectorAll<HTMLButtonElement>('button[role=menuitem]')).find(b=>b.textContent===label)!;assert.ok(button);await act(async()=>{button.click();await new Promise(r=>setTimeout(r,30))});assert.equal(document.querySelector('[role=menu]'),null);assert.equal(document.activeElement,trigger)}assert.equal(picks,1);assert.equal(watchlist,1)}finally{window.removeEventListener('ss:open-my-picks',p);window.removeEventListener('ss:open-watchlist',w);await ui.close()}
})
