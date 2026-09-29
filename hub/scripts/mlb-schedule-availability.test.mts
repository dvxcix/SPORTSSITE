import assert from 'node:assert/strict'
import test from 'node:test'
import { getMLBSchedule, getMLBScheduleResult } from '../packages/core/src/mlb-api.ts'

test('off-day is available; failures and malformed responses are not', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ totalGames: 0, dates: [] })
    assert.deepEqual(await getMLBScheduleResult('2026-09-28'), { available: true, games: [] })
    assert.deepEqual(await getMLBSchedule('2026-09-28'), [])
    globalThis.fetch = async () => Response.json({}, { status: 503 })
    assert.equal((await getMLBScheduleResult()).available, false)
    globalThis.fetch = async () => Response.json({ error: 'unavailable' })
    assert.equal((await getMLBScheduleResult()).available, false)
    globalThis.fetch = async () => { throw new Error('network failure') }
    assert.equal((await getMLBScheduleResult()).available, false)
    globalThis.fetch = async () => Response.json({ dates: [{ games: [{ gamePk: 849845 }] }] })
    assert.deepEqual(await getMLBSchedule(), [{ gamePk: 849845 }])
  } finally { globalThis.fetch = original }
})
