import {NextResponse} from 'next/server'
import {requireBrowserbaseCronAuth} from '@/lib/cron-auth'
import {withPipelineHealth} from '@/lib/pipelineHealth'
import {getPaintSchedule} from '@/lib/nbaPaintData'
import {getNbaOddsGame} from '@/lib/nbaOddsClockData'
import {nbaToday} from '@/lib/nbaPaint'
import {createAdminClient} from '@/lib/supabase/admin'
import {acquirePikkitBrowserLease} from '@/lib/pikkitBrowserLease'
import {openPikkitSession} from '@/lib/browserbase'
import {findAndClickPikkitGame} from '@/lib/scrapers/gameMatch'
import {runNbaPikkitScrape} from '@/lib/scrapers/nbaPikkitScraper'
import {importNbaPublic} from '@/lib/nbaPublicServer'
import {NBA_PUBLIC_VERSION} from '@/lib/nbaPublic'
import {nbaPublicResponseKind,nbaPublicEventIdentities,nbaVerifiedPublicEvent,nbaPublicEventUrl,nbaPublicEventPageMatches,type NbaPublicEventIdentity} from '@/lib/nbaPublicEventIdentity'
import {nbaSharedCache} from '@/lib/nbaSharedCache'
import type {Response as BrowserResponse,Request as BrowserRequest} from 'playwright-core'
export const maxDuration=300
class NbaCaptureDeadline extends Error {}
class NbaPikkitAuthenticationRequired extends Error {}
function requirePikkitPageSession(url:string){
 if(/\/(?:login|signin|sign-in|join|auth|verify)(?:\/|$)/i.test(new URL(url).pathname))throw new NbaPikkitAuthenticationRequired('Pikkit sign-in expired; reconnect the shared Pikkit session')
}
function diagnosticPath(url:string):string|null{
 try{
  const parsed=new URL(url),path=parsed.pathname.replace(/\/+$/,'')||'/'
  if(parsed.protocol==='about:'&&path==='blank')return 'about:blank'
  const auth=path.match(/^\/(login|signin|sign-in|join|auth|verify)(?:\/|$)/i)
  if(auth)return '/'+auth[1].toLowerCase()
  if(path==='/'||/^\/leagues\/(?:nba|nfl|mlb)$/i.test(path))return path.toLowerCase()
  return /^\/event(?:\/|$)/i.test(path)?'/event/[redacted]':'/other'
 }catch{return null}
}
function diagnosticError(error:unknown){
 if(error instanceof NbaCaptureDeadline||error instanceof Error&&error.name==='TimeoutError')return 'deadline'
 const message=error instanceof Error?error.message:''
 if(/(?:page|context|browser|target).*(?:closed|closing)|session closed/i.test(message))return 'page-closed'
 if(/execution context|cannot find context/i.test(message))return 'execution-context'
 return 'probe-failed'
}
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
  const schedule={games:await Promise.all([...new Map(schedules.flatMap(slate=>slate.games).map(game=>[game.id,game])).values()].map(game=>getNbaOddsGame(game)))}
  const requested=new URL(request.url).searchParams.get('game')
  if(requested&&!/^\d{1,10}$/.test(requested))return NextResponse.json({error:'Invalid game'},{status:400})
  // Daily coverage starts within 48h of tip. Prioritize missing/old captures;
  // a busy shared browser defers this job without disrupting NFL or MLB.
  const upcoming=schedule.games.filter(g=>['scheduled','unknown',undefined].includes(g.status_state)&&Date.parse(g.datetime??g.status)>Date.now()&&Date.parse(g.datetime??g.status)-Date.now()<48*3600000&&(!requested||String(g.id)===requested))
  if(!upcoming.length)return NextResponse.json({games:0,skipped:'No upcoming NBA games inside the capture window'})
  const admin=createAdminClient()
  const successKey=(id:number)=>`public-success:${NBA_PUBLIC_VERSION}:${id}`
  const attemptKey=(id:number)=>`public-attempt:${NBA_PUBLIC_VERSION}:${id}`
  const {data:checks,error:checkError}=await admin.from('nba_source_cache').select('key,fetched_at').in('key',upcoming.flatMap(g=>[successKey(g.id),attemptKey(g.id)])).limit(200)
  if(checkError)return NextResponse.json({error:'Public capture preflight failed'},{status:503})
  // An unchanged successful read still counts toward the refresh cadence; the
  // append-only public history preserves its actual observation time and counts.
  // A reviewed parser version change deliberately refreshes affected games once;
  // old source captures remain append-only and never masquerade as new facts.
  const last=(id:number)=>checks?.find(p=>p.key===successKey(id))?.fetched_at
  const attempted=(id:number)=>checks?.find(p=>p.key===attemptKey(id))?.fetched_at??'1970-01-01'
  const due=upcoming.filter(g=>!last(g.id)||Date.now()-Date.parse(last(g.id)!)>30*60000).sort((a,b)=>Date.parse(attempted(a.id))-Date.parse(attempted(b.id))||Date.parse(last(a.id)??'1970-01-01')-Date.parse(last(b.id)??'1970-01-01'))
  if(!due.length)return NextResponse.json({games:upcoming.length,skipped:'Captures are current'})
  const lease=await acquirePikkitBrowserLease()
  if(!lease)return NextResponse.json({stage:'deferred',reason:'Pikkit browser busy; deferred to the next run',games:upcoming.length,due:due.length,deferred:due.length},{status:425})
  const results:{game:number;ok:boolean;reason?:string;markets?:number;diagnostic?:unknown;emptyShellReloaded?:boolean}[]=[]
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
        let captureExpired=false,emptyShellReloaded=false
        const gameStarted=Date.now(),gameBudget=Math.min(110000,remaining()-25000)
        const identities:NbaPublicEventIdentity[]=[],eventIdentities:NbaPublicEventIdentity[]=[],pending=new Set<Promise<void>>()
        const requests=new Set<BrowserRequest>(),eventRequests=new Set<BrowserRequest>()
        let observing=true,eventNavigation=0,eventResponseReceived=()=>{}
        let eventResponseReady=new Promise<void>(()=>{})
        const beginEventNavigation=()=>{
          eventNavigation++;eventRequests.clear();eventIdentities.length=0
          eventResponseReady=new Promise<void>(resolve=>{eventResponseReceived=resolve})
        }
        const observeRequest=(request:BrowserRequest)=>{
          const kind=nbaPublicResponseKind(request.url())
          if(!observing||!kind)return
          requests.add(request)
          if(kind==='event'&&eventNavigation>0)eventRequests.add(request)
        }
        const observe=(response:BrowserResponse)=>{
          const kind=nbaPublicResponseKind(response.url())
          if(!observing||!kind||response.status()!==200)return
          const request=response.request(),navigation=eventNavigation
          // Track request objects emitted after this game/navigation began:
          // late prior-page responses and browser/server clock skew cannot pass.
          if(!(kind==='event'?eventRequests:requests).has(request))return
          const read=response.json().then(payload=>{
            if(!observing||kind==='event'&&navigation!==eventNavigation)return
            const events=nbaPublicEventIdentities(response.url(),payload)
            identities.push(...events)
            if(kind==='event'){
              eventIdentities.push(...events)
              // Unrelated prefetches do not finish the wait. A conflict wakes
              // validation so it rejects, while a matching response can proceed.
              try{if(nbaVerifiedPublicEvent(game,eventIdentities))eventResponseReceived()}catch{eventResponseReceived()}
            }
          }).catch(()=>undefined).finally(()=>pending.delete(read))
          pending.add(read)
        }
        browser.page.on('request',observeRequest);browser.page.on('response',observe)
        const pendingMetadata=()=>bounded(Promise.all([...pending]),4000,'NBA event metadata read deadline')
        try{
          await bounded((async()=>{
          await browser.page.goto('https://app.pikkit.com/leagues/nba',{waitUntil:'domcontentloaded',timeout:20000})
          // A confirmed sign-in redirect requires operator attention. Do not
          // misreport it as an unlisted event or spend the rest of the batch
          // repeating the same unauthenticated navigation.
          requirePikkitPageSession(browser.page.url())
          await browser.page.waitForFunction((team)=>document.body.innerText.includes(team),game.visitor_team.full_name,{timeout:15000}).catch(()=>undefined)
          requirePikkitPageSession(browser.page.url())
          const navigate=async()=>{
            await pendingMetadata()
            const listed=nbaVerifiedPublicEvent(game,identities)
            beginEventNavigation()
            if(listed){await browser.page.goto(nbaPublicEventUrl(listed),{waitUntil:'domcontentloaded',timeout:20000});return true}
            return findAndClickPikkitGame(browser.page,game.visitor_team.full_name,game.home_team.full_name)
          }
          let found=await navigate()
          if(!found){await browser.page.waitForTimeout(3000);found=await navigate()}
          // An intermittently empty league shell is different from a populated
          // schedule without this event. Reload it once, only with enough time
          // left inside the existing game/run deadlines and no sign-in state.
          if(!found&&Math.min(gameBudget-(Date.now()-gameStarted),remaining()-25000)>=60000){
            const emptyShell=await bounded(browser.page.evaluate(()=>{
              const text=document.body.innerText.trim()
              return location.pathname.replace(/\/$/,'')==='/leagues/nba'&&text.length<400&&!/sign\s*in|log\s*in|verify your|create an account/i.test(text)&&document.querySelectorAll('a[href*="/event/"]').length===0&&document.querySelectorAll('select').length===0
            }),4000,'NBA league shell check deadline').catch(()=>false)
            if(emptyShell===true){
              emptyShellReloaded=true
              await browser.page.reload({waitUntil:'domcontentloaded',timeout:20000})
              requirePikkitPageSession(browser.page.url())
              await browser.page.waitForFunction((team)=>document.body.innerText.includes(team),game.visitor_team.full_name,{timeout:15000}).catch(()=>undefined)
              requirePikkitPageSession(browser.page.url())
              found=await navigate()
            }
          }
          if(!found)throw new Error('NBA event is not listed')
          await browser.page.waitForTimeout(2200)
          // Event headers now show only a local time. Bind the full dated
          // timestamp from this navigation's event response, never a prior page.
          await bounded(eventResponseReady,15000,'NBA event metadata deadline')
          await pendingMetadata()
          nbaVerifiedPublicEvent(game,identities) // Reject conflicting listing/event identities.
          const identity=nbaVerifiedPublicEvent(game,eventIdentities)
          if(!identity)throw new Error('NBA event teams and start could not be verified')
          await browser.page.waitForFunction(({names})=>{const text=document.body.innerText,normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');return names.every(name=>normalize(text).includes(normalize(name)))},{names:[identity.away.full,identity.home.full]},{timeout:15000}).catch(()=>undefined)
          const text=await browser.page.evaluate(()=>document.body.innerText)
          if(!nbaPublicEventPageMatches(game,identity,browser.page.url(),text))throw new Error('NBA event page could not be verified')
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
          const canonicalGame=await getNbaOddsGame(game)
          await pendingMetadata()
          const currentIdentity=nbaVerifiedPublicEvent(canonicalGame,identities)
          const finalText=await browser.page.evaluate(()=>document.body.innerText)
          if(captureExpired)throw new NbaCaptureDeadline('NBA game capture deadline')
          const capturedAt=Date.parse(payload.capturedAt)
          // Browser and server clocks may differ slightly. Keep the existing
          // 60-second tolerance, but a capture timestamp may never cross tipoff.
          if(!currentIdentity||currentIdentity.id!==identity.id||payload.url!==nbaPublicEventUrl(identity)||!Number.isFinite(capturedAt)||capturedAt<gameStarted-60000||capturedAt>Date.now()+60000||capturedAt>=Date.parse(canonicalGame.datetime??canonicalGame.status)||!nbaPublicEventPageMatches(canonicalGame,identity,browser.page.url(),finalText))throw new Error('NBA event changed or started during capture')
          const imported=await nbaSharedCache(successKey(game.id),1800,0,()=>importNbaPublic(canonicalGame,payload),25)
          if(!captureExpired)results.push({game:game.id,ok:true,markets:imported.value.markets,...(emptyShellReloaded?{emptyShellReloaded:true}:{})})
          })(),gameBudget,'NBA game capture deadline')
        }catch(error){
          // page.url() is local Playwright state: retain a safe path even when
          // navigation leaves the remote page unable to answer a DOM probe.
          const path=(()=>{try{return diagnosticPath(browser.page.url())}catch{return null}})()
          const base={path,...(path&&/^\/(?:login|signin|sign-in|join|auth|verify)$/.test(path)?{authenticationRequired:true}:{})}
          const diagnostic=error instanceof NbaCaptureDeadline?{...base,deadline:true}:error instanceof NbaPikkitAuthenticationRequired?{...base,authenticationRequired:true}:await bounded(browser.page.evaluate((away)=>{const text=document.body?.innerText??'';return {bodyLength:text.length,signIn:/sign in|log in|verify your/i.test(text),awayTeamMentioned:text.toLowerCase().includes(away.toLowerCase()),selectCount:document.querySelectorAll('select').length,eventCount:document.querySelectorAll('a[href*="/event/"]').length}},game.visitor_team.full_name),4000,'NBA capture diagnostic deadline').then(counts=>({...base,...counts})).catch(probeError=>({...base,diagnosticError:diagnosticError(probeError)}))
          results.push({game:game.id,ok:false,reason:error instanceof Error?error.message:'NBA capture failed',diagnostic,...(emptyShellReloaded?{emptyShellReloaded:true}:{})})
          if(error instanceof NbaPikkitAuthenticationRequired){runError=error.message;break}
          if(error instanceof NbaCaptureDeadline){captureExpired=true;timedOut=true;break}
        }finally{
          observing=false;browser.page.off('request',observeRequest);browser.page.off('response',observe)
          await bounded(nbaSharedCache(attemptKey(game.id),30,0,async()=>({game:game.id,ok:results.some(result=>result.game===game.id&&result.ok)}),10),5000,'NBA attempt receipt deadline').catch(()=>cleanupIssues.push('NBA public attempt progress could not save'))
        }
      }
    }finally{await bounded(browser.close(),15000,'NBA browser close deadline').then(()=>{browserReleased=true}).catch(()=>cleanupIssues.push('Browser release could not be confirmed; automatic 300-second browser expiry remains enabled'))}
  }catch(error){timedOut=true;runError=error instanceof NbaCaptureDeadline?error.message:'Pikkit browser could not open'}finally{
    if(!browserOpened||!browserReleased)cleanupIssues.push('The shared context lease is retained until its safety expiry because browser shutdown could not be confirmed')
    else await bounded(lease.release(),10000,'NBA browser lease release deadline').then(released=>{if(released===false)cleanupIssues.push('Shared browser lease release could not be confirmed; automatic lease expiry remains enabled')}).catch(()=>cleanupIssues.push('Shared browser lease release could not be confirmed'))
  }
  const unavailable=results.filter(result=>!result.ok&&result.reason==='NBA event is not listed').length
  const failed=results.filter(result=>!result.ok&&result.reason!=='NBA event is not listed').length,deferred=due.length-results.length+unavailable
  return NextResponse.json({games:upcoming.length,due:due.length,failed,unavailable,deferred,results,reason:runError??(deferred?'NBA public coverage is incomplete; deferred to the next run':null),cleanupIssues},{status:runError||cleanupIssues.length?503:failed?502:deferred?425:200})
}
export const GET=withPipelineHealth('poll-pikkit-nba-picks',run,{allowSecondarySecret:true})
