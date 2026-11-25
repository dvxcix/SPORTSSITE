import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'
import { summarizeProductTelemetry } from '../src/lib/productExperienceTelemetry.ts'

const event = (route: string, event_name: string, duration_ms: number, device_class: string, created_at = '2026-11-25T16:00:00Z') =>
  ({ route, event_name, duration_ms, device_class, created_at, outcome: event_name === 'action_failure' ? 'failure' : 'success' })
const events = [event('/feed', 'route_ready', 360, 'phone'), event('/the-paint', 'action_failure', 240, 'desktop'),
  event('/feed', 'slow_interaction', 3200, 'phone'), event('/feed', 'route_ready', 420, 'tablet', '2026-11-25T16:15:00Z')]

test('website audit uses identical traffic ordering, counts and percentiles in both clients', () => {
  const summary = summarizeProductTelemetry(events)
  assert.deepEqual([summary.events, summary.measuredRoutes, summary.failures, summary.slowInteractions, summary.p95ReadyMs, summary.deviceCoverage],
    [4, 2, 1, 1, 3200, 3])
  assert.deepEqual(summary.routeHealth.map(row => [row.route, row.failures, row.slow, row.p95Ms, row.lastSeen]), [
    ['/the-paint', 1, 0, 240, '2026-11-25T16:00:00Z'], ['/feed', 0, 1, 3200, '2026-11-25T16:15:00Z'],
  ])
  assert.deepEqual(summarizeProductTelemetry([]).routeHealth, [])
})

test('the native audit guards access and returns the website roadmap and bounded aggregate projection', async () => {
  let reads = 0
  let failed = false
  const fixture = { from(table: string) {
    reads++
    assert.equal(table, 'product_interaction_events')
    return { select(columns: string) {
      assert.equal(columns, 'route,event_name,outcome,duration_ms,device_class,created_at')
      return { order(column: string, options: { ascending: boolean }) {
        assert.deepEqual([column, options.ascending], ['created_at', false])
        return { limit(limit: number) {
          assert.equal(limit, 5000)
          return failed ? { error: 'unavailable' } : { data: events }
        } }
      } }
    } }
  } }
  Object.assign(globalThis, { nativeProductAuditFixture: fixture })
  const stubs: Record<string, string> = {
    'next/server': 'export const NextResponse = Response;',
    '@/lib/supabase/adminDecisionActor': `export const adminDecisionActor = async req => req.headers.get('authorization') === 'Bearer admin'
      ? { admin: globalThis.nativeProductAuditFixture } : { error: Response.json({}, { status: 403 }) };`,
  }
  const output = await build({ entryPoints: ['src/app/api/mobile/admin/product-audit/route.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', plugins: [{ name: 'native-product-audit-fixture', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
    } }],
  })
  const module = { exports: {} as typeof import('../src/app/api/mobile/admin/product-audit/route') }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const request = (role?: string) => new Request('https://fixture.invalid', { headers: role ? { authorization: `Bearer ${role}` } : {} })
  assert.equal((await module.exports.GET(request())).status, 401)
  assert.equal((await module.exports.GET(request('member'))).status, 403)
  assert.equal(reads, 0)
  const reply = await module.exports.GET(request('admin'))
  assert.equal(reply.headers.get('cache-control'), 'private, no-store')
  const result = await reply.json()
  assert.deepEqual(result.telemetry, summarizeProductTelemetry(events))
  assert.equal(result.routes.find((route: { route: string }) => route.route === '/the-paint').completion, 100)
  assert.equal(result.roadmap.phases.find((phase: { id: string }) => phase.id === 'quality').status, 'active')
  assert.doesNotMatch(JSON.stringify(result), /user_id|session_id/)
  failed = true
  assert.equal((await module.exports.GET(request('admin'))).status, 503)
})
