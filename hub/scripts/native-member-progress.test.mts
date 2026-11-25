import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const owner = '0e1b44a4-340f-476b-ab6e-4e69e7454ca8'
const progress = { level: 2, points: 125,
  missions: [{ key: 'daily_signal', title: 'Share today', current: 1, target: 1, period: 'daily', points: 15 }],
  achievements: ['first_signal'] }
const event = { id: 12, activity_type: 'research', target_path: '/workspace', label: 'Saved a note', occurred_at: '2026-11-25' }
const calls: unknown[] = []
const fixture = {
  fail: false,
  client: {
    from(table: string) {
      calls.push(table)
      return {
        select() { return this },
        eq(field: string, value: string) { calls.push([field, value]); return this },
        order(field: string, options: object) { calls.push([field, options]); return this },
        async limit(amount: number) { calls.push(amount); return { data: [event], error: fixture.fail ? {} : null } },
      }
    },
    async rpc(name: string) { calls.push(name); return { data: progress, error: fixture.fail ? {} : null } },
  },
}
Object.assign(globalThis, { memberProgressFixture: fixture })
const bundle = await build({
  entryPoints: ['src/app/api/mobile/member-progress/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'member-progress-fixture', setup(plugin) {
    plugin.onResolve({ filter: /^(@\/lib\/supabase\/nativeAccount|next\/server)$/ }, arg => ({ path: arg.path, namespace: 'fixture' }))
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({
      contents: arg.path === 'next/server' ? 'export const NextResponse = Response' : `
        export async function requireNativeAccount(request) {
          if (request.headers.get('authorization') === 'Bearer viewer') return { userId: '${owner}', supabase: globalThis.memberProgressFixture.client };
          return { error: Response.json({}, {status: 401}) };
        }`,
    }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/member-progress/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (query: string, authorized = true) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/member-progress?${query}`, {
  headers: authorized ? { authorization: 'Bearer viewer' } : {},
}))

test('private Activity Replay uses the viewer ledger and the canonical 150-event order', async () => {
  assert.equal((await get('view=activity', false)).status, 401)
  assert.equal((await get('view=activity&view=missions')).status, 400)
  assert.deepEqual(calls, [])
  const result = await get('view=activity&user=someone-else')
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await result.json(), { events: [event] })
  assert.deepEqual(calls, ['member_activity_events', ['user_id', owner], ['occurred_at', { ascending: false }],
    ['id', { ascending: false }], 150])
})

test('Missions uses the existing account-bound mastery and handles unavailable progress', async () => {
  calls.length = 0
  assert.equal((await get('view=missions', false)).status, 401)
  assert.deepEqual(await (await get('view=missions')).json(), progress)
  assert.deepEqual(calls, ['get_member_mastery'])
  fixture.fail = true
  assert.equal((await get('view=missions')).status, 503)
  assert.equal((await get('view=activity')).status, 503)
})
