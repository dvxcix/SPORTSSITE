import {makeBoard,observedAt,getPaintProfile} from './nba'
import {nbaFirstBasketResearch} from '../src/lib/nbaFirstBasket'
import {nbaEmptyMarketContext} from '../src/lib/nbaMarketSignal'
import type {PaintBoard} from '../src/lib/nbaPaint'
const snapshot={observedAt,source:'capture' as const,frozen:false}
export async function getNbaResearchDefense(board:PaintBoard=makeBoard()){
 const profiles=[board.game.home_team,board.game.visitor_team].flatMap(team=>['PG','SG','SF','PF','C'].flatMap((position,i)=>['points','rebounds','assists','threes','points_rebounds_assists','points_rebounds','points_assists','rebounds_assists'].map((market,j)=>({teamId:team.id,position,market,games:24,minutes:1152,per48:18+i*3+j,leaguePer48:20+i*2+j,allowance:(i-2)*.06+j*.01}))))
 return {ready:true,season:2030,before:board.game.date,teams:board.teams,profiles,games:144,rows:3456,quarterRows:864,fetchedAt:observedAt,stale:false,researchSnapshot:snapshot}
}
export async function getNbaResearchTracking(board:PaintBoard=makeBoard()){
 const fields=['usage_percentage','touches','time_of_possession','drives','potential_assists','passes_made','rebound_chances','contested_shots','deflections','usg_pct','offensive_rating','defensive_rating','pace','pie','effective_field_goal_percentage','true_shooting_percentage','matchup_field_goal_attempts','matchup_field_goal_percentage']
 return {gameId:board.game.id,rows:board.players.flatMap((p,i)=>p.logs.map((l,j)=>({id:l.id,playerId:p.id,teamId:p.team.id,gameId:l.game.id,values:Object.fromEntries(fields.map((f,k)=>[f,f==='usage_percentage'?.24+i*.015+j*.001:k>7?(k<13?98+i+j%4:.45+(i%4)*.04):45-k*5+i*2+j%7]))}))),seasons:[2030],complete:true,sourceStates:[],fields,fetchedAt:observedAt,stale:false,researchSnapshot:snapshot}
}
export async function getNbaResearchMarketContext(board:PaintBoard=makeBoard()){return nbaEmptyMarketContext(board.game.id,observedAt,board.game.datetime,'Illustrative local review prices.')}
export async function getNbaResearchModels(){return []}
export async function getNbaResearchProfiles(board:PaintBoard=makeBoard()){return {gameId:board.game.id,season:2030,players:await Promise.all(board.players.map(async p=>({playerId:p.id,profile:await getPaintProfile()}))),complete:true,fetchedAt:observedAt,researchSnapshot:snapshot}}
export async function getNbaResearchProfile(_board:PaintBoard,_id:number){return {profile:await getPaintProfile(),fetchedAt:observedAt,researchSnapshot:snapshot}}
export async function getNbaResearchFirstBasket(board:PaintBoard=makeBoard()){
 const base=nbaFirstBasketResearch(board,[],[])
 return {...base,requestedGames:12,coveredGames:12,failed:0,rows:base.rows.map((r,i)=>({...r,games:12,firstFieldGoals:1+i%4,firstScores:1+i%4,firstAttempts:2+i%5,teamFirstFieldGoals:2+i%4})),teams:base.teams.map((t,i)=>({...t,tips:12,tipWins:6+i*2})),mode:'pregame',fetchedAt:observedAt,stale:false,researchSnapshot:snapshot}
}
export async function getNbaResearchShots(board:PaintBoard,playedGame:number,playerId:number){return {gameId:playedGame,playerId,shots:Array.from({length:22},(_,i)=>({gameId:playedGame,order:i+1,playerId,teamId:board.players.find(p=>p.id===playerId)?.team.id??2,period:1+i%4,clock:'08:24',text:'Illustrative shot',made:i%3!==0,points:i%4?2:3,x:3+(i*13%44),y:2+(i*7%33),halfCourt:true})),boxScoreAttempts:22,coverageMatches:true,stale:false,fetchedAt:observedAt,researchSnapshot:snapshot}}
export async function warmNbaResearchResources(){return {complete:true}}
