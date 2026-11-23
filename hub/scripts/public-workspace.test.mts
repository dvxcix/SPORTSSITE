import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { publicWorkspaceRequest, PUBLIC_WORKSPACE_RESOURCES } from '../src/lib/publicWorkspacePolicy'
import { isPublicPreviewDataPath } from '../src/lib/publicResearchPreview'
import { publicWorkspaceHref, publicWorkspaceFetch, publicWorkspaceAccessOr } from '../src/lib/publicWorkspaceClient'

const scope={sport:'nba' as const,game:'123',date:'2026-11-23'}
const input=(resource:string,extra='')=>new URLSearchParams('resource='+encodeURIComponent(resource)+extra)
test('preview reads allow exact one-game resources, normal markets and Live mode',()=>{
  for(const resource of PUBLIC_WORKSPACE_RESOURCES.nba){
    const result=publicWorkspaceRequest('nba',scope,input(resource,'&game=123&date=2026-11-23&market=rebounds&mode=live'))
    assert.equal(result?.resource,resource);assert.equal(result?.query.get('game'),'123')
  }
  assert.equal(publicWorkspaceRequest('nfl',{game:'2026_11_CIN_WAS',date:scope.date},input('/the-sideline/market'))?.query.get('game'),'2026_11_CIN_WAS')
})
test('other games, dates, duplicate inputs, private routes and write features stay unavailable',()=>{
  for(const extra of ['&game=124','&game_id=124','&gameId=124','&date=2026-11-22','&slate_date=2026-11-22','&game=123&game=124','&researchGame=124'])assert.equal(publicWorkspaceRequest('nba',scope,input('/the-paint/board',extra)),null,extra)
  for(const resource of ['/admin','/api/nba-matrices','/api/nba-matrices/evaluate','/the-paint/slate','/the-paint/../profile','https://example.com/the-paint/board','/the-sideline/market'])assert.equal(publicWorkspaceRequest('nba',scope,input(resource)),null,resource)
  assert.equal(publicWorkspaceRequest('nba',scope,input('/the-paint/board','&resource=%2Fthe-paint%2Fprofile')),null)
  assert.equal(publicWorkspaceRequest('nba',scope,input('/the-paint/board','&x='+'x'.repeat(4100))),null)
  assert.equal(isPublicPreviewDataPath('/preview/nba/data','GET'),true)
  assert.equal(isPublicPreviewDataPath('/preview/nba/data','POST'),false)
  assert.equal(isPublicPreviewDataPath('/preview/nba/data/admin','GET'),false)
})
test('historical shots require the featured research-game anchor; the real handler verifies saved log membership',()=>{
  assert.equal(publicWorkspaceRequest('nba',scope,input('/the-paint/shots','&game=99&player=1')),null)
  assert.ok(publicWorkspaceRequest('nba',scope,input('/the-paint/shots','&game=99&researchGame=123&player=1')))
  assert.equal(publicWorkspaceRequest('nba',scope,input('/the-paint/shots','&game=99&researchGame=124&player=1')),null)
})

