import assert from 'node:assert/strict'
import test from 'node:test'
import { isStrictlyPregameDate, priorPregameDate } from '../src/lib/pregameFeatureDate.ts'

test('pregame feature windows end on the prior calendar date', () => {
  assert.equal(priorPregameDate('2026-08-18'), '2026-08-17')
  assert.equal(priorPregameDate('2026-03-01'), '2026-02-28')
  assert.equal(priorPregameDate('2027-01-01'), '2026-12-31')
})

test('target-date and future outcomes are excluded from pregame features', () => {
  assert.equal(isStrictlyPregameDate('2026-08-17', '2026-08-18'), true)
  assert.equal(isStrictlyPregameDate('2026-08-18', '2026-08-18'), false)
  assert.equal(isStrictlyPregameDate('2026-08-19', '2026-08-18'), false)
})
