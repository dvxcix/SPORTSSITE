import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const win = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://slipsurge.invalid', pretendToBeVisual:true }).window
Object.assign(globalThis, { window:win, document:win.document, HTMLElement:win.HTMLElement, Event:win.Event, IS_REACT_ACT_ENVIRONMENT:true })
const { createRoot } = await import('react-dom/client')
let reads = 0
let failAfterFirstPage = false
let result: { data:unknown; error:unknown } = { data:null, error:{ message:'Temporary connection failure' } }
const client = { from:(table:string) => {
  assert.equal(table,'user_badges')
  let cursor:string|null=null
  const query={
    select:(columns:string)=>{assert.equal(columns,'id, user_id, badge:badges(id, name, icon_url, description, card_image_url)');return query},
    order:(column:string)=>{assert.equal(column,'id');return query},
    limit:(size:number)=>{assert.equal(size,500);return query},
    gt:(column:string,value:string)=>{assert.equal(column,'id');cursor=value;return query},
    then:(resolve:(value:unknown)=>void,reject:(reason:unknown)=>void)=>{
      reads++
      const rows=Array.isArray(result.data)?result.data.map((row,index)=>({id:String(index).padStart(8,'0'),...row})):[]
      return Promise.resolve(cursor&&failAfterFirstPage?{data:null,error:{message:'Second page failed'}}:{...result,data:result.error?null:rows.filter(row=>!cursor||row.id>cursor).slice(0,500)}).then(resolve,reject)
    },
  }
  return query
} }
const bundle = await build({
  stdin:{ contents:'export {useUserBadges,invalidateBadgeCache} from "./src/lib/badges"', resolveDir:resolve('.'), loader:'tsx' },
  bundle:true, write:false, platform:'node', format:'cjs', jsx:'automatic', external:['react','react-dom','swr'], tsconfig:'tsconfig.json',
  plugins:[{ name:'badge-read-fixture', setup(builder) {
    builder.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'badge-client',namespace:'fixture'}))
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function createClient(){return __badgeClient}',loader:'js'}))
  } }],
})
const module = { exports:{} as { useUserBadges:(id:string|null)=>{name:string}[]; invalidateBadgeCache:()=>void } }
new Function('require','module','exports','__badgeClient',bundle.outputFiles[0].text)(require,module,module.exports,client)
const { useUserBadges, invalidateBadgeCache } = module.exports
const badge = (name:string) => ({id:name,name,icon_url:'/badge.webp',description:name})
function Identities({first='a'}:{first?:string|null}) {
  const a = useUserBadges(first), b = useUserBadges('b'), again = useUserBadges('a')
  return h('div',null,h('output',{'data-user':'first'},a.map(x=>x.name).join(',')),h('output',{'data-user':'b'},b.map(x=>x.name).join(',')),h('output',{'data-user':'again'},again.map(x=>x.name).join(',')))
}
async function settle() { await act(async()=>{await new Promise(resolve=>setTimeout(resolve,40))}) }

test('badge reads dedupe, recover from failure, follow the current member and refresh mounted identities',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const output=(id:string)=>host.querySelector(`[data-user="${id}"]`)?.textContent
  try {
    await act(async()=>root.render(h(Identities,{})));await settle()
    assert.equal(reads,1,'three consumers share one request')
    assert.equal(output('first'),'')
    result={data:[{user_id:'a',badge:badge('Ultimate')},{user_id:'b',badge:badge('Beta Tester')}],error:null}
    await act(async()=>invalidateBadgeCache());await settle()
    assert.equal(reads,2,'a failed first read must be recoverable')
    assert.equal(output('first'),'Ultimate');assert.equal(output('again'),'Ultimate');assert.equal(output('b'),'Beta Tester')
    await act(async()=>root.render(h(Identities,{first:'b'})))
    assert.equal(output('first'),'Beta Tester','reused row never shows the preceding member’s badge')
    await act(async()=>root.render(h(Identities,{first:null})))
    assert.equal(output('first'),'','missing ID must not keep the preceding badge')
    assert.equal(reads,2,'rendering or theme changes must not refetch each badge')
    result={data:null,error:{message:'Revalidation failed'}}
    await act(async()=>invalidateBadgeCache());await settle()
    assert.equal(output('again'),'Ultimate','failed refresh keeps the last successful assignments')
    result={data:[{user_id:'a',badge:badge('Beta Tester')}],error:null}
    await act(async()=>invalidateBadgeCache());await settle()
    assert.equal(reads,4,'four reads completed');assert.equal(output('again'),'Beta Tester','admin invalidation updates mounted consumers')
    assert.equal(output('b'),'','removed assignment is no longer displayed')
    assert.equal(reads,4)
    result={data:Array.from({length:1227},(_,i)=>({user_id:i===1226?'a':'member-'+i,badge:badge(i===1226?'Beyond first thousand':'Beta Tester')})),error:null}
    await act(async()=>invalidateBadgeCache());await settle()
    assert.equal(reads,7,'all three ordered pages are loaded once for the shared cache')
    assert.equal(output('again'),'Beyond first thousand','members after the first 1,000 records retain their badges')
    failAfterFirstPage=true
    ;(result.data as any[])[0]={user_id:'a',badge:badge('Incomplete new page')}
    await act(async()=>invalidateBadgeCache());await settle()
    assert.equal(reads,9)
    assert.equal(output('again'),'Beyond first thousand','a later-page failure must not publish partial assignments')
    failAfterFirstPage=false
    result={data:[{user_id:'a',badge:badge('Recovered')}],error:null}
    await act(async()=>invalidateBadgeCache());await settle()
    assert.equal(output('again'),'Recovered','a failed later page cannot leave the shared request stuck')
  } finally { await act(async()=>root.unmount());host.remove();win.close() }
})
