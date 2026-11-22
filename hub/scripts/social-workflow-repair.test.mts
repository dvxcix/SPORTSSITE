import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h } from 'react'
import { loadChannelHistory } from '../src/lib/channelHistory.ts'
import { searchMessageRecipients } from '../src/lib/messageRecipients.ts'

const require = createRequire(import.meta.url), { JSDOM } = require('jsdom')
const win = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://slipsurge.invalid/messages/new', pretendToBeVisual:true }).window
Object.assign(globalThis, {window:win,document:win.document,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,Event:win.Event,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot} = await import('react-dom/client')
const calls:any[] = [], pending:Array<{resolve:(result:any)=>void;payload:any}> = [], pushes:string[] = []
const member = {id:'00000000-0000-4000-8000-000000000002',username:'beyond-the-first-50',display_name:'Directory member'}
let history:any[] = [], readError:any = null, rpcError:any = null, subscribe:((status:string)=>void)|undefined
class Query {
  op='read'; payload:any
  constructor(readonly table:string){}
  select(value?:string){calls.push(['select',this.table,value]);return this}eq(...args:any[]){calls.push(['eq',...args]);return this}neq(...args:any[]){calls.push(['neq',...args]);return this}or(...args:any[]){calls.push(['or',...args]);return this}not(...args:any[]){calls.push(['not',...args]);return this}order(...args:any[]){calls.push(['order',...args]);return this}limit(...args:any[]){calls.push(['limit',...args]);return this}range(){return this}single(){return this}
  insert(payload:any){this.op='insert';this.payload=payload;return this}update(payload:any){this.op='update';this.payload=payload;return this}upsert(payload:any){this.op='upsert';this.payload=payload;return this}
  then(done:any,fail:any){calls.push(['execute',this.table,this.op,this.payload]);return (this.op==='insert'?new Promise(resolve=>pending.push({resolve,payload:this.payload})):Promise.resolve({data:this.table==='blocks'?[]:history,error:readError})).then(done,fail)}
}
const client:any = {from:(table:string)=>new Query(table),rpc:async(name:string,args:any)=>{calls.push(['rpc',name,args]);return{data:'new-group-id',error:rpcError}},channel:()=>{const c:any={on:()=>c,subscribe:(callback:any)=>{subscribe=callback;return c}};return c},removeChannel(){}}
Object.assign(globalThis,{socialQA:{client,pushes}})
const stubs:Record<string,string> = {
 'next/navigation':`export const useRouter=()=>({push:url=>globalThis.socialQA.pushes.push(url),refresh(){}})`,
 'next/link':`import{createElement as h}from'react';export default({children,...props})=>h('a',props,children)`,
 '@/lib/supabase/client':`export const createClient=()=>globalThis.socialQA.client`,
 '@/components/chat/useMessageInteractionState':`export const useMessageInteractionState=()=>({reactions:{},typingUsers:[],notifyTyping(){},toggleReaction(){},markRead:async()=>{}})`,
 '@/components/social/MentionInput':`import{createElement as h,forwardRef}from'react';export const MentionInput=forwardRef(({onValueChange,currentUserId,...props},ref)=>h('textarea',{...props,ref,onInput:e=>onValueChange(e.target.value)}))`,
 '@/components/social/MemberAvatar':`export const MemberAvatar=()=>null`,
 '@/components/social/EmojiPicker':`export const EmojiPicker=()=>null`,
 '@/components/social/GifPicker':`export const GifPicker=()=>null`,
 '@/components/chat/MessageReactionBar':`export const MessageReactionBar=()=>null`,
 '@/components/social/LinkifiedText':`export const LinkifiedText=({text})=>text`,
 '@/components/social/EmojiText':`export const EmojiText=({text})=>text`,
 '@/lib/mentions':`export const notifyMentions=async()=>{throw new Error('Notification service offline')}`,
 '@/lib/messageScroll':`export const scrollMessagePane=()=>{}`,
 '@/lib/desktopNotifications':`export const sendDesktopNotification=async()=>{}`,
 '@/lib/uploadMedia':`export const uploadMedia=async()=>({error:'disabled'})`,
 '@/lib/notify':`export const notify=async()=>{}`,
 '@/components/social/BlockUserButton':`export const BlockUserButton=()=>null`,
 '@/components/chat/DMConversationTools':`export const DMConversationTools=()=>null`,
}
const compiled=await build({stdin:{contents:'export {ChatRoom} from "./src/components/chat/ChatRoom"; export {NewDMForm} from "./src/components/chat/NewDMForm"; export {DMRoom} from "./src/components/chat/DMRoom"; export {GroupDMRoom} from "./src/components/chat/GroupDMRoom"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'private-services',setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:'qa'}:undefined);b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const mod={exports:{} as any};new Function('require','module','exports',compiled.outputFiles[0].text)(require,mod,mod.exports)
async function mount(element:any){pending.length=0;calls.length=0;history=[];readError=null;rpcError=null;pushes.length=0;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(element));return{host,close:async()=>{await act(async()=>root.unmount());host.remove()}}}
async function enter(field:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{const proto=field.tagName==='INPUT'?win.HTMLInputElement.prototype:win.HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(field,value);field.dispatchEvent(new win.Event('input',{bubbles:true}))})}
async function submit(host:HTMLElement){await act(async()=>host.querySelector('form')!.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true})))}
const room=()=>h(mod.exports.ChatRoom,{channelId:'channel',channelName:'Room',channelSlug:'room',currentUserId:'me',initialMessages:[]})

