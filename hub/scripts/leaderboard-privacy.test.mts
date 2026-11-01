import assert from 'node:assert/strict'
import test from 'node:test'
import { currentPublicLeaderboard } from '../src/lib/leaderboardPrivacy'

const first = '10000000-0000-0000-0000-000000000001'
const second = '10000000-0000-0000-0000-000000000002'
const third = '10000000-0000-0000-0000-000000000003'
const ranked = [{ id: first, wins: 9 }, { id: second, wins: 7 }, { id: third, wins: 4 }]

function client(result: unknown, calls: string[][] = []) {
  return { rpc(name: string, args: { target_ids: string[] }) {
    assert.equal(name, 'get_current_public_leaderboard_ids')
    calls.push(args.target_ids)
    return { abortSignal: async (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); return result } }
  } } as never
}

test('each request applies current privacy while preserving cached rank order', async () => {
  const calls: string[][] = []
  const firstView = await currentPublicLeaderboard(client({ data: [third, first, second], error: null }, calls), ranked)
  assert.deepEqual(firstView.users.map(row => row.id), [first, second, third])
  const changedView = await currentPublicLeaderboard(client({ data: [first, third], error: null }, calls), ranked)
  assert.deepEqual(changedView.users.map(row => row.id), [first, third])
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], [first, second, third])
  assert.deepEqual(ranked.map(row => row.id), [first, second, third])
})

test('provider failures and malformed or unauthorized results hide the entire cached ranking', async () => {
  for (const result of [
    { data: null, error: {} },
    { data: null, error: null },
    { data: [first, first], error: null },
    { data: ['10000000-0000-0000-0000-000000000099'], error: null },
    { data: [first, 1], error: null },
  ]) {
    const response = await currentPublicLeaderboard(client(result), ranked)
    assert.deepEqual(response, { users: [], available: false })
  }
  const throwing = { rpc() { throw new Error('unavailable') } } as never
  assert.deepEqual(await currentPublicLeaderboard(throwing, ranked), { users: [], available: false })
})

test('invalid, duplicate, and unbounded inputs fail before any database request', async () => {
  const calls: string[][] = []
  const db = client({ data: [], error: null }, calls)
  assert.deepEqual(await currentPublicLeaderboard(db, []), { users: [], available: true })
  assert.equal((await currentPublicLeaderboard(db, [{ id: 'invalid' }])).available, false)
  assert.equal((await currentPublicLeaderboard(db, [{ id: first }, { id: first.toUpperCase() }])).available, false)
  assert.equal((await currentPublicLeaderboard(db, Array.from({ length: 50_001 }, (_, i) => ({ id: `10000000-0000-0000-0000-${String(i).padStart(12, '0')}` })))).available, false)
  assert.equal(calls.length, 0)
})

test('large rankings use bounded sequential batches and reject partial failures', async () => {
  const rows = Array.from({ length: 10_001 }, (_, i) => ({ id: `10000000-0000-0000-0000-${String(i).padStart(12, '0')}` }))
  const calls: string[][] = []
  const db = { rpc(_name: string, args: { target_ids: string[] }) {
    calls.push(args.target_ids)
    return { abortSignal: async () => ({ data: args.target_ids, error: null }) }
  } } as never
  const ok = await currentPublicLeaderboard(db, rows)
  assert.equal(ok.available, true)
  assert.deepEqual(ok.users, rows)
  assert.deepEqual(calls.map(batch => batch.length), [10_000, 1])
  let count = 0
  const failing = { rpc(_name: string, args: { target_ids: string[] }) {
    count++
    return { abortSignal: async () => count === 2 ? { data: null, error: {} } : { data: args.target_ids, error: null } }
  } } as never
  assert.deepEqual(await currentPublicLeaderboard(failing, rows), { users: [], available: false })
})
