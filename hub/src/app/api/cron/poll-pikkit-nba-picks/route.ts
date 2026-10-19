import {NextResponse} from 'next/server'
import {requireBrowserbaseCronAuth} from '@/lib/cron-auth'
import {withPipelineHealth} from '@/lib/pipelineHealth'
import {getPaintSchedule} from '@/lib/nbaPaintData'
import {nbaToday} from '@/lib/nbaPaint'
import {createAdminClient} from '@/lib/supabase/admin'
import {acquirePikkitBrowserLease} from '@/lib/pikkitBrowserLease'
import {openPikkitSession} from '@/lib/browserbase'
import {findAndClickPikkitGame} from '@/lib/scrapers/gameMatch'
import {runNbaPikkitScrape} from '@/lib/scrapers/nbaPikkitScraper'
import {importNbaPublic} from '@/lib/nbaPublicServer'
import {nbaPublicEventMatches} from '@/lib/nbaPublic'
export const maxDuration=300
class NbaCaptureDeadline extends Error {}
async function bounded<T>(task:Promise<T>,milliseconds:number,label:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined
 try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new NbaCaptureDeadline(label)),Math.max(1,milliseconds))})])}finally{if(timer)clearTimeout(timer)}
}
async function run(request:Request){
  const denied=requireBrowserbaseCronAuth(request);if(denied)return denied
  const context=process.env.PIKKIT_CONTEXT_ID
  if(!context)return NextResponse.json({error:'Pikkit context is not configured'},{status:503})
  const started=Date.now(),today=nbaToday()
  const dates=[0,1,2].map(offset=>{const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)})
  const schedules=await Promise.all(dates.map(date=>getPaintSchedule(date)))
  const schedule={games:[...new Map(schedules.flatMap(slate=>slate.games).map(game=>[game.id,game])).values()]}
  const requested=new URL(request.url).searchParams.get('game')
  if(requested&&!/^\d{1,10}$/.test(requested))return NextResponse.json({error:'Invalid game'},{status:400})
  // Daily coverage starts within 48h of tip. Prioritize missing/old captures;
  // a busy shared browser defers this job without disrupting NFL or MLB.
  const upcoming=schedule.games.filter(g=>['scheduled','unknown',undefined].includes(g.status_state)&&Date.parse(g.datetime??g.status)>Date.now()&&Date.parse(g.datetime??g.status)-Date.now()<48*3600000&&(!requested||String(g.id)===requested))
  if(!upcoming.length)return NextResponse.json({games:0,skipped:'No upcoming NBA games inside the capture window'})
  const {data:prior,error}=await createAdminClient().from('nba_public_captures').select('game_id,captured_at').in('game_id',upcoming.map(g=>g.id)).order('captured_at',{ascending:false}).limit(200)
  if(error)return NextResponse.json({error:'Public capture preflight failed'},{status:503})
  const last=(id:number)=>prior?.find(p=>p.game_id===id)?.captured_at
  const due=upcoming.filter(g=>!last(g.id)||Date.now()-Date.parse(last(g.id)!)>30*60000).sort((a,b)=>Date.parse(last(a.id)??'1970-01-01')-Date.parse(last(b.id)??'1970-01-01'))
  if(!due.length)return NextResponse.json({games:upcoming.length,skipped:'Captures are current'})
  const lease=await acquirePikkitBrowserLease()
  if(!lease)return NextResponse.json({stage:'deferred',reason:'Pikkit browser busy; deferred to the next run',deferred:due.length},{status:200})
  const results:{game:number;ok:boolean;reason?:string;markets?:number;diagnostic?:unknown}[]=[]
  let timedOut=false,browserOpened=false,browserReleased=false,runError:string|null=null
  const cleanupIssues:string[]=[],remaining=()=>250000-(Date.now()-started)
  try{
    const opening=openPikkitSession(context,{sport:'nba',mode:'daily-public',gameCount:due.length},{requestTimeoutMs:15000})
    void opening.then(browser=>{if(timedOut)void bounded(browser.close(),15000,'Late browser release deadline').catch(()=>undefined)}).catch(()=>undefined)
    const browser=await bounded(opening,Math.min(75000,remaining()),'Pikkit browser startup deadline')
    browserOpened=true
    browser.page.setDefaultTimeout(12000);browser.page.setDefaultNavigationTimeout(20000)
    try{
      for(const game of due){
        if(remaining()<35000)break
        let captureExpired=false
        try{
          await bounded((async()=>{
          await browser.page.goto('https://app.pikkit.com/leagues/nba',{waitUntil:'domcontentloaded',timeout:20000})
          await browser.page.waitForFunction((team)=>document.body.innerText.includes(team),game.visitor_team.full_name,{timeout:15000}).catch(()=>undefined)
          let found=await findAndClickPikkitGame(browser.page,game.visitor_team.full_name,game.home_team.full_name)
          if(!found){await browser.page.waitForTimeout(3000);found=await findAndClickPikkitGame(browser.page,game.visitor_team.full_name,game.home_team.full_name)}
          if(!found)throw new Error('NBA event is not listed')
          await browser.page.waitForTimeout(2200)
          const text=await browser.page.evaluate(()=>document.body.innerText)
          if(!nbaPublicEventMatches(game,text))throw new Error('NBA event teams and date could not be verified')
          await browser.page.getByText('Odds',{exact:true}).filter({visible:true}).first().click({timeout:15000})
          // Responsive event navigation contains repeated tab labels. The
          // shared helper chooses the first match and swallows click errors;
          // NBA must click the visible exact tab, then wait for its controls.
          const propsTab=browser.page.getByText('Player Props',{exact:true}).filter({visible:true}).first()
          await propsTab.waitFor({state:'visible',timeout:15000}).catch(()=>{throw new Error('NBA Player Props tab is unavailable')})
          await propsTab.click({timeout:10000})
          await browser.page.waitForFunction(()=>Array.from(document.querySelectorAll('select')).some(s=>Array.from(s.options).filter(o=>/points?|rebounds?|assists?|three|steals?|blocks?/i.test(o.textContent??'')).length>=2),{},{timeout:10000}).catch(()=>undefined)
          const payload=await browser.page.evaluate(runNbaPikkitScrape)
          if(!payload.complete){console.info('[nba-public] incomplete-controls',{game:game.id,diagnostic:payload.diagnostic??null});throw new Error('NBA public market capture was incomplete')}
          if(captureExpired)throw new NbaCaptureDeadline('NBA game capture deadline')
          if(Date.parse(game.datetime??game.status)<=Date.now())throw new Error('Game started during capture')
          const imported=await importNbaPublic(game,payload)
          if(!captureExpired)results.push({game:game.id,ok:true,markets:imported.markets})
          })(),Math.min(110000,remaining()-25000),'NBA game capture deadline')
        }catch(error){
          const diagnostic=error instanceof NbaCaptureDeadline?{deadline:true}:await bounded(browser.page.evaluate((away)=>{const text=document.body.innerText;const start=text.toLowerCase().indexOf(away.toLowerCase());return {path:location.pathname,bodyLength:text.length,signIn:/sign in|log in|verify your/i.test(text),selects:Array.from(document.querySelectorAll('select')).map(s=>Array.from(s.options).map(o=>o.textContent?.trim()).slice(0,40)),marketExcerpt:start>=0?text.slice(start,start+3500):null,events:Array.from(document.querySelectorAll('a[href*="/event/"]')).map(a=>({path:a.getAttribute('href'),label:a.textContent?.trim().slice(0,160)})).slice(0,12)}},game.visitor_team.full_name),4000,'NBA capture diagnostic deadline').catch(()=>null)
          results.push({game:game.id,ok:false,reason:error instanceof Error?error.message:'NBA capture failed',diagnostic})
          if(error instanceof NbaCaptureDeadline){captureExpired=true;timedOut=true;break}
        }
      }
    }finally{await bounded(browser.close(),15000,'NBA browser close deadline').then(()=>{browserReleased=true}).catch(()=>cleanupIssues.push('Browser release could not be confirmed; automatic 300-second browser expiry remains enabled'))}
  }catch(error){timedOut=true;runError=error instanceof NbaCaptureDeadline?error.message:'Pikkit browser could not open'}finally{
    if(!browserOpened||!browserReleased)cleanupIssues.push('The shared context lease is retained until its safety expiry because browser shutdown could not be confirmed')
    else await bounded(lease.release(),10000,'NBA browser lease release deadline').catch(()=>cleanupIssues.push('Shared browser lease release could not be confirmed'))
  }
  const unavailable=results.filter(result=>!result.ok&&result.reason==='NBA event is not listed').length
  const failed=results.filter(result=>!result.ok&&result.reason!=='NBA event is not listed').length,deferred=due.length-results.length+unavailable
  return NextResponse.json({games:upcoming.length,due:due.length,failed,unavailable,deferred,results,reason:runError,cleanupIssues},{status:runError||cleanupIssues.length?503:failed?502:deferred?206:200})
}
export const GET=withPipelineHealth('poll-pikkit-nba-picks',run,{allowSecondarySecret:true})