test('history selects the latest bounded page and disambiguates both sender relationships',async()=>{
 calls.length=0;history=[{id:'new',created_at:'2026-11-22'},{id:'old',created_at:'2026-11-21'}]
 const rows=await loadChannelHistory(client,'channel',80)
 assert.deepEqual(rows.map(r=>r.id),['old','new'])
 assert.match(calls.find(c=>c[0]==='select')[2],/sender:users!messages_sender_id_fkey/)
 assert.deepEqual(calls.find(c=>c[0]==='order'),['order','created_at',{ascending:false}])
 assert.deepEqual(calls.find(c=>c[0]==='limit'),['limit',80])
 readError={message:'database unavailable'};await assert.rejects(()=>loadChannelHistory(client,'channel'));readError=null
})
test('full directory search remains scoped to willing recipients and fails closed on block lookup failure',async()=>{
 calls.length=0;history=[member];const rows=await searchMessageRecipients(client,'00000000-0000-4000-8000-000000000001','member,or(%)')
 assert.equal(rows.length,1);assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='allow_dms'&&c[2]===true));assert.match(calls.find(c=>c[0]==='or'&&String(c[1]).startsWith('username'))[1],/ilike\."/)
 readError={message:'denied'};await assert.rejects(()=>searchMessageRecipients(client,'00000000-0000-4000-8000-000000000001','member'));readError=null
})
test('successful channel send appears immediately without a realtime echo',async()=>{
 const ui=await mount(room());try{const field=ui.host.querySelector('textarea')!;await enter(field,'Fresh message');await submit(ui.host);assert.equal(pending.length,1);await act(async()=>pending[0].resolve({data:{id:'sent',content:'Fresh message',created_at:new Date().toISOString(),sender_id:'me'},error:null}));assert.equal(field.value,'');assert.match(ui.host.querySelector('.ss-chat-messages')!.textContent!,/Fresh message/)}finally{await ui.close()}
})
test('channel failure retains the draft and unlocks retry',async()=>{
 const ui=await mount(room());try{const field=ui.host.querySelector('textarea')!;await enter(field,'Retry me');await submit(ui.host);await act(async()=>pending[0].resolve({data:null,error:{code:'42501'}}));assert.equal(field.value,'Retry me');assert.equal(ui.host.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.disabled,false);await submit(ui.host);assert.equal(pending.length,2);await act(async()=>pending[1].resolve({data:{id:'retry',content:'Retry me',created_at:new Date().toISOString(),sender_id:'me'},error:null}));assert.equal(field.value,'')}finally{await ui.close()}
})
test('reconnect recovers missed channel messages and exposes failed recovery',async()=>{
 const ui=await mount(room());try{history=[{id:'missed',content:'Arrived offline',created_at:'2026-11-22T00:00:00Z',sender_id:'other'}];await act(async()=>subscribe?.('SUBSCRIBED'));assert.match(ui.host.textContent!,/Arrived offline/);readError={message:'offline'};await act(async()=>window.dispatchEvent(new win.Event('online')));assert.match(ui.host.textContent!,/Connection interrupted/)}finally{readError=null;await ui.close()}
})
test('recipient search reaches beyond suggestions and opens the selected conversation',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({users:[member]})}) as any
 const ui=await mount(h(mod.exports.NewDMForm,{users:[]}));try{await enter(ui.host.querySelector('input')!,'Directory');await act(async()=>new Promise(r=>setTimeout(r,260)));const person=ui.host.querySelector<HTMLButtonElement>('.ss-new-dm-person')!;assert.ok(person);await act(async()=>person.click());assert.equal(pushes[0],'/messages/beyond-the-first-50')}finally{await ui.close();globalThis.fetch=originalFetch}
})
test('group selections survive searches and create the selected member conversation',async()=>{
 const other={...member,id:'other',username:'second',display_name:'Second member'}
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({users:[other]})}) as any
 const ui=await mount(h(mod.exports.NewDMForm,{users:[member]}));try{await act(async()=>ui.host.querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click());await enter(ui.host.querySelector('[aria-label="Group conversation name"]')!,'Our room');await act(async()=>ui.host.querySelector<HTMLButtonElement>('.ss-new-dm-person')!.click());await enter(ui.host.querySelector('[aria-label="Search members"]')!,'Second');await act(async()=>new Promise(r=>setTimeout(r,260)));await act(async()=>ui.host.querySelector<HTMLButtonElement>('.ss-new-dm-person')!.click());assert.equal(ui.host.querySelectorAll('.ss-new-dm-selected button').length,2);await act(async()=>ui.host.querySelector<HTMLButtonElement>('.ss-new-dm-group-action button')!.click());assert.deepEqual(calls.find(c=>c[0]==='rpc')[2].invited_user_ids,[member.id,other.id]);assert.equal(pushes[0],'/messages/group/new-group-id')}finally{await ui.close();globalThis.fetch=originalFetch}
})

