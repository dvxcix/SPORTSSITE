import assert from 'node:assert/strict'
import test from 'node:test'
import { nflBrowserDecision, nflBrowserReservationKey, nflVerifiedNoCreateDenial } from '../src/lib/nflBrowserCapturePolicy.ts'

const HOUR=3_600_000
test('Monday, Thursday and Sunday games all open at 24h and enter the late pregame window at 3h',()=>{
  for(const tip of ['2026-11-02T23:15:00Z','2026-11-06T01:15:00Z','2026-11-08T18:00:00Z'].map(Date.parse)) {
    assert.equal(nflBrowserDecision(tip,null,[],tip-24*HOUR-1).due,false)
    assert.equal(nflBrowserDecision(tip,null,[],tip-24*HOUR).slot,'day-before')
    assert.equal(nflBrowserDecision(tip,tip-23*HOUR,[],tip-3*HOUR-1).due,false)
    assert.equal(nflBrowserDecision(tip,tip-23*HOUR,[],tip-3*HOUR).slot,'two-hours')
    assert.equal(nflBrowserDecision(tip,tip-1000,[],tip).due,false)
  }
})
test('a missed first checkpoint is never replayed and the next real frame starts a baseline',()=>{
  const tip=Date.parse('2026-11-08T18:00:00Z'), now=tip-90*60_000
  assert.deepEqual(nflBrowserDecision(tip,null,[],now),{due:true,slot:'two-hours',attempt:0,reason:'initial'})
  assert.equal(nflBrowserDecision(tip,now,[],now+1000).reason,'checkpoint-complete')
})
test('retained attempts allow one retry after 90 minutes without replaying uncertainty',()=>{
  const tip=Date.parse('2026-11-08T18:00:00Z'), first=tip-24*HOUR, attempt=[{attempt:0 as const,at:first}]
  assert.equal(nflBrowserDecision(tip,null,attempt,first+89*60_000).reason,'retry-cooldown')
  assert.equal(nflBrowserDecision(tip,null,attempt,first+90*60_000).attempt,1)
  assert.equal(nflBrowserDecision(tip,null,[...attempt,{attempt:1,at:first+90*60_000}],first+3*HOUR).reason,'attempt-limit')
  assert.equal(nflBrowserDecision(tip,null,[{attempt:1,at:first}],first+HOUR).reason,'invalid-attempts')
})
test('invalid, post-tip or future observations never justify a paid launch',()=>{
  const tip=Date.parse('2026-11-08T18:00:00Z'),now=tip-3*HOUR
  assert.equal(nflBrowserDecision(tip,now+1,[],now).reason,'invalid-observation')
  assert.equal(nflBrowserDecision(tip,tip,[],now).reason,'invalid-observation')
  assert.equal(nflBrowserDecision(NaN,null,[],now).reason,'started-or-invalid')
  assert.equal(nflBrowserDecision(tip,null,[{attempt:0,at:now+1}],now).reason,'invalid-attempts')
})
test('reservations separate sport source, game, checkpoint and attempt',()=>{
  const keys=['public','fanduel'].flatMap(source=>['day-before','two-hours'].flatMap(slot=>[0,1].map(attempt=>nflBrowserReservationKey(source as 'public'|'fanduel','2026_09_KC_SEA',slot as 'day-before'|'two-hours',attempt as 0|1))))
  assert.equal(new Set(keys).size,8)
  assert.throws(()=>nflBrowserReservationKey('public','../unsafe','day-before',0))
})
test('only an exact pre-create denial permits reservation cleanup',()=>{
  const denial={error:'NFL browser capture deferred',budgetCode:'spend-limit',browserSessions:0}
  assert.equal(nflVerifiedNoCreateDenial(425,denial,'public'),true)
  assert.equal(nflVerifiedNoCreateDenial(425,denial,'fanduel'),true)
  assert.equal(nflVerifiedNoCreateDenial(425,{...denial,budgetCode:'session-busy'},'public'),true)
  assert.equal(nflVerifiedNoCreateDenial(425,{...denial,budgetCode:'session-busy'},'fanduel'),true)
  for(const [status,body] of [[502,denial],[425,{...denial,error:'partial capture'}],[425,{...denial,browserSessions:1}],[425,{...denial,budgetCode:'unknown'}],[425,null]]) {
    assert.equal(nflVerifiedNoCreateDenial(status as number,body,'public'),false)
  }
  const busy={error:'NFL browser capture deferred',reason:'context-busy',browserSessions:0}
  assert.equal(nflVerifiedNoCreateDenial(423,busy,'public'),true)
  assert.equal(nflVerifiedNoCreateDenial(423,busy,'fanduel'),false)
  assert.equal(nflVerifiedNoCreateDenial(423,{...busy,browserSessions:1},'public'),false)
  assert.equal(nflVerifiedNoCreateDenial(423,{...busy,reason:'other'},'public'),false)
})
