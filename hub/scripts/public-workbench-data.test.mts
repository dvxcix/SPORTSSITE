import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { PUBLIC_PREVIEW_EXAMPLES } from '../src/lib/publicResearchPreviewExamples'
import { publicPreviewPresentation, selectPreviewPlayers } from '../src/lib/publicResearchPreview'

test('public player art accepts provider identity assets and excludes unsafe URLs and arbitrary fields',()=>{
  const source={portraitUrl:'https://a.espncdn.com/i/headshots/nba/players/full/4066457.png',position:'G-F',recent:[12,24,19],formula:{weight:99},email:'private@example.invalid'}
  assert.deepEqual(publicPreviewPresentation(source),{portraitUrl:source.portraitUrl,position:'G-F',recent:[12,24,19]})
  for(const portraitUrl of ['javascript:alert(1)','http://a.espncdn.com/i/headshots/nba/players/full/1.png','https://localhost/private.png','https://a.espncdn.com.evil.test/i/headshots/nba/players/full/1.png','https://a.espncdn.com/private','https://a.espncdn.com/i/headshots/nba/players/full/1.png?secret=yes','https://user:pass@a.espncdn.com/i/headshots/nba/players/full/1.png'])assert.equal(publicPreviewPresentation({portraitUrl}).portraitUrl,undefined,portraitUrl)
  assert.equal(publicPreviewPresentation({position:'<script>'}).position,undefined)
})

test('public chart observations remain bounded, finite and copied rather than carrying the source payload',()=>{
  const recent=Array.from({length:20},(_,i)=>i)
  const result=publicPreviewPresentation({recent})
  assert.deepEqual(result.recent,recent.slice(-10))
  recent[19]=999
  assert.equal(result.recent?.at(-1),19)
  for(const invalid of [[10,NaN],[10,Infinity],[10,-1],[10,1001]])assert.equal(publicPreviewPresentation({recent:invalid}).recent,undefined)
})

test('visual metadata does not expand the server-enforced game, market, player or rung slice',()=>{
  const game=PUBLIC_PREVIEW_EXAMPLES.nba.game
  const quotes=Array.from({length:12},(_,i)=>({id:i+1,name:'Player '+(i+1),team:i<6?game.away:game.home,line:20,price:-110,opening:-120,portraitUrl:'https://a.espncdn.com/i/headshots/nba/players/full/4066457.png',position:'G',recent:[10,20],formula:{weight:100}}))
  const players=selectPreviewPlayers('nba',game,quotes)
  assert.equal(players.length,8)
  assert.equal(players.filter(p=>p.team===game.away).length,4)
  assert.ok(players.every(p=>p.portraitUrl&&p.prices.length===1))
  assert.doesNotMatch(JSON.stringify(players),/formula|weight/)
})

test('both fallback archives have the same real portrait metadata as the limited tool cards',()=>{
  for(const sport of ['nba','nfl'] as const){
    const board=PUBLIC_PREVIEW_EXAMPLES[sport]
    assert.equal(board.example,true)
    for(const player of board.players){
      assert.ok(publicPreviewPresentation(player).portraitUrl,`${sport} ${player.id}`)
      assert.ok(player.position,`${sport} ${player.id}`)
      assert.ok(player.prices.length)
    }
  }
  assert.deepEqual(PUBLIC_PREVIEW_EXAMPLES.nba.players.find(p=>p.id===17553995)?.recent,[23,28,29,26,16,21,19,27,21,25])
})

test('the current public board retains source art and only played, final, earlier observations',async()=>{
  const start=new Date(Date.now()+2*60*60*1000).toISOString()
  const captured=new Date(Date.now()-120000).toISOString()
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const yesterday=new Date(new Date(date+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10)
  const player=(id:number,team:string)=>({id,first_name:'Test',last_name:'Player '+id,team:{id,abbreviation:team},position:'G',headshot:'https://a.espncdn.com/i/headshots/nba/players/full/4066457.png',injury:null,logs:[{pts:24,min:'30:00',game:{date:yesterday,status:'Final'}},{pts:99,min:'30:00',game:{date,status:'Final'}},{pts:0,min:'0:00',game:{date:yesterday,status:'Final'}},{pts:90,min:'30:00',game:{date:yesterday,status:'Live'}}],formula:{privateWeight:99}})
  const fixture={start,captured,date,requests:[] as string[],players:[player(1,'NYK'),player(2,'BOS'),{...player(3,'BOS'),injury:{status:'Out'}}]}
  const globals=globalThis as typeof globalThis & { publicWorkbenchFixture?:typeof fixture }
  globals.publicWorkbenchFixture=fixture
  const stubs:Record<string,string>={
    'server-only':'',
    'next/cache':'export const unstable_cache=load=>(...args)=>load(...args)',
    './supabase/admin':`export const createAdminClient=()=>({
      from:name=>{
        const f=globalThis.publicWorkbenchFixture
        const data=name==='nba_games'?[{id:123,game_date:f.date,payload:{id:123,date:f.date,status:'Scheduled',status_state:'scheduled',period:0,datetime:f.start,visitor_team:{abbreviation:'NYK'},home_team:{abbreviation:'BOS'}}}]:name==='nba_pregame_research'?{players:f.players}:[]
        const result={data,error:null}
        const q={select:()=>q,eq:()=>q,lt:()=>q,lte:()=>q,in:()=>q,order:()=>q,limit:()=>q,abortSignal:()=>q,maybeSingle:()=>Promise.resolve(result),then:resolve=>Promise.resolve(result).then(resolve)}
        return q
      },
      rpc:name=>{globalThis.publicWorkbenchFixture.requests.push(name);return{abortSignal:()=>Promise.resolve(name==='read_nba_book_frames'?{error:{message:'Unneeded aggregate timed out'},data:null}:{error:null,data:name==='nba_phase_cutoff'?globalThis.publicWorkbenchFixture.start:[{captured_at:globalThis.publicWorkbenchFixture.captured,quotes:[1,2,3].map(id=>({id,game_id:123,player_id:id,vendor:'fanduel',prop_type:'points',line_value:'20',updated_at:globalThis.publicWorkbenchFixture.captured,market:{type:'milestone',odds:-110}}))}]})}}
    })`,
  }
  try{
    const result=await build({entryPoints:['src/lib/publicResearchPreviewData.ts'],bundle:true,platform:'node',format:'cjs',write:false,tsconfig:'tsconfig.json',plugins:[{name:'public-workbench-source',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'js'}))}}]})
    const compiled={exports:{} as typeof import('../src/lib/publicResearchPreviewData')}
    new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url))
    const preview=await compiled.exports.getPublicResearchPreview('nba')
    assert.equal(preview.board.example,false)
    assert.ok(fixture.requests.includes('read_nba_phase_frames_scoped'))
    assert.ok(!fixture.requests.includes('read_nba_book_frames'),'FanDuel preview avoids unrelated book aggregation')
    assert.equal(preview.board.capturedAt,captured)
    assert.deepEqual(preview.board.players.map(p=>p.id),[1,2])
    assert.deepEqual(preview.board.players[0].recent,[24])
    assert.equal(preview.board.players[0].portraitUrl,fixture.players[0].headshot)
    assert.doesNotMatch(JSON.stringify(preview),/privateWeight|formula|injury|logs/)
  }finally{delete globals.publicWorkbenchFixture}
})
