/* eslint-disable @typescript-eslint/no-explicit-any -- Runtime component and route fixture exports are intentionally dynamic. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import ts from 'typescript'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { nbaName, type PaintGame } from '../src/lib/nbaPaint.ts'
import { nbaPortraitFallback, nbaRosterPortraits } from '../src/lib/nbaPlayerPortraits.ts'
import { nflPlayerPortrait } from '../src/lib/nflPlayerPortrait.ts'
import { nbaFullBoardPlayers } from '../src/lib/nbaFullBoardPlayers.ts'

const known = [
  [1028028405, 'Alexandre', 'Sarr', 'Alex Sarr', 5160992],
  [1028025235, 'Carlton', 'Carrington', 'Bub Carrington', 4845374],
  [666508, 'Nicolas', 'Claxton', 'Nic Claxton', 4278067],
  [17896031, "Nah'Shon", 'Hyland', 'Bones Hyland', 4592492],
  [1057275769, 'Hansen', 'Yang', 'Yang Hansen', 5217746],
  [1028245237, 'David', 'Jones', 'David Jones Garcia', 4713010],
  [1057260888, 'Airious', 'Bailey', 'Ace Bailey', 4873138],
] as const
const player = (id: number, first_name: string, last_name: string) => ({ id, first_name, last_name })
test('all seven observed name mismatches use the exact player-ID-pinned image', () => {
  for (const [id, first, last, alias, espn] of known) {
    const image = `https://a.espncdn.com/i/headshots/nba/players/full/${espn}.png`
    assert.equal(nbaRosterPortraits([player(id, first, last)], new Map([[nbaName(alias), image]])).get(id), image)
    assert.equal(nbaPortraitFallback(`bdl:${id}`), image)
    assert.equal(nbaPortraitFallback(id), image)
  }
})
test('six verified official NBA portraits cover missing team artwork without requests', () => {
  for (const [id, first, last, nba] of [[1091360181,'Chris','Cenac Jr.',1643416],[1095497363,'Khalifa','Diop',1631215],[1028245994,'Riley','Minix',1642434],[1057848025,'Norchad','Omier',1641807],[1042560902,"Nae'Qwan",'Tomlin',1641772],[1091467104,'Bruce','Thornton',1643570]] as const) {
    assert.equal(nbaRosterPortraits([player(id,first,last)],new Map()).get(id),`https://cdn.nba.com/headshots/nba/latest/1040x760/${nba}.png`)
  }
})
test('exact normal names retain their source image; accents and suffixes normalize', () => {
  const image='https://example.test/jose.png'
  assert.equal(nbaRosterPortraits([player(1,'José','Example Jr.')],new Map([[nbaName('Jose Example'),image]])).get(1),image)
})
test('aliases never guess a misspelling, surname or a different player ID', () => {
  const image='https://example.test/alex.png'
  assert.equal(nbaRosterPortraits([player(1,'Alexandre','Sarr')],new Map([[nbaName('Alex Sarr'),image]])).get(1),null)
  assert.equal(nbaRosterPortraits([player(1028028405,'Alexander','Other')],new Map()).get(1028028405),null)
  assert.equal(nbaRosterPortraits([player(1,'Alexander','Sarr')],new Map([[nbaName('Alex Sarr'),image]])).get(1),null)
  for (const id of ['nba:1028028405','gsis:1028028405','00-0036358','1028028405junk',-1,0,null,undefined]) assert.equal(nbaPortraitFallback(id),null)
})
test('ambiguous names, duplicate IDs and conflicting portraits fail closed', () => {
  const sarr=player(1028028405,'Alexandre','Sarr'), image='https://example.test/alex.png'
  assert.equal(nbaRosterPortraits([sarr,{...sarr}],new Map([[nbaName('Alex Sarr'),image]])).get(sarr.id),null)
  assert.equal(nbaRosterPortraits([sarr,player(2,'Alex','Sarr')],new Map([[nbaName('Alex Sarr'),image]])).get(sarr.id),null)
  assert.equal(nbaRosterPortraits([sarr],new Map([[nbaName('Alex Sarr'),image],[nbaName('Alexandre Sarr'),'https://example.test/other.png']])).get(sarr.id),null)
})
test('closed boards retain the original archive and make no artwork reads; crossed cutoffs reject', async () => {
  const team={id:1,abbreviation:'WAS',name:'Wizards',full_name:'Washington Wizards'}
  const game:PaintGame={id:1,date:'2000-01-01',datetime:'2000-01-01T20:00:00Z',season:1999,status:'Final',period:4,home_team:team,visitor_team:{...team,id:2},home_team_score:1,visitor_team_score:0}
  const roster=[{...player(1028028405,'Alexandre','Sarr'),position:'C',team,headshot:null}], before=JSON.stringify(roster)
  let reads=0
  const load=async()=>{reads++;return {headshots:new Map<string,string|null>()}}
  assert.equal((await nbaFullBoardPlayers(game,roster,false,true,load))[0].headshot,null)
  assert.equal(reads,0); assert.equal(JSON.stringify(roster),before)
  await assert.rejects(nbaFullBoardPlayers(game,roster,true,true,load),/cutoff/)
})
test('NFL fallback uses its own validated ESPN ID and preserves a supplied image', () => {
  assert.equal(nflPlayerPortrait({espn_id:' 5150249 '}),'https://a.espncdn.com/i/headshots/nfl/players/full/5150249.png')
  assert.equal(nflPlayerPortrait({espn_id:5150249,headshot:'https://example.test/original.png'}),'https://example.test/original.png')
  for (const id of ['0','../2','1e2','abc',null]) assert.equal(nflPlayerPortrait({espn_id:id}),null)
})

const require=createRequire(import.meta.url)
const bundled=await build({stdin:{contents:'export {PlayerAvatar} from "./src/components/sports/PlayerAvatar";export {PlayerAvatar as CourtAvatar} from "./src/app/the-paint/PaintVisuals";',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',plugins:[{name:'portrait-ui-fixture',setup(builder){
  builder.onResolve({filter:/\.module\.css$/},args=>({path:args.path,namespace:'css'}))
  builder.onLoad({filter:/.*/,namespace:'css'},()=>({contents:'export default {}',loader:'js'}))
  builder.onResolve({filter:/NbaMatrixContext$/},args=>({path:args.path,namespace:'context'}))
  builder.onLoad({filter:/.*/,namespace:'context'},()=>({contents:'export const useNbaMatrixMatches=()=>[]',loader:'js'}))
}}]})
const loaded={exports:{} as Record<string,any>}
new Function('require','module','exports',bundled.outputFiles[0].text)(require,loaded,loaded.exports)
const {PlayerAvatar,CourtAvatar}=loaded.exports
test('saved social cards and frozen Court avatars recover Sarr without editing the archive', () => {
  const url=nbaPortraitFallback(1028028405)!
  assert.ok(renderToStaticMarkup(createElement(PlayerAvatar,{sport:'NBA',playerId:1028028405,name:'Alexandre Sarr',teamAbbr:'WAS'})).includes(url))
  assert.ok(renderToStaticMarkup(createElement(CourtAvatar,{player:{id:1028028405,headshot:null,team:{abbreviation:'WAS'}}})).includes(url))
  assert.ok(!renderToStaticMarkup(createElement(PlayerAvatar,{sport:'NFL',playerId:1028028405,name:'Another player'})).includes(url))
})
test('a broken saved URL tries the verified photo once, stops after failure, and recovers for a new player', async () => {
  const {JSDOM}=require('jsdom'), {createRoot}=await import('react-dom/client')
  const dom=new JSDOM('<div id="root"></div>'), globals=globalThis as any
  globals.window=dom.window;globals.document=dom.window.document;globals.IS_REACT_ACT_ENVIRONMENT=true
  const host=dom.window.document.getElementById('root')!,root=createRoot(host)
  try{
    await act(async()=>root.render(createElement(PlayerAvatar,{sport:'NBA',playerId:1028028405,name:'Sarr',headshot:'https://example.test/broken.png',showTeam:false})))
    assert.match(host.querySelector('img')!.src,/broken\.png/)
    await act(async()=>host.querySelector('img')!.dispatchEvent(new dom.window.Event('error')))
    assert.equal(host.querySelector('img')!.src,nbaPortraitFallback(1028028405))
    await act(async()=>host.querySelector('img')!.dispatchEvent(new dom.window.Event('error')))
    assert.equal(host.querySelector('img'),null)
    await act(async()=>root.render(createElement(PlayerAvatar,{sport:'NBA',playerId:1028025235,name:'Bub',showTeam:false})))
    assert.equal(host.querySelector('img')!.src,nbaPortraitFallback(1028025235))
  }finally{await act(async()=>root.unmount());dom.window.close();delete globals.window;delete globals.document;delete globals.IS_REACT_ACT_ENVIRONMENT}
})

