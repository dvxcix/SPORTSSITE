import { fetchHistoricalGameBundles } from '../src/lib/matrixBacktest'
import { computeDugoutSpecsValue, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'
import { normName } from '@slipsurge/core/nameNorm'
import { createAdminClient } from '../src/lib/supabase/admin'
import { buildPitcherMap, computeMmByWindowForGame, type MmPlayerInput } from '../src/lib/dugoutPaperScore'

// Precision-first ANYTIME-HR research. The model may abstain. All thresholds
// and coefficients are learned on TRAIN_DATES; HOLDOUT_DATES are graded once,
// untouched. A 100% result means zero OBSERVED false positives, not certainty.
const TRAIN_DATES = [
  '2026-07-16','2026-07-17','2026-07-18','2026-07-19','2026-07-20','2026-07-21','2026-07-22','2026-07-23',
  '2026-07-24','2026-07-25','2026-07-26','2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31',
]
const HOLDOUT_DATES = ['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05']

type FeatureRow = {
  date: string; gamePk: number; batterId: number; name: string; team: string; hitHr: number
  x: Record<string, number>
}
const admin=createAdminClient()

const implied = (o: number | null | undefined) => o == null ? null : o > 0 ? 100 / (o + 100) : -o / (-o + 100)
const mean = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0
}
const percentile = (x: number | null, all: Array<number | null>) => {
  if (x == null) return 0.5
  const v = all.filter((n): n is number => n != null).sort((a,b)=>a-b)
  return v.length < 2 ? 0.5 : v.filter(n => n <= x).length / v.length
}
const ratio = (a: number | null | undefined, b: number | null | undefined) => {
  const x=implied(a), y=implied(b); return x != null && y != null && y > 0 ? x/y : null
}

function acceleration(b: FieldBundle): number {
  const sw:any=b.statcastWindows??{}, season:any=sw.season??{}
  const fields=['avgBatSpeed','barrelPct','hardHitPct','pullAirRate','fbRate','avgEv','squaredUpPct','blastPct']
  const ds:number[]=[]
  for(const w of ['l10','l5','l3','l1']) for(const f of fields){
    const r=sw[w]?.[f], s=season[f]; if(r==null||s==null) continue
    const scale=Math.max(Math.abs(s),f==='avgEv'||f==='avgBatSpeed'?5:.05); ds.push((r-s)/scale)
  }
  ds.sort((a,b)=>b-a); return mean(ds.slice(0,Math.max(3,Math.ceil(ds.length*.3))))
}

function oddsMap(p: OddsProps | null | undefined) {
  return {
    sa: implied(p?.sa?.fanduel), fhr: implied(p?.fhr?.fanduel), hr2: implied(p?.hr2?.fanduel),
    hrr: implied(p?.hrr?.fanduel), hits: implied(p?.hits?.fanduel), runs: implied(p?.runs?.fanduel),
    tb: implied(p?.tb?.fanduel), tb3: implied(p?.tb3?.fanduel), tb4: implied(p?.tb4?.fanduel), tb5: implied(p?.tb5?.fanduel),
    rbi: implied(p?.rbi?.fanduel), rbi2: implied(p?.rbi2?.fanduel), rbi3: implied(p?.rbi3?.fanduel),
    hrml: implied(p?.hrMl?.fanduel), pa1: implied(p?.pa1?.fanduel), laser: implied(p?.laser105?.fanduel),
    moonshot: implied(p?.moonshot?.fanduel), singles: implied(p?.singles?.fanduel), doubles: implied(p?.doubles?.fanduel),
    sb: implied(p?.stolenBases?.fanduel),
  }
}

