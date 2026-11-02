import test from 'node:test'
import assert from 'node:assert/strict'
import { BrowserbaseAdmissionError } from '../src/lib/browserbaseAdmissionError'
import { reserveBrowserbaseSharedAdmission } from '../src/lib/browserbaseSharedAdmission'

const periodId = '10000000-0000-4000-8000-000000000001'
function fixture() {
  const calls: string[] = []
  return {
    calls,
    input: {
      projectId: 'verified-project', periodId, timeoutSeconds: 450,
      readUsage: async () => { calls.push('usage'); return { browserMinutes: 10, proxyBytes: 1000 } },
      reserve: async (input: { id: string; timeoutSeconds: number }) => {
        calls.push('reserve')
        return { allowed: true, reason: 'reserved', id: input.id, reservedCents: 50 + Math.ceil(input.timeoutSeconds / 360) }
      },
    },
  }
}
const denied = (code: string) => (error: unknown) => error instanceof BrowserbaseAdmissionError && error.code === code

test('admission checks real usage before one uniquely identified reservation', async () => {
  const { input, calls } = fixture()
  const first = await reserveBrowserbaseSharedAdmission(input)
  const second = await reserveBrowserbaseSharedAdmission(input)
  assert.deepEqual(calls, ['usage', 'reserve', 'usage', 'reserve'])
  assert.notEqual(first.id, second.id)
  assert.equal(first.reservedCents, 52)
})

test('missing baseline identity, invalid project, or unsafe timeouts fail before any provider call', async () => {
  for (const mutation of [
    { periodId: '' }, { projectId: '' }, { timeoutSeconds: 0 }, { timeoutSeconds: 451 },
  ]) {
    const { input, calls } = fixture()
    await assert.rejects(reserveBrowserbaseSharedAdmission({ ...input, ...mutation }), denied('configuration'))
    assert.deepEqual(calls, [])
  }
})

test('failed or malformed usage never reserves', async () => {
  for (const response of [
    () => Promise.reject(new Error('private provider error')),
    async () => ({ browserMinutes: NaN, proxyBytes: 1 }),
    async () => ({ browserMinutes: 1, proxyBytes: -1 }),
    async () => ({ browserMinutes: 1, proxyBytes: 1.5 }),
  ]) {
    const { input, calls } = fixture()
    await assert.rejects(reserveBrowserbaseSharedAdmission({ ...input, readUsage: response }), denied('usage-unavailable'))
    assert.deepEqual(calls, [])
  }
})

test('shared ceiling denial and uncertain database result fail closed without retries', async () => {
  for (const result of [
    { allowed: false, reason: 'spend-limit' },
    { allowed: false, reason: 'baseline-unavailable' },
    { allowed: true, reason: 'reserved', id: 'wrong', reservedCents: 52 },
    null,
  ]) {
    const { input, calls } = fixture()
    const reserve = async () => { calls.push('reserve'); return result }
    await assert.rejects(reserveBrowserbaseSharedAdmission({ ...input, reserve }), denied(result?.reason === 'spend-limit' ? 'spend-limit' : 'reservation-unavailable'))
    assert.deepEqual(calls, ['usage', 'reserve'])
  }
  const { input, calls } = fixture()
  const reserve = async () => { calls.push('reserve'); throw new Error('private SQL transport error') }
  await assert.rejects(reserveBrowserbaseSharedAdmission({ ...input, reserve }), denied('reservation-unavailable'))
  assert.deepEqual(calls, ['usage', 'reserve'])
})

test('a known outstanding session is a distinct no-debit deferral', async () => {
  const { input, calls } = fixture()
  await assert.rejects(reserveBrowserbaseSharedAdmission({ ...input, reserve: async () => { calls.push('reserve'); return { allowed: false, reason: 'session-unverified' } } }), denied('session-busy'))
  assert.deepEqual(calls, ['usage', 'reserve'])
})

test('a confirmed no-debit reordered response gets one fresh read using the same reservation ID', async () => {
  const { input, calls } = fixture()
  const ids: string[] = []
  const reserve = async (request: { id: string; timeoutSeconds: number }) => {
    calls.push('reserve'); ids.push(request.id)
    return ids.length === 1 ? { allowed: false, reason: 'usage-reordered' }
      : { allowed: true, reason: 'reserved', id: request.id, reservedCents: 50 + Math.ceil(request.timeoutSeconds / 360) }
  }
  await reserveBrowserbaseSharedAdmission({ ...input, reserve })
  assert.deepEqual(calls, ['usage', 'reserve', 'usage', 'reserve'])
  assert.equal(ids[0], ids[1])
  calls.length = 0
  await assert.rejects(reserveBrowserbaseSharedAdmission({ ...input, reserve: async () => { calls.push('reserve'); return { allowed: false, reason: 'usage-reordered' } } }), denied('reservation-unavailable'))
  assert.deepEqual(calls, ['usage', 'reserve', 'usage', 'reserve'])
})
