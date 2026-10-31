import * as firstMarkets from '../src/lib/nbaFirstBasketMarkets.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import * as pure from '../src/lib/nbaPaint.ts'
import {watchlistPickPayload} from '../src/lib/nflWatchlist.ts'
import type {WatchlistItem} from '../src/lib/watchlist.ts'

async function compiled(file:string,imports:Record<string,unknown>){
  const source=await readFile(new URL(file,import.meta.url),'utf8')
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}})
  const target={exports:{} as Record<string,unknown>}
  new Function('require','exports','module',outputText)((name:string)=>{if(name==='./nbaSharedCache'&&!(name in imports))return {nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>({value:await load()})};if(name==='./nbaFirstBasketMarkets')return firstMarkets;if(!(name in imports)&&(name==='./nbaFirstBasketFacts'||name==='./nbaFirstBasketOddsData'))return {};assert.ok(name in imports,name);return imports[name]},target.exports,target)
  return target.exports
}
const quote:pure.PaintProp={id:22,player_id:434,game_id:123,vendor:'fanduel',prop_type:'points',line_value:'29.5',market:{type:'over_under',over_odds:350,under_odds:-480},updated_at:'2099-10-20T10:00:00Z'}
type CapturedPost={p_post:{visibility:string;author_id:string;pick_data:Record<string,unknown>};p_picks:Record<string,unknown>[]}
const item=(offer=quote,side:'over'|'under'='over')=>({id:'saved',user_id:'owner',sport:'nba',player_name:'Saved name',team:'OLD',mlb_id:null,headshot_url:null,game_pk:'123',game_date:'2099-10-20',prop_key:pure.nbaSelectionKey(434,offer,side),prop_label:'Saved label',line:'wrong',book:offer.vendor,odds:pure.nbaPrice(offer,side)}) as WatchlistItem
async function harness(options:{offer?:pure.PaintProp;started?:boolean;gate?:number;user?:boolean;failed?:boolean}={}){
  const writes:CapturedPost[]=[], notices:string[]=[]
  let reads=0
  const validator=await compiled('../src/lib/nbaPickValidation.ts',{'server-only':{},'./nbaPaint':pure,'./nbaSupplementalProps':{nbaSupplementalQuote:(quote:{id:number})=>quote.id<=-1_000_000_000_000},'./nbaFirstBasketOddsData':{getNbaFirstOdds:async()=>({rows:[{offer:options.offer??quote}]})},'./nbaPaintData':{
    getPaintGame:async()=>{reads++;return{id:123,date:'2099-10-20',datetime:options.started?'2000-10-20T20:00:00Z':'2099-10-20T20:00:00Z',status_state:'scheduled',home_team:{id:2},visitor_team:{id:9}}},
    getPaintProps:async()=>[options.offer??quote],getPaintIdentity:async()=>({id:434,first_name:'Canonical',last_name:'Player',team:{id:2,abbreviation:'BOS'}}),
  }})
  const route=await compiled('../src/app/api/posts/pick/route.ts',{
    '@/lib/pickGrading':{},'@/lib/nflPickGrading':{},'@/lib/mlbCaptureWindow':{},'@/lib/mlbOffseason':{MLB_HIBERNATING:true},
    'next/server':{NextResponse:{json:Response.json}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.user===false?null:{id:'owner'}}})}})},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name:string,args:CapturedPost)=>{assert.equal(name,'create_tracked_pick_post');writes.push(args);return options.failed?{data:null,error:{message:'transaction failed'}}:{data:{id:'post',picksTracked:true},error:null}}})},
    '@slipsurge/core/mlbSchedule':{},'@slipsurge/core/parlayCalc':{},'@/lib/watchlist':{},'@/lib/mentions':{notifyMentions:async()=>notices.push('mention')},'@/lib/notify':{notifyFollowers:async()=>notices.push('followers')},'@/app/the-sideline/data':{},'@/app/the-sideline/kickoff':{},'@/lib/nflPickOffer':{},'@/lib/nbaPickValidation':validator,'@/lib/paintAccess':{requirePaintAccess:async()=>options.gate?{error:Response.json({},{status:options.gate})}:{userId:'owner'}},
  })
  assert.equal(typeof route.POST,'function')
  const post=route.POST as (request:Request)=>Promise<Response>
  return {writes,notices,get reads(){return reads},post:(body:Record<string,unknown>)=>post(new Request('https://test/api/posts/pick',{method:'POST',body:JSON.stringify(body)}))}
}
const request=(saved=item(),extra:Record<string,unknown>={})=>({sport:'NBA',content:'@follower',visibility:'private',legs:[watchlistPickPayload(saved)],...extra})

