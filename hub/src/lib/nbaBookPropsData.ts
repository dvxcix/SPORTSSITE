import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaGameStart, nbaPregameOpen, nbaQuoteInMode } from './nbaOddsMode'
import { nbaValidOdds } from './nbaOddsHistory'
import { PAINT_MARKETS, type PaintGame, type PaintProp } from './nbaPaint'

export type NbaBookPropContract = { market: string; type: 'milestone' | 'over_under'; line: number }
export type NbaBookPropFrame = { gameId: number; book: 'betmgm'; tipoff: string; contract: NbaBookPropContract; observedAt: string; props: PaintProp[]; complete: boolean }
export type NbaBookPropObservation={gameId:number;contractKey:string;market:string;complete:boolean;status:string;observedAt:string|null;props:PaintProp[];unmatched:number}
export type NbaBookPropCoverage={gameId:number;market:string;complete:boolean;observedAt:string;contracts:string[];status?:'unavailable'}
const MAX_FRAMES=160
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const prefix=(game:PaintGame)=>`book-props:v1:${game.id}:${nbaGameStart(game)}:betmgm:`
export const nbaBookPropKey=(game:PaintGame,contract:NbaBookPropContract)=>`${prefix(game)}${contract.market}:${contract.type}:${contract.line}`
export const nbaBookPropContractKey=(contract:NbaBookPropContract)=>`${contract.market}:${contract.type}:${contract.line}`
export function nbaParseBookPropContract(key:string):NbaBookPropContract|null{
  const [market,type,line,extra]=key.split(':')
  if(extra!==undefined||!PAINT_MARKETS.some(m=>m.key===market)||!['milestone','over_under'].includes(type)||!/^\d+(?:\.\d+)?$/.test(line)||Number(line)>300)return null
  return {market,type:type as NbaBookPropContract['type'],line:Number(line)}
}
const identity=(quote:PaintProp,side:string)=>`${quote.game_id}:${quote.player_id}:${quote.vendor}:${quote.prop_type}:${quote.market.type}:${Number(quote.line_value)}:${side}`
const sides=(quote:PaintProp)=>quote.market.type==='milestone'?['odds'] as const:['over_odds','under_odds'] as const

export function nbaValidBookPropFrame(value:unknown,game:PaintGame):value is NbaBookPropFrame {
  const start=nbaGameStart(game)
  if(!object(value)||!object(value.contract))return false
  const contract=value.contract
  if(start==null||!object(value)||value.gameId!==game.id||value.book!=='betmgm'||value.tipoff!==new Date(start).toISOString()
    ||typeof value.complete!=='boolean'||typeof value.observedAt!=='string'||!Number.isFinite(Date.parse(value.observedAt))||Date.parse(value.observedAt)>=start
    ||!PAINT_MARKETS.some(market=>market.key===contract.market)||!['milestone','over_under'].includes(String(contract.type))
    ||typeof contract.line!=='number'||!Number.isFinite(contract.line)||contract.line<0||contract.line>300
    ||contract.type==='milestone'&&(!Number.isInteger(contract.line)||contract.line<=0)
    ||!Array.isArray(value.props)||value.props.length>100)return false
  const seen=new Set<string>()
  return value.props.every((raw:unknown)=>{
    if(!object(raw)||!Number.isSafeInteger(raw.id)||Number(raw.id)>-5_000_000_000_000||!Number.isSafeInteger(raw.player_id)||Number(raw.player_id)<=0||raw.game_id!==game.id||raw.vendor!=='betmgm'
      ||raw.prop_type!==contract.market||raw.line_value!==String(contract.line)||!object(raw.market)||raw.market.type!==contract.type
      ||typeof raw.updated_at!=='string'||!nbaQuoteInMode(raw as PaintProp,game,'pregame',Date.parse(value.observedAt as string)))return false
    const quote=raw as PaintProp,fields=sides(quote)
    if(quote.market.type==='milestone'&&(quote.market.over_odds!=null||quote.market.under_odds!=null)||quote.market.type==='over_under'&&quote.market.odds!=null)return false
    if(!fields.some(field=>nbaValidOdds(quote.market[field]))||fields.some(field=>quote.market[field]!=null&&!nbaValidOdds(quote.market[field])))return false
    for(const field of fields){if(quote.market[field]==null)continue;const key=identity(quote,field);if(seen.has(key))return false;seen.add(key)}
    return true
  })
}

