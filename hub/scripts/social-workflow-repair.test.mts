import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h } from 'react'
import { loadChannelHistory } from '../src/lib/channelHistory.ts'
import { searchMessageRecipients } from '../src/lib/messageRecipients.ts'
import { attachMessageReplies } from '../src/lib/messageReplies.ts'
import { loadDmHistory, loadGroupHistory, reconcileMessageHistory } from '../src/lib/conversationHistory.ts'

const require = createRequire(import.meta.url), { JSDOM } = require('jsdom')
const win = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://slipsurge.invalid/messages/new', pretendToBeVisual:true }).window
Object.assign(globalThis, {window:win,document:win.document,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,Event:win.Event,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot} = await import('react-dom/client')
const channels:any[] = [], reads:Array<{resolve:(r:any)=>void}>=[]
let holdRead=false, holdUpdate=false
const calls:any[] = [], pending:Array<{resolve:(result:any)=>void;payload:any}> = [], pushes:string[] = []
const member = {id:'00000000-0000-4000-8000-000000000002',username:'beyond-the-first-50',display_name:'Directory member'}
let history:any[] = [], readError:any = null, rpcError:any = null, subscribe:((status:string)=>void)|undefined
class Query {
  op='read'; payload:any
  constructor(readonly table:string){}
  select(value?:string){calls.push(['select',this.table,value]);return this}eq(...args:any[]){calls.push(['eq',...args]);return this}neq(...args:any[]){calls.push(['neq',...args]);return this}or(...args:any[]){calls.push(['or',...args]);return this}not(...args:any[]){calls.push(['not',...args]);return this}order(...args:any[]){calls.push(['order',...args]);return this}limit(...args:any[]){calls.push(['limit',...args]);return this}range(){return this}single(){return this}
  abortSignal(){return this}maybeSingle(){return this}
  in(...args:any[]){calls.push(['in',...args]);return this}
  insert(payload:any){this.op='insert';this.payload=payload;return this}update(payload:any){this.op='update';this.payload=payload;return this}upsert(payload:any){this.op='upsert';this.payload=payload;return this}
  then(done:any,fail:any){calls.push(['execute',this.table,this.op,this.payload]);return (this.op==='read'&&holdRead&&['messages','group_messages'].includes(this.table)?new Promise(resolve=>reads.push({resolve})):this.op==='insert'||holdUpdate&&this.op==='update'&&['messages','group_messages'].includes(this.table)?new Promise(resolve=>pending.push({resolve,payload:this.payload})):Promise.resolve({data:this.table==='blocks'?[]:history,error:readError})).then(done,fail)}
}
const client:any = {from:(table:string)=>new Query(table),rpc:async(name:string,args:any)=>{calls.push(['rpc',name,args]);return{data:'new-group-id',error:rpcError}},channel:(name:string)=>{const handlers:any[]=[];const c:any={name,handlers,on:(_kind:any,filter:any,callback:any)=>{handlers.push({filter,callback});return c},subscribe:(callback:any)=>{if(callback)subscribe=callback;c.status=callback;return c}};channels.push(c);return c},removeChannel(){}}
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
async function mount(element:any){pending.length=0;calls.length=0;history=[...(element.props.initialMessages??[])].reverse();channels.length=0;reads.length=0;holdRead=false;holdUpdate=false;readError=null;rpcError=null;pushes.length=0;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(element));return{host,close:async()=>{await act(async()=>root.unmount());host.remove()}}}
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
for (const [name,scope,column] of [['channel',{channelId:'channel'},'channel_id'],['group',{conversationId:'group'},'conversation_id'],['direct',{userId:'me',partnerId:'partner'},null]] as const) test(`${name} replies use a separate scoped RLS query and preserve missing reply privacy`,async()=>{
 calls.length=0;history=[{id:'reply',content:'Scoped context',sender_id:'other'}]
 const rows=await attachMessageReplies(client,[{reply_to_id:'reply'},{reply_to_id:'not-visible'}],scope)
 assert.equal((rows[0] as any).reply_to.content,'Scoped context');assert.equal((rows[1] as any).reply_to,null)
 const selection=calls.find(c=>c[0]==='select')[2];assert.doesNotMatch(selection,/reply_to:messages|reply_to:group_messages/)
 if(column)assert.ok(calls.some(c=>c[0]==='eq'&&c[1]===column));else assert.match(calls.find(c=>c[0]==='or')[1],/sender_id.eq.me,dm_recipient_id.eq.partner/)
 readError={code:'42501'};await assert.rejects(()=>attachMessageReplies(client,[{reply_to_id:'reply'}],scope));readError=null
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

const variants=[
 {name:'channel',make:(rows:any[]=[])=>h(mod.exports.ChatRoom,{channelId:'channel',channelName:'Room',channelSlug:'room',currentUserId:'me',initialMessages:rows}),channel:'chat:channel'},
 {name:'direct',make:(rows:any[]=[])=>h(mod.exports.DMRoom,{partner:member,currentUserId:'me',initialMessages:rows}),channel:'dm-'+['me',member.id].sort().join('-')},
 {name:'group',make:(rows:any[]=[])=>h(mod.exports.GroupDMRoom,{conversation:{id:'group',name:'Our room',owner_id:'me'},currentUserId:'me',members:[{user_id:'me',role:'owner',muted:false,user:{id:'me',username:'owner'}}],initialMessages:rows,initialReactions:[]}),channel:'group-dm:group'},
]
const sendClick=async(host:HTMLElement)=>act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click())
const status=async(name:string,value:string)=>act(async()=>channels.find(c=>c.name===name)?.status?.(value))
const emit=async(name:string,event:string,row:any)=>act(async()=>{const c=channels.find(c=>c.name===name);for(const h of c.handlers)if(h.filter.event===event)await h.callback({new:row,old:row})})
for(const v of variants){
 test(v.name+': delayed success preserves the newer composer draft and prevents duplicate sends',async()=>{
  const ui=await mount(v.make());try{const field=ui.host.querySelector('textarea')!;await enter(field,'First draft');await sendClick(ui.host);await sendClick(ui.host);assert.equal(pending.length,1);assert.equal(ui.host.querySelector<HTMLButtonElement>('[aria-label="Attach image"]')!.disabled,true);await enter(field,'Next draft');await act(async()=>pending[0].resolve({data:{id:'sent',sender_id:'me',content:'First draft',created_at:'2026-11-22T12:00:00Z'},error:null}));assert.equal(field.value,'Next draft');assert.match(ui.host.textContent!,/First draft/)}finally{await ui.close()}
 })
 test(v.name+': a failed earlier draft can be recovered without losing newer text',async()=>{
  const ui=await mount(v.make());try{const field=ui.host.querySelector('textarea')!;await enter(field,'Failed draft');await sendClick(ui.host);await enter(field,'Keep this too');await act(async()=>pending[0].resolve({data:null,error:{code:'offline'}}));assert.equal(field.value,'Keep this too');assert.match(ui.host.querySelector('.ss-unsent-drafts')!.textContent!,/Failed draft/);await act(async()=>ui.host.querySelector<HTMLButtonElement>('.ss-unsent-drafts button')!.click());assert.equal(field.value,'Keep this too\nFailed draft');assert.equal(ui.host.querySelector('.ss-unsent-drafts'),null)}finally{await ui.close()}
 })
 test(v.name+': composition Enter never submits a message',async()=>{
  const ui=await mount(v.make());try{await enter(ui.host.querySelector('textarea')!,'変換中');await act(async()=>ui.host.querySelector('textarea')!.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true})));assert.equal(pending.length,0)}finally{await ui.close()}
 })
 test(v.name+': reconnect and returning to the tab recover missed messages; failure keeps the visible history',async()=>{
  const ui=await mount(v.make());try{history=[{id:'missed',content:'Recovered message',sender_id:member.id,created_at:'2026-11-22T00:00:00Z'}];await status(v.channel,'SUBSCRIBED');assert.match(ui.host.textContent!,/Recovered message/);readError={code:'offline'};await act(async()=>window.dispatchEvent(new win.Event('online')));assert.match(ui.host.textContent!,/Connection interrupted/);assert.match(ui.host.textContent!,/Recovered message/);readError=null;history=[{id:'resumed',content:'After tab resume',sender_id:member.id,created_at:'2026-11-22T00:01:00Z'}];await act(async()=>document.dispatchEvent(new win.Event('visibilitychange')));assert.match(ui.host.textContent!,/After tab resume/);assert.doesNotMatch(ui.host.textContent!,/Connection interrupted/)}finally{await ui.close()}
 })
 test(v.name+': realtime insert survives a late history response, including an edit to an existing message',async()=>{
  const old={id:'old',content:'Old text',sender_id:'me',created_at:'2026-11-22T00:00:00Z'};const ui=await mount(v.make([old]));try{holdRead=true;await status(v.channel,'SUBSCRIBED');assert.equal(reads.length,1);await emit(v.channel,'INSERT',{id:'live',content:'Live during refresh',sender_id:member.id,created_at:'2026-11-22T00:02:00Z'});await emit(v.channel,'UPDATE',{...old,content:'Fresh edit',edited_at:'2026-11-22T00:01:00Z'});await act(async()=>reads[0].resolve({data:[old],error:null}));assert.match(ui.host.textContent!,/Live during refresh/);assert.match(ui.host.textContent!,/Fresh edit/);assert.equal(ui.host.querySelectorAll('#message-live').length,1)}finally{holdRead=false;await ui.close()}
 })
 test(v.name+': failed edits restore only their own row and keep messages received during the save',async()=>{
  const old={id:'old',content:'Original message',sender_id:'me',created_at:'2026-11-22T00:00:00Z'};const ui=await mount(v.make([old]));try{const edit=ui.host.querySelector<HTMLButtonElement>('[aria-label="Edit message"]')??[...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='Edit')!;await act(async()=>edit.click());await enter(ui.host.querySelector('textarea')!,'Changed');holdUpdate=true;await sendClick(ui.host);await emit(v.channel,'INSERT',{id:'live',content:'Incoming during edit',sender_id:member.id,created_at:'2026-11-22T00:02:00Z'});await act(async()=>pending[0].resolve({data:null,error:{code:'offline'}}));assert.match(ui.host.textContent!,/Original message/);assert.match(ui.host.textContent!,/Incoming during edit/);assert.equal(ui.host.querySelector('textarea')!.value,'Changed')}finally{holdUpdate=false;await ui.close()}
 })
}
test('history reconciliation preserves deletions and deterministic order without local clock assumptions',()=>{
 const removed={id:'removed',created_at:'2026-11-22'},original={id:'old',created_at:'2026-11-20'},updated={...original,content:'Changed'},incoming={id:'live',created_at:'2026-11-21'}
 assert.deepEqual(reconcileMessageHistory([original,removed],[updated,incoming],[removed,original]).map(r=>r.id),['old','live']);assert.equal(reconcileMessageHistory([original],[updated],[original])[0],updated)
})
test('DM and group recovery are bounded, abortable and scoped to the same conversation as navigation',async()=>{
 const signal=new AbortController().signal;calls.length=0;history=[];await loadDmHistory(client,'me','partner',signal);assert.match(calls.find(c=>c[0]==='or')[1],/sender_id.eq.me,dm_recipient_id.eq.partner/);assert.ok(calls.some(c=>c[0]==='limit'&&c[1]===100));assert.match(calls.find(c=>c[0]==='select')[2],/messages_sender_id_fkey/);calls.length=0;await loadGroupHistory(client,'group',signal);assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='conversation_id'&&c[2]==='group'));assert.ok(calls.some(c=>c[0]==='limit'&&c[1]===200))
})

for(const v of variants)test(v.name+': failed deletion keeps concurrent incoming rows',async()=>{
 const old={id:'old',content:'Keep original',sender_id:'me',created_at:'2026-11-22T00:00:00Z'};const ui=await mount(v.make([old]));try{holdUpdate=true;const button=ui.host.querySelector<HTMLButtonElement>('[aria-label="Delete message"]')??[...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='Delete')!;await act(async()=>button.click());await emit(v.channel,'INSERT',{id:'during-delete',content:'During deletion',sender_id:member.id,created_at:'2026-11-22T00:02:00Z'});await act(async()=>pending[0].resolve({data:null,error:{code:'offline'}}));assert.match(ui.host.textContent!,/Keep original/);assert.match(ui.host.textContent!,/During deletion/)}finally{holdUpdate=false;await ui.close()}
})
