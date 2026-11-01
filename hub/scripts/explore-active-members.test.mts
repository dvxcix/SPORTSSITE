import assert from 'node:assert/strict'
import test from 'node:test'
import { exploreSpotlightMembers, visibleExploreSpotlights } from '../src/lib/exploreActiveMembers'

const a = '10000000-0000-0000-0000-000000000001'
const b = '10000000-0000-0000-0000-000000000002'
const c = '10000000-0000-0000-0000-000000000003'

function client(result: unknown, calls: unknown[][]) {
  const builder = {
    select(...args: unknown[]) { calls.push(['select', ...args]); return this },
    eq(...args: unknown[]) { calls.push(['eq', ...args]); return this },
    neq(...args: unknown[]) { calls.push(['neq', ...args]); return this },
    order(...args: unknown[]) { calls.push(['order', ...args]); return this },
    limit(...args: unknown[]) { calls.push(['limit', ...args]); return Promise.resolve(result) },
    in(...args: unknown[]) { calls.push(['in', ...args]); return Promise.resolve(result) },
  }
  return { from(name: string) { calls.push(['from', name]); return builder } } as never
}

test('ranked public members are read under viewer RLS without disclosing membership state', async () => {
  const viewerCalls: unknown[][] = []
  const users = await exploreSpotlightMembers(client({ data: [{ id: a, username: 'first' }, { id: c, username: 'third' }], error: null }, viewerCalls), true)
  assert.deepEqual(users.map(user => user.id), [a, c])
  assert.equal(viewerCalls[1][1]?.toString().includes('is_active_member'), false)
  assert.deepEqual(viewerCalls[2], ['eq', 'account_type', 'creator'])
  assert.deepEqual(viewerCalls[3], ['order', 'follower_count', { ascending: false }])
  assert.deepEqual(viewerCalls[4], ['limit', 4])
  assert.ok(!JSON.stringify(viewerCalls).includes('is_active_member'))
})

test('bettors use a bounded non-creator caller-scoped query', async () => {
  const viewerCalls: unknown[][] = []
  assert.deepEqual(await exploreSpotlightMembers(client({ data: [], error: null }, viewerCalls), false), [])
  assert.ok(viewerCalls.some(call => call[0] === 'neq' && call[1] === 'account_type' && call[2] === 'creator'))
  assert.ok(viewerCalls.some(call => call[0] === 'limit' && call[1] === 4))
})

test('errors and malformed responses fail closed', async () => {
  for (const bad of [
    { data: null, error: {} },
    { data: [{ id: 'invalid' }], error: null },
    { data: [{ id: a }, { id: a }], error: null },
    { data: Array.from({ length: 5 }, () => ({ id: a })), error: null },
  ]) assert.deepEqual(await exploreSpotlightMembers(client(bad, []), true), [])
})

test('spotlights omit either direction of blocking and fail closed on unknown viewer state', async () => {
  const me = '10000000-0000-0000-0000-000000000099'
  const lists = [[{ id: a }, { id: b }], [{ id: c }]] as never
  const blockClient = (result: unknown) => {
    const query = { select() { return this }, or() { return this }, order() { return this }, range() { return Promise.resolve(result) } }
    return { from(name: string) { assert.equal(name, 'blocks'); return query } } as never
  }
  const visible = await visibleExploreSpotlights(blockClient({ data: [{ blocker_id: me, blocked_id: a }, { blocker_id: c, blocked_id: me }], error: null }), me, null, lists)
  assert.deepEqual(visible.map(list => list.map(user => user.id)), [[b], []])
  assert.deepEqual(await visibleExploreSpotlights(blockClient({ data: null, error: {} }), me, null, lists), [[], []])
  assert.deepEqual(await visibleExploreSpotlights(blockClient({ data: [], error: null }), null, { name: 'AuthApiError' }, lists), [[], []])
  assert.deepEqual(await visibleExploreSpotlights(blockClient({ data: [], error: null }), null, { name: 'AuthSessionMissingError' }, lists), lists)
})
