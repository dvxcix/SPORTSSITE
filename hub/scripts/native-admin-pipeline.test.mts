import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const recent = new Date(Date.now() - 60_000).toISOString()
const older = new Date(Date.now() - 20 * 60_000).toISOString()
const runs = [
  { id: 7, job_name: 'live', status: 'running', started_at: older, duration_ms: null, details: { stage: 'official-provider', token: 'private-fixture' } },
  { id: 9, job_name: 'closed', status: 'succeeded', started_at: recent, details: { stage: 'token=https://private.invalid' } },
  { id: 1, job_name: 'live', status: 'succeeded', started_at: older, duration_ms: 550 },
]
const fixture = {
  providerReads: 0,
  admin: {
    from(table: string) {
      return {
        select() { return this }, order() { return this }, limit() { return this }, in() { return this },
        eq() { return this }, gte() { return this }, lt() { return this },
        async maybeSingle() { return { data: { status: 'healthy', through_date: '2026-10-30', summary: { failures: 0 }, checks: { pitch_log: { rows: 8 } } } } },
        then(resolve: (value: unknown) => void) { resolve(table === 'pipeline_runs' ? { data: runs } : { count: 2 }) },
      }
    },
  },
}
Object.assign(globalThis, { nativePipelineFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/browserbaseUsage': `export const getBrowserbaseUsageSummary = async () => {globalThis.nativePipelineFixture.providerReads++; return {runningSessions:1,byWorkflow:[]};};
    export const browserbasePlanUsage = () => ({browserHours:25,proxyGigabytes:1});`,
  '@/lib/mlbOffseason': 'export const isMlbCronPaused = job => job === "closed";',
  '@/lib/pipelineRegistry': `export const TRACKED_PIPELINES = [
    {name:'live',label:'Live',schedule:'Daily',staleAfterMinutes:30,area:'Odds'},
    {name:'closed',label:'Closed',schedule:'Daily',staleAfterMinutes:120,area:'MLB data'},
  ];`,
  '@/lib/supabase/adminDecisionActor': `export const adminDecisionActor = async req => req.headers.get('authorization') === 'Bearer fixture'
    ? {admin:globalThis.nativePipelineFixture.admin} : {error:Response.json({}, {status:401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/admin/pipeline-health/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'native-pipeline-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/admin/pipeline-health/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const read = (admin = true) => module.exports.GET(new Request('https://fixture.invalid/api/mobile/admin/pipeline-health', {
  headers: admin ? { authorization: 'Bearer fixture' } : {},
}))

test('pipeline health is private, reports official gates and filters provider details', async () => {
  assert.equal((await read(false)).status, 401)
  assert.equal(fixture.providerReads, 0)
  const response = await read()
  const data = await response.json()
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(data.jobs[0].state, 'timed_out')
  assert.deepEqual(data.jobs[0].runs.map((run: { id: number }) => run.id), [7, 1])
  assert.equal(data.jobs[1].state, 'paused')
  assert.equal(data.jobs[1].runs[0].stage, null)
  assert.equal(JSON.stringify(data).includes('private-fixture'), false)
  assert.equal(data.audit.pitches, 8)
  assert.equal(data.budget.runningSessions, 1)
  assert.equal(fixture.providerReads, 1)
})
