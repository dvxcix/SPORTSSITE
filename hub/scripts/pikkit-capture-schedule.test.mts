import assert from 'node:assert/strict'
import { pikkitCaptureDecision } from '../src/lib/pikkitCaptureSchedule'

const hour = 60 * 60 * 1000
const sunday = Date.parse('2026-09-13T13:00:00-04:00')
assert.equal(pikkitCaptureDecision('nfl', sunday, null, sunday - 43 * hour).due, false)
assert.equal(pikkitCaptureDecision('nfl', sunday, null, sunday - 42 * hour).slotHours, 42)
assert.equal(pikkitCaptureDecision('nfl', sunday, sunday - 41 * hour, sunday - 20 * hour).slotHours, 20)
assert.equal(pikkitCaptureDecision('nfl', sunday, sunday - 2 * hour, sunday - hour).slotHours, 1)
assert.equal(pikkitCaptureDecision('nfl', sunday, sunday - 30 * 60_000, sunday - 15 * 60_000).due, false)

const thursday = Date.parse('2026-09-10T20:20:00-04:00')
assert.equal(pikkitCaptureDecision('nfl', thursday, null, thursday - 30 * hour).slotHours, 30)
const monday = Date.parse('2026-09-14T20:15:00-04:00')
assert.equal(pikkitCaptureDecision('nfl', monday, null, monday - 28 * hour).slotHours, 28)

const mlb = Date.parse('2026-09-10T19:10:00-04:00')
assert.equal(pikkitCaptureDecision('mlb', mlb, null, mlb - 10 * hour).slotHours, 10)
assert.equal(pikkitCaptureDecision('mlb', mlb, mlb - 9 * hour, mlb - 4 * hour).slotHours, 4)
assert.equal(pikkitCaptureDecision('mlb', mlb, mlb - 3 * hour, mlb - hour).due, false)

console.log('pikkit capture schedule: ok')
