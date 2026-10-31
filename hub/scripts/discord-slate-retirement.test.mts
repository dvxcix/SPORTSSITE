import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { inspectDiscordSlate, retireDiscordSlate } from '../src/lib/discordSlateRetirement.ts'

process.env.DISCORD_APPLICATION_ID = '123456789012345678'
process.env.DISCORD_BOT_TOKEN = 'fixture-token'
const target = { id: '223456789012345678', name: 'slate', type: 1 }
const help = { id: '323456789012345678', name: 'help', type: 1 }

function discord(lists: unknown[][], deleteStatus = 204) {
  const requests: Array<{ url: string; method: string }> = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET'
    requests.push({ url, method })
    if (method === 'DELETE') return new Response(null, { status: deleteStatus })
    const list = lists.shift()
    if (!list) throw new Error('unexpected read')
    return new Response(JSON.stringify(list), { status: 200 })
  }
  return { requests, fetcher: fetcher as typeof fetch }
}

test('inspection and targeted deletion preserve unrelated commands', async () => {
  const f = discord([[target, help], [target, help], [help]])
  assert.deepEqual(await inspectDiscordSlate(f.fetcher), { slateId: target.id, otherCount: 1 })
  assert.deepEqual(await retireDiscordSlate(target.id, f.fetcher), { removed: true, otherCount: 1 })
  assert.deepEqual(f.requests.map(row => row.method), ['GET', 'GET', 'DELETE', 'GET'])
  assert.ok(f.requests[2].url.endsWith(`/commands/${target.id}`))
})

test('ambiguous, changed and malformed commands fail before deletion', async () => {
  for (const [list, expected] of [
    [[target, { ...target, id: '423456789012345678' }], target.id],
    [[target, help], '423456789012345678'],
    [[{ id: 'bad', name: 'slate', type: 1 }], target.id],
  ] as const) {
    const f = discord([[...list]])
    await assert.rejects(retireDiscordSlate(expected, f.fetcher))
    assert.equal(f.requests.some(row => row.method === 'DELETE'), false)
  }
})

test('failed or unverified deletion is not retried or reported successful', async () => {
  const denied = discord([[target, help]], 503)
  await assert.rejects(retireDiscordSlate(target.id, denied.fetcher))
  assert.equal(denied.requests.filter(row => row.method === 'DELETE').length, 1)
  const changed = discord([[target, help], []])
  await assert.rejects(retireDiscordSlate(target.id, changed.fetcher))
  assert.equal(changed.requests.filter(row => row.method === 'DELETE').length, 1)
})

const routeSource = await readFile(new URL('../src/app/api/admin/discord/slate-command/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function routeFixture(role: string | null, level: string | null, hibernating = true) {
  let reads = 0, writes = 0
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: role ? { id: 'id' } : null }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: level ? { currentLevel: level } : null, error: null }) } }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_type: role }, error: null }) }) }) }) }) },
    '@/lib/discordSlateRetirement': { inspectDiscordSlate: async () => { reads++; return { slateId: target.id, otherCount: 1 } }, retireDiscordSlate: async () => { writes++; return { removed: true, otherCount: 1 } } },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: hibernating },
  }
  const mod = { exports: {} as Record<string, (request?: Request) => Promise<{ status: number }>> }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  const post = (origin = 'https://example.com') => mod.exports.POST(new Request('https://example.com/api/admin/discord/slate-command', { method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ expectedId: target.id }) }))
  return { get: () => mod.exports.GET(), post, reads: () => reads, writes: () => writes }
}

test('only a verified admin at aal2 can inspect or remove, and POST requires same origin', async () => {
  for (const [role, level, expected] of [[null, null, 401], ['member', 'aal2', 403], ['admin', 'aal1', 403], ['admin', null, 403]] as const) {
    const f = routeFixture(role, level)
    assert.equal((await f.get()).status, expected)
    assert.equal((await f.post()).status, expected)
    assert.equal(f.reads() + f.writes(), 0)
  }
  const f = routeFixture('admin', 'aal2')
  assert.equal((await f.get()).status, 200)
  assert.equal((await f.post('https://attacker.invalid')).status, 403)
  assert.equal((await f.post()).status, 200)
  assert.equal(f.writes(), 1)
  assert.equal((await routeFixture('admin', 'aal2', false).post()).status, 409)
})
