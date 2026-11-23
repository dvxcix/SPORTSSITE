import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
function fixture(options={}){
 let history=0,list=0
 const channel={id:'channel',slug:'member-room',group_id:'group',...options.channel}
 const client={auth:{getUser:async()=>({data:{user:{id:'member'}}})},rpc:async()=>({data:{send:true},error:null}),from(table){const q=new Proxy({},{get:(_,key)=>key==='single'?async()=>({data:channel,error:null}):key==='maybeSingle'?async()=>({data:options.hidden?null:{slug:'film-room'},error:options.error?{code:'failed'}:null}):()=>q});return q}}
 const Gate=()=>null,imports={'react/jsx-runtime':jsx,'@/lib/supabase/server':{createClient:async()=>client},'next/navigation':{notFound(){throw Error('NOT_FOUND')},redirect(url){throw Error('REDIRECT '+url)}},'@/lib/queries':{getChannelMessages:async()=>{history++;return[]},getChannels:async()=>{list++;return[]}},'@/components/layout/TierGate':{TierGate:Gate},'@/components/chat/ChatRoom':{ChatRoom:()=>null},'@/components/community/CommunityNav':{CommunityNav:()=>null},'next/link':{default:()=>null},'next/image':{default:()=>null},'lucide-react':{Hash:()=>null,Menu:()=>null,Users:()=>null}}
 const module={exports:{}}
 const source=fs.readFileSync(new URL('../src/app/channels/[slug]/page.tsx',import.meta.url),'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',js)(name=>{assert.ok(name in imports,name);return imports[name]},module,module.exports)
 return{run:()=>module.exports.default({params:Promise.resolve({slug:channel.slug})}),reads:()=>({history,list}),Gate}
}
test('legacy group-channel links enter the member workspace before reading chat history',async()=>{const f=fixture();await assert.rejects(f.run(),/REDIRECT \/groups\/film-room\?view=chat&channel=member-room/);assert.deepEqual(f.reads(),{history:0,list:0})})
test('unreadable groups do not disclose history or a community destination',async()=>{const f=fixture({hidden:true});await assert.rejects(f.run(),/NOT_FOUND/);assert.deepEqual(f.reads(),{history:0,list:0})})
test('group access lookup failures fail closed before content queries',async()=>{const f=fixture({error:true});await assert.rejects(f.run(),/could not be verified/);assert.deepEqual(f.reads(),{history:0,list:0})})
test('global rooms retain their existing Basic gate and chat history path',async()=>{const f=fixture({channel:{group_id:null}}),result=await f.run();assert.equal(result.type,f.Gate);assert.equal(result.props.requiredTier,'basic');assert.deepEqual(f.reads(),{history:1,list:1})})