test('NFL search uses the existing directory ID without an added query or external request',async()=>{
  const source=await readFile(new URL('../src/app/api/search/nfl/route.ts',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  let queries=0,selected=''
  const admin={from(table:string){queries++; const q:any={select:(fields:string)=>{if(table==='nfl_players')selected=fields;return q},ilike:()=>q,not:()=>q,order:()=>q,or:()=>q,limit:()=>q,then:(done:any)=>done({data:table==='nfl_players'?[{gsis_id:'00-0041075',display_name:'Fixture',espn_id:'5150249',latest_team:'CLE',headshot:null}]:[]})};return q}}
  const mod={exports:{} as any}
  new Function('require','module','exports',output)((name:string)=>{
    if(name==='next/server')return {NextResponse:Response}
    if(name.endsWith('/requireTier'))return {requireTier:async()=>({})}
    if(name.endsWith('/supabase/admin'))return {createAdminClient:()=>admin}
    if(name.endsWith('/nflPlayerPortrait'))return {nflPlayerPortrait}
    throw Error('Unexpected import '+name)
  },mod,mod.exports)
  const response=await mod.exports.GET(new Request('https://example.test/api/search/nfl?q=Fixture'))
  assert.equal(response.status,200);assert.equal(queries,3);assert.match(selected,/espn_id/)
  assert.equal((await response.json()).players[0].headshot,'https://a.espncdn.com/i/headshots/nfl/players/full/5150249.png')
})
