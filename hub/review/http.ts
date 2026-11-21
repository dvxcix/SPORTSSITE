import {NextRequest,NextResponse} from 'next/server'
import {authUser,reviewProfile,table,REVIEW_DATE,type ReviewRole} from './database'
import {makeBoard,games,getPaintScouting,getPaintProfile,observedAt} from './nba'
import * as resources from './nba-resources'
import {makeNflOdds,makeLens,nflGames,storedGameState,makeNflSlateEdge,getNflTouchdownFeed,nflReviewTimeline} from './nfl'
import {nbaSlateRows} from '../src/lib/nbaSlate'
import {nbaSlipSurgeScore,nbaPosition,nbaGamePace,nbaScoreDetails} from '../src/lib/nbaIntelligence'
import {nbaScoreWorkloads} from '../src/lib/nbaScoreWorkload'
import {nbaMarketRanks} from '../src/lib/nbaMarketMetrics'
import {nbaReference,type PaintMarket} from '../src/lib/nbaPaint'
import {nbaMarketSupportView,nbaMarketSupport} from '../src/lib/nbaMarketSignal'
import {nbaPackFullBoard} from '../src/lib/nbaFullOddsBoard'
import {nbaOddsBoardPhaseHeader,nbaOddsBoardPhaseSignature} from '../src/lib/nbaOddsBoardPhase'
import {nbaMilestoneSignals} from '../src/lib/nbaMilestoneSignals'
import {DEFAULT_RESEARCH_PREFERENCES,validResearchPreferences} from '../src/lib/researchPreferences'
/** Complete interception of local review API requests. No request falls through to a real handler. */
export async function reviewHttp(request:NextRequest){
 const path=request.nextUrl.pathname,q=request.nextUrl.searchParams
 const role=(request.cookies.get('ss_ui_review_role')?.value??'member') as ReviewRole
 const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-SlipSurge-Review':'local-fixtures-only'}})
 const board=makeBoard(games.find(g=>g.id===Number(q.get('game')))??games[0])
 if(path.startsWith('/api/share-image/'))return new NextResponse('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#111820"/><rect x="64" y="64" width="8" height="502" rx="4" fill="#b4ff4d"/><text x="112" y="150" fill="#b4ff4d" font-family="Arial" font-size="42" font-weight="700">SlipSurge</text><text x="112" y="290" fill="#fff" font-family="Arial" font-size="62">25+ points</text><text x="112" y="380" fill="#fff" font-family="Arial" font-size="40">Jayson Tatum · BOS</text><text x="112" y="510" fill="#a3b3c5" font-family="Arial" font-size="28">Illustrative card · private design review</text></svg>',{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store','X-SlipSurge-Review':'local-fixtures-only'}})
 if(path==='/api/composer/nba-games')return json({date:REVIEW_DATE,games:games.map(game=>({gameKey:String(game.id),gamePk:String(game.id),gameDate:game.date,homeAbbr:game.home_team.abbreviation,awayAbbr:game.visitor_team.abbreviation,homeTeam:game.home_team.full_name,awayTeam:game.visitor_team.full_name,status:'Preview',players:makeBoard(game).players.map(player=>({player_id:String(player.id),mlb_id:null,name:player.first_name+' '+player.last_name,team:player.team.abbreviation,position:player.position,headshot_url:player.headshot,markets:[{key:'points:milestone',prop_type:'points',label:'Points',line:25,offers:[{vendor:'fanduel',side:'milestone',odds:-110},{vendor:'draftkings',side:'milestone',odds:-108}]}]}))}))})
 if(path==='/api/composer/nfl-games')return json({date:REVIEW_DATE,games:nflGames.map(game=>({gameKey:game.id,gamePk:game.id,gameDate:game.gameday,homeAbbr:game.home.abbr,awayAbbr:game.away.abbr,homeTeam:game.home.name,awayTeam:game.away.name,status:'Preview',players:makeLens(game).windows.season.players.map(player=>({player_id:player.id,mlb_id:null,name:player.name,team:player.team,position:player.position,headshot_url:player.headshot,markets:[{key:'passing_yards:over_under',prop_type:'passing_yards',label:'Passing yards',line:249.5,offers:[{vendor:'fanduel',side:'over',odds:-110},{vendor:'draftkings',side:'over',odds:-108}]}]}))}))})
 if(path==='/api/account/preferences'){

  const user=authUser(role)
  if(!user)return json({error:'Sign in required.'},401)
  const rows=table('member_research_preferences'),row=rows.find(item=>item.user_id===user.id)
  const current=row?.preferences??structuredClone(DEFAULT_RESEARCH_PREFERENCES)
  if(request.method==='GET')return json({preferences:current})
  if(request.method==='PATCH'){
   const body=await request.json().catch(()=>null)
   if(body?.kind!=='research'||Object.keys(body).some(key=>!['kind','value','expected'].includes(key))||!validResearchPreferences(body.value)||!validResearchPreferences(body.expected))return json({error:'Invalid research preferences.'},400)
   const canonical=(value:typeof current)=>JSON.stringify([value.version,value.launchPage,value.books,value.primaryBook])
   if(canonical(current)!==canonical(body.expected))return json({error:'Preferences changed while editing.'},409)
   if(row)row.preferences=structuredClone(body.value);else rows.push({user_id:user.id,preferences:structuredClone(body.value)})
   return json({ok:true})
  }
 }
 if(!['GET','HEAD'].includes(request.method)){
  // Only UI editing in the isolated in-memory adapter is allowed. APIs never execute operational actions.
  return json({error:'This action is disabled in private design review. No live changes were made.',code:'PRIVATE_REVIEW_ONLY'},409)
 }
 if(path==='/api/account/me')return role==='guest'?json({profile:null},401):json({profile:reviewProfile(role),user:authUser(role)})
 if(path==='/api/account/nfl-access')return json({allowed:role!=='guest'})
 if(path==='/api/account/favorites')return json({teams:[],players:[],sports:['nba','nfl'],catalog:[...games.flatMap(g=>[g.home_team,g.visitor_team].map(t=>({key:'NBA:'+t.abbreviation,sport:'nba',id:String(t.id),href:'/nba/teams/'+t.id,name:t.full_name,abbr:t.abbreviation,logo:'/review-assets/team-'+t.abbreviation+'.png'}))),...nflGames.flatMap(g=>[g.away,g.home].map(t=>({key:'NFL:'+t.abbr,sport:'nfl',id:t.abbr,href:'/nfl/teams/'+t.abbr,name:t.name,abbr:t.abbr,logo:t.logo})))],favorites:{teams:[],players:[]}})
 if(path==='/api/account/favorites/players')return json({players:board.players.filter(p=>(p.first_name+' '+p.last_name).toLowerCase().includes((q.get('q')??'').toLowerCase())).map(p=>({id:p.id,player_id:p.id,sport:'nba',name:p.first_name+' '+p.last_name,team:p.team.abbreviation,headshot:p.headshot}))})
 if(path==='/api/admin/discord/contact-alerts')return json({ready:false,enabled:false,channels:{hr:{configured:false,id:null},nearHr:{configured:false,id:null}},queue:{pending:0,processing:0,failed:0,succeeded:0},latestSuccessAt:null,latestFailureAt:null,recoverySchedule:'Private local review',recent:[]})
 if(path==='/api/admin/discord/slate-command')return json({slateId:null,otherCount:0})
 if(path==='/api/admin/nfl-access')return json({grants:[],count:0,users:table('users')})
 if(path==='/api/admin/feature-rollouts')return json({rollouts:table('site_settings').map(s=>({feature_key:s.key,audience:'everyone',rollout_percent:100,rollout_salt:'private-review',updated_at:observedAt}))})
 if(path==='/api/admin/contact-recap')return json({date:REVIEW_DATE,generatedAt:observedAt,games:[],contacts:[],homeRuns:[],nearHomeRuns:[],dataNotes:['Illustrative design review. MLB is in its off-season.']})
 if(path==='/api/admin/contact-recap-jobs')return json({jobs:[]})
 if(path==='/api/nba-matrices/evaluate')return json({gameId:board.game.id,matrices:[],matches:[],players:[],unavailable:[]})
 if(path==='/the-paint/board'){
  if(q.get('phase_only')==='1'){
   const checkedAt=Date.now()
   return new NextResponse(null,{status:204,headers:{'X-NBA-Slate-Phase':nbaOddsBoardPhaseHeader({date:REVIEW_DATE,checkedAt,signature:nbaOddsBoardPhaseSignature(games)!}),'X-NBA-Slate-Phase-Expires':String(checkedAt+60000)}})
  }
  return json(board)
 }
 if(path==='/the-paint/lineups')return json({gameId:board.game.id,mode:q.get('mode')==='live'?'live':'pregame',cutoffAt:board.game.datetime,checkedAt:observedAt,unavailable:false,teams:[board.game.visitor_team,board.game.home_team].map((team,i)=>({teamId:team.id,status:i?'expected':'confirmed',source:'pregame',sourceId:team.id,observedAt,players:board.players.filter(p=>p.team.id===team.id).slice(0,5).map((p,j)=>({id:p.id,firstName:p.first_name,lastName:p.last_name,position:['PG','SG','SF','PF','C'][j]}))}))})
 if(path==='/the-paint/tracking')return json(await resources.getNbaResearchTracking(board))
 if(path==='/the-paint/scouting')return json(await getPaintScouting(board.game))
 if(path==='/the-paint/profile')return json({...await getPaintProfile(),gameId:board.game.id,playerId:Number(q.get('player')),fetchedAt:observedAt})
 if(path==='/the-paint/first-basket')return json(await resources.getNbaResearchFirstBasket(board))
 if(path==='/the-paint/shots')return json(await resources.getNbaResearchShots(board,Number(q.get('game')),Number(q.get('player'))))
 if(path==='/the-paint/history')return json({frames:[0,1,2,3].map(i=>({captured_at:REVIEW_DATE+`T${10+i*2}:00:00Z`,props:board.players.flatMap(p=>p.props.map(o=>({...o,market:{...o.market,odds:(o.market.odds??100)+30-i*10}}))),gameOdds:board.gameOdds})),openingRows:[],fetchedAt:observedAt,mode:'pregame'})
 if(path==='/the-paint/game-overview')return json({gameOdds:board.gameOdds,pricesUnavailable:false,overview:q.get('mode')==='live'?null:{gameId:board.game.id,observedAt,totalBets:21613,totalHandleDollars:698522.76,splits:['moneyline','spread','total'].flatMap((market,i)=>(market==='total'?['over','under']:['away','home']).map((side,j)=>({market,side,betShare:j?1-[.23,.44,.68][i]:[.23,.44,.68][i],moneyShare:j?1-[.19,.36,.48][i]:[.19,.36,.48][i]})))}})
 if(path==='/the-paint/public')return json({captures:[0,1].map(j=>({captured_at:observedAt,snapshot:{gameId:board.game.id,capturedAt:observedAt,sourceUrl:'local-design-review',rows:board.players.flatMap((p,i)=>['points','rebounds','assists'].map(market=>({playerId:p.id,market,picks:120-i*9-j*8}))),markets:['points','rebounds','assists'],unmatched:0}})),mode:'pregame'})
 if(path==='/the-paint/results'||path==='/the-paint/final-results')return json({gameId:board.game.id,players:[],rows:[],games:[],available:false})
 if(path==='/the-paint/intelligence'){
  const defense=await resources.getNbaResearchDefense(board),market=(q.get('market')??'points') as PaintMarket,book=q.get('book')??'all',side=q.get('side')==='under'?'under':'over',ranks=nbaMarketRanks(board.players,market,book,'all',{gameId:board.game.id,beforeDate:board.game.date})
  const tracking=await resources.getNbaResearchTracking(board),workloads=nbaScoreWorkloads(board,tracking.rows,tracking.fetchedAt)
  return json({...defense,scores:board.players.map(player=>{const opponent=player.team.id===board.game.home_team.id?board.game.visitor_team.id:board.game.home_team.id,matchup=defense.profiles.find(p=>p.teamId===opponent&&p.position===nbaPosition(player.position)&&p.market===market),score=nbaSlipSurgeScore(player,market,board.game.date,matchup as any,nbaGamePace(board),undefined,workloads.get(player.id,market));return {playerId:player.id,scoreDetails:nbaScoreDetails(score,market,observedAt,false),score:score.score,mm:ranks.get(player.id)?.mm??0,offer:nbaReference(player.props,market,book,side),minutes:score.minutes,production:score.production,newTeam:false,marketSupport:nbaMarketSupportView(nbaMarketSupport()),marketSignals:nbaMarketSupportView(nbaMarketSupport()),workload:null,workloadGap:null}}),market,book,side,mode:'pregame',unavailable:[]})
 }
 if(path==='/the-paint/divergence'){
  const props=board.players.flatMap(p=>p.props.filter(o=>o.market.type==='milestone'))
  const frames=[{captured_at:REVIEW_DATE+'T10:00:00Z',props:props.map(o=>({...o,market:{...o.market,odds:(o.market.odds??100)+(o.prop_type==='points'?30:-30)}})),gameOdds:board.gameOdds},{captured_at:observedAt,props,gameOdds:board.gameOdds}]
  return json({rows:[],milestones:nbaMilestoneSignals(frames,[],board.game.id),captures:2,publicCapturedAt:observedAt,latestAt:observedAt,stale:false})
 }
 if(path==='/the-paint/estimate')return json({available:false,estimate:null,reason:'Model outputs are not part of design review.'})
 if(path==='/the-paint/slate'){
  const boards=games.map(makeBoard),market=(q.get('market')??'points') as PaintMarket
  const defenses=await Promise.all(boards.map(async b=>({gameId:b.game.id,profiles:(await resources.getNbaResearchDefense(b)).profiles as any})))
  const rows=nbaSlateRows(boards,market,q.get('book')??'all',q.get('side')==='under'?'under':'over',true,[],defenses).map(row=>({...row,marketSupport:nbaMarketSupportView(row.marketSupport),marketSignals:nbaMarketSupportView(nbaMarketSupport())}))
  return json({date:REVIEW_DATE,rows,games:games.length,loaded:games.length,failed:[],defenseUnavailable:0,complete:true,fetchedAt:observedAt,stale:false})
 }
 if(path==='/the-paint/odds-board'){
  const boards=games.map(makeBoard),market=q.get('market')??'points',book=q.get('book')??'all'
  return json(nbaPackFullBoard({date:REVIEW_DATE,games,players:boards.flatMap(b=>b.players.map(p=>({...p,gameId:b.game.id,publicPicks:120}))),cells:boards.flatMap(b=>b.players.flatMap(p=>p.props.filter(o=>o.prop_type===market&&o.market.type==='milestone'&&(book==='all'||o.vendor===book)).map(o=>({gameId:b.game.id,playerId:p.id,vendor:o.vendor,market,line:Number(o.line_value),current:{odds:o.market.odds??-110,at:o.updated_at},opening:{odds:(o.market.odds??-110)+30,at:REVIEW_DATE+'T10:00:00Z'},previous:{odds:(o.market.odds??-110)+10,at:REVIEW_DATE+'T15:00:00Z'}})))),failed:[],unavailable:[],firstUnavailable:[],captureWarning:[],complete:true,stale:false,selectedBook:book,phaseCheckedAt:Date.now()}))
 }
 if(path==='/the-paint/first-basket/odds')return json({mode:'pregame',date:REVIEW_DATE,requestedDate:REVIEW_DATE,games:3,loaded:3,failed:0,status:'ready',rows:games.flatMap(game=>makeBoard(game).players.slice(0,4).flatMap((player,i)=>['fanduel','draftkings'].map((vendor,j)=>({game,player,offer:{id:player.id*10+j,game_id:game.id,player_id:player.id,vendor,prop_type:'first_score',line_value:'0.5',market:{type:'over_under',over_odds:450+i*100+j*20},updated_at:observedAt,opening:{over:{odds:500+i*100,at:REVIEW_DATE+'T10:00:00Z'}}},movement:{change:1,previousChange:.2,previousOdds:480+i*100,previousAt:REVIEW_DATE+'T14:00:00Z'}})))),historyAvailable:true,unmatched:0,fetchedAt:observedAt})
 if(path==='/api/the-sideline/odds-board'){
  const markets=['anytime_td','first_td','passing_yards','rushing_yards','receiving_yards','receptions'],books=['fanduel','draftkings','betmgm','caesars'],market=q.get('market')??'anytime_td',book=q.get('book')??'all',at=new Date().toISOString()
  return json({date:REVIEW_DATE,games:nflGames.map(g=>({id:g.id,away:g.away.abbr,home:g.home.abbr,status:'ready'})),markets,books,market,book,quotes:nflGames.flatMap(g=>makeNflOdds(g).players.flatMap(p=>p.markets.filter(m=>m.propType===market).flatMap(m=>m.offers.filter(o=>book==='all'||o.vendor===book).map(o=>[g.id,p.id,p.name,p.team,p.position,market,o.vendor,o.line,o.current.odds??o.current.over??-110,at,o.opening?.odds??o.opening?.over??null,at,o.opening?.odds??o.opening?.over??null,false])))),picks:[],identities:nflGames.flatMap(g=>makeNflOdds(g).players.map(p=>[g.id,p.id,p.name,p.team,p.headshot,[]])),teams:nflGames.flatMap(g=>[g.away,g.home].map(t=>[g.id,t.abbr,t.color,t.color2,t.logo])),phaseToken:'a'.repeat(64),phaseObservedAt:at,nextStart:'2030-11-20T20:20:00Z'})
 }
 if(path==='/api/the-sideline/slate-edge')return json(makeNflSlateEdge())
 if(path==='/the-sideline/market'){
  const game=nflGames.find(g=>g.id===q.get('game'))??nflGames[0],odds=makeNflOdds(game)
  return json({odds,board:odds,frame:q.has('at')?{capturedAt:q.get('at')!,board:{...odds,capturedAt:q.get('at')!}}:null,timeline:nflReviewTimeline,gameState:storedGameState(game),touchdowns:await getNflTouchdownFeed(),results:null})
 }
 if(path==='/api/nfl-matrices')return json({matrices:[{id:'illustrative-matrix',name:'Illustrative red-zone role',color:'#35d7ff',priority:0,enabled:false,matrix_type:'classic',match_mode:'all',match_any_count:null,pipeline_scope:null,definition:{factors:[{id:'review-factor',category:'score',field:'redZone',operator:'gte',value:70,window:'season',vendor:null,propType:null,marketValue:null}]},element_code:'NFL-REVIEW01'}]})
 if(path==='/api/nfl-matrix-marketplace')return json({listings:[{id:'illustrative-listing',title:'Illustrative receiving role',description:'Local layout sample. No live template or member data.',color:'#4de2a1',matrix_type:'classic',copy_count:12,snapshot:{}}]})
 if(path==='/api/nfl-matrices'||path==='/api/nba-matrices')return json({matrices:[]})
 if(path==='/api/nfl-matrix-marketplace'||path==='/api/nba-matrix-marketplace')return json({listings:[]})
 if(path.includes('changelog'))return json({entries:table('changelog_entries'),items:table('changelog_entries')})
 if(path.includes('site-banner'))return json({banners:[],banner:null})
 if(path.includes('feature'))return json({flags:Object.fromEntries(table('site_settings').map(r=>[r.key,true]))})
 if(path.includes('notifications'))return json({notifications:table('notifications'),unreadCount:1,count:1})
 if(path.includes('watchlist'))return json({items:[],watchlist:[],groups:[]})
 if(path.includes('feed'))return json({posts:table('posts'),hasMore:false,nextCursor:null})
 if(path.includes('messages'))return json({messages:table('messages'),conversations:[],unreadCount:1})
 if(path.includes('scores')||path.includes('schedule'))return json({games,date:REVIEW_DATE,nba:games,nfl:nflGames})
 if(path.startsWith('/api/'))return json({error:'This service is unavailable in private design review. No external request was made.',review:true},503)
 return json({error:'This data view has no illustrative fixture yet.',review:true},503)
}