/** One row per exact panel. A partial inspection cannot overwrite another
 * threshold, or make retained sibling rows look freshly observed. */
export async function saveNbaBookPropFrames(game:PaintGame,frames:NbaBookPropFrame[],previous?:{key:string;payload:unknown}[]) {
  if(!nbaPregameOpen(game)||!frames.length||frames.length>MAX_FRAMES||new Set(frames.map(frame=>nbaBookPropKey(game,frame.contract))).size!==frames.length
    ||frames.some(frame=>!nbaValidBookPropFrame(frame,game)||Date.parse(frame.observedAt)>Date.now()||Date.now()-Date.parse(frame.observedAt)>300_000
      ||frame.props.some(quote=>quote.updated_at!==frame.observedAt)))throw new Error('NBA book observations unavailable')
  const admin=createAdminClient(),keys=frames.map(frame=>nbaBookPropKey(game,frame.contract))
  const {data,error}=previous?{data:previous,error:null}:await admin.from('nba_source_cache').select('key,payload').in('key',keys).abortSignal(AbortSignal.timeout(12_000))
  if(error||!Array.isArray(data))throw new Error('NBA book observations unavailable')
  const rows=frames.map(frame=>{
    const key=nbaBookPropKey(game,frame.contract),prior=data.find(row=>row.key===key)?.payload
    if(prior&&nbaValidBookPropFrame(prior,game)&&Date.parse(prior.observedAt)>Date.parse(frame.observedAt))throw new Error('NBA book observation is older than its saved frame')
    let props=frame.props
    if(!frame.complete&&prior&&nbaValidBookPropFrame(prior,game)){
      const current=new Set(frame.props.flatMap(quote=>sides(quote).filter(field=>quote.market[field]!=null).map(field=>identity(quote,field))))
      const retained=prior.props.flatMap(quote=>{
        const fields=sides(quote).filter(field=>quote.market[field]!=null&&!current.has(identity(quote,field)))
        return fields.length?[{...quote,market:{type:quote.market.type,...Object.fromEntries(fields.map(field=>[field,quote.market[field]]))}}]:[]
      })
      props=[...frame.props,...retained]
    }
    if(props.length>100)throw new Error('NBA book observations unavailable')
    return {key,payload:{...frame,props},fetched_at:frame.observedAt,expires_at:new Date(Date.parse(frame.observedAt)+300_000).toISOString(),lease_token:null,lease_until:null}
  })
  if(!nbaPregameOpen(game))throw new Error('NBA book observations unavailable')
  const saved=await admin.from('nba_source_cache').upsert(rows,{onConflict:'key'}).abortSignal(AbortSignal.timeout(12_000))
  if(saved.error)throw new Error('NBA book observations could not be saved')
}

/** Only an independently verified complete menu can establish withdrawal.
 * Unobserved prior panels instead retain their original quote timestamps and
 * mark the book incomplete until a later verified observation resolves them. */
