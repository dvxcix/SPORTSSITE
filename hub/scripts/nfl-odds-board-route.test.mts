import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createNflPausedProjection, packNflPausedProjection } from '../src/lib/nflPausedProjection'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes'

const require=createRequire(import.meta.url)
const state={denied:false,aliasedMatchup:false,cutoffs:[] as string[],clocks:0,schedules:0,reads:0,truncated:false,many:false,archiveDelay:false,archiveAborted:0,archiveActive:0,archivePeak:0,archive:null as null|{value:unknown;observedAt:string},capture:null as null|{board:unknown},publicPick:null as unknown,entries:new Map<string,unknown>(),baselines:new Map<string,unknown>(),tables:{} as Record<string,Array<{captured_at:string;board:unknown}>>}
;(globalThis as typeof globalThis&{nflBoardRoute:typeof state}).nflBoardRoute=state
const stubs:Record<string,string>={
  'server-only':'',
  'next/server':`export class NextResponse extends Response{static json(v,o={}){return new Response(JSON.stringify(v),{...o,headers:{'Content-Type':'application/json',...o.headers}})}}`,
  '@/lib/nflAccess':`export async function requireNflAccess(){return globalThis.nflBoardRoute.denied?{error:new Response('',{status:403})}:{userId:'test'}}`,
  '@/app/the-sideline/data':`export const getSidelineGames=async()=>({date:'2020-11-02',games:Array.from({length:globalThis.nflBoardRoute.many?24:1},(_,i)=>({id:globalThis.nflBoardRoute.many?'game'+i:'game',gameday:'2020-11-02',gametime:'18:00',away:{abbr:globalThis.nflBoardRoute.aliasedMatchup?'LA':'SEA',color:'#002244',color2:'#69BE28',logo:'https://a.espncdn.com/seattle.png'},home:{abbr:globalThis.nflBoardRoute.aliasedMatchup?'WAS':'CHI',color:'#0B162A',color2:'#C83803',logo:'https://a.espncdn.com/chicago.png'}}))});export const getSidelineCapture=async()=>globalThis.nflBoardRoute.capture`,
  '@/lib/nflPregameResearchData':`export const readNflPregameResearch=async()=>globalThis.nflBoardRoute.archive`,
  '@/lib/nflFanduel':`export const attachNflFanduel=(base)=>base`,
  '@/app/the-sideline/kickoff':`export const nflKickoffAt=()=>new Date('2020-11-02T23:00:00Z')`,
  '@/lib/nbaSharedCache':`export const nbaSharedCache=async(key,ttl,stale,load)=>{const s=globalThis.nflBoardRoute;if(!s.entries.has(key)){const value=await load();s.entries.set(key,value);if(key.includes('partial-view'))s.baselines.set(key,value)}return{value:s.entries.get(key),stale:false}}`,
  '@/lib/supabase/admin':`export const createAdminClient=()=>{const s=globalThis.nflBoardRoute;return{rpc:()=>({abortSignal:signal=>s.archiveDelay?new Promise(resolve=>{s.archiveActive++;s.archivePeak=Math.max(s.archivePeak,s.archiveActive);signal.addEventListener('abort',()=>{s.archiveActive--;s.archiveAborted++;resolve({error:{message:'aborted'},data:null})},{once:true})}):Promise.resolve({error:null,data:s.archive?{payload:s.archive.value,observed_at:s.archive.observedAt,kickoff_at:'2020-11-02T23:00:00.000Z',source:'capture'}:null})}),from:name=>{let stop='',now='',limit=1000,key='';const q={select(){return q},eq(k,v){if(k==='key')key=v;return q},in(){return q},lt(k,v){stop=v;return q},lte(k,v){now=v;return q},order(){return q},limit(v){limit=v;return q},abortSignal:()=>{if(name==='nba_source_cache')return{maybeSingle:async()=>({error:null,data:s.baselines.has(key)?{payload:s.baselines.get(key)}:null})};if(name==='nfl_pikkit_picks_snapshot_history')return{maybeSingle:async()=>({error:null,data:s.publicPick&&s.publicPick.captured_at<stop&&s.publicPick.captured_at<=now?s.publicPick:null})};if(name==='nfl_schedule'){s.schedules++;const data=Array.from({length:s.many?24:1},(_,i)=>({game_id:s.many?'game'+i:'game',gameday:'2020-11-02',gametime:'18:00',away_team:s.aliasedMatchup?'LA':'SEA',home_team:s.aliasedMatchup?'WAS':'CHI'}));return Promise.resolve({error:null,count:data.length,data})}if(name==='nfl_pregame_research'){const value=s.cutoffs[Math.min(s.clocks++,s.cutoffs.length-1)];const data=Array.from({length:s.many?24:1},(_,i)=>({game_id:s.many?'game'+i:'game',kickoff_at:value}));return Promise.resolve({error:null,count:s.truncated?data.length+1:data.length,data})}s.reads++;return Promise.resolve({error:null,data:(s.tables[name]??[]).filter(r=>r.captured_at<stop&&r.captured_at<=now).slice(0,limit)})}};return q}}}`,
}
stubs['./supabase/admin']=stubs['@/lib/supabase/admin']
stubs['./nbaSharedCache']=stubs['@/lib/nbaSharedCache']
const bundled=await build({stdin:{contents:"export {GET} from './src/app/api/the-sideline/odds-board/route'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,outfile:'nfl-board-route.cjs',platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'route-fixtures',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}))}}]})
const compiled={exports:{} as {GET:(request:Request&{nextUrl:URL})=>Promise<Response>}}
new Function('module','exports','require',bundled.outputFiles[0].text)(compiled,compiled.exports,require)
const cutoff='2020-11-02T23:00:00.000Z',older='2020-11-02T22:00:00.000Z'
const sample=(capturedAt:string,updatedAt:string,odds:number,version?:number)=>({captured_at:capturedAt,board:{bdlGameId:7,status:'ready',source:version==null?'live':'snapshot',capturedAt,gameLines:[],...(version==null?{}:{fanduelParserVersion:version}),players:[{id:4,name:'Test',team:'SEA',position:'WR',headshot:'https://static.www.nfl.com/headshot.png',headshotFallbacks:['https://a.espncdn.com/headshot.png'],privateField:'do not expose',markets:[{key:'receiving_yards:25',propType:'receiving_yards',label:'Receiving yards',category:'receiving',line:25,privateField:'do not expose',offers:[{vendor:'fanduel',type:'milestone',line:25,openingLine:25,current:{odds},opening:{odds:300},updatedAt,privateField:'do not expose'}]}]}]}})
function reset(){state.denied=false;state.aliasedMatchup=false;state.cutoffs=[cutoff];state.clocks=0;state.schedules=0;state.reads=0;state.truncated=false;state.many=false;state.archiveDelay=false;state.archiveAborted=0;state.archiveActive=0;state.archivePeak=0;state.archive=null;state.capture=null;state.publicPick=null;state.entries.clear();state.baselines.clear();state.tables={nfl_odds_snapshot_history:[sample('2020-11-02T21:30:00.000Z','2020-11-02T21:29:00.000Z',-140),sample('2020-11-02T20:30:00.000Z','2020-11-02T20:29:00.000Z',-110)],nfl_fanduel_capture_history:[]}}
function request(market='receiving_yards',book='fanduel'){const url=`https://www.slipsurge.com/api/the-sideline/odds-board?date=2020-11-02&market=${market}&book=${book}`;return compiled.exports.GET(Object.assign(new Request(url),{nextUrl:new URL(url)}))}
test('authorization happens before any cache or database reads',async()=>{reset();state.denied=true;assert.equal((await request()).status,403);assert.equal(state.clocks,0);assert.equal(state.reads,0)})
test('saved Anytime and First Touchdown prices populate separate market selections', async () => {
  reset()
  const history = state.tables.nfl_odds_snapshot_history
  for (const [index, snapshot] of history.entries()) {
    const board = snapshot.board as SidelineOddsBoard
    const player = board.players[0]
    const offer = player.markets[0].offers[0]
    for (const [propType, line, odds, opening] of [
      ['anytime_td', 0.5, index ? 145 : 125, 150],
      ['first_td', index ? null : 0.5, index ? 850 : 900, 1000],
      ['anytime_td', 1.5, 500, 550],
      ['two_plus_td', 2, 510, 550],
    ] as const) {
      player.markets.push({
        key: `${propType}:${line ?? ''}`, propType, label: propType, line, category: 'touchdowns',
        offers: [{ ...offer, line, openingLine: line, current: { odds }, opening: { odds: opening } }],
      })
    }
  }
  const board = history[0].board as SidelineOddsBoard
  board.picksCapturedAt = '2020-11-02T21:00:00.000Z'
  board.players[0].publicPicks = [{
    propType: 'anytime_td', label: 'Anytime touchdown', rawMarket: 'Anytime touchdown',
    line: 0.5, side: 'over', kind: 'milestone', picks: 42, capturedAt: board.picksCapturedAt,
  }, {
    propType: 'first_td', label: 'First touchdown', rawMarket: 'First TD Scorer',
    picks: 12, capturedAt: board.picksCapturedAt,
  }]
  state.archive = { value: board, observedAt: history[0].captured_at }
  const anytime = await (await request('anytime_td')).json()
  const first = await (await request('first_td')).json()
  assert.deepEqual(anytime.markets, ['anytime_td', 'first_td', 'receiving_yards', 'two_plus_td'])
  assert.equal(anytime.quotes.length, 1)
  assert.equal(first.quotes.length, 1)
  assert.deepEqual(anytime.quotes[0].slice(5, 9), ['anytime_td', 'fanduel', 0.5, 125])
  assert.deepEqual(first.quotes[0].slice(5, 9), ['first_td', 'fanduel', 0.5, 900])
  assert.deepEqual(anytime.quotes[0].slice(10, 13), [145, '2020-11-02T20:29:00.000Z', 150])
  assert.deepEqual(first.quotes[0].slice(10, 13), [850, '2020-11-02T20:29:00.000Z', 1000])
  assert.deepEqual(anytime.picks, [['game', 4, 'SEA', 'anytime_td', 'fanduel', 0.5, 42, false]])
  assert.deepEqual(first.picks, [['game', 4, 'SEA', 'first_td', 'fanduel', 0.5, 12, false]])
  assert.equal(state.reads, 2)
})
test('frozen pregame Props ladder supplies shared exact or estimated picks without current data',async()=>{
 reset();const board=sample('2020-11-02T21:30:00.000Z','2020-11-02T21:29:00.000Z',-140).board
 Object.assign(board,{picksCapturedAt:'2020-11-02T21:00:00.000Z'});Object.assign(board.players[0],{publicPicks:[{propType:'receiving_yards',label:'Receiving',rawMarket:'Receiving',picks:100,capturedAt:'2020-11-02T21:00:00.000Z'}]})
 state.archive={value:board,observedAt:'2020-11-02T21:30:00.000Z'}
 const result=await(await request()).json();assert.deepEqual(result.picks,[['game',4,'SEA','receiving_yards','fanduel',25,100,true]])
 assert.equal((await request()).status,200);assert.equal([...state.entries.keys()].filter(key=>key.includes('odds-board-candidate')).length,1)
})
test('unavailable or post-cutoff frozen research never falls back to current picks',async()=>{
 reset();const board=sample('2020-11-02T21:30:00.000Z','2020-11-02T21:29:00.000Z',-140).board
 Object.assign(board,{picksCapturedAt:'2020-11-02T21:00:00.000Z'});Object.assign(board.players[0],{publicPicks:[{propType:'receiving_yards',label:'Receiving',rawMarket:'Receiving',picks:100,capturedAt:'2020-11-02T21:00:00.000Z'}]})
 state.archive={value:board,observedAt:'2020-11-02T23:01:00.000Z'};state.capture={board}
 const result=await(await request()).json();assert.deepEqual(result.picks,[])
})
test('frozen marked research uses the same visible ladder as Props',async()=>{
 reset();const original=sample('2020-11-02T21:30:00.000Z','2020-11-02T21:29:00.000Z',-140).board as unknown as SidelineOddsBoard
 original.picksCapturedAt='2020-11-02T21:00:00.000Z';original.players[0].publicPicks=[{propType:'receiving_yards',label:'Receiving',rawMarket:'Receiving',picks:100,capturedAt:'2020-11-02T21:00:00.000Z'}]
 const visible={...original,players:original.players.map(player=>({...player,markets:[]}))}
 state.archive={value:{...original,pausedProjection:packNflPausedProjection(createNflPausedProjection(original,visible,'game'))},observedAt:'2020-11-02T21:30:00.000Z'}
 const result=await(await request()).json();assert.equal(result.quotes.length,1);assert.deepEqual(result.picks,[])
})
test('slow optional frozen counts abort without hiding saved odds',async()=>{reset();state.archiveDelay=true;const result=await(await request()).json();assert.equal(state.archiveAborted,1);assert.equal(result.quotes.length,1);assert.deepEqual(result.picks,[])})
test('24 slow frozen games never exceed three simultaneous count reads',async()=>{reset();state.many=true;state.archiveDelay=true;const result=await(await request()).json();assert.equal(result.games.length,24);assert.equal(result.quotes.length,24);assert.equal(state.archiveAborted,24);assert.equal(state.archiveActive,0);assert.ok(state.archivePeak<=3);assert.deepEqual(result.picks,[])})
test('open game joins the original public snapshot to the saved full ladder once for all members',async()=>{
 reset();const previous=Date.now;Date.now=()=>Date.parse('2020-11-02T22:00:00.000Z')
 try{
  state.publicPick={captured_at:'2020-11-02T21:00:00.000Z',snapshot:{gameId:'game',gameDate:'2020-11-02',awayTeam:'SEA',homeTeam:'CHI',markets:[{propType:'receiving_yards',label:'Receiving Yards',rawLabel:'Receiving Yards',rawKey:'receiving_yards',players:[{playerName:'Test',playerKey:'Test',team:'SEA',picks:100}]}]}}
  const result=await(await request()).json();assert.deepEqual(result.picks,[['game',4,'SEA','receiving_yards','fanduel',25,100,true]])
  assert.equal((await request()).status,200);assert.equal(state.reads,2)
 }finally{Date.now=previous}
})
test('source reads are shared while fresh clock checks remain per request',async()=>{reset();const first=await request();assert.equal(first.status,200);const result=await first.json();assert.equal(result.quotes.length,1);assert.equal(result.quotes[0][8],-140);assert.equal(result.quotes[0][10],-110);assert.equal(result.quotes[0][12],300);assert.equal(result.quotes[0][13],false);assert.equal(state.clocks,2);assert.equal(state.reads,2);assert.doesNotMatch(JSON.stringify(result),/privateField|do not expose/);assert.equal((await request()).status,200);assert.equal(state.clocks,3);assert.equal(state.reads,2)})
test('saved pregame player artwork is sent once per exact game/player with the game team colors',async()=>{reset();const result=await(await request()).json();assert.deepEqual(result.identities,[['game',4,'Test','SEA','https://static.www.nfl.com/headshot.png',['https://a.espncdn.com/headshot.png']]]);assert.deepEqual(result.teams[0],['game','SEA','#002244','#69BE28','https://a.espncdn.com/seattle.png']);assert.equal(result.quotes.length,1);assert.equal(state.reads,2);await request();assert.equal(state.reads,2)})
test('untrusted artwork hosts and a mismatched player name do not supply an avatar',async()=>{reset();const next=state.tables.nfl_odds_snapshot_history[0] as ReturnType<typeof sample>;next.board.players[0].headshot='https://example.org/untrusted.png';next.board.players[0].headshotFallbacks=[];const older=state.tables.nfl_odds_snapshot_history[1] as ReturnType<typeof sample>;older.board.players[0].name='Another Player';const result=await(await request()).json();assert.deepEqual(result.identities,[])})
test('a valid saved fallback remains usable when the primary host is untrusted',async()=>{reset();const next=state.tables.nfl_odds_snapshot_history[0] as ReturnType<typeof sample>;next.board.players[0].headshot='https://example.org/untrusted.png';const result=await(await request()).json();assert.deepEqual(result.identities,[['game',4,'Test','SEA','https://a.espncdn.com/headshot.png',[]]])})
test('v4 cached prices survive the identity rollout without inventing artwork',async()=>{reset();await request();const [key,value]=[...state.baselines.entries()].find(([entry])=>entry.includes('partial-view:v10'))!;const saved=value as {quotes:unknown[][]};state.baselines.set(key.replace('partial-view:v10','partial-view:v4'),{...saved,identities:undefined});state.baselines.delete(key);state.entries.clear();state.tables.nfl_odds_snapshot_history=[];const result=await(await request()).json();assert.equal(result.quotes[0][8],-140);assert.equal(result.quotes[0][9],'2020-11-02T21:29:00.000Z');assert.deepEqual(result.identities,[])})
test('unavailable selections retain requested market and book without substituting quotes',async()=>{reset();const missingBook=await(await request('receiving_yards','draftkings')).json();assert.equal(missingBook.market,'receiving_yards');assert.equal(missingBook.book,'draftkings');assert.deepEqual(missingBook.quotes,[]);assert.deepEqual(missingBook.books,['fanduel']);const missingMarket=await(await request('passing_tds','fanduel')).json();assert.equal(missingMarket.market,'passing_tds');assert.equal(missingMarket.book,'fanduel');assert.deepEqual(missingMarket.quotes,[]);assert.deepEqual(missingMarket.markets,['receiving_yards']);assert.equal(state.reads,2)})
test('direct parser initialization is never treated as an opening',async()=>{reset();state.tables.nfl_odds_snapshot_history=[];state.tables.nfl_fanduel_capture_history=[sample('2020-11-02T21:30:00.000Z','2020-11-02T21:29:00.000Z',-120,3)];const result=await(await request()).json();assert.equal(result.quotes.length,1);assert.equal(result.quotes[0][12],null)})
test('opening conflicts do not revive an older cached opening',async()=>{reset();await request();for(const key of state.entries.keys())if(key.includes('candidate')||key.includes('partial-view'))state.entries.delete(key);const changed=sample('2020-11-02T21:45:00.000Z','2020-11-02T21:44:00.000Z',-130);changed.board.players[0].markets[0].offers[0].opening.odds=400;state.tables.nfl_odds_snapshot_history=[changed];const result=await(await request()).json();assert.equal(result.games[0].status,'incomplete');assert.equal(result.quotes[0][12],null);assert.equal(result.quotes[0][13],true)})
test('the v3 last-seen baseline survives rollout without inventing an opening',async()=>{reset();await request();const [key,value]=[...state.baselines.entries()].find(([entry])=>entry.includes('partial-view:v10'))!;const saved=value as {quotes:unknown[][]};state.baselines.set(key.replace('partial-view:v10','partial-view:v3'),{...saved,quotes:saved.quotes.map(quote=>quote.slice(0,12))});state.baselines.delete(key);state.entries.clear();state.tables.nfl_odds_snapshot_history=[];const result=await(await request()).json();assert.equal(result.games[0].status,'incomplete');assert.equal(result.quotes[0][8],-140);assert.equal(result.quotes[0][9],'2020-11-02T21:29:00.000Z');assert.equal(result.quotes[0][12],null);assert.equal(result.quotes[0][13],false)})
test('an earlier corrected cutoff during the load rejects the entire response',async()=>{reset();state.cutoffs=[cutoff,older];const response=await request();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Test|receiving_yards/)})
test('truncated durable cutoff rows fail closed',async()=>{reset();state.truncated=true;assert.equal((await request()).status,503);assert.equal(state.reads,0)})
test('a frame or quote after the cutoff never leaves the endpoint',async()=>{reset();state.cutoffs=[older];state.tables.nfl_odds_snapshot_history=[sample('2020-11-02T22:30:00.000Z','2020-11-02T22:29:00.000Z',-140),sample('2020-11-02T21:30:00.000Z','2020-11-02T22:10:00.000Z',-110)];const result=await (await request()).json();assert.equal(result.quotes.length,0)})
test('a post-cutoff player image cannot replace the saved pregame image',async()=>{reset();const after=sample('2020-11-02T23:01:00.000Z','2020-11-02T23:00:01.000Z',-150);after.board.players[0].headshot='https://static.www.nfl.com/later.png';state.tables.nfl_odds_snapshot_history.unshift(after);const result=await(await request()).json();assert.equal(result.identities[0][4],'https://static.www.nfl.com/headshot.png');assert.doesNotMatch(JSON.stringify(result),/later\.png/)})
test('unrepairable direct capture is incomplete, not misclassified',async()=>{reset();state.tables.nfl_fanduel_capture_history=[sample('2020-11-02T21:30:00.000Z','2020-11-02T21:29:00.000Z',-120,2)];const result=await (await request()).json();assert.equal(result.games[0].status,'incomplete');assert.equal(result.quotes.length,1)})
test('oversized historical frame is unavailable without slicing',async()=>{reset();const value=sample('2020-11-02T21:30:00.000Z','2020-11-02T21:29:00.000Z',-120);value.board.players=Array.from({length:161},()=>value.board.players[0]);state.tables.nfl_odds_snapshot_history=[value];const result=await (await request()).json();assert.equal(result.games[0].status,'unavailable');assert.equal(result.quotes.length,0)})
test('a later incomplete frame cannot withdraw or restamp the previously saved quote',async()=>{reset();const first=await (await request()).json();for(const key of state.entries.keys())if(key.includes('candidate')||key.includes('partial-view'))state.entries.delete(key);state.tables.nfl_odds_snapshot_history=[];const next=await (await request()).json();assert.equal(next.games[0].status,'incomplete');assert.equal(next.quotes[0][8],first.quotes[0][8]);assert.equal(next.quotes[0][9],first.quotes[0][9])})
test('an earlier cutoff rejects an already-cached partial view',async()=>{reset();await request();state.cutoffs=[older];state.clocks=0;assert.equal((await request()).status,503)})
test('a conflicting quote at the same timestamp cannot replace the saved observation',async()=>{reset();const first=await (await request()).json();for(const key of state.entries.keys())if(key.includes('candidate')||key.includes('partial-view'))state.entries.delete(key);state.tables.nfl_odds_snapshot_history=[sample('2020-11-02T22:00:00.000Z','2020-11-02T21:29:00.000Z',-150)];const next=await (await request()).json();assert.equal(next.games[0].status,'incomplete');assert.equal(next.quotes[0][8],first.quotes[0][8]);assert.equal(next.quotes[0][9],first.quotes[0][9])})
test('cached observations with an unrelated game team fail closed',async()=>{reset();await request();for(const key of state.entries.keys())if(key.includes('candidate')||key.includes('partial-view'))state.entries.delete(key);for(const value of state.baselines.values()){const pool=value as {quotes:Array<Array<string|number|null>>};pool.quotes[0][3]='NYJ'};assert.equal((await request()).status,503)})

test('saved Rams and Washington aliases populate prices, artwork and public counts after kickoff', async () => {
  reset()
  state.aliasedMatchup = true
  const history = state.tables.nfl_odds_snapshot_history
  const recent = history[0].board as SidelineOddsBoard
  const prior = history[1].board as SidelineOddsBoard
  recent.players[0].team = 'LAR'
  prior.players[0].team = 'LA'
  recent.players.push({ ...structuredClone(recent.players[0]), id: 5, team: 'WSH', name: 'Washington Player' })
  recent.players.push({ ...structuredClone(recent.players[0]), id: 6, team: 'BAL', name: 'Unrelated Player' })
  recent.picksCapturedAt = '2020-11-02T21:00:00.000Z'
  for (const player of recent.players.slice(0, 2)) player.publicPicks = [{
    propType: 'receiving_yards', label: 'Receiving', rawMarket: 'Receiving',
    line: 25, side: 'over', kind: 'milestone', picks: 42, capturedAt: recent.picksCapturedAt,
  }]
  state.archive = { value: recent, observedAt: history[0].captured_at }
  const result = await (await request()).json()
  assert.deepEqual(result.quotes.map((row: unknown[]) => [row[1],row[3],row[8],row[10],row[12]]), [
    [4,'LA',-140,-110,300],[5,'WAS',-140,null,300],
  ])
  assert.deepEqual(result.identities.map((row: unknown[]) => row[3]), ['LA','WAS'])
  assert.deepEqual(result.picks.map((row: unknown[]) => [row[2],row[6],row[7]]), [['LA',42,false],['WAS',42,false]])
  assert.equal(recent.players[0].team, 'LAR')
  assert.equal(recent.players[1].team, 'WSH')
})
