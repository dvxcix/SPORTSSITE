import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/app/api/creator/scheduled-posts/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const id = '01234567-89ab-4cde-8fab-0123456789ab'

function fixture(role: string, storedSport: string | null) {
  let writes = 0
  let filtered = false
  const row = { id, sport: storedSport }
  const query = {
    eq: () => query, in: () => query,
    or: (filter: string) => { assert.equal(filter, 'sport.is.null,sport.not.ilike.MLB'); filtered = true; return query },
    select: () => query,
    single: async () => { writes++; return { data: row, error: null } },
    maybeSingle: async () => { if (filtered && storedSport === 'MLB') return { data: null, error: null }; writes++; return { data: row, error: null } },
    then: (resolve: (result: { error: null }) => void) => { if (!(filtered && storedSport === 'MLB')) writes++; resolve({ error: null }) },
  }
  const admin = { from: (table: string) => table === 'users'
    ? { select: () => ({ eq: () => ({ single: async () => ({ data: { account_type: role } }) }) }) }
    : { insert: () => query, update: () => query, delete: () => query } }
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/creator': { hasApprovedCreatorAccess: async () => true },
    '@/lib/serverRateLimit': { consumeServerRateLimit: async () => ({ available: true, allowed: true }) },
    '@/lib/safeApiError': { safeApiError: () => ({ status: 500 }) },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
  }
  const mod = { exports: {} as Record<string, (request: Request) => Promise<{ status: number }>> }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  const request = (method: string, body?: unknown) => new Request(`https://example.com/api/creator/scheduled-posts?id=${id}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { post: (body: unknown) => mod.exports.POST(request('POST', body)), patch: (body: unknown) => mod.exports.PATCH(request('PATCH', body)), delete: () => mod.exports.DELETE(request('DELETE')), writes: () => writes }
}

test('members cannot create or modify a retired MLB post, and existing drafts are not erased', async () => {
  const f = fixture('user', 'MLB')
  assert.equal((await f.post({ content: 'MLB take', sport: 'MLB', draft: true })).status, 404)
  assert.equal((await f.patch({ id, action: 'edit', content: 'MLB take', sport: 'MLB', draft: true })).status, 404)
  assert.equal((await f.patch({ id, action: 'cancel' })).status, 404)
  await f.delete()
  assert.equal(f.writes(), 0)
})

test('NFL and sport-neutral drafts remain editable and admins retain MLB access', async () => {
  for (const [role, sport] of [['user', 'NFL'], ['user', null], ['admin', 'MLB']] as const) {
    const f = fixture(role, sport)
    assert.equal((await f.patch({ id, action: 'edit', content: 'take', sport, draft: true })).status, 200)
    assert.equal(f.writes(), 1)
  }
})
