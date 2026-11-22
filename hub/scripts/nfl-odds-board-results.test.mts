import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifiedNflBoardFinal, nflBoardFinalValues, nflBoardFinalMap, type NflFinalFeed, type NflBoardResultQuote } from '../src/lib/nflOddsBoardResults.ts'
import type { SidelineGame } from '../src/app/the-sideline/types.ts'
import type { NflPublicResult } from '../src/lib/nflPublicResults.ts'
const game = { id:'2026_11_IND_HOU',season:2026,week:11,gameday:'2026-11-19',away:{abbr:'IND'},home:{abbr:'HOU'},awayScore:3,homeScore:26 } as SidelineGame
const feed: NflFinalFeed = { game_id:game.id,reconciled:true,fetched_at:'2026-11-20T05:00:00Z',game:{id:1392366,season:2026,week:11,date:'2026-11-20T01:15:00Z',status_state:'final',visitor_team:{abbreviation:'IND'},home_team:{abbreviation:'HOU'},visitor_team_score:3,home_team_score:26} }
const q: NflBoardResultQuote = [game.id,4,'Test Player','IND','WR','receiving_yards','fanduel',25]
const marketQuote=(market:string,line:number):NflBoardResultQuote=>[q[0],q[1],q[2],q[3],q[4],market,q[6],line]
const result: NflPublicResult = {status:'final',updatedAt:feed.fetched_at,firstTd:null,firstTdKnown:false,players:[{id:4,name:'Test Player',team:'IND',stats:{receiving_yards:25,anytime_td:0}}]}
test('Thursday night and earlier weeks verify against the exact final game, teams, scores and source',()=>{
 assert.equal(verifiedNflBoardFinal(game,feed),true)
 for(const patch of [{reconciled:false},{game:{...feed.game!,status_state:'in_progress'}},{game:{...feed.game!,season:2025}},{game:{...feed.game!,week:10}},{game:{...feed.game!,visitor_team_score:7}},{game:{...feed.game!,home_team:{abbreviation:'DAL'}}},{fetched_at:'2999-01-01T00:00:00Z'}])assert.equal(verifiedNflBoardFinal(game,{...feed,...patch}),false)
})
test('actuals stay separate from original prices and retain zero and exact milestone equality',()=>{
 const quotes=[q,marketQuote('receiving_yards',50)]
 assert.deepEqual(nflBoardFinalValues(game.id,quotes,result),[[game.id,4,'IND',25]])
 assert.deepEqual(nflBoardFinalValues(game.id,[marketQuote('anytime_td',.5)],result),[[game.id,4,'IND',0]])
 assert.equal(quotes[0][7],25)
})
test('live, missing, duplicate and wrong-team stats cannot produce a final miss',()=>{
 for(const changed of [{...result,status:'in_progress'},{...result,players:[]},{...result,players:[...result.players,...result.players]},{...result,players:[{...result.players[0],team:'HOU'}]}])assert.deepEqual(nflBoardFinalValues(game.id,[q],changed),[])
})
test('first scorer and multiple touchdown markets keep their own contract',()=>{
 const td={...result,firstTdKnown:true,firstTd:{id:4,gsisId:null,name:'Test Player',team:'IND'}}
 assert.deepEqual(nflBoardFinalValues(game.id,[marketQuote('first_td',.5)],td),[[game.id,4,'IND',1]])
 assert.deepEqual(nflBoardFinalValues(game.id,[marketQuote('two_plus_td',2)],result),[[game.id,4,'IND',0]])
 assert.deepEqual(nflBoardFinalValues(game.id,[marketQuote('three_plus_td',3)],result),[[game.id,4,'IND',0]])
 assert.deepEqual(nflBoardFinalValues(game.id,[marketQuote('first_td',.5)],result),[])
})
test('combined passing and rushing needs both actuals and never assumes missing yards are zero',()=>{
 const full={...result,players:[{...result.players[0],stats:{passing_yards:200,rushing_yards:25}}]}
 assert.deepEqual(nflBoardFinalValues(game.id,[marketQuote('passing_rushing_yards',225)],full),[[game.id,4,'IND',225]])
 assert.deepEqual(nflBoardFinalValues(game.id,[marketQuote('passing_rushing_yards',225)],result),[])
})
test('foreign identities, non-finite values and conflicting finals fail closed',()=>{
 const key=JSON.stringify([game.id,4,'IND'])
 assert.equal(nflBoardFinalMap([[game.id,4,'IND',0]],[q]).get(key),0)
 assert.equal(nflBoardFinalMap([[game.id,4,'IND',25],[game.id,4,'IND',30]],[q]).get(key),null)
 assert.equal(nflBoardFinalMap([[game.id,4,'HOU',10],[game.id,4,'IND',NaN]],[q]).size,0)
})
