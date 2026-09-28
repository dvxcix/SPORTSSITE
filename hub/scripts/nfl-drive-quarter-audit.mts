import {createClient} from '@supabase/supabase-js'
import {writeFileSync,mkdirSync} from 'node:fs'
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const game='2026_03_PHI_CHI'
const cutoff=process.argv[2]??new Date().toISOString()
const {data,error}=await db.from('nfl_fanduel_capture_history').select('captured_at,raw_tabs').eq('game_id',game).lte('captured_at',cutoff).order('captured_at')
if(error)throw error
const series=new Map<string,any>()
const seen=new Set<string>()
for(const capture of data??[]) for(const tab of capture.raw_tabs??[]) {
 const time=tab.scraped_at??capture.captured_at
 for(const [market,rows] of Object.entries(tab.sections??{})) {
  if(!/drive 1|1st drive|qtr.*(?:receiving|passing|rushing)|quarter.*(?:receiving|passing|rushing)/i.test(market))continue
  for(const row of rows as any[]) {
   const selection=String(row.selection??row.parts?.slice(1).join(' | ')??'')
   const odds=/^(even|evens)$/i.test(row.odds)?100:Number(String(row.odds).replace('−','-'))
   if(!Number.isFinite(odds)||Math.abs(odds)<100)continue
   const key=market+'||'+selection
   const unique=key+'||'+time+'||'+odds
   if(seen.has(unique))continue
   seen.add(unique)
   const s=series.get(key)??{market,selection,path:[]}
   s.path.push({time,odds,capturedAt:capture.captured_at})
   series.set(key,s)
  }
 }
}
const decimal=(n:number)=>n>0?1+n/100:1+100/-n
const fmt=(n:number)=>n>0?'+'+n:String(n)
const et=(s:string)=>new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
const result=[...series.values()].map(s=>{
 s.path.sort((a:any,b:any)=>a.time.localeCompare(b.time))
 const first=s.path[0],last=s.path.at(-1)
 const direction=decimal(last.odds)>decimal(first.odds)?'UP':decimal(last.odds)<decimal(first.odds)?'DOWN':'FLAT'
 return {...s,first,last,direction,observations:s.path.length}
}).sort((a,b)=>a.market.localeCompare(b.market)||a.selection.localeCompare(b.selection,undefined,{numeric:true}))
const latestByMarket = new Map<string,string>()
for(const s of result) if(s.last.time>(latestByMarket.get(s.market)??'')) latestByMarket.set(s.market,s.last.time)
for(const s of result) s.presentAtLatestMarketCapture = s.last.time === latestByMarket.get(s.market)
let md='# PHI @ CHI — saved FanDuel drive/quarter price paths\n\n'
md+='Read cutoff: '+cutoff+'. '+data!.length+' captures. Each first/latest is for that exact selection, using the tab scrape timestamp; not necessarily sportsbook opening/closing odds. UP = longer payout; DOWN = shorter. Missing rows are not assumed unchanged.\n\n'
for(const market of [...new Set(result.map(s=>s.market))]){
 md+='## '+market+'\n\n| Selection | First → latest | Move | First seen ET | Last seen ET | Observations | At latest market capture? |\n|---|---|---|---|---|---|---|\n'
 for(const s of result.filter(s=>s.market===market))md+='| '+s.selection.replaceAll('|',' / ')+' | '+fmt(s.first.odds)+' → '+fmt(s.last.odds)+' | '+(s.observations<2?'ONE OBSERVATION':s.direction)+' | '+et(s.first.time)+' | '+et(s.last.time)+' | '+s.observations+' | '+(s.presentAtLatestMarketCapture?'Yes':'No — historical line')+' |\n'
 md+='\n'
}
mkdirSync('research/nfl-phi-chi-2026-09-28',{recursive:true})
writeFileSync('research/nfl-phi-chi-2026-09-28/drive-quarter-ladders.md',md)
writeFileSync('research/nfl-phi-chi-2026-09-28/drive-quarter-paths.json',JSON.stringify({game,cutoff,captures:data!.map(r=>r.captured_at),series:result},null,2))
console.log(JSON.stringify({cutoff,captures:data!.length,series:result.length,counts:result.reduce((a,s)=>(a[s.direction]=(a[s.direction]??0)+1,a),{})}))
for(const market of [...new Set(result.map(s=>s.market))]){
 console.log(market+': '+result.filter(s=>s.market===market).map(s=>s.selection+' '+fmt(s.first.odds)+'→'+fmt(s.last.odds)+' '+s.direction).join('; '))
}
