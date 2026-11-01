import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchVisiblePickRecords, hydrateVisibleAuthorRecords } from '../src/lib/visiblePickRecords.ts'

const a = '00000000-0000-0000-0000-000000000001'
const b = '00000000-0000-0000-0000-000000000002'
const c = '00000000-0000-0000-0000-000000000003'
function client(rows: unknown, options: { error?: unknown; throws?: boolean } = {}) {
  const calls: string[][] = []
  const fake = { rpc: (name: string, args: { target_ids: string[] }) => {
    assert.equal(name, 'get_visible_pick_records')
    calls.push(args.target_ids)
    return { abortSignal: async (signal: AbortSignal) => {
      assert.ok(signal instanceof AbortSignal)
      if (options.throws) throw new Error('timeout')
      return { data: rows, error: options.error ?? null }
    } }
  } }
  return { instance: fake as unknown as SupabaseClient, calls }
}

test('one request hydrates distinct visible authors while hidden and absent stay null', async () => {
  const f = client([{ profile_id: a, pick_record: { wins: 12, losses: 3, pushes: 1 } }, { profile_id: b, pick_record: null }])
  const original = [{ author: { id: a, pick_record: { wins: 99, losses: 99, pushes: 99 } } }, { author: { id: b } }, { author: { id: a } }, { author: { id: c } }]
  const result = await hydrateVisibleAuthorRecords(f.instance, original)
  assert.equal(result.available, true)
  assert.deepEqual(f.calls, [[a, b, c]])
  assert.deepEqual(result.posts.map(post => post.author?.pick_record), [{ wins: 12, losses: 3, pushes: 1 }, null, { wins: 12, losses: 3, pushes: 1 }, null])
  assert.deepEqual(original[0].author.pick_record, { wins: 99, losses: 99, pushes: 99 })
})

test('errors, malformed rows and unrequested or duplicate IDs fail closed', async () => {
  for (const f of [
    client([], { error: { code: 'OUTAGE' } }), client([], { throws: true }), client(null),
    client([{ profile_id: c, pick_record: { wins: 1, losses: 1, pushes: 0 } }]),
    client([{ profile_id: a, pick_record: { wins: 1, losses: 1, pushes: 0 } }, { profile_id: a, pick_record: null }]),
    client([{ profile_id: a, pick_record: { wins: 1, losses: 1, pushes: 0, secret: 'no' } }]),
    client([{ profile_id: a, pick_record: { wins: -1, losses: 1, pushes: 0 } }]),
  ]) {
    const result = await hydrateVisibleAuthorRecords(f.instance, [{ author: { id: a, pick_record: { wins: 9, losses: 9, pushes: 9 } } }])
    assert.equal(result.available, false)
    assert.equal(result.posts[0].author?.pick_record, null)
  }
})

test('requests are bounded and empty or invalid inputs do not hit the database', async () => {
  const f = client([])
  assert.equal((await fetchVisiblePickRecords(f.instance, [])).available, true)
  assert.equal((await fetchVisiblePickRecords(f.instance, ['not-a-uuid'])).available, true)
  const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`)
  assert.equal((await fetchVisiblePickRecords(f.instance, ids)).available, false)
  assert.equal(f.calls.length, 0)
})

test('a genuine zero is retained rather than confused with unavailable', async () => {
  const f = client([{ profile_id: a, pick_record: { wins: 0, losses: 0, pushes: 0 } }])
  const result = await fetchVisiblePickRecords(f.instance, [a.toUpperCase()])
  assert.deepEqual(result.records.get(a), { wins: 0, losses: 0, pushes: 0 })
})
