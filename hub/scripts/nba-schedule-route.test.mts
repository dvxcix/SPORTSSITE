import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nbaDate } from '../src/lib/nbaPaint.ts'

test('the light slate route authenticates, requires a complete exact date and uses the shared thirty-second provider fill', async () => {
  let denied = false, complete = true, wrong = false, reads = 0
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/paintAccess': { requirePaintAccess: async () => denied ? { error: Response.json({}, { status: 403 }) } : {} },
    '@/lib/nbaPaint': { nbaDate },
    '@/lib/nbaPaintData': { getPaintSchedule: async (date: string, exact: boolean, ttl: number) => {
      reads++; assert.equal(exact, true); assert.equal(ttl, 30)
      return { date: wrong ? '2030-11-21' : date, games: [], complete }
    } },
  }
  const source = await readFile(new URL('../src/app/the-paint/schedule/route.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as { GET: (request: unknown) => Promise<Response> } }
  new Function('require', 'module', 'exports', js)((name: string) => { assert.ok(name in imports, name); return imports[name] }, module, module.exports)
  const get = (date = '2030-11-20') => module.exports.GET({ nextUrl: new URL('https://www.slipsurge.com/the-paint/schedule?date=' + date) })
  denied = true; assert.equal((await get()).status, 403); assert.equal(reads, 0)
  denied = false; assert.equal((await get('bad')).status, 400); assert.equal(reads, 0)
  const result = await get(); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await result.json(), { date: '2030-11-20', games: [] })
  complete = false; assert.equal((await get()).status, 503)
  complete = true; wrong = true; assert.equal((await get()).status, 503)
})