async function outcomes(gamePk:number):Promise<Set<number>>{
  const out=new Set<number>()
  try{
    const r=await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`,{cache:'no-store'})
    if(!r.ok)return out; const j=await r.json(); const teams=j?.liveData?.boxscore?.teams
    for(const side of ['home','away']) for(const p of Object.values(teams?.[side]?.players??{}) as any[])
      if((p?.stats?.batting?.homeRuns??0)>0&&p?.person?.id)out.add(Number(p.person.id))
  }catch{} return out
}

async function pitcherMapFor(ids:number[],date:string){
  const rows:any[]=[]
  await Promise.all(ids.map(async id=>{
    const all:any[]=[]
    for(let from=0;from<5000;from+=1000){const {data}=await admin.from('player_pitch_log').select('pitch_type,stand').eq('pitcher_id',id).lt('game_date',date).range(from,from+999);all.push(...(data??[]));if((data??[]).length<1000)break}
    for(const hand of ['L','R']){
      const h=all.filter(r=>r.stand===hand&&r.pitch_type),n=h.length||1,count=(pt:string)=>100*h.filter(r=>r.pitch_type===pt).length/n
      rows.push({mlb_id:id,bat_hand:hand,win:'season',pct_fastball:count('FF'),pct_sinker:count('SI'),pct_cutter:count('FC'),pct_slider:count('SL'),pct_curveball:count('CU'),pct_changeup:count('CH'),pct_splitter:count('FS')})
    }
  }))
  return buildPitcherMap(rows)
}

async function rowsForDate(date:string):Promise<FeatureRow[]>{
  const bundles=await fetchHistoricalGameBundles(date), out:FeatureRow[]=[]
  const pitcherIds=[...new Set(bundles.flatMap(b=>[b.game.homePitcher?.id,b.game.awayPitcher?.id]).filter((x):x is number=>!!x))]
  const [pitcherMap,edgeRows]=await Promise.all([pitcherMapFor(pitcherIds,date),admin.from('dugout_matchup_edge_precomputed').select('mlb_id,role,data').eq('game_date',date).then(r=>r.data??[])])
  const batterEdge:Record<number,any>={},pitcherEdge:Record<number,any>={}
  for(const r of edgeRows as any[])(r.role==='batter'?batterEdge:pitcherEdge)[r.mlb_id]=r.data
  for(const gb of bundles){
    if(!gb.game.homeLineupConfirmed||!gb.game.awayLineupConfirmed)continue
    const hr=await outcomes(gb.game.gamePk)
    const players=[
      ...gb.game.awayLineup.map(p=>({p,team:gb.game.awayAbbr,map:gb.awayBundle,pit:gb.game.homePitcher,hand:gb.game.homePitcher?.hand??'R'})),
      ...gb.game.homeLineup.map(p=>({p,team:gb.game.homeAbbr,map:gb.homeBundle,pit:gb.game.awayPitcher,hand:gb.game.awayPitcher?.hand??'R'})),
    ].map(v=>({...v,b:v.map.get(normName(v.p.name))})).filter(v=>v.b)
    const mmInputs:MmPlayerInput[]=players.map(v=>({mlbId:v.p.mlb_id,effectiveBats:v.p.bats==='L'||v.p.bats==='S'?'L':'R',pitcherHand:v.hand as 'L'|'R',pitcherId:v.pit?.id??null,saFd:v.b?.props?.sa?.fanduel??null,statcastWindows:v.b?.statcastWindows as any,batterMatchupData:batterEdge[v.p.mlb_id]??null}))
    const ranked=computeMmByWindowForGame(mmInputs,pitcherMap,pitcherEdge)
    const om=players.map(v=>oddsMap(v.b!.props))
    const keys=Object.keys(om[0]??{}) as Array<keyof ReturnType<typeof oddsMap>>
    const pickVals=players.map(v=>Number(v.b?.pikkitEntry?.home_runs?.picks??0))
    const accelVals=players.map(v=>acceleration(v.b!))
    for(let i=0;i<players.length;i++){
      const v=players[i], b=v.b!, p=b.props, o=om[i]
      const fhrPct=computeDugoutSpecsValue('fhr_pct',p,b.fhrAvg,b.saAvg)??0
      const hrPct=computeDugoutSpecsValue('sa_pct',p,b.fhrAvg,b.saAvg)??0
      const marketPct:Record<string,number>={}
      for(const k of keys)marketPct[k]=percentile(o[k],om.map(z=>z[k]))
      const correlated=mean(['hrr','hits','runs','tb','tb3','tb4','tb5','rbi','rbi2','rbi3'].map(k=>marketPct[k]))
      const power=mean(['sa','fhr','hr2','hrml','pa1','laser','moonshot'].map(k=>marketPct[k]))
      const disparity=Math.max(...keys.map(k=>Math.abs(marketPct[k]-.5)))
      const mm=ranked.mm[v.p.mlb_id],pp=ranked.ppRk[v.p.mlb_id]
      const mmVals=[mm?.l10,mm?.l5,mm?.l3,mm?.l1].filter((z):z is number=>z!=null)
      const paperPcts=[pp?.l10,pp?.l5,pp?.l3,pp?.l1].filter((z):z is number=>z!=null).map(z=>1-(z-1)/Math.max(1,players.length-1))
      out.push({date,gamePk:gb.game.gamePk,batterId:v.p.mlb_id,name:v.p.name,team:v.team,hitHr:hr.has(v.p.mlb_id)?1:0,x:{
        sa:marketPct.sa,fhr:marketPct.fhr,hr2:marketPct.hr2,hrml:marketPct.hrml,pa1:marketPct.pa1,
        laser:marketPct.laser,moonshot:marketPct.moonshot,correlated,power,disparity,
        hrShock:-hrPct/100,fhrShock:-fhrPct/100,sequenceSkew:(hrPct-fhrPct)/100,
        hrmlCoupling:1/(ratio(p?.sa?.fanduel,p?.hrMl?.fanduel)??2),
        paCoupling:ratio(p?.pa1?.fanduel,p?.sa?.fanduel)??0,
        fhrCoupling:ratio(p?.fhr?.fanduel,p?.sa?.fanduel)??0,
        acceleration:accelVals[i],accelPct:percentile(accelVals[i],accelVals),
        lowPublic:1-percentile(pickVals[i],pickVals),logPicks:Math.log1p(pickVals[i]),
        battingOrder:(v.p.batting_order??9)/9,
        mmOverride:mean(mmVals.map(z=>-z/Math.max(1,players.length-1))),
        mmL1:mm?.l1==null?0:-mm.l1/Math.max(1,players.length-1),
        mmTrend:mm?.l1==null||mm?.l10==null?0:(mm.l10-mm.l1)/Math.max(1,players.length-1),
        paper:mean(paperPcts),paperTrend:paperPcts.length<2?0:paperPcts[paperPcts.length-1]-paperPcts[0],
      }})
    }
  }
  console.log(`${date}: ${out.length} hitters, ${out.reduce((s,r)=>s+r.hitHr,0)} HR hitters`)
  return out
}

const FEATURES=['sa','fhr','hr2','hrml','pa1','laser','moonshot','correlated','power','disparity','hrShock','fhrShock','sequenceSkew','hrmlCoupling','paCoupling','fhrCoupling','acceleration','accelPct','lowPublic','logPicks','battingOrder','mmOverride','mmL1','mmTrend','paper','paperTrend']

function scaler(rows:FeatureRow[]){
  const m=FEATURES.map(f=>mean(rows.map(r=>r.x[f]))), sd=FEATURES.map((f,i)=>Math.sqrt(mean(rows.map(r=>(r.x[f]-m[i])**2)))||1)
  return { apply:(r:FeatureRow)=>FEATURES.map((f,i)=>(r.x[f]-m[i])/sd[i]), m, sd }
}
const sig=(z:number)=>1/(1+Math.exp(-z))
function fit(X:number[][],y:number[]){
  const d=X[0].length,w=Array(d).fill(0);let b=0
  for(let it=0;it<5000;it++){
    const gw=Array(d).fill(0);let gb=0
    for(let i=0;i<X.length;i++){const e=sig(X[i].reduce((s,x,j)=>s+x*w[j],b))-y[i];gb+=e;for(let j=0;j<d;j++)gw[j]+=e*X[i][j]}
    for(let j=0;j<d;j++)w[j]-=.15*(gw[j]/X.length+2*w[j]/X.length);b-=.15*gb/X.length
  }return{w,b}
}
function wilson(k:number,n:number,z=1.96){if(!n)return[0,0];const p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;return[c-h,c+h]}
function evaluate(label:string,rows:FeatureRow[],scores:number[],threshold:number){
  const calls=rows.map((r,i)=>({r,s:scores[i]})).filter(v=>v.s>=threshold).sort((a,b)=>b.s-a.s)
  const hits=calls.reduce((s,v)=>s+v.r.hitHr,0), fp=calls.length-hits, ci=wilson(hits,calls.length)
  console.log(`\n${label}: calls=${calls.length} hits=${hits} falsePositives=${fp} precision=${calls.length?(100*hits/calls.length).toFixed(1):'n/a'}% recall=${rows.reduce((s,r)=>s+r.hitHr,0)?(100*hits/rows.reduce((s,r)=>s+r.hitHr,0)).toFixed(1):0}% 95%CI=${(100*ci[0]).toFixed(1)}-${(100*ci[1]).toFixed(1)}%`)
  for(const v of calls)console.log(`  ${v.r.hitHr?'HIT ':'MISS'} ${v.r.date} ${v.r.name} (${v.r.team}) score=${v.s.toFixed(4)}`)
}

function thresholdForObservedPrecision(rows:FeatureRow[],scores:number[],target:number){
  const ranked=rows.map((r,i)=>({r,s:scores[i]})).sort((a,b)=>b.s-a.s)
  let hits=0,bestK=0
  for(let i=0;i<ranked.length;i++){
    hits+=ranked[i].r.hitHr
    if(hits/(i+1)>=target)bestK=i+1
  }
  return bestK ? ranked[bestK-1].s : Number.POSITIVE_INFINITY
}
function topRateThreshold(scores:number[],rate:number){const s=[...scores].sort((a,b)=>b-a),k=Math.max(1,Math.floor(s.length*rate));return s[k-1]}

async function main(){
  const train:FeatureRow[]=[],hold:FeatureRow[]=[]
  for(const d of TRAIN_DATES)train.push(...await rowsForDate(d))
  for(const d of HOLDOUT_DATES)hold.push(...await rowsForDate(d))
  const scale=scaler(train),X= train.map(scale.apply), y=train.map(r=>r.hitHr), model=fit(X,y)
  const score=(r:FeatureRow)=>sig(scale.apply(r).reduce((s,x,j)=>s+x*model.w[j],model.b))
  const ts=train.map(score), hs=hold.map(score)
  // Strictest non-empty threshold with zero training false positives: just
  // above the highest-scoring negative. Calls may legitimately be zero.
  const maxNegative=Math.max(...train.map((r,i)=>r.hitHr?Number.NEGATIVE_INFINITY:ts[i]))
  const threshold=maxNegative+Number.EPSILON
  console.log(`\nRows: train=${train.length}, holdout=${hold.length}; field HR rates=${(100*mean(train.map(r=>r.hitHr))).toFixed(1)}% / ${(100*mean(hold.map(r=>r.hitHr))).toFixed(1)}%`)
  console.log(`Frozen zero-training-FP threshold=${threshold.toFixed(6)}`)
  evaluate('TRAIN',train,ts,threshold); evaluate('HOLDOUT',hold,hs,threshold)
  for(const target of [.90,.80,.70]){
    const t=thresholdForObservedPrecision(train,ts,target)
    console.log(`\n--- Largest training call-set with >=${(100*target).toFixed(0)}% observed precision; frozen threshold=${Number.isFinite(t)?t.toFixed(6):'none'} ---`)
    evaluate(`TRAIN P${100*target}`,train,ts,t); evaluate(`HOLDOUT P${100*target}`,hold,hs,t)
  }
  for(const rate of [.001,.005,.01,.02,.05]){
    const t=topRateThreshold(ts,rate)
    console.log(`\n--- Frozen top ${(100*rate).toFixed(1)}% training-score threshold=${t.toFixed(6)} ---`)
    evaluate(`TRAIN TOP${100*rate}`,train,ts,t); evaluate(`HOLDOUT TOP${100*rate}`,hold,hs,t)
  }
  console.log('\nFROZEN_MODEL_JSON')
  console.log(JSON.stringify({features:FEATURES,mean:scale.m,sd:scale.sd,weights:model.w,intercept:model.b,thresholdTop5:topRateThreshold(ts,.05)}))
  console.log('\nLargest standardized coefficients:')
  FEATURES.map((f,i)=>({f,w:model.w[i]})).sort((a,b)=>Math.abs(b.w)-Math.abs(a.w)).slice(0,10).forEach(v=>console.log(`  ${v.f.padEnd(18)} ${v.w>=0?'+':''}${v.w.toFixed(3)}`))
}
main().catch(e=>{console.error(e);process.exit(1)})
