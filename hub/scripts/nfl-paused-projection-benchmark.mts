import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { createNflPausedProjection, packNflPausedProjection, visibleNflObservedOdds } from '../src/lib/nflPausedProjection.ts'
import type { NflMarketOffer, SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'

const quote = (vendor:string, line:number):NflMarketOffer => ({ vendor,line,openingLine:line,type:'over_under',current:{over:-110,under:-110},opening:{over:-105,under:-115},updatedAt:'2026-11-02T19:00:00.000Z' })
const base:SidelineOddsBoard = { bdlGameId:1,status:'ready',source:'snapshot',capturedAt:'2026-11-02T19:00:00.000Z',gameLines:[],players:Array.from({length:32},(_,id)=>({ id:id+1,name:`Player ${id}`,team:'CHI',position:'WR',markets:Array.from({length:30},(_,line)=>({ key:`receiving_yards:${line}`,propType:'receiving_yards',label:'Receiving yards',category:'receiving',line,offers:[quote('draftkings',line),quote('betmgm',line)] })) })) }
const merged:SidelineOddsBoard = { ...base,players:base.players.map(player=>({ ...player,markets:player.markets.map(market=>({ ...market,offers:[...market.offers,quote('fanduel',market.line!)] })) })) }
const times:number[]=[]
let archiveBytes=0, resultBytes=0, markerBytes=0, markerGzipBase64Bytes=0
for(let i=0;i<60;i++) {
  const started=performance.now(), marker=packNflPausedProjection(createNflPausedProjection(merged,base,'fixture')), value={...merged,pausedProjection:marker}
  const visible=visibleNflObservedOdds(value,'fixture')
  times.push(performance.now()-started)
  archiveBytes=Buffer.byteLength(JSON.stringify(value));resultBytes=Buffer.byteLength(JSON.stringify(visible))
  const markerJson=JSON.stringify(marker);markerBytes=Buffer.byteLength(markerJson);markerGzipBase64Bytes=Buffer.byteLength(gzipSync(markerJson).toString('base64'))
}
const sorted=times.slice(10).sort((a,b)=>a-b)
console.log(JSON.stringify({players:32,markets:960,offers:2880,iterations:sorted.length,rawArchiveBytes:Buffer.byteLength(JSON.stringify(merged)),archiveWithMarkerBytes:archiveBytes,markerBytes,markerGzipBase64Bytes,visibleBytes:resultBytes,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]}))