test('opening a DM executes the notification read update; send executes its accepted-conversation update',async()=>{
 const ui=await mount(h(mod.exports.DMRoom,{partner:member,currentUserId:'me',initialMessages:[]}));try{
 assert.ok(calls.some(c=>c[0]==='execute'&&c[1]==='notifications'&&c[2]==='update'&&c[3].read===true))
 await enter(ui.host.querySelector('textarea')!,'Direct draft');await act(async()=>ui.host.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());assert.equal(pending.length,1)
 await act(async()=>pending[0].resolve({data:{id:'direct',content:'Direct draft',sender_id:'me',created_at:new Date().toISOString()},error:null}))
 assert.ok(calls.some(c=>c[0]==='execute'&&c[1]==='dm_conversation_preferences'&&c[2]==='upsert'&&c[3].status==='accepted'))
 }finally{await ui.close()}
})

test('group chat preserves a failed draft, retries and renders the server-confirmed message',async()=>{
 const ui=await mount(h(mod.exports.GroupDMRoom,{conversation:{id:'group',name:'Our room',owner_id:'me'},currentUserId:'me',members:[{user_id:'me',role:'owner',muted:false,user:{id:'me',username:'owner'}}],initialMessages:[],initialReactions:[]}));try{
 const field=ui.host.querySelector('textarea')!;await enter(field,'Group draft');await act(async()=>ui.host.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());assert.equal(pending.length,1);await act(async()=>pending[0].resolve({data:null,error:{message:'offline'}}));assert.equal(field.value,'Group draft')
 await act(async()=>ui.host.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());await act(async()=>pending[1].resolve({data:{id:'group-sent',conversation_id:'group',content:'Group draft',sender_id:'me',created_at:new Date().toISOString()},error:null}));assert.equal(field.value,'');assert.match(ui.host.textContent!,/Group draft/)
 }finally{await ui.close()}
})
