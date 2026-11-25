import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'
import { nativeMlbResearchSelection, observedMlbMechanics } from '../src/lib/nativeMlbResearch'
import type { GameMechanicsResult } from '../src/lib/hrMechanics'

const selection = { date: '2026-09-20', game: 1234, window: 5 } as const
const query = new URLSearchParams({ date: selection.date, game: String(selection.game), window: String(selection.window) })
const cutoff = '2026-09-20T19:20:00Z'
const payload = { gameDate: selection.date, gamePk: selection.game, window: selection.window, sourceThroughDate: '2026-09-19', players: [] } as unknown as GameMechanicsResult
const row = { computed_at: '2026-09-20T19:10:00Z', payload }

test('workspace requires one exact day, game and supported mechanics window', () => {
  assert.deepEqual(nativeMlbResearchSelection(query), selection)
  for (const invalid of [`${query}&game=1235`, `${query}&window=3`, `${query}`.replace('2026-09-20', '2026-02-30'), `${query}`.replace('window=5', 'window=7')]) {
    assert.equal(nativeMlbResearchSelection(new URLSearchParams(invalid)), null)
  }
})

test('workspace only accepts exact mechanics observed before the frozen cutoff', () => {
  assert.equal(observedMlbMechanics(row, selection, cutoff), payload)
  assert.equal(observedMlbMechanics({ ...row, computed_at: cutoff }, selection, cutoff), null)
  assert.equal(observedMlbMechanics({ ...row, computed_at: '2026-09-20T19:21:00Z' }, selection, cutoff), null)
  assert.equal(observedMlbMechanics({ ...row, payload: { ...payload, sourceThroughDate: selection.date } }, selection, cutoff), null)
  assert.equal(observedMlbMechanics({ ...row, payload: { ...payload, gamePk: 1235 } }, selection, cutoff), null)
  assert.equal(observedMlbMechanics(null, selection, cutoff), null)
})

const operations: unknown[] = []
const fixture = {
  allowed: true, ultimate: true, saved: true,
  db: {
    from(table: string) { operations.push(table); return this },
    select() { return this },
    eq(key: string, value: unknown) { operations.push([key, value]); return this },
    lt(key: string, value: unknown) { operations.push([key, value]); return this },
    async maybeSingle() { return { data: row } },
  },
  startAt: cutoff,
}
Object.assign(globalThis, { nativeMlbWorkspaceFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/dugoutData': `export const getMlbResearchGame = async (date, game) => date === '${selection.date}' && game === ${selection.game} ? {} : null;`,
  '@/lib/hrMechanics': 'export const HR_MECHANICS_MODEL_VERSION = "fixture-model";',
  '@/lib/mlbPregameResearchData': `export const readMlbPregameResearch = async () => globalThis.nativeMlbWorkspaceFixture.saved ? {startAt: globalThis.nativeMlbWorkspaceFixture.startAt} : null;`,
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.nativeMlbWorkspaceFixture.allowed;',
  '@/lib/requireTier': `export const requireTier = async () => globalThis.nativeMlbWorkspaceFixture.ultimate ? {userId:'fixture'} : {error:Response.json({}, {status:403})};`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.nativeMlbWorkspaceFixture.db;',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.has('authorization') ? {supabase:{},userId:'fixture'} : {error:Response.json({}, {status:401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/dugout/workspace/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'mlb-workspace-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/dugout/workspace/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (authorized = true) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/dugout/workspace?${query}`, {
  headers: authorized ? { authorization: 'Bearer fixture' } : {},
}))

test('the native route applies membership and archive gates before reading mechanics', async () => {
  assert.equal((await get(false)).status, 401)
  fixture.ultimate = false
  assert.equal((await get()).status, 403)
  fixture.ultimate = true
  fixture.allowed = false
  assert.equal((await get()).status, 403)
  fixture.allowed = true
  fixture.saved = false
  assert.deepEqual(await (await get()).json(), { mechanics: null })
  assert.deepEqual(operations, [])
  fixture.saved = true
  const response = await get()
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { mechanics: payload })
  assert.ok(operations.some(item => JSON.stringify(item) === JSON.stringify(['computed_at', cutoff])))
})
