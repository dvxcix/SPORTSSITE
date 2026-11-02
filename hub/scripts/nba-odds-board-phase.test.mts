import assert from 'node:assert/strict'
import test from 'node:test'
import { NBA_ODDS_BOARD_PHASE_MAX_AGE,nbaBoardPhaseGames,nbaOddsBoardPhaseHeader,nbaOddsBoardPhaseSignature,nbaReadOddsBoardPhase } from '../src/lib/nbaOddsBoardPhase.ts'
import type { PaintGame } from '../src/lib/nbaPaint.ts'
const team={id:1,abbreviation:'AAA',full_name:'Alpha',name:'Alpha'},now=Date.parse('2026-11-02T20:00:00Z')
const game:PaintGame={id:12,date:'2026-11-02',season:2026,status:'Scheduled',status_state:'scheduled',datetime:'2026-11-02T22:00:00Z',period:0,home_team:team,visitor_team:{...team,id:2},home_team_score:0,visitor_team_score:0}
test('phase tokens bind date, all game clocks and started state independent of ordering',()=>{
  const a=nbaOddsBoardPhaseSignature([game,{...game,id:13}]),b=nbaOddsBoardPhaseSignature([{...game,id:13},game]);assert.equal(a,b)
  assert.notEqual(a,nbaOddsBoardPhaseSignature([{...game,datetime:'2026-11-02T21:00:00Z'},{...game,id:13}]))
  assert.notEqual(a,nbaOddsBoardPhaseSignature([{...game,status_state:'in_progress'},{...game,id:13}]))
  const header=nbaOddsBoardPhaseHeader({date:game.date,checkedAt:now,signature:a!})
  assert.deepEqual(nbaReadOddsBoardPhase(header,game.date,now),{date:game.date,checkedAt:now,signature:a})
})
test('missing, malformed, stale, future, duplicate and wrong-date tokens fail closed',()=>{
  const signature=nbaOddsBoardPhaseSignature([game])!,header=nbaOddsBoardPhaseHeader({date:game.date,checkedAt:now,signature})
  assert.equal(nbaReadOddsBoardPhase(null,game.date,now),null)
  assert.equal(nbaReadOddsBoardPhase(header,'2026-11-03',now),null)
  assert.equal(nbaReadOddsBoardPhase(header,game.date,now+NBA_ODDS_BOARD_PHASE_MAX_AGE+1),null)
  assert.equal(nbaReadOddsBoardPhase(header,game.date,now-5001),null)
  assert.equal(nbaReadOddsBoardPhase(`v1|${game.date}|${now}|${signature};${signature}`,game.date,now),null)
  assert.equal(nbaReadOddsBoardPhase(`v1|${game.date}|${now}|12,invalid,0`,game.date,now),null)
  assert.equal(nbaOddsBoardPhaseSignature([game,game]),null)
})
test('shared phase reconstruction enforces full identity, started state and earliest schedule boundary',()=>{
  const earlier={...game,datetime:'2026-11-02T21:00:00Z'},phase={date:game.date,checkedAt:now,signature:nbaOddsBoardPhaseSignature([earlier])!}
  assert.equal(nbaBoardPhaseGames([game],phase)[0].datetime,earlier.datetime.replace('Z','.000Z'))
  assert.throws(()=>nbaBoardPhaseGames([game,{...game,id:13}],phase))
  assert.throws(()=>nbaBoardPhaseGames([game,game],phase))
  assert.throws(()=>nbaBoardPhaseGames([{...game,status_state:'in_progress'}],phase))
  assert.throws(()=>nbaBoardPhaseGames([earlier],{...phase,signature:nbaOddsBoardPhaseSignature([game])!}))
})
