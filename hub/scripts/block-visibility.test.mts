import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BlockLookupUnavailable, getBlockedEitherWayIds, isBlockedEitherWay } from '../src/lib/blocks.ts'

type Result = { data: unknown; error: unknown }
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const viewer = id(1), one = id(2), two = id(3), target = id(4)
function database(pages: Result[], pair: Result = pages[0]) {
  const calls: { from: number; to: number; order: string[] }[] = []
  const client = {
    from(table: string) {
      assert.equal(table, 'blocks')
      const orders: string[] = []
      const query = {
        select: () => query,
        or: () => query,
        order: (column: string) => { orders.push(column); return query },
        range: async (from: number, to: number) => { calls.push({ from, to, order: orders }); return pages[from / 1000] },
        limit: async (count: number) => { assert.equal(count, 1); return pair },
      }
      return query
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

test('two-way lookup returns only verified identifiers and handles an empty list', async () => {
  const source = database([{ data: [{ blocker_id: viewer, blocked_id: one }, { blocker_id: two, blocked_id: viewer }, { blocker_id: viewer, blocked_id: two }], error: null }])
  assert.deepEqual(await getBlockedEitherWayIds(source.client, viewer), [one, two])
  assert.deepEqual(source.calls, [{ from: 0, to: 999, order: ['blocker_id', 'blocked_id'] }])
  assert.deepEqual(await getBlockedEitherWayIds(database([{ data: [], error: null }]).client, viewer), [])
})

test('pagination includes the entire block set, and a failed later page never returns a partial list', async () => {
  const first = Array.from({ length: 1000 }, (_, i) => ({ blocker_id: viewer, blocked_id: id(i + 10) }))
  const good = database([{ data: first, error: null }, { data: [{ blocker_id: viewer, blocked_id: id(2000) }], error: null }])
  assert.equal((await getBlockedEitherWayIds(good.client, viewer)).length, 1001)
  assert.equal(good.calls.length, 2)
  const failed = database([{ data: first, error: null }, { data: null, error: { code: 'PGRST002' } }])
  await assert.rejects(() => getBlockedEitherWayIds(failed.client, viewer), BlockLookupUnavailable)
})

test('failed, malformed or unrelated block rows never grant visibility', async () => {
  for (const page of [
    { data: null, error: { code: 'PGRST002' } },
    { data: null, error: null },
    { data: [{ blocker_id: one, blocked_id: two }], error: null },
    { data: [{ blocker_id: viewer, blocked_id: null }], error: null },
  ]) await assert.rejects(() => getBlockedEitherWayIds(database([page]).client, viewer), BlockLookupUnavailable)
  await assert.rejects(() => getBlockedEitherWayIds(database([{ data: [], error: null }]).client, 'x),blocked_id.eq.bad'), BlockLookupUnavailable)
})

test('pair check permits only a verified empty result and blocks in either direction', async () => {
  for (const row of [{ blocker_id: viewer, blocked_id: target }, { blocker_id: target, blocked_id: viewer }]) {
    assert.equal(await isBlockedEitherWay(database([{ data: [row], error: null }]).client, viewer, target), true)
  }
  assert.equal(await isBlockedEitherWay(database([{ data: [], error: null }]).client, viewer, target), false)
  for (const row of [{ data: null, error: { code: 'PGRST002' } }, { data: null, error: null }, { data: [{ blocker_id: viewer, blocked_id: two }], error: null }]) {
    await assert.rejects(() => isBlockedEitherWay(database([row]).client, viewer, target), BlockLookupUnavailable)
  }
})
