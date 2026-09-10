import assert from 'node:assert/strict'
import test from 'node:test'
import { browserbaseRefreshAfterMs, captureNeedsRefresh } from '../src/lib/browserbaseRefresh.ts'

const minute = 60_000
const now = new Date('2026-09-10T16:00:00Z') // noon Eastern

test('uses a 30-minute game-day refresh window', () => {
  assert.equal(browserbaseRefreshAfterMs('2026-09-10', now), 30 * minute)
  assert.equal(captureNeedsRefresh({ gameDate: '2026-09-10', capturedAt: now.getTime() - 29 * minute }, now), false)
  assert.equal(captureNeedsRefresh({ gameDate: '2026-09-10', capturedAt: now.getTime() - 30 * minute }, now), true)
})

test('backs future games off instead of refreshing every cron tick', () => {
  assert.equal(browserbaseRefreshAfterMs('2026-09-11', now), 3 * 60 * minute)
  assert.equal(browserbaseRefreshAfterMs('2026-09-12', now), 6 * 60 * minute)
  assert.equal(browserbaseRefreshAfterMs('2026-09-13', now), 12 * 60 * minute)
})

test('always captures a game with no prior snapshot', () => {
  assert.equal(captureNeedsRefresh({ gameDate: '2026-09-13' }, now), true)
})