export function nbaReconcileBookPropFrames(game:PaintGame,observations:NbaBookPropObservation[],coverage:NbaBookPropCoverage[],previous:{key:string;payload:unknown}[],observedAt:string){
  const frames=new Map<string,NbaBookPropFrame>(),seen=new Set<string>(),invalid=new Set<string>()
  let failed=0
  for(const observation of observations){
    const contract=nbaParseBookPropContract(observation.contractKey)
    if(observation.gameId!==game.id||!contract||contract.market!==observation.market){failed++;continue}
    if(seen.has(observation.contractKey)){frames.delete(observation.contractKey);invalid.add(observation.contractKey);failed++;continue}
    seen.add(observation.contractKey)
    if(!observation.props.length&&['unlisted','closed'].includes(observation.status))continue
    // A fully inspected panel whose actual outcome controls are all locked is
    // a verified withdrawal. Missing/failed panels instead store an incomplete
    // attempt, including on their first inspection; they never invent prices.
    const complete=observation.complete&&observation.unmatched===0&&observation.status==='captured'&&!!observation.observedAt
    const frame:NbaBookPropFrame={gameId:game.id,book:'betmgm',tipoff:new Date(nbaGameStart(game)!).toISOString(),contract,observedAt:observation.observedAt??observedAt,props:observation.props,complete}
    if(!nbaValidBookPropFrame(frame,game)||Date.parse(frame.observedAt)>Date.now()||Date.now()-Date.parse(frame.observedAt)>300_000){failed++;invalid.add(observation.contractKey);continue}
    if(!frame.complete)failed++
    frames.set(observation.contractKey,frame)
  }
  for(const entry of previous){
    if(!nbaValidBookPropFrame(entry.payload,game)||entry.key!==nbaBookPropKey(game,entry.payload.contract)){failed++;continue}
    const prior=entry.payload,key=nbaBookPropContractKey(prior.contract)
    if(frames.has(key))continue
    if(prior.complete&&!prior.props.length)continue
    const matching=coverage.filter(item=>item.gameId===game.id&&item.market===prior.contract.market)
    const proof=matching.length===1?matching[0]:null
    const absent=!invalid.has(key)&&proof?.complete===true&&proof.contracts.every(value=>nbaParseBookPropContract(value)?.market===proof.market)&&!proof.contracts.includes(key)
    const frame:NbaBookPropFrame={...prior,observedAt:absent?proof.observedAt:observedAt,props:[],complete:absent}
    if(!nbaValidBookPropFrame(frame,game)){failed++;continue}
    frames.set(key,frame)
    if(!absent)failed++
  }
  return{frames:[...frames.values()],failed}
}

export function nbaBookPropsSupplement(game:PaintGame,primary:PaintProp[],entries:{key:string;payload:unknown}[],now=Date.now()){
  if(!nbaPregameOpen(game,now))return{props:[] as PaintProp[],complete:true}
  const present=new Set(primary.filter(quote=>nbaQuoteInMode(quote,game,'pregame',now)).flatMap(quote=>sides(quote).filter(field=>nbaValidOdds(quote.market[field])).map(field=>identity(quote,field))))
  const props:PaintProp[]=[]
  let complete=true
  const seen=new Set<string>()
  for(const entry of entries){
    if(!entry.key.startsWith(prefix(game))||!nbaValidBookPropFrame(entry.payload,game)||entry.key!==nbaBookPropKey(game,entry.payload.contract)||seen.has(entry.key)){complete=false;continue}
    seen.add(entry.key)
    const frame=entry.payload
    if(!frame.complete)complete=false
    for(const quote of frame.props){
      const missing=sides(quote).filter(field=>nbaValidOdds(quote.market[field])&&!present.has(identity(quote,field)))
      if(!missing.length)continue
      const age=now-Date.parse(quote.updated_at)
      if(age<0||age>300_000){complete=false;continue}
      props.push({...quote,market:{type:quote.market.type,...Object.fromEntries(missing.map(field=>[field,quote.market[field]]))}})
    }
  }
  return{props,complete}
}

export async function getNbaBookPropEntries(game:PaintGame,fresh=false):Promise<{key:string;payload:unknown}[]>{
  if(!nbaPregameOpen(game))return[]
  const read=async()=>{
    const {data,error}=await createAdminClient().from('nba_source_cache').select('key,payload').like('key',`${prefix(game)}%`).limit(MAX_FRAMES+1).abortSignal(AbortSignal.timeout(12_000))
    if(error||!Array.isArray(data)||data.length>MAX_FRAMES)throw new Error('NBA book observations unavailable')
    return data as {key:string;payload:unknown}[]
  }
  return fresh?await read():(await nbaSharedCache(`book-props-read:v1:${game.id}:${nbaGameStart(game)}`,10,0,read,25)).value
}
export async function getNbaBookPropsSupplement(game:PaintGame,primary:PaintProp[],fresh=false){
  return nbaBookPropsSupplement(game,primary,await getNbaBookPropEntries(game,fresh))
}
