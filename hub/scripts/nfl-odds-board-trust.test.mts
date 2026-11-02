import test from 'node:test'
import assert from 'node:assert/strict'
import { nflOddsBoardTrust, type NflOddsBoardPhase } from '../src/lib/nflOddsBoardTrust.ts'

const start=Date.parse('2026-11-02T20:00:00Z'), a='a'.repeat(64), b='b'.repeat(64)
const proof={phaseToken:a,phaseObservedAt:new Date(start).toISOString(),nextStart:null}
const phase=(token:string|null,observed:number,checked:number):NflOddsBoardPhase=>({gameId:'game',token,observedAt:token?new Date(observed).toISOString():null,checkedAt:checked})
test('unchanged token retains its original source time and expires without extending by receipt',()=>{assert.equal(nflOddsBoardTrust(proof,phase(a,start+1000,start+46000),start-1,start+47000).safe,true);const result=nflOddsBoardTrust(proof,phase(a,start+1000,start+47000),start-1,start+49001);assert.equal(result.safe,false);assert.equal(result.reason,'expired')})
test('a newer corrected phase or failed poll immediately invalidates the old board',()=>{assert.equal(nflOddsBoardTrust(proof,phase(b,start+500,start+600),start-1,start+600).reason,'changed');assert.equal(nflOddsBoardTrust(proof,phase(null,start,start+600),start-1,start+600).reason,'failed')})
test('an old token does not invalidate a newer directly verified board',()=>{assert.equal(nflOddsBoardTrust(proof,phase(b,start-1000,start+100),start-1,start+100).safe,true)})
test('known tipoff, expired proof, and future source times fail closed',()=>{const frozen={...proof,nextStart:new Date(start+500).toISOString()};assert.equal(nflOddsBoardTrust(frozen,null,start,start+500).reason,'boundary');assert.equal(nflOddsBoardTrust(proof,null,start,start+48001).reason,'expired');assert.equal(nflOddsBoardTrust(proof,null,start,start-1).reason,'invalid')})
test('phase state from a previous opening of the board is ignored',()=>{assert.equal(nflOddsBoardTrust(proof,phase(null,start,start-1),start,start+100).safe,true)})
