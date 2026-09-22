import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAllBdl, reconcileFeed, matchingFeedGame, groupAuxiliary, type FeedGame, type FeedPlay } from '../src/lib/nflGameFeeds'
import { normalizeWeeklyStats } from '../src/lib/nflverseSync'
const game:FeedGame={id:1,season:2026,week:2,date:'2026-09-22T00:15:00Z',visitor_team:{abbreviation:'NYG'},home_team:{abbreviation:'LAR'},status_state:'final',visitor_team_score:6,home_team_score:28}
const end:FeedPlay={id:'end',game,type_slug:'end-of-game',period:4,clock_display:'0:00',away_score:6,home_score:28}
test('matches aliases and Eastern game date, not UTC next day',()=>{
 assert.equal(matchingFeedGame([game],{season:2026,week:2,gameday:'2026-09-21',away_team:'NYG',home_team:'LA'})?.id,1)
 assert.equal(matchingFeedGame([game],{season:2026,week:2,gameday:'2026-09-22',away_team:'NYG',home_team:'LA'}),null)
})
test('rejects ambiguous game identity',()=>{
 assert.throws(()=>matchingFeedGame([game,game],{season:2026,week:2,gameday:'2026-09-21',away_team:'NYG',home_team:'LA'}),/Ambiguous/)
})
test('final reconciliation needs terminal marker and both scores',()=>{
 assert.equal(reconcileFeed(game,[end]),true)
 assert.equal(reconcileFeed(game,[{...end,type_slug:'rush'}]),false)
 assert.equal(reconcileFeed(game,[{...end,home_score:21}]),false)
 assert.equal(reconcileFeed({...game,status_state:'in_progress'},[end]),false)
 assert.throws(()=>reconcileFeed(game,[end,end]),/Duplicate/)
 assert.throws(()=>reconcileFeed(game,[{...end,game:{...game,id:2}}]),/mismatch/)
 assert.throws(()=>reconcileFeed(game,[]),/Empty/)
})
test('pagination reads beyond the old three-page cap',async()=>{
 let page=0
 const request=async()=>Response.json({data:[++page],meta:{next_cursor:page<5?page:null}})
 assert.deepEqual(await fetchAllBdl('plays?game_id=1&per_page=100',request as typeof fetch),[1,2,3,4,5])
})
test('pagination never silently accepts repeated cursors, missing arrays or HTTP errors',async()=>{
 await assert.rejects(fetchAllBdl('x?',(async()=>Response.json({data:[],meta:{next_cursor:7}})) as typeof fetch),/repeated/)
 await assert.rejects(fetchAllBdl('x?',(async()=>Response.json({meta:{}})) as typeof fetch),/data array/)
 await assert.rejects(fetchAllBdl('x?',(async()=>new Response('',{status:429})) as typeof fetch),/429/)
})
test('modern weekly column aliases preserve zero and negative numbers as supplied',()=>{
 const r=normalizeWeeklyStats({team:'LA',passing_interceptions:'0',sacks_suffered:'2',sack_yards_lost:'-15'})
 assert.equal(r.recent_team,'LA');assert.equal(r.interceptions,'0');assert.equal(r.sacks,'2');assert.equal(r.sack_yards,'-15')
 assert.equal(normalizeWeeklyStats({recent_team:'NYG',interceptions:'1'}).interceptions,'1')
})
test('auxiliary datasets stay in their own ID namespace with validated season and duplicates',()=>{
 const r={season:'2026',nflverse_game_id:'2026_02_NYG_LA',nflverse_play_id:'41',is_motion:'FALSE'}
 assert.equal(groupAuxiliary([r],'ftn_charting',2026).size,1)
 assert.throws(()=>groupAuxiliary([r,r],'ftn_charting',2026),/Duplicate/)
 assert.throws(()=>groupAuxiliary([{...r,season:'2025'}],'ftn_charting',2026),/season/)
 assert.throws(()=>groupAuxiliary([{season:'2026'}],'snap_counts',2026),/identity/)
})
