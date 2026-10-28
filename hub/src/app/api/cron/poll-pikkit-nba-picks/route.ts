import {NextResponse} from 'next/server'
import {requireBrowserbaseCronAuth} from '@/lib/cron-auth'
import {withPipelineHealth} from '@/lib/pipelineHealth'
import {getPaintSchedule} from '@/lib/nbaPaintData'
import {getNbaOddsGame} from '@/lib/nbaOddsClockData'
import {nbaToday} from '@/lib/nbaPaint'
import {nbaGameStart,nbaPregameOpen} from '@/lib/nbaOddsMode'
import {nbaPublicGameControlKey,nbaPublicContextControlKey,nbaPublicCaptureDecision,nbaNextPublicControl,type NbaPublicOutcome} from '@/lib/nbaPublicCaptureControl'
import {readNbaPublicControls,saveNbaPublicControl} from '@/lib/nbaPublicCaptureControlData'
import {createAdminClient} from '@/lib/supabase/admin'
import {acquirePikkitBrowserLease} from '@/lib/pikkitBrowserLease'
import {openPikkitSession} from '@/lib/browserbase'
import {NbaBrowserBudgetError} from '@/lib/nbaBrowserBudget'
import {findAndClickPikkitGame} from '@/lib/scrapers/gameMatch'
import {observePikkitLeagueDates} from '@/lib/scrapers/pikkitLeagueDate'
import {runNbaPikkitScrape} from '@/lib/scrapers/nbaPikkitScraper'
import {importNbaPublic} from '@/lib/nbaPublicServer'
import {NBA_PUBLIC_VERSION} from '@/lib/nbaPublic'
import {nbaPublicResponseKind,nbaPublicEventIdentities,nbaVerifiedPublicEvent,nbaPublicEventUrl,nbaPublicEventPageMatches,nbaPublicTeamLabel,type NbaPublicEventIdentity} from '@/lib/nbaPublicEventIdentity'
import {nbaSharedCache} from '@/lib/nbaSharedCache'
import type {Response as BrowserResponse,Request as BrowserRequest} from 'playwright-core'
export const maxDuration=300
class NbaCaptureDeadline extends Error {}
class NbaPikkitAuthenticationRequired extends Error {}
function requirePikkitPageSession(url:string){
 if(/\/(?:login|signin|sign-in|join|auth|verify)(?:\/|$)/i.test(new URL(url).pathname))throw new NbaPikkitAuthenticationRequired('Pikkit authentication is unavailable on the current page')
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
  // Public counts use sparse pregame checkpoints, not continuous price polling.
  const upcoming=schedule.games.filter(g=>['scheduled','unknown',undefined].includes(g.status_state)&&nbaPregameOpen(g,Date.now())&&nbaGameStart(g)!-Date.now()<=24*3600000&&(!requested||String(g.id)===requested))
  if(!upcoming.length)return NextResponse.json({games:0,browserSessions:0,skipped:'No upcoming NBA games inside the capture window'})
  const admin=createAdminClient()
  const successKey=(id:number)=>`public-success:${NBA_PUBLIC_VERSION}:${id}`
  const attemptKey=(id:number)=>`public-attempt:${NBA_PUBLIC_VERSION}:${id}`
  const contextKey=nbaPublicContextControlKey(context),gameKey=(game:typeof upcoming[number])=>nbaPublicGameControlKey(game,NBA_PUBLIC_VERSION)
  const keys=[contextKey,...upcoming.map(gameKey)]
  const {data:checks,error:checkError}=await admin.from('nba_source_cache').select('key,fetched_at').in('key',upcoming.flatMap(g=>[successKey(g.id),attemptKey(g.id)])).limit(200)
  if(checkError)return NextResponse.json({error:'Public capture preflight failed'},{status:503})
  // Legacy successful observations bootstrap the new policy. A parser change
  // cannot relabel old captures as new facts, and partial reads are never success.
  const last=(id:number)=>checks?.find(p=>p.key===successKey(id))?.fetched_at??null
  const attempted=(id:number)=>checks?.find(p=>p.key===attemptKey(id))?.fetched_at??'1970-01-01'
  let controls:Awaited<ReturnType<typeof readNbaPublicControls>>
  try{controls=await readNbaPublicControls(keys)}catch{return NextResponse.json({error:'Public capture controls unavailable'},{status:503})}
  const contextCooldown=()=>{const control=controls.get(contextKey);return control&&Date.parse(control.nextAttemptAt)>Date.now()?control:null}
  const cooldownResponse=()=>{const control=contextCooldown();return NextResponse.json({stage:'deferred',reason:control?.outcome==='auth'?'NBA public authentication cooldown':'NBA public browser cooldown',retryAt:control?.nextAttemptAt,browserSessions:0,results:[]},{status:425})}
  if(contextCooldown())return cooldownResponse()
  const eligible=()=>upcoming.filter(game=>nbaPublicCaptureDecision(game,last(game.id),controls.get(gameKey(game)),Date.now()).due)
    .sort((a,b)=>Date.parse(controls.get(gameKey(a))?.attemptedAt??attempted(a.id))-Date.parse(controls.get(gameKey(b))?.attemptedAt??attempted(b.id))||nbaGameStart(a)!-nbaGameStart(b)!)
  let due=eligible()
  if(!due.length)return NextResponse.json({games:upcoming.length,due:0,browserSessions:0,skipped:'Captures are current',decisions:upcoming.map(game=>({gameId:game.id,...nbaPublicCaptureDecision(game,last(game.id),controls.get(gameKey(game)),Date.now())}))})
  const lease=await acquirePikkitBrowserLease()
  if(!lease)return NextResponse.json({stage:'deferred',reason:'Pikkit browser busy; deferred to the next run',games:upcoming.length,due:due.length,deferred:due.length,browserSessions:0},{status:425})
  // A different instance may have finished between preflight and lease claim.
  // Re-read under the existing shared-context lease before any paid launch.
  try{
    controls=await readNbaPublicControls(keys)
    due=eligible()
    if(contextCooldown()||!due.length){
      const released=await lease.release()
      if(released===false)return NextResponse.json({error:'Shared browser lease release could not be confirmed'},{status:503})
      return contextCooldown()?cooldownResponse():NextResponse.json({games:upcoming.length,due:0,browserSessions:0,skipped:'Captures are current'})
    }
  }catch{
    await lease.release().catch(()=>false)
    return NextResponse.json({error:'Public capture controls unavailable'},{status:503})
  }
  const contextPrior=controls.get(contextKey)
  const results:{game:number;ok:boolean;reason?:string;markets?:number;rows?:number;saved?:boolean;coverage?:Record<string,number>;diagnostic?:unknown;emptyShellReloaded?:boolean}[]=[]
  let timedOut=false,browserOpened=false,browserReleased=false,authenticationRequired=false,progressFailed=false,runError:string|null=null
  let budgetDenied:NbaBrowserBudgetError|null=null
  const cleanupIssues:string[]=[],remaining=()=>250000-(Date.now()-started)
  try{
    // Persist even a terminated startup, so the next instance cannot hot-loop.
    await saveNbaPublicControl(contextKey,nbaNextPublicControl(contextPrior,'running',Date.now()))
    const opening=openPikkitSession(context,{sport:'nba',mode:'daily-public',gameCount:due.length},{requestTimeoutMs:15000})
    void opening.then(browser=>{if(timedOut)void bounded(browser.close(),15000,'Late browser release deadline').catch(()=>undefined)}).catch(()=>undefined)
    const browser=await bounded(opening,Math.min(75000,remaining()),'Pikkit browser startup deadline')
    browserOpened=true
    browser.page.setDefaultTimeout(12000);browser.page.setDefaultNavigationTimeout(20000)
    try{
      for(const game of due){
        if(remaining()<35000||progressFailed)break
        if(!nbaPregameOpen(game,Date.now()))continue
        const controlKey=gameKey(game),prior=controls.get(controlKey)
        let outcome:NbaPublicOutcome='failed',successAt:string|undefined
        await saveNbaPublicControl(controlKey,nbaNextPublicControl(prior,'running',Date.now(),nbaGameStart(game)!))
        const awaySourceName=nbaPublicTeamLabel(game.visitor_team),homeSourceName=nbaPublicTeamLabel(game.home_team)
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
        const calendar=observePikkitLeagueDates(browser.page)
        const pendingMetadata=()=>bounded(Promise.all([...pending]),4000,'NBA event metadata read deadline')
        try{
          await bounded((async()=>{
          await browser.page.goto('https://app.pikkit.com/leagues/nba',{waitUntil:'domcontentloaded',timeout:20000})
          // A confirmed sign-in redirect requires operator attention. Do not
          // misreport it as an unlisted event or spend the rest of the batch
          // repeating the same unauthenticated navigation.
          requirePikkitPageSession(browser.page.url())
          const dateAvailable=await calendar.selectDate(game.date)
          requirePikkitPageSession(browser.page.url())
          if(!dateAvailable)throw new Error('NBA event is not listed')
          await browser.page.waitForFunction((team)=>document.body.innerText.includes(team),awaySourceName,{timeout:15000}).catch(()=>undefined)
          requirePikkitPageSession(browser.page.url())
          const navigate=async()=>{
            await pendingMetadata()
            nbaVerifiedPublicEvent(game,identities)
            beginEventNavigation()
            // The source's event cards use client-side routing. A hard event
            // reload can lose the source's in-memory authenticated state even
            // after the saved login validated on the league page. Follow the
            // real card; the fresh event response below still binds exact ID,
            // teams, date and tipoff before anything can be imported.
            return findAndClickPikkitGame(browser.page,awaySourceName,homeSourceName)
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
              if(!await calendar.selectDate(game.date))throw new Error('NBA event is not listed')
              await browser.page.waitForFunction((team)=>document.body.innerText.includes(team),awaySourceName,{timeout:15000}).catch(()=>undefined)
              requirePikkitPageSession(browser.page.url())
              found=await navigate()
            }
          }
          if(!found)throw new Error('NBA event is not listed')
          requirePikkitPageSession(browser.page.url())
          await browser.page.waitForTimeout(2200)
          requirePikkitPageSession(browser.page.url())
          // Event headers now show only a local time. Bind the full dated
          // timestamp from this navigation's event response, never a prior page.
          await bounded(eventResponseReady,15000,'NBA event metadata deadline').catch(()=>{
            // This passive wait has no browser work to cancel. Missing evidence
            // rejects this game; the enclosing game/run deadlines still stop work.
            requirePikkitPageSession(browser.page.url())
            throw new Error('NBA event metadata could not be verified')
          })
          await pendingMetadata()
          requirePikkitPageSession(browser.page.url())
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
          const extractionBudget=Math.max(0,Math.min(80000,gameBudget-(Date.now()-gameStarted)-15000))
          const payload=await browser.page.evaluate(runNbaPikkitScrape,{maxDurationMs:extractionBudget})
          // A failed category must not discard independently verified siblings.
          // Every category and its observation time is retained by the importer;
          // incomplete coverage never satisfies a successful checkpoint.
          if(!payload.marketStates.length)throw new Error('NBA public market controls could not be verified')
          if(captureExpired)throw new NbaCaptureDeadline('NBA game capture deadline')
          const canonicalGame=await getNbaOddsGame(game)
          await pendingMetadata()
          requirePikkitPageSession(browser.page.url())
          const currentIdentity=nbaVerifiedPublicEvent(canonicalGame,identities)
          const finalText=await browser.page.evaluate(()=>document.body.innerText)
          if(captureExpired)throw new NbaCaptureDeadline('NBA game capture deadline')
          const capturedAt=Date.parse(payload.capturedAt)
          // Browser and server clocks may differ slightly. Keep the existing
          // 60-second tolerance, but a capture timestamp may never cross tipoff.
          if(!currentIdentity||currentIdentity.id!==identity.id||payload.url!==nbaPublicEventUrl(identity)||!Number.isFinite(capturedAt)||capturedAt<gameStarted-60000||capturedAt>Date.now()+60000||capturedAt>=Date.parse(canonicalGame.datetime??canonicalGame.status)||!nbaPublicEventPageMatches(canonicalGame,identity,browser.page.url(),finalText))throw new Error('NBA event changed or started during capture')
          const imported=await importNbaPublic(canonicalGame,payload)
          if(captureExpired)throw new NbaCaptureDeadline('NBA game capture deadline')
          const complete=imported.complete===true&&imported.available===true
          outcome=complete?'captured':imported.available===false?'unavailable':'partial'
          successAt=complete?imported.observedAt??payload.capturedAt:undefined
          if(complete)await nbaSharedCache(successKey(game.id),1800,0,async()=>({game:game.id,markets:imported.markets,rows:imported.rows,observedAt:imported.observedAt,coverage:imported.coverage}),25)
          if(!captureExpired)results.push({game:game.id,ok:complete,saved:imported.available,rows:imported.rows,markets:imported.markets,coverage:imported.coverage,...(!complete?{reason:imported.available===false?'NBA public markets are not available yet':'NBA public market observations are unresolved'}:{}),...(emptyShellReloaded?{emptyShellReloaded:true}:{})})
          })(),gameBudget,'NBA game capture deadline')
        }catch(error){
          // page.url() is local Playwright state: retain a safe path even when
          // navigation leaves the remote page unable to answer a DOM probe.
          const path=(()=>{try{return diagnosticPath(browser.page.url())}catch{return null}})()
          const base={path,...(path&&/^\/(?:login|signin|sign-in|join|auth|verify)$/.test(path)?{authenticationRequired:true}:{})}
          const diagnostic=error instanceof NbaCaptureDeadline?{...base,deadline:true}:error instanceof NbaPikkitAuthenticationRequired?{...base,authenticationRequired:true}:await bounded(browser.page.evaluate((away)=>{const text=document.body?.innerText??'';return {bodyLength:text.length,signIn:/sign in|log in|verify your/i.test(text),awayTeamMentioned:text.toLowerCase().includes(away.toLowerCase()),selectCount:document.querySelectorAll('select').length,eventCount:document.querySelectorAll('a[href*="/event/"]').length}},awaySourceName),4000,'NBA capture diagnostic deadline').then(counts=>({...base,...counts})).catch(probeError=>({...base,diagnosticError:diagnosticError(probeError)}))
          results.push({game:game.id,ok:false,reason:error instanceof Error?error.message:'NBA capture failed',diagnostic,...(emptyShellReloaded?{emptyShellReloaded:true}:{})})
          if(error instanceof NbaPikkitAuthenticationRequired||base.authenticationRequired){authenticationRequired=true;outcome='auth';runError='Pikkit authentication is unavailable on the current page';break}
          if(error instanceof Error&&error.message==='NBA event is not listed')outcome='unavailable'
          if(error instanceof NbaCaptureDeadline){captureExpired=true;timedOut=true;break}
        }finally{
          observing=false;calendar.dispose();browser.page.off('request',observeRequest);browser.page.off('response',observe)
          await saveNbaPublicControl(controlKey,nbaNextPublicControl(prior,outcome,Date.now(),nbaGameStart(game)!,successAt)).catch(()=>{progressFailed=true;cleanupIssues.push('NBA public attempt progress could not save')})
        }
      }
    }finally{await bounded(browser.close(),15000,'NBA browser close deadline').then(()=>{browserReleased=true}).catch(()=>cleanupIssues.push('Browser release could not be confirmed; automatic 300-second browser expiry remains enabled'))}
  }catch(error){
    // This typed admission error is thrown before session creation. Only that
    // verified no-browser path may release the lease without remote teardown.
    if(!browserOpened&&error instanceof NbaBrowserBudgetError)budgetDenied=error
    else{timedOut=true;runError=error instanceof NbaCaptureDeadline?error.message:'Pikkit browser could not open'}
  }finally{
    await saveNbaPublicControl(contextKey,nbaNextPublicControl(contextPrior,authenticationRequired?'auth':runError||cleanupIssues.length||timedOut?'failed':'ready',Date.now())).catch(()=>cleanupIssues.push('NBA public browser cooldown could not save'))
    if(!budgetDenied&&(!browserOpened||!browserReleased))cleanupIssues.push('The shared context lease is retained until its safety expiry because browser shutdown could not be confirmed')
    else await bounded(lease.release(),10000,'NBA browser lease release deadline').then(released=>{if(released===false)cleanupIssues.push('Shared browser lease release could not be confirmed; automatic lease expiry remains enabled')}).catch(()=>cleanupIssues.push('Shared browser lease release could not be confirmed'))
  }
  if(budgetDenied&&!cleanupIssues.length)return NextResponse.json({stage:'deferred',reason:budgetDenied.message,budgetCode:budgetDenied.code,games:upcoming.length,due:due.length,browserSessions:0,attempted:0,failed:0,deferred:due.length,results:[]},{status:425})
  const unavailableReasons=new Set(['NBA event is not listed','NBA public markets are not available yet'])
  const unavailable=results.filter(result=>!result.ok&&unavailableReasons.has(result.reason??'')).length
  const failed=results.filter(result=>!result.ok&&!unavailableReasons.has(result.reason??'')).length,deferred=due.length-results.length+unavailable
  return NextResponse.json({games:upcoming.length,due:due.length,browserSessions:browserOpened?1:0,attempted:results.length,failed,unavailable,deferred,results,reason:runError??(deferred?'NBA public coverage is incomplete; deferred to the next run':null),cleanupIssues},{status:runError||cleanupIssues.length?503:failed?502:deferred?425:200})
}
export const GET=withPipelineHealth('poll-pikkit-nba-picks',run,{allowSecondarySecret:true})
