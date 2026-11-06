import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const state={date:'2026-11-02',game:{id:7,date:'2026-11-02'},fail:true,exact:false}
;(globalThis as typeof globalThis&{nbaPastPage:typeof state}).nbaPastPage=state
const built=await build({stdin:{contents:"export {default} from './src/app/the-paint/page'",resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'nba-past-page.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'past-page',setup(builder){
  const modules:Record<string,string>={
    '@/lib/paintAccess':`export async function requirePaintAccess(){return {userId:'member'}}`,
    '@/lib/nbaSeasonDisplay':`export const nbaSeasonDisplayBoard=board=>board`,
    '@/components/nba/NbaAccessFallback':`export function NbaAccessFallback(){return null}`,
    '@/lib/nbaOddsMode':`export const nbaOddsMode=value=>value==='live'?'live':'pregame'`,
    '@/lib/nbaPaintData':`export async function getPaintSchedule(date,exact){const s=globalThis.nbaPastPage;s.exact=exact;return {date:date??s.date,days:[s.date],complete:true,games:date===s.date?[s.game]:[]}};export async function getPaintBoard(game,mode){if(globalThis.nbaPastPage.fail)throw Error('Saved research unavailable');return {game}}`,
    './PaintBoardClient':`export function PaintBoardClient(){return null}`,
  }
  builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'fixture'}:undefined)
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}))
}}]})
const fixture={exports:{} as {default:(props:{searchParams:Promise<Record<string,string>>})=>Promise<{props:Record<string,unknown>}>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))

test('missing historical research keeps the requested date and game navigation, without a substitute board',async()=>{
  const result=await fixture.exports.default({searchParams:Promise.resolve({date:'2026-11-02',game:'7',mode:'pregame',view:'odds-board'})})
  assert.equal(state.exact,true)
  assert.equal(result.props.date,'2026-11-02');assert.equal(result.props.selectedGameId,7);assert.equal(result.props.initial,null)
  assert.equal(result.props.scheduleComplete,true);assert.deepEqual(result.props.games,[state.game])
  state.fail=false
  try{const saved=await fixture.exports.default({searchParams:Promise.resolve({date:'2026-11-02',game:'7',mode:'pregame'})});assert.deepEqual(saved.props.initial,{game:state.game});await fixture.exports.default({searchParams:Promise.resolve({})});assert.equal(state.exact,true)}finally{state.fail=true}
})
