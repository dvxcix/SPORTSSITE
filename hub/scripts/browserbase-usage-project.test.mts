import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const now = new Date().toISOString()
const session = (projectId: string, id: string, proxyBytes: number) => ({ id, projectId, proxyBytes, createdAt: now, startedAt: now, updatedAt: now, expiresAt: now, endedAt: now, status: 'COMPLETED', region: 'us-east-1', keepAlive: false, userMetadata: { book: 'fixture', sport: 'NFL', mode: 'test' } })
const fixture = { project: 'project-a', usage: { browserMinutes: 30, proxyBytes: 1000 }, sessions: [session('project-a', 'a-1', 100), session('project-b', 'b-1', 500)], running: [session('project-a', 'a-2', 0), session('project-b', 'b-2', 0)] }
Object.assign(globalThis, { browserbaseUsageFixture: fixture })
const stubs: Record<string, string> = {
  'server-only': '',
  'next/cache': 'export const unstable_cache=(fn)=>fn',
  '@browserbasehq/sdk': 'export default class Browserbase { projects={usage:async()=>globalThis.browserbaseUsageFixture.usage,list:async()=>[]}; sessions={list:async(query)=>query?.status==="RUNNING"?globalThis.browserbaseUsageFixture.running:globalThis.browserbaseUsageFixture.sessions} }',
}
const bundle = await build({
  stdin: { contents: 'export {getBrowserbaseUsageSummary} from "./src/lib/browserbaseUsage"', resolveDir: resolve('.'), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'ts' }))
  } }],
})
const compiled = { exports: {} as { getBrowserbaseUsageSummary: () => Promise<{ attributedProxyBytes: number; cycleSessionCount: number; retainedSessionCount: number; runningSessions: number; recentSessions: unknown[] } | null> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

test('project usage never attributes another project’s sessions or running browsers', async () => {
  const oldKey = process.env.BROWSERBASE_API_KEY, oldProject = process.env.BROWSERBASE_PROJECT_ID
  process.env.BROWSERBASE_API_KEY = 'fixture'; process.env.BROWSERBASE_PROJECT_ID = fixture.project
  try {
    const summary = await compiled.exports.getBrowserbaseUsageSummary()
    assert.ok(summary)
    assert.equal(summary.attributedProxyBytes, 100)
    assert.equal(summary.cycleSessionCount, 1)
    assert.equal(summary.retainedSessionCount, 1)
    assert.equal(summary.runningSessions, 1)
    assert.equal(summary.recentSessions.length, 1)
  } finally {
    if (oldKey === undefined) delete process.env.BROWSERBASE_API_KEY; else process.env.BROWSERBASE_API_KEY = oldKey
    if (oldProject === undefined) delete process.env.BROWSERBASE_PROJECT_ID; else process.env.BROWSERBASE_PROJECT_ID = oldProject
  }
})