const require=createRequire(import.meta.url)
const stubs:Record<string,string>={
  'server-only':'',
  '@/lib/requireTier':`export const resolveAuthedClient=async()=>({userId:null,error:undefined})`,
  '@/lib/supabase/admin':`export const createAdminClient=()=>{throw Error('Private account lookup must not run in a scoped public read')}`,
  '@/lib/publicWorkspaceData':`export const resolvePublicWorkspace=async sport=>({sport,game:'123',date:'2026-11-23'})`,
  '@/lib/publicWorkspaceRoutes':`import{publicWorkspaceScope,publicWorkspaceGames}from'@/lib/publicWorkspaceScope';import{requirePaintAccess}from'@/lib/paintAccess';export const PUBLIC_WORKSPACE_READERS={'/the-paint/board':async()=>({GET:async()=>{globalThis.previewReaderCalls++;return Response.json({scope:publicWorkspaceScope(),gate:await requirePaintAccess(),games:publicWorkspaceGames([{id:123},{id:124}],'nba')})}})}`,
}
const bundle=await build({stdin:{contents:'export * from "./src/lib/publicWorkspaceScope";export{requirePaintAccess,requirePaintAdmin}from"./src/lib/paintAccess";export{requireNflAccess}from"./src/lib/nflAccess";export{GET as previewRead}from"./src/app/preview/[sport]/data/route"',resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',tsconfig:'tsconfig.json',external:['next/server'],plugins:[{name:'scope-fixture',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],resolveDir:process.cwd(),loader:'js'}))}}]})
const mod={exports:{} as typeof import('../src/lib/publicWorkspaceScope') & typeof import('../src/lib/paintAccess') & typeof import('../src/lib/nflAccess') & {previewRead:typeof import('../src/app/preview/[sport]/data/route').GET}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports)
const api=mod.exports

test('real dispatcher ignores forged headers, rejects cross-game and write requests, then restores private gating',async()=>{
  const {NextRequest}=require('next/server')
  const globals=globalThis as typeof globalThis & {previewReaderCalls:number}
  globals.previewReaderCalls=0
  const read=(query:string,method='GET')=>api.previewRead(new NextRequest('https://slipsurge.invalid/preview/nba/data?'+query,{method,headers:{'x-preview-game':'124','x-preview-admin':'true'}}),{params:Promise.resolve({sport:'nba'})})
  assert.equal((await read(input('/the-paint/board','&game=124').toString())).status,403)
  assert.equal((await read(input('/the-paint/board','&game=123').toString(),'POST')).status,405)
  assert.equal((await read(input('/api/nba-matrices').toString())).status,403)
  assert.equal(globals.previewReaderCalls,0,'invalid requests never reach a research reader')
  const response=await read(input('/the-paint/board','&game=123').toString())
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store')
  const data=await response.json()
  assert.deepEqual(data.scope,scope);assert.deepEqual(data.games,[{id:123}]);assert.equal(data.gate.isAdmin,false)
  assert.equal(globals.previewReaderCalls,1)
  assert.equal(api.publicWorkspaceScope(),undefined);assert.equal((await api.requirePaintAccess()).error?.status,401)
})

test('public context is request-local, sport-specific and cannot grant admin access',async()=>{
  assert.equal((await api.requirePaintAccess()).error?.status,401)
  await Promise.all([api.withPublicWorkspace(scope,async()=>{
    await Promise.resolve();assert.equal(api.publicWorkspaceScope()?.game,'123')
    assert.equal((await api.requirePaintAccess()).isAdmin,false)
    assert.equal((await api.requirePaintAdmin()).error?.status,403)
    assert.equal((await api.requireNflAccess()).error?.status,401)
    assert.deepEqual(api.publicWorkspaceGames([{id:123},{id:124}],'nba'),[{id:123}])
    assert.equal(api.publicWorkspacePhase({date:scope.date,checkedAt:1,signature:'123,1000000000000,0;124,1000000000000,0'}).signature,'123,1000000000000,0')
  }),api.withPublicWorkspace({sport:'nfl',game:'other',date:scope.date},async()=>{
    await Promise.resolve();assert.equal(api.publicWorkspaceScope()?.game,'other')
    assert.equal((await api.requirePaintAccess()).error?.status,401)
    assert.equal((await api.requireNflAccess()).isAdmin,false)
  })])
  assert.equal(api.publicWorkspaceScope(),undefined)
  assert.equal((await api.requirePaintAccess()).error?.status,401)
  assert.deepEqual(api.publicWorkspaceGames([{id:123},{id:124}],'nba'),[{id:123},{id:124}])
})

test('client transport is unchanged outside previews; preview navigation and read requests stay inside the preview',async()=>{
  const globals=globalThis as unknown as {window?:unknown}
  const original=globals.window
  try{
    globals.window={location:{pathname:'/the-paint'}}
    assert.equal(publicWorkspaceHref('/the-paint/board?game=123'),'/the-paint/board?game=123')
    globals.window={location:{pathname:'/preview/nba'}}
    assert.equal(publicWorkspaceHref('/the-paint?game=123&view=odds-board'),'/preview/nba?game=123&view=odds-board')
    const url=new URL(publicWorkspaceHref('/the-paint/board?game=123'),'https://slipsurge.invalid')
    assert.equal(url.pathname,'/preview/nba/data');assert.equal(url.searchParams.get('resource'),'/the-paint/board')
    assert.equal(publicWorkspaceHref('https://example.com'),'https://example.com')
    let called=0
    globals.window={location:{pathname:'/preview/nfl'},dispatchEvent:()=>{called++;return true}}
    let writes=0
    publicWorkspaceAccessOr(()=>{writes++})
    assert.equal(writes,0,'saved actions cannot execute while browsing a public workspace')
    assert.equal(called,1)
    const response=await publicWorkspaceFetch('/api/nfl-matrices',{method:'POST'})
    assert.equal(response.status,403);assert.equal(called,2)
    globals.window={location:{pathname:'/the-sideline'}}
    publicWorkspaceAccessOr(()=>{writes++})
    assert.equal(writes,1,'normal member actions retain their handler')
  }finally{if(original===undefined)delete globals.window;else globals.window=original}
})

test('full preview mounts the actual workspace pages; all date-wide routes apply game scope before loading or caching',async()=>{
  const page=await readFile('src/app/preview/[sport]/page.tsx','utf8')
  assert.match(page,/PaintPage\(\{ searchParams: search \}\)/);assert.match(page,/SidelinePage\(\{ searchParams: search \}\)/)
  assert.doesNotMatch(page,/ResearchPreviewClient|preservePublicPreviewContext/)
  for(const path of ['the-paint/odds-board','the-paint/final-results','the-paint/first-basket/odds','the-paint/schedule','api/the-sideline/odds-board'])assert.match(await readFile('src/app/'+path+'/route.ts','utf8'),/publicWorkspaceGames/)
  const shots=await readFile('src/app/the-paint/shots/route.ts','utf8');assert.match(shots,/visible\?\.logs\.some/)
})
