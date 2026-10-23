import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { PAINT_MARKETS } from '../src/lib/nbaPaint.ts'

test('scheduled validation fits supported box-score markets and never loops on play-by-play-only markets', async () => {
  const fitted: string[] = []
  let released = false
  const completed = ['points', 'rebounds']
  const admin = {
    from(table: string) {
      const query = {
        select: () => query, eq: () => query,
        in: async () => ({ data: [2023, 2024, 2025].map(year => ({ key: `stats:${year}`, complete: true })), error: null }),
        update: () => { released = true; return query },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: table === 'nba_model_reports' ? completed.map(market => ({ market })) : [], error: null })),
      }
      return query
    },
    rpc(name: string, args: { p_market?: string; p_validation_season?: number }) {
      if (name === 'claim_nba_source') return Promise.resolve({ data: true, error: null })
      assert.equal(name, 'fit_nba_production_baseline')
      assert.equal(args.p_validation_season, 2025)
      assert.ok(!args.p_market?.endsWith('_first3min'))
      fitted.push(args.p_market!)
      return { abortSignal: async () => ({ data: { ready: true }, error: null }) }
    },
  }
  const imports: Record<string, unknown> = {
    'node:crypto': { randomUUID: () => 'validation-test' },
    'next/server': { NextResponse: Response },
    '@/lib/cron-auth': { requireCronAuth: () => null },
    '@/lib/pipelineHealth': { withPipelineHealth: (_name: string, handler: unknown) => handler },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/nbaPaint': { PAINT_MARKETS, nbaToday: () => '2026-10-23' },
  }
  const source = await readFile(new URL('../src/app/api/cron/nba-model-validate/route.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const target = { exports: {} as { GET: (request: Request) => Promise<Response> } }
  new Function('require', 'exports', 'module', outputText)((name: string) => {
    assert.ok(name in imports, name); return imports[name]
  }, target.exports, target)
  const response = await target.exports.GET(new Request('https://slipsurge.com/api/cron/nba-model-validate'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).deferred, 0)
  assert.equal(fitted.length, 14)
  assert.ok(fitted.includes('double_double') && fitted.includes('triple_double') && fitted.includes('assists_1q'))
  assert.ok(!fitted.includes('points') && !fitted.includes('rebounds'))
  assert.equal(released, true)
})
