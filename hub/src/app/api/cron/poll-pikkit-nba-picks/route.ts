import {NextResponse} from 'next/server'
import {requireBrowserbaseCronAuth} from '@/lib/cron-auth'
import {withPipelineHealth} from '@/lib/pipelineHealth'
import {getPaintSchedule} from '@/lib/nbaPaintData'
import {nbaToday} from '@/lib/nbaPaint'
import {createAdminClient} from '@/lib/supabase/admin'
import {acquirePikkitBrowserLease} from '@/lib/pikkitBrowserLease'
import {openPikkitSession} from '@/lib/browserbase'
import {clickTabByText,findAndClickPikkitGame} from '@/lib/scrapers/gameMatch'
import {runNbaPikkitScrape} from '@/lib/scrapers/nbaPikkitScraper'
import {importNbaPublic} from '@/lib/nbaPublicServer'
export const maxDuration=300
async function run(request:Request){
  const denied=requireBrowserbaseCronAuth(request);if(denied)return denied
  const context=process.env.PIKKIT_CONTEXT_ID
  if(!context)return NextResponse.json({error:'Pikkit context is not configured'},{status:503})
  const started=Date.now(),today=nbaToday(),schedule=await getPaintSchedule(today)
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
  if(!lease)return NextResponse.json({reason:'Pikkit browser busy; deferred to the next run',deferred:due.length},{status:423})
  const results:{game:number;ok:boolean;reason?:string;markets?:number}[]=[]
  try{
    const browser=await openPikkitSession(context,{sport:'nba',mode:'daily-public',gameCount:due.length})
    try{
      for(const game of due){
        if(Date.now()-started>190000)break
        try{
          await browser.page.goto('https://app.pikkit.com/leagues/nba',{waitUntil:'domcontentloaded'})
          await browser.page.waitForTimeout(1800)
          if(!await findAndClickPikkitGame(browser.page,game.visitor_team.full_name,game.home_team.full_name))throw new Error('NBA event is not listed')
          await browser.page.waitForTimeout(2200)
          const text=await browser.page.evaluate(()=>document.body.innerText)
          if(![game.visitor_team.name,game.home_team.name].every(name=>text.toLowerCase().includes(name.toLowerCase())))throw new Error('NBA event identity could not be verified')
          await clickTabByText(browser.page,'Odds').catch(()=>false)
          await browser.page.waitForTimeout(900)
          await clickTabByText(browser.page,'Player Props',false).catch(()=>false)
          await browser.page.waitForTimeout(900)
          const payload=await browser.page.evaluate(runNbaPikkitScrape)
          if(!payload.complete){console.info('[nba-public] incomplete-controls',{game:game.id,diagnostic:payload.diagnostic??null});throw new Error('NBA public market capture was incomplete')}
          if(Date.parse(game.datetime??game.status)<=Date.now())throw new Error('Game started during capture')
          const imported=await importNbaPublic(game,payload)
          results.push({game:game.id,ok:true,markets:imported.markets})
        }catch(error){results.push({game:game.id,ok:false,reason:error instanceof Error?error.message:'NBA capture failed'})}
      }
    }finally{await browser.close()}
  }finally{await lease.release()}
  const failed=results.filter(r=>!r.ok).length,deferred=due.length-results.length
  return NextResponse.json({games:upcoming.length,due:due.length,failed,deferred,results},{status:failed?502:deferred?206:200})
}
export const GET=withPipelineHealth('poll-pikkit-nba-picks',run,{allowSecondarySecret:true})
