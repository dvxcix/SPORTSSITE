/** Deterministic illustrative data. Imported only by the local review webpack configuration. */
import type {PaintBoard,PaintGame,PaintPlayer,PaintProp,PaintTeam} from '../src/lib/nbaPaint'
import {REVIEW_DATE} from './database'
export const observedAt=REVIEW_DATE+'T16:00:00Z'
const teams:PaintTeam[]=[{id:2,abbreviation:'BOS',name:'Celtics',full_name:'Boston Celtics',city:'Boston'},{id:20,abbreviation:'NYK',name:'Knicks',full_name:'New York Knicks',city:'New York'},{id:10,abbreviation:'GSW',name:'Warriors',full_name:'Golden State Warriors',city:'Golden State'},{id:14,abbreviation:'LAL',name:'Lakers',full_name:'Los Angeles Lakers',city:'Los Angeles'},{id:8,abbreviation:'DEN',name:'Nuggets',full_name:'Denver Nuggets',city:'Denver'},{id:18,abbreviation:'MIN',name:'Timberwolves',full_name:'Minnesota Timberwolves',city:'Minnesota'}]
export const games:PaintGame[]=Array.from({length:3},(_,i)=>({id:900001+i,date:REVIEW_DATE,season:2030,status:'7:30 PM',status_state:'scheduled',datetime:REVIEW_DATE+`T${20+i}:30:00Z`,period:0,home_team:teams[i*2],visitor_team:teams[i*2+1],home_team_score:0,visitor_team_score:0}))
const identities=[['Jayson','Tatum','tatum','F',27,8,5],['Jalen','Brunson','brunson','G',26,4,8],['Stephen','Curry','curry','G',28,5,6],['LeBron','James','lebron','F',25,7,8],['Nikola','Jokic','jokic','C',29,12,10],['Anthony','Edwards','edwards','G',27,6,5]] as const
export function makeBoard(game=games[0]):PaintBoard {
 const players:PaintPlayer[]=identities.slice(games.findIndex(g=>g.id===game.id)*2,games.findIndex(g=>g.id===game.id)*2+2).flatMap((base,index)=>[base,...Array.from({length:3},(_,n)=>[index?['Josh','Mikal','Mitchell'][n]:['Jaylen','Derrick','Jrue'][n],index?['Hart','Bridges','Robinson'][n]:['Brown','White','Holiday'][n],index?'brunson':'tatum',n===2?'C':'G',18-n*3,5+n,4+n] as const)].map((info,n)=>{
  const [first_name,last_name,asset,position,pts,reb,ast]=info,team=index?game.visitor_team:game.home_team,id=(index?900200:900100)+(game.id-900000)*10+n
  const logs=Array.from({length:24},(_,j)=>({id:id*1000+j,player:{id,position},team:{id:team.id},game:{id:890000+j,date:new Date(Date.UTC(2030,10,18-j)).toISOString().slice(0,10),status:'Final',status_state:'final',season:2030,home_team_id:j%2?team.id:29,visitor_team_id:j%2?29:team.id},min:String(33+(j%6)-2),pts:pts+(j*7%17)-8,reb:reb+(j%5)-2,ast:ast+(j*3%7)-3,fg3m:2+j%4,stl:j%3,blk:j%2,turnover:1+j%4,fga:17+j%7,fgm:8+j%4,fg3a:6+j%5,fta:4+j%4,ftm:3+j%3}))
  const props:PaintProp[]=['points','rebounds','assists','threes','points_rebounds_assists','points_rebounds','points_assists','rebounds_assists','steals','blocks','turnovers','points_1q'].flatMap((key,k)=>['fanduel','draftkings','betmgm','caesars'].flatMap((vendor,b)=>{
   const target=key==='points'?pts:key==='rebounds'?reb:key==='assists'?ast:key==='threes'?3:key==='points_rebounds_assists'?pts+reb+ast:key==='points_rebounds'?pts+reb:key==='points_assists'?pts+ast:key==='rebounds_assists'?reb+ast:key==='points_1q'?7:1
   return [0,1,2].map((step)=>({id:id*10000+k*100+b*10+step,game_id:game.id,player_id:id,vendor,prop_type:key,line_value:String(Math.max(1,Math.round(target)-5+step*5)),market:{type:'milestone' as const,odds:step===0?-210+b*5:step===1?105+b*8:235+b*10},updated_at:observedAt,opening:{over:{odds:step===0?-185:step===1?135:260,at:REVIEW_DATE+'T10:00:00Z'}}}))
  }))
  return {id,first_name,last_name,position,jersey_number:String(0+n*7),height:position==='C'?'6-11':'6-8',team,headshot:n===0?'/review-assets/'+asset+'.png':null,injury:n===3?{status:'Questionable',description:'Illustrative availability note.'}:null,average:{pts,reb,ast,fg3m:3,stl:1.2,blk:.6,turnover:2.4,min:35,fga:21,fgm:10,fg3a:8,fta:5,ftm:4,gp:24},averageSeason:2030,logs,periodLogs:logs.map(log=>({...log,id:log.id+10000000,period:1,min:'9',pts:Math.round(log.pts!/4),reb:Math.round(log.reb!/4),ast:Math.round(log.ast!/4),fga:5,fgm:2,fg3a:2,fg3m:1,fta:1,ftm:1})),props}
 }))
 return {game,players,teams,sampleSeason:2030,baselineSeasons:[2030],historical:false,sampleEnd:REVIEW_DATE,fetchedAt:observedAt,issues:[],statsComplete:true,periodStatsComplete:true,teamStatsSeason:2030,teamStats:[game.home_team,game.visitor_team].map(team=>({team,stats:{pace:101.3,offensive_rating:116.2,defensive_rating:111.4,net_rating:4.8,pts:115,reb:44,ast:28}})),gameOdds:['fanduel','draftkings','betmgm','caesars'].map((vendor,i)=>({id:i+1,game_id:game.id,vendor,spread_home_value:'-4.5',spread_away_value:'4.5',spread_home_odds:-110,spread_away_odds:-110,moneyline_home_odds:-180+i*5,moneyline_away_odds:155+i*5,total_value:'226.5',total_over_odds:-110,total_under_odds:-110,updated_at:observedAt})),starters:players.map(p=>p.id),oddsMode:'pregame',researchSnapshot:{observedAt,source:'capture',frozen:false}}
}
export class PaintProviderError extends Error {constructor(public endpoint='',public status=503){super('Local review data unavailable')}}
export async function artwork(abbr:string){return {logo:paintTeamLogo(abbr),primary:'#007A33',secondary:'#BA9653',headshots:new Map(games.map(makeBoard).flatMap(b=>b.players).filter(p=>p.team.abbreviation===abbr).map(p=>[(p.first_name+p.last_name).toLowerCase(),p.headshot]))}}
export const paintTeamLogo=(abbr:string)=>'/review-assets/team-'+abbr+'.png'
export async function getPaintSchedule(){return {games,days:[REVIEW_DATE],date:REVIEW_DATE,complete:true}}
export async function getPaintGame(id:number){return games.find(g=>g.id===id)??games[0]}
export async function getPaintIdentity(id:number){return makeBoard().players.find(p=>p.id===id)??makeBoard().players[0]}
export async function getPaintBoard(game:PaintGame=games[0]){return makeBoard(game)}
export async function getPaintRoster(game:PaintGame){return makeBoard(game).players}
export const getPaintMarketRoster=getPaintRoster
export const getPaintSavedMarketRoster=getPaintRoster
export async function getPaintMarketIds(game:PaintGame){return new Set(makeBoard(game).players.map(p=>p.id))}
export async function getPaintFinalStats(){return {rows:makeBoard().players.map(p=>p.logs[0]),complete:true}}
export async function getPaintProps(id:number){return makeBoard(await getPaintGame(id)).players.flatMap(p=>p.props)}
export async function getPaintGameOdds(id:number){return makeBoard(await getPaintGame(id)).gameOdds??[]}
export async function getPaintPropSnapshot(game:PaintGame){return {props:makeBoard(game).players.flatMap(p=>p.props),gameOdds:makeBoard(game).gameOdds,complete:true,capturedAt:observedAt}}
export async function getPaintScouting(game=games[0]){return {season:2030,fetchedAt:observedAt,issues:[],players:makeBoard(game).players.map(p=>({playerId:p.id,player:p,shooting:{fg_pct:.48,fg3_pct:.38},advanced:{usg_pct:.28,pace:101,off_rating:116,def_rating:111},tracking:{touches:64,potential_assists:12,rebound_chances:15}}))}}
export async function getPaintProfile(){return {shooting:{fg_pct:.48,fg3_pct:.38,ft_pct:.87},advanced:{usg_pct:.28,pace:101,off_rating:116,def_rating:111},season:2030}}
export async function getPaintPrices(game:PaintGame){return {...await getPaintPropSnapshot(game),fetchedAt:observedAt}}
export async function refreshPaintBoardPrices(board:PaintBoard){return board}
