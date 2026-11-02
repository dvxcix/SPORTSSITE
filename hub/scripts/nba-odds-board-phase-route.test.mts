import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { build } from 'esbuild'
const shared={denied:false,phaseFails:false,phaseCalls:0,boardCalls:0}
;(globalThis as typeof globalThis&{phaseRouteFixture:typeof shared}).phaseRouteFixture=shared
const bundled=await build({stdin:{contents:"export {GET} from './src/app/the-paint/board/route'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'phase-route',setup(builder){
  const modules:Record<string,string>={
    'next/server':`export const NextResponse={json:(data,options)=>Response.json(data,options)}`,
    '@/lib/paintAccess':`export async function requirePaintAccess(){return globalThis.phaseRouteFixture.denied?{error:new Response('denied',{status:403})}:{userId:'fixture'}}`,
    '@/lib/nbaPaintData':`export async function getPaintGame(id){return {id,date:'2026-11-02'}};export async function getPaintBoard(game,mode){globalThis.phaseRouteFixture.boardCalls++;return {game,oddsMode:mode,fetchedAt:'2026-11-02T20:00:00Z',players:[]}}`,
    '@/lib/nbaOddsBoardPhaseData':`export async function getNbaOddsBoardPhase(){const s=globalThis.phaseRouteFixture;s.phaseCalls++;if(s.phaseFails)throw Error('unavailable');return {header:'v1|2026-11-02|1793650000000|12,1793656800000,0',expiresAt:1793650015000}}`,
  }
  builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'fixture'}:undefined)
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}))
}}]})
const fixture={exports:{} as {GET:(request:{nextUrl:URL;headers:Headers})=>Promise<Response>}}
new Function('module','exports','require',bundled.outputFiles[0].text)(fixture,fixture.exports,(await import('node:module')).createRequire(import.meta.url))
const req=(query:string,etag?:string)=>({nextUrl:new URL(`https://slipsurge.com/the-paint/board?${query}`),headers:new Headers(etag?{'if-none-match':etag}:{})})
test('authenticated Odds Board poll carries phase token on both 200 and 304',async()=>{
 shared.denied=false;shared.phaseFails=false;shared.phaseCalls=0
 const first=await fixture.exports.GET(req('game=12&mode=pregame&slate_date=2026-11-02'));assert.equal(first.status,200);assert.match(first.headers.get('x-nba-slate-phase')??'',/^v1\|2026-11-02\|/);assert.equal(first.headers.get('x-nba-slate-phase-expires'),'1793650015000')
 const second=await fixture.exports.GET(req('game=12&mode=pregame&slate_date=2026-11-02',first.headers.get('etag')!));assert.equal(second.status,304);assert.match(second.headers.get('x-nba-slate-phase')??'',/^v1\|/);assert.equal(second.headers.get('x-nba-slate-phase-expires'),'1793650015000');assert.equal(shared.phaseCalls,2)
})
test('ordinary board reads do not fetch a token; failures and denied access do not expose one',async()=>{
 shared.phaseCalls=0;const ordinary=await fixture.exports.GET(req('game=12&mode=pregame'));assert.equal(ordinary.headers.get('x-nba-slate-phase'),null);assert.equal(shared.phaseCalls,0)
 shared.phaseFails=true;const failed=await fixture.exports.GET(req('game=12&slate_date=2026-11-02'));assert.equal(failed.headers.get('x-nba-slate-phase'),'unavailable')
 shared.denied=true;const denied=await fixture.exports.GET(req('game=12&slate_date=2026-11-02'));assert.equal(denied.status,403);assert.equal(shared.phaseCalls,1);shared.denied=false
})