test('Only-me saved NBA alt lines preserve exact book, threshold, side and validated identity without broadcasts',async()=>{
  for(const side of ['over','under'] as const){
    const h=await harness(),res=await h.post(request(item(quote,side)))
    assert.equal(res.status,200);assert.equal(h.reads,1);assert.deepEqual(h.notices,[])
    const {p_post,p_picks}=h.writes[0]
    assert.equal(p_post.visibility,'private');assert.equal(p_post.author_id,'owner')
    for(const leg of [p_post.pick_data,p_picks[0]]){
      assert.equal(leg.player_id,'bdl:434');assert.equal(leg.game_pk,'123');assert.equal(leg.numeric_line,29.5)
      assert.equal(leg.market_side,side);assert.equal(leg.odds,side==='over'?350:-480);assert.equal(leg.book,'fanduel')
      assert.equal(leg.player_name,'Canonical Player');assert.equal(leg.line,'29.5');assert.equal(leg.result,'pending')
    }
  }
})
test('Only-me milestone ladder remains inclusive and distinct from an over-under alt',async()=>{
  const offer={...quote,line_value:'30',market:{type:'milestone' as const,odds:350}},h=await harness({offer})
  assert.equal((await h.post(request(item(offer)))).status,200)
  const pick=h.writes[0].p_picks[0]
  assert.equal(pick.numeric_line,30);assert.equal(pick.market_side,'milestone');assert.equal(pick.odds,350)
  assert.equal(h.writes[0].p_post.pick_data.prop_label,'30+ Points')
})
test('Only-me does not bypass NBA access, pregame state, exact price or transaction failure',async()=>{
  for(const [options,status] of [[{gate:403},403],[{user:false},401],[{started:true},409],[{offer:{...quote,market:{...quote.market,over_odds:360}}},409],[{failed:true},503]] as const){
    const h=await harness(options);assert.equal((await h.post(request())).status,status)
    assert.deepEqual(h.notices,[])
    if(!options.failed)assert.equal(h.writes.length,0)
    if(options.gate||options.user===false)assert.equal(h.reads,0)
  }
})
test('Only-me rejects group/page publishing and non-NBA posting before source reads',async()=>{
  for(const extra of [{groupId:'group'},{pageId:'page'},{sport:'NFL'},{sport:'MLB'}]){
    const h=await harness(),res=await h.post(request(item(),extra))
    assert.equal(res.status,'sport'in extra?(extra.sport==='MLB'?503:403):400);assert.equal(h.reads,0);assert.equal(h.writes.length,0);assert.deepEqual(h.notices,[])
  }
})
test('Existing public and followers posting continue their notification behavior',async()=>{
  for(const visibility of ['public','followers']){
    const h=await harness();assert.equal((await h.post(request(item(),{visibility}))).status,200)
    assert.equal(h.writes[0].p_post.visibility,visibility);assert.deepEqual(h.notices,['mention','followers'])
  }
})

test('private first-basket and method picks revalidate the exact current contract before atomic posting',async()=>{
 for(const prop_type of ['first_score','first_field_goal','first_score_dunk']){
  const offer={...quote,prop_type,line_value:'0.5',market:{type:'over_under' as const,over_odds:700}},h=await harness({offer})
  const result=await h.post(request(item(offer)));assert.equal(result.status,200)
  const leg=h.writes[0].p_picks[0];assert.equal(leg.pick_type,prop_type);assert.equal(leg.numeric_line,.5);assert.equal(leg.odds,700);assert.equal(leg.market_side,'over');assert.deepEqual(h.notices,[])
  const changed=await harness({offer:{...offer,market:{...offer.market,over_odds:650}}});assert.equal((await changed.post(request(item(offer)))).status,409);assert.equal(changed.writes.length,0)
 }
})
