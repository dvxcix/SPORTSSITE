import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as paint from '../src/lib/nbaPaint.ts'
import * as metrics from '../src/lib/nbaMarketMetrics.ts'
import * as selection from '../src/lib/nbaMarketSelection.ts'
import * as mode from '../src/lib/nbaOddsMode.ts'
import { nbaSlateRows } from '../src/lib/nbaSlate.ts'
import * as marketSignal from '../src/lib/nbaMarketSignal.ts'
import * as slateHeat from '../src/lib/nbaSlateHeat.ts'
import * as models from '../src/lib/nbaModel.ts'

const tip = Date.parse('2026-10-25T23:00:00Z')
const team = { id: 1, abbreviation: 'A', full_name: 'Team A', name: 'A' }
const game = (id: number, start = tip): paint.PaintGame => ({ id, date: '2026-10-25', season: 2026, datetime: new Date(start).toISOString(), status: 'Scheduled', status_state: 'scheduled', period: 0, home_team: team, visitor_team: { ...team, id: 2 }, home_team_score: 0, visitor_team_score: 0 })
function player(id: number, gameId: number, performance: number, line: number): paint.PaintPlayer {
  const logs = Array.from({ length: 10 }, (_, i): paint.PaintStat => ({ id: id * 100 + i, player: { id }, team: { id: 1 }, game: { id: 900 + i, date: '2026-10-01', status: 'Final', status_state: 'final', home_team_id: 1, visitor_team_id: 2 }, min: '30', pts: performance, reb: 5, ast: 5, fg3m: 2, stl: 0, blk: 0, turnover: 1, fga: 10, fgm: 5, fg3a: 3, fta: 2, ftm: 2 }))
  const quote = (vendor: string, market: string, target: number, odds = 100): paint.PaintProp => ({ id, game_id: gameId, player_id: id, vendor, prop_type: market, line_value: String(target), market: { type: 'milestone', odds }, updated_at: new Date(tip - 60_000).toISOString() })
  return { id, first_name: 'Player', last_name: String(id), position: 'G', team, headshot: null, injury: null, average: { pts: performance, points_1q: performance / 4 }, logs, periodLogs: logs.map(log => ({ ...log, period: 1, pts: performance / 4 })), props: [quote('fanduel', 'points', line), quote('draftkings', 'points', 25, id === 1 ? 300 : 100), quote('fanduel', 'points_1q', line / 4)] }
}
const boards = (): paint.PaintBoard[] => [
  { game: game(101), players: [player(1, 101, 40, 30), player(2, 101, 10, 10)], sampleSeason: 2026, historical: false, sampleEnd: '2026-10-24', fetchedAt: new Date(tip - 60_000).toISOString(), issues: [], statsComplete: true, periodStatsComplete: true },
  { game: game(102, tip + 3_600_000), players: [player(3, 102, 20, 20), player(4, 102, 30, 40)], sampleSeason: 2026, historical: false, sampleEnd: '2026-10-24', fetchedAt: new Date(tip - 60_000).toISOString(), issues: [], statsComplete: true, periodStatsComplete: true },
]
async function fixture() {
  let now = tip - 30_000, crossing = false, reads = 0, writes = 0
  const archive = new Map<string, { value: unknown; observedAt: string; source: 'capture'; frozen: boolean }>()
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const output = ts.transpileModule(await readFile(new URL('../src/lib/nbaSlateFreezeData.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const imports: Record<string, unknown> = {
    'server-only': {}, 'node:crypto': crypto, './nbaPaint': paint, './nbaMarketMetrics': metrics, './nbaMarketSelection': selection, './nbaModel':models, './nbaSlateHeat':slateHeat,
    './nbaOddsMode': { ...mode, nbaPregameOpen: (g: paint.PaintGame) => mode.nbaPregameOpen(g, now) },
    './nbaPregameResearchData': {
      readNbaPregameResearch: async (g: paint.PaintGame, resource: string) => { reads++; return archive.get(g.id + ':' + resource) ?? null },
      saveNbaPregameResearch: async (g: paint.PaintGame, resource: string, entry: { value: unknown; observedAt: string }) => {
        if (crossing) now = tip + 1
        const key = g.id + ':' + resource, old = archive.get(key)
        if (!mode.nbaPregameOpen(g, now) || old && old.observedAt >= entry.observedAt) return old ?? null
        writes++; const saved = { ...structuredClone(entry), source: 'capture' as const, frozen: false }; archive.set(key, saved); return saved
      },
    },
  }
  const target = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', 'Buffer', output)((key: string) => { assert.ok(key in imports, key); return imports[key] }, target, target.exports, Clock, Buffer)
  return { api: target.exports as typeof import('../src/lib/nbaSlateFreezeData.ts'), archive, time: (n: number) => { now = n }, cross: () => { crossing = true }, counts: () => ({ reads, writes }) }
}

test('earlier matchup keeps the whole-slate MM pool while a later game refreshes', async () => {
  const h = await fixture(), initial = boards(), games = initial.map(board => board.game)
  await h.api.captureNbaSlatePools(games, initial, true)
  const before = await h.api.getNbaSlateRanks(games, initial, 'points', 'fanduel', undefined, 'pregame', true)
  assert.equal(before.ranks.get('101:1'), 1, 'whole-slate result differs from a matchup-only rank')
  h.time(tip + 1000)
  const changed = structuredClone(initial)
  changed[1].players[0].props[0].line_value = '100'
  const after = await h.api.getNbaSlateRanks(games, changed, 'points', 'fanduel', undefined, 'pregame', true)
  assert.equal(after.ranks.get('101:1'), before.ranks.get('101:1'))
  assert.equal(after.ranks.get('101:2'), before.ranks.get('101:2'))
  assert.notEqual(after.ranks.get('102:3'), before.ranks.get('102:3'))
  assert.deepEqual(after.unavailable, [])
})

test('all books and exact contract targets replay from the same unfiltered frozen pool', async () => {
  const h = await fixture(), initial = boards(), games = initial.map(board => board.game)
  await h.api.captureNbaSlatePools(games, initial, true)
  const filters = { type: 'milestone' as const, line: 25 }
  const before = await h.api.getNbaSlateRanks(games, initial, 'points', 'draftkings', filters, 'pregame', true)
  h.time(tip + 1)
  const changed = structuredClone(initial); changed[1].players.forEach(player => { player.props = [] })
  const after = await h.api.getNbaSlateRanks(games, changed, 'points', 'draftkings', filters, 'pregame', true)
  assert.equal(after.ranks.get('101:1'), before.ranks.get('101:1'))
  assert.ok(after.ranks.has('101:1'))
  assert.equal((await h.api.getNbaSlateRanks(games, changed, 'points', 'fanduel', filters, 'pregame', true)).ranks.has('101:1'), false)
})

test('missing post-tip pool withholds MM instead of borrowing the current slate or matchup', async () => {
  const h = await fixture(), b = boards(), games = b.map(board => board.game)
  h.time(tip + 1)
  const result = await h.api.getNbaSlateRanks(games, b, 'points', 'fanduel', undefined, 'pregame', true)
  assert.deepEqual(result.unavailable, [101]); assert.equal(result.ranks.has('101:1'), false); assert.ok(result.ranks.has('102:3'))
})

test('partial full slate never replaces a complete capture; quarter failures are independent', async () => {
  const h = await fixture(), b = boards(), games = b.map(board => board.game)
  await h.api.captureNbaSlatePools(games, b, true)
  const originalQuarter = structuredClone(h.archive.get('101:slate-mm-q1:v1'))
  h.time(tip - 20_000)
  b[1].periodStatsComplete = false
  await h.api.captureNbaSlatePools(games, b, true)
  assert.deepEqual(h.archive.get('101:slate-mm-q1:v1'), originalQuarter)
  assert.notEqual(h.archive.get('101:slate-mm-full:v1')?.observedAt, originalQuarter?.observedAt)
  const writes = h.counts().writes
  await h.api.captureNbaSlatePools(games, b.slice(0, 1), false)
  assert.equal(h.counts().writes, writes)
})

test('response crossing tip cannot introduce a new frozen pool', async () => {
  const h = await fixture(), b = boards(), games = b.map(board => board.game)
  h.cross()
  await h.api.captureNbaSlatePools(games, b, true)
  assert.equal(h.archive.has('101:slate-mm-full:v1'), false)
  assert.deepEqual((await h.api.getNbaSlateRanks(games, b, 'points', 'fanduel', undefined, 'pregame', true)).unavailable, [101])
})

test('Live bypasses frozen research and frozen MM survives unrelated partial current coverage', async () => {
  const h = await fixture(), b = boards(), games = b.map(board => board.game)
  await h.api.captureNbaSlatePools(games, b, true); h.time(tip + 1)
  const before = h.counts().reads
  await h.api.getNbaSlateRanks(games, b, 'points', 'fanduel', undefined, 'live', true)
  assert.equal(h.counts().reads, before)
  const frozen = await h.api.getNbaSlateRanks(games, b, 'points', 'fanduel', undefined, 'pregame', false)
  assert.equal(frozen.ranks.get('101:1'), 1); assert.equal(frozen.ranks.has('102:3'), false)
  const rows = nbaSlateRows(b, 'points', 'fanduel', 'over', false, [], [], [], { ranks: frozen.ranks })
  assert.equal(rows.find(row => row.player.id === 1)?.mm, 1); assert.equal(rows.find(row => row.player.id === 3)?.mm, null)
})

test('pool capture keeps exact historical identities, periods and quote timestamps', async () => {
  const h = await fixture(), b = boards(), games = b.map(board => board.game)
  b[0].players[0].logs.push({ ...b[0].players[0].logs[0], game: { ...b[0].players[0].logs[0].game, id: 101, date: '2026-10-25' }, pts: 999 })
  b[0].players[0].props.push({ ...b[0].players[0].props[0], updated_at: new Date(tip + 1).toISOString() })
  const full = h.api.nbaSlatePoolPlayers(h.api.nbaSlatePool(games, b, true, 0, new Date(tip - 30_000).toISOString())!)
  const quarter = h.api.nbaSlatePoolPlayers(h.api.nbaSlatePool(games, b, true, 1, new Date(tip - 30_000).toISOString())!)
  assert.equal(full[0].logs.length, 10); assert.equal(full[0].periodLogs?.length, 0)
  assert.ok(full[0].props.every(prop => !prop.prop_type.endsWith('_1q') && Date.parse(prop.updated_at) < tip))
  assert.equal(quarter[0].logs.length, 0); assert.equal(quarter[0].periodLogs?.length, 10)
  assert.equal(h.api.nbaSlatePool([games[0], games[0]], b, true, 0, new Date(tip - 1).toISOString()), null)
})

test('legacy recovery is exact-filter only and rejects wrong or post-observation quotes', async () => {
  const h=await fixture(), b=boards(), g=b[0].game, filter={type:'milestone' as const,line:30}
  const key='101:'+h.api.nbaLegacySlateResource(g.date,'points','fanduel','over',filter)
  const value={date:g.date,market:'points',book:'fanduel',side:'over',type:'milestone',target:30,complete:true,gameIds:[101,102],rows:nbaSlateRows([b[0]],'points','fanduel','over',true).filter(row=>row.player.id===1)}
  h.archive.set(key,{value,observedAt:new Date(tip-30_000).toISOString(),source:'capture',frozen:true})
  assert.equal(await h.api.getNbaLegacySlateRows(g,'points','fanduel','over',filter),null,'future game cannot consume a recovered closed snapshot')
  h.time(tip+1)
  assert.equal((await h.api.getNbaLegacySlateRows(g,'points','fanduel','over',filter))?.value.rows[0].mm,value.rows[0].mm)
  assert.equal(await h.api.getNbaLegacySlateRows(g,'points','fanduel','under',filter),null)
  assert.equal(await h.api.getNbaLegacySlateRows(g,'points','all','over',filter),null)
  assert.equal(await h.api.getNbaLegacySlateRows(g,'points','fanduel','over',{type:'milestone',line:25}),null)
  value.rows[0].offer.updated_at=new Date(tip-10_000).toISOString()
  assert.equal(await h.api.getNbaLegacySlateRows(g,'points','fanduel','over',filter),null)
})

async function routeFixture() {
  const h=await fixture(), initial=boards(), source=boards(), cached=new Map<string,unknown>(), observations=new Map<string,unknown>()
  let now=tip-30_000, marker=1, failContext=false, failDefense=false, failModels=false, crossing=false, captures=0, failFinalBoard=false, crossDuringRank=false,priceHook:(()=>void)|undefined
  const time=(n:number)=>{now=n;h.time(n)}
  class Clock extends Date { constructor(value:string|number=now){super(value)} static now(){return now} }
  async function resource(board:paint.PaintBoard,key:string,live:string,load:()=>unknown){
    const identity=board.game.id+':'+key
    if(live!=='live'&&!mode.nbaPregameOpen(board.game,now)){if(!observations.has(identity))throw new Error('missing archive');return structuredClone(observations.get(identity))}
    const value=load();if(live!=='live')observations.set(identity,structuredClone(value));return value
  }
  const output=ts.transpileModule(await readFile(new URL('../src/app/the-paint/slate/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const imports:Record<string,unknown>={
    'next/server':{NextResponse:{json:(value:unknown,init?:{status?:number})=>({status:init?.status??200,value})}},
    '@/lib/paintAccess':{requirePaintAccess:async()=>({})},
    '@/lib/nbaOddsMode':{...mode,nbaPregameOpen:(g:paint.PaintGame)=>mode.nbaPregameOpen(g,now),nbaLiveOpen:(g:paint.PaintGame)=>mode.nbaLiveOpen(g,now)},
    '@/lib/nbaMarketSelection':selection,'@/lib/nbaPaint':paint,
    '@/lib/nbaOddsClockData':{getNbaOddsGame:async(g:paint.PaintGame)=>g},
    '@/lib/nbaPaintData':{
      getPaintSchedule:async()=>({date:'2026-10-25',complete:true,games:source.map(board=>board.game)}),
      getPaintBoard:async(g:paint.PaintGame,live:string)=>{if(failFinalBoard&&live!=='live'&&!mode.nbaPregameOpen(g,now))throw new Error('missing final board');return structuredClone((live!=='live'&&!mode.nbaPregameOpen(g,now)?initial:source).find(board=>board.game.id===g.id))},
      refreshPaintBoardPrices:async(b:paint.PaintBoard)=>{priceHook?.();return structuredClone(b)},
    },
    '@/lib/nbaSharedCache':{nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{if(!cached.has(key))cached.set(key,(async()=>({value:await load(),fetchedAt:new Date(now).toISOString(),stale:false}))());return await cached.get(key)}},
    '@/lib/nbaResearchResources':{
      getNbaResearchModels:async(b:paint.PaintBoard,live:string)=>{if(failModels)throw new Error('missing model');return resource(b,'models',live,()=>[])},
      getNbaResearchDefense:async(b:paint.PaintBoard,live:string)=>{if(failDefense)throw new Error('missing defense');return resource(b,'defense',live,()=>({ready:true,profiles:[]}))},
      getNbaResearchMarketContext:async(b:paint.PaintBoard,live:string)=>{if(crossing)time(tip+1);if(failContext)throw new Error('missing context');return resource(b,'market',live,()=>({gameId:b.game.id,marker}))},
    },
    '@/lib/nbaSlate':{nbaSlateRows},
    '@/lib/nbaSlateHeat':slateHeat,
    '@/lib/nbaSlateFreezeData':{...h.api,captureNbaSlatePools:async(...args:Parameters<typeof h.api.captureNbaSlatePools>)=>{captures++;return h.api.captureNbaSlatePools(...args)},getNbaSlateRanks:async(...args:Parameters<typeof h.api.getNbaSlateRanks>)=>{const result=await h.api.getNbaSlateRanks(...args);if(crossDuringRank){crossDuringRank=false;time(tip+1)}return result}},
    '@/lib/nbaMarketSignal':{...marketSignal,nbaPlayerMarketSignals:({context}:{context:{marker:number}|null})=>({...marketSignal.nbaMarketSupport(),reason:context?'original '+context.marker:'missing'})},
    '@/lib/nbaIntelligence':{nbaContextualScore:(base:number|null,_player:number,_market:string,_date:string,{context}:{context:{marker:number}|null})=>({score:base==null?null:base+(context?.marker??0),marketSupport:{...marketSignal.nbaMarketSupport(),reason:context?'original '+context.marker:'missing'}})},
  }
  const target={exports:{}}
  new Function('require','module','exports','Date',output)((key:string)=>{assert.ok(key in imports,key);return imports[key]},target,target.exports,Clock)
  const api=target.exports as {GET:(request:unknown)=>Promise<{status:number;value:any}>}
  return {...h,source,finalBoards:initial,time,marker:(n:number)=>{marker=n},finalResource:(gameId:number,key:string,value:unknown)=>observations.set(gameId+':'+key,value),fail:(parts:{context?:boolean;defense?:boolean;models?:boolean;board?:boolean})=>{failContext=!!parts.context;failDefense=!!parts.defense;failModels=!!parts.models;failFinalBoard=!!parts.board},cross:()=>{crossing=true},crossInRanks:()=>{crossDuringRank=true},onPrice:(hook:()=>void)=>{priceHook=hook},captures:()=>captures,get:(params='')=>api.GET({nextUrl:new URL('https://example.test/the-paint/slate?date=2026-10-25&market=points&book=fanduel&side=over'+params)}),getQuery:(query:string)=>api.GET({nextUrl:new URL('https://example.test/the-paint/slate?date=2026-10-25&'+query)})}
}

test('mixed book and target requests share one full-slate capture without sharing filtered rows',async()=>{
  const h=await routeFixture()
  for(const board of h.source)for(const player of board.players)player.props.push({...structuredClone(player.props[0]),prop_type:'rebounds',line_value:'5'})
  const [fanduel,draftkings,rebounds]=await Promise.all([
    h.getQuery('market=points&book=fanduel&side=over&contract=milestone&target=30'),
    h.getQuery('market=points&book=draftkings&side=over&contract=milestone&target=25'),
    h.getQuery('market=rebounds&book=fanduel&side=over&contract=milestone&target=5'),
  ])
  assert.equal(fanduel.status,200);assert.equal(draftkings.status,200);assert.equal(rebounds.status,200);assert.equal(h.captures(),1)
  assert.ok(fanduel.value.rows.length);assert.ok(draftkings.value.rows.length);assert.ok(rebounds.value.rows.length)
  assert.ok(fanduel.value.rows.every((row:any)=>row.offer.vendor==='fanduel'&&Number(row.offer.line_value)===30))
  assert.ok(draftkings.value.rows.every((row:any)=>row.offer.vendor==='draftkings'&&Number(row.offer.line_value)===25))
  assert.ok(rebounds.value.rows.every((row:any)=>row.market==='rebounds'&&row.offer.prop_type==='rebounds'))
  const under=await h.getQuery('market=points&book=draftkings&side=under&contract=milestone&target=25')
  assert.equal(under.status,200);assert.equal(h.captures(),1)
})

test('full-game and quarter markets share slate inputs while live stays isolated',async()=>{
  const h=await routeFixture()
  assert.equal((await h.get()).status,200);assert.equal(h.captures(),1)
  const quarter=await h.getQuery('market=points_1q&book=fanduel&side=over')
  assert.equal(quarter.status,200);assert.ok(quarter.value.rows.length);assert.equal(h.captures(),1)
  assert.equal((await h.get('&mode=live')).status,200);assert.equal(h.captures(),1)
})

test('shared slate computes full and quarter completeness separately and preserves partial quarter archive',async()=>{
  const h=await routeFixture();h.source[1].periodStatsComplete=false
  const [full,quarter]=await Promise.all([h.get(),h.getQuery('market=points_1q&book=fanduel&side=over')])
  assert.equal(full.status,200);assert.equal(quarter.status,200);assert.equal(h.captures(),1)
  assert.equal(full.value.complete,true);assert.equal(quarter.value.complete,false)
  assert.ok(h.archive.has('101:slate-mm-full:v1'));assert.equal(h.archive.has('101:slate-mm-q1:v1'),false)
})

test('legacy boards without quarter coverage never claim a complete quarter or invent a frozen pool',async()=>{
  const h=await routeFixture();delete h.source[1].periodStatsComplete
  const [full,quarter]=await Promise.all([h.get(),h.getQuery('market=points_1q&book=fanduel&side=over')])
  assert.equal(full.status,200);assert.equal(quarter.status,200);assert.equal(h.captures(),1)
  assert.equal(full.value.complete,true);assert.equal(quarter.value.complete,false)
  assert.ok(h.archive.has('101:slate-mm-full:v1'));assert.equal(h.archive.has('101:slate-mm-q1:v1'),false)
  h.time(tip+1)
  const closed=await h.getQuery('market=points_1q&book=fanduel&side=over')
  assert.equal(closed.status,200);assert.equal(closed.value.complete,false)
  assert.ok(closed.value.frozenMmUnavailable.includes(101))
})

test('shared filter universe still freezes each game before a later filter request',async()=>{
  const h=await routeFixture()
  const [first,prior]=await Promise.all([
    h.getQuery('market=points&book=fanduel&side=over&contract=milestone&target=30'),
    h.getQuery('market=points&book=draftkings&side=over&contract=milestone&target=25'),
  ])
  assert.equal(first.status,200);assert.equal(prior.status,200);assert.equal(h.captures(),1)
  const original=prior.value.rows.find((row:any)=>row.game.id===101&&row.player.id===1)
  assert.ok(original)
  h.time(tip+1);h.source[0].players[0].props[1].market.odds=900
  const after=await h.getQuery('market=points&book=draftkings&side=over&contract=milestone&target=25')
  const frozen=after.value.rows.find((row:any)=>row.game.id===101&&row.player.id===1)
  assert.equal(after.status,200);assert.equal(frozen.offer.market.odds,original.offer.market.odds)
  assert.equal(frozen.mm,original.mm);assert.ok(frozen.researchObservedAt)
})

test('quarter market reuses a full-game load but keeps the earlier game frozen across tip',async()=>{
  const h=await routeFixture()
  const full=await h.get(),before=await h.getQuery('market=points_1q&book=fanduel&side=over')
  assert.equal(full.status,200);assert.equal(before.status,200);assert.equal(h.captures(),1)
  const original=before.value.rows.find((row:any)=>row.game.id===101&&row.player.id===1)
  assert.ok(original)
  h.time(tip+1);h.source[0].players[0].props[2].line_value='100'
  const after=await h.getQuery('market=points_1q&book=fanduel&side=over')
  const frozen=after.value.rows.find((row:any)=>row.game.id===101&&row.player.id===1)
  assert.equal(after.status,200);assert.equal(frozen.offer.line_value,original.offer.line_value)
  assert.equal(frozen.mm,original.mm);assert.ok(frozen.researchObservedAt)
})

test('shared partial slate is incomplete for each filter and is never captured',async()=>{
  const h=await routeFixture();h.source[1].statsComplete=false
  const [first,second]=await Promise.all([h.get(),h.getQuery('market=points&book=draftkings&side=over')])
  assert.equal(first.status,200);assert.equal(second.status,200)
  assert.equal(first.value.complete,false);assert.equal(second.value.complete,false)
  assert.equal(h.archive.size,0)
})

test('slate response keeps closed score, market context and MM while later source changes',async()=>{
  const h=await routeFixture(),before=await h.get()
  assert.equal(before.status,200)
  h.marker(99);h.time(tip+1);h.source[1].players[0].props[0].line_value='100'
  const after=await h.get(),first=before.value.rows.find((row:any)=>row.player.id===1),closed=after.value.rows.find((row:any)=>row.player.id===1)
  assert.equal(after.status,200);assert.equal(closed.score,first.score);assert.equal(closed.mm,first.mm);assert.deepEqual(closed.marketSupport,first.marketSupport);assert.deepEqual(closed.marketSignals,first.marketSignals)
  assert.notEqual(after.value.rows.find((row:any)=>row.player.id===3).score,before.value.rows.find((row:any)=>row.player.id===3).score)
  assert.equal(closed.researchObservedAt,new Date(tip-30_000).toISOString())
  assert.deepEqual(closed.frozenHeat,{average:100,estimate:null,gap:100})
  assert.equal('boards'in after.value,false);assert.equal('reports'in after.value,false);assert.equal('defense'in after.value,false);assert.equal('signalOffers'in closed,false)
})

test('missing historical optional resources do not erase a closed slate MM',async()=>{
  const h=await routeFixture();await h.get();h.time(tip+1);h.fail({context:true,defense:true,models:true})
  const response=await h.get(),row=response.value.rows.find((row:any)=>row.player.id===1)
  assert.equal(response.status,200);assert.equal(row.mm,1);assert.equal(row.score,null);assert.equal(row.estimate,null)
  assert.ok(row.issues.some((issue:string)=>issue.includes('score unavailable')))
  assert.equal(row.marketSignals.status,'unavailable')
})

test('slate warm response crossing tip resolves frozen ranks, while Live skips capture',async()=>{
  const h=await routeFixture();await h.get();h.source[1].players[0].props[0].line_value='100';h.cross()
  const crossed=await h.get(),row=crossed.value.rows.find((row:any)=>row.player.id===1)
  assert.equal(crossed.status,200);assert.equal(row.mm,1);assert.ok(row.researchObservedAt)
  const captures=h.captures();h.marker(3);const live=await h.get('&mode=live')
  assert.equal(live.status,200);assert.equal(h.captures(),captures);assert.equal(live.value.rows.find((item:any)=>item.player.id===1).researchObservedAt,undefined)
})

test('recovered exact-filter row retains its original contract and metrics without missing extras',async()=>{
  const h=await routeFixture(),b=boards(),g=b[0].game,raw=nbaSlateRows([b[0]],'points','fanduel','over',true)
  raw[0].score=77;raw[0].estimate=33;raw[0].mm=6
  h.archive.set('101:'+h.api.nbaLegacySlateResource(g.date,'points','fanduel','over'),{value:{date:g.date,market:'points',book:'fanduel',side:'over',type:'auto',target:'auto',complete:true,gameIds:[101,102],rows:raw},observedAt:new Date(tip-30_000).toISOString(),source:'capture',frozen:true})
  h.time(tip+1);h.fail({context:true,defense:true,models:true})
  const response=await h.get(),row=response.value.rows.find((item:any)=>item.player.id===raw[0].player.id)
  assert.equal(response.status,200);assert.equal(row.score,77);assert.equal(row.estimate,33);assert.equal(row.mm,6);assert.deepEqual(row.offer,raw[0].offer)
  assert.deepEqual(response.value.recoveredSlateGames,[101]);assert.deepEqual(response.value.frozenMmUnavailable,[])
  assert.equal(row.marketSignals.status,'unavailable');assert.ok(row.marketSignals.reason.includes('not captured'))
  assert.deepEqual(row.frozenHeat,{average:null,estimate:null,gap:null},'missing original column domain stays neutral')
  const wrong=await h.get('&contract=milestone&target=30')
  assert.ok(wrong.value.frozenMmUnavailable.includes(101));assert.equal(wrong.value.rows.find((item:any)=>item.player.id===1).mm,null)
})

test('all original heat domains, including validated projections, stay tied to the anchor pool',async()=>{
  const h=await fixture(),b=boards(),games=b.map(board=>board.game)
  const report={ready:true,market:'points',version:'nba-rolling-v1',trainingGames:1000,validationGames:200,trainedThrough:'2025-04-01',validationThrough:'2026-04-01',method:'last10'} as models.NbaModelReport
  await h.api.captureNbaSlatePools(games,b,true,undefined,games.map(game=>({gameId:game.id,reports:[report]})))
  const pool=h.archive.get('101:slate-mm-full:v1')?.value as any
  assert.equal(pool.models.reports.length,1,'equivalent model payloads stored once per pool')
  h.time(tip+1);b[1].players[0].logs.forEach(log=>{log.pts=900});b[1].players[0].average.pts=900;b[1].players[0].props[0].line_value='900'
  const frozen=await h.api.getNbaSlateRanks(games,b,'points','fanduel',undefined,'pregame',true)
  assert.deepEqual(frozen.heatDomains[101],{average:[10,40],estimate:[10,40],gap:[-9.5,10.5]})
  const levels=slateHeat.nbaSlateFrozenHeat({average:20,estimate:20,gap:-5.25},frozen.heatDomains[101])
  assert.ok(Math.abs(levels.average!-100/3)<1e-12);assert.ok(Math.abs(levels.estimate!-100/3)<1e-12);assert.equal(levels.gap,25)
  assert.deepEqual(slateHeat.nbaSlateHeatDomains([{average:1,estimate:null,gap:0},{average:1,estimate:NaN,gap:0}]),{average:null,estimate:null,gap:null})
})

test('a warm slate crossing tip uses another writer’s final board, model and defense together with its final MM',async()=>{
  const h=await routeFixture(),before=await h.get(),board=h.finalBoards[0]
  h.time(tip-1000)
  board.players[0].logs.forEach(log=>{log.pts=70});board.players[0].average.pts=70;board.fetchedAt=new Date(tip-1000).toISOString()
  const report={ready:true,market:'points',version:'nba-rolling-v1',trainingGames:1000,validationGames:200,trainedThrough:'2025-04-01',validationThrough:'2026-04-01',method:'last10'} as models.NbaModelReport
  const profiles=[{teamId:2,position:'G',market:'points',games:20,minutes:900,per48:40,leaguePer48:20,allowance:1}]
  h.finalResource(101,'models',[report]);h.finalResource(101,'defense',{ready:true,profiles});h.finalResource(101,'market',{gameId:101,marker:9})
  await h.api.captureNbaSlatePools(h.finalBoards.map(board=>board.game),h.finalBoards,true,undefined,[{gameId:101,reports:[report]},{gameId:102,reports:[]}])
  h.cross()
  const response=await h.get(),row=response.value.rows.find((item:any)=>item.player.id===1)
  const expected=nbaSlateRows(h.finalBoards,'points','fanduel','over',true,[],[{gameId:101,profiles:profiles as any}],[],{ranks:new Map(),reports:[{gameId:101,reports:[report]}]}).find(item=>item.player.id===1)!
  assert.equal(response.status,200);assert.equal(row.average,70);assert.equal(row.estimate,70);assert.equal(row.score,expected.baseScore!+9)
  assert.notEqual(row.average,before.value.rows.find((item:any)=>item.player.id===1).average)
  const final=await h.api.getNbaSlateRanks(h.finalBoards.map(board=>board.game),h.finalBoards,'points','fanduel',undefined,'pregame',true)
  assert.equal(row.mm,final.ranks.get('101:1'));assert.equal(row.fetchedAt,board.fetchedAt);assert.equal(row.researchObservedAt,board.fetchedAt)
})

test('a game crossing during rank reads is re-resolved, and unavailable final boards do not reuse the old cache',async()=>{
  const h=await routeFixture();await h.get();h.finalBoards[0].players[0].logs.forEach(log=>{log.pts=77});h.crossInRanks()
  const response=await h.get()
  assert.equal(response.value.rows.find((row:any)=>row.player.id===1).average,77)
  const missing=await routeFixture();await missing.get();missing.fail({board:true});missing.cross()
  const failed=await missing.get()
  assert.equal(failed.status,200);assert.ok(failed.value.rows.every((row:any)=>row.game.id!==101));assert.ok(failed.value.failed.includes(101));assert.ok(failed.value.frozenMmUnavailable.includes(101));assert.equal(failed.value.complete,false);assert.equal(failed.value.loaded,1)
})

test('cold slate capture for a future anchor includes a peer’s final board and models after price waits cross tip',async()=>{
  const h=await routeFixture();let crossed=false
  const report={ready:true,market:'points',version:'nba-rolling-v1',trainingGames:1000,validationGames:200,trainedThrough:'2025-04-01',validationThrough:'2026-04-01',method:'last10'} as models.NbaModelReport
  h.onPrice(()=>{
    if(crossed)return;crossed=true
    h.finalBoards[0].players[0].logs.forEach(log=>{log.pts=90});h.finalBoards[0].players[0].average.pts=90
    h.finalResource(101,'models',[report]);h.finalResource(101,'defense',{ready:true,profiles:[]});h.finalResource(101,'market',{gameId:101,marker:4})
    h.time(tip+1)
  })
  const response=await h.get();assert.equal(response.status,200)
  const pool=h.archive.get('102:slate-mm-full:v1')?.value as import('../src/lib/nbaSlateFreezeData.ts').NbaSlatePool
  assert.ok(pool);const players=h.api.nbaSlatePoolPlayers(pool),peer=players.find(player=>player.id===1)!
  assert.equal(peer.average.pts,90);assert.equal(peer.logs[0].pts,90)
  assert.equal(pool.models?.reports[pool.models.games.find(item=>item.gameId===101)!.indexes[0]].method,'last10')
  h.time(tip+3_600_001)
  const frozen=await h.api.getNbaSlateRanks(h.finalBoards.map(board=>board.game),h.finalBoards,'points','fanduel',undefined,'pregame',true)
  assert.equal(frozen.ranks.get('102:3'),metrics.nbaMarketRanks(players,'points','fanduel').get(3)?.mm)
})
