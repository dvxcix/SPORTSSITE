import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { hasNflAccess, isNflToolHref } from '../src/lib/nflAccessPolicy.ts'

test('NFL entitlement is independent of admin role and other memberships', () => {
  assert.equal(hasNflAccess('admin', false), true)
  for (const role of ['user', 'creator', 'ultimate', null, undefined]) {
    assert.equal(hasNflAccess(role, false), false)
    assert.equal(hasNflAccess(role, true), true)
  }
  assert.equal(isNflToolHref('/the-sideline?mode=research'), true)
  assert.equal(isNflToolHref('/admin'), false)
  assert.equal(isNflToolHref('/dugout'), false)
})

test('all NFL tool handlers enforce the entitlement before loading data', () => {
  const files = [
    'src/app/the-sideline/page.tsx', 'src/app/the-sideline/market/route.ts',
    'src/app/the-sideline/touchdown-replay/route.ts', 'src/app/api/the-sideline/slate-edge/route.ts',
    'src/app/api/the-sideline/history/[gameId]/route.ts',
    'src/app/api/nfl-matrices/route.ts', 'src/app/api/nfl-matrices/[id]/route.ts',
    'src/app/api/nfl-matrices/import/route.ts',
  ]
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const handlers = [...source.matchAll(/export (?:default )?async function/g)].length
    assert.equal([...source.matchAll(/await requireNflAccess\(\)/g)].length, handlers, file)
    assert.doesNotMatch(source, /requireTier\('ultimate'\)/, file)
  }
  for (const file of ['src/app/admin/layout.tsx', 'src/lib/supabase/middleware.ts']) {
    assert.match(readFileSync(file, 'utf8'), /account_type !== 'admin'/)
  }
})

test('real gate and admin handlers: grant, revoke, role isolation, MFA, invalid input', async () => {
  const member = '11111111-1111-4111-8111-111111111111'
  const adminId = '22222222-2222-4222-8222-222222222222'
  const state = {
    caller: null as string | null,
    accounts: new Map([[member, 'user'], [adminId, 'admin']]),
    grants: new Set<string>(), audit: [] as unknown[], adminCalls: 0,
    assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
    error: false,
  }
  function client() {
    return {
      auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.assurance, error: null }) } },
      from(table: string) {
        let id = ''
        let operation = 'select'
        let values: { user_id: string } | null = null
        const query = {
          select() { return query },
          eq(_field: string, value: string) { id = value; return query },
          upsert(value: { user_id: string }) { operation = 'upsert'; values = value; return query },
          delete() { operation = 'delete'; return query },
          async maybeSingle() { return result() },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) },
        }
        function result() {
          if (table === 'users') return { data: state.accounts.has(id) ? { id, account_type: state.accounts.get(id) } : null, error: null }
          if (state.error) return { data: null, error: { message: 'Database unavailable' } }
          if (operation === 'upsert') state.grants.add(values!.user_id)
          if (operation === 'delete') state.grants.delete(id)
          return { data: state.grants.has(id) ? { user_id: id } : null, error: null }
        }
        return query
      },
    }
  }
  const fixture = {
    resolveAuthedClient: async () => ({ supabase: client(), userId: state.caller }),
    createAdminClient: () => { state.adminCalls++; return client() },
    writeAdminAudit: async (_client: unknown, event: unknown) => { state.audit.push(event); return null },
  }
  const globals = globalThis as typeof globalThis & { __nflAccessTest?: typeof fixture }
  globals.__nflAccessTest = fixture
  const output = await build({
    stdin: { contents: "export { requireNflAccess } from './src/lib/nflAccess'; export { GET, POST } from './src/app/api/admin/nfl-access/route'", resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm', tsconfig: 'tsconfig.json',
    plugins: [{
      name: 'isolated-auth-fixtures',
      setup(builder) {
        builder.onResolve({ filter: /^(server-only|next\/server|@\/lib\/(requireTier|supabase\/admin|adminAudit))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
          contents: args.path === 'server-only' ? '' : args.path === 'next/server'
            ? 'export const NextResponse = Response'
            : 'export const { resolveAuthedClient, createAdminClient, writeAdminAudit } = globalThis.__nflAccessTest',
        }))
      },
    }],
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'))
  const request = (body: unknown, origin = 'https://slipsurge.com') => new Request('https://slipsurge.com/api/admin/nfl-access', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    assert.equal((await api.requireNflAccess()).error.status, 401)
    assert.equal((await api.GET(new Request('https://slipsurge.com/api/admin/nfl-access'))).status, 401)
    state.caller = member
    assert.equal((await api.requireNflAccess()).error.status, 403)
    assert.equal((await api.POST(request({ userId: member, granted: true }))).status, 403)
    assert.equal(state.adminCalls, 0, 'Unauthorized requests must not create a privileged client')
    state.caller = adminId
    assert.equal((await api.requireNflAccess()).userId, adminId)
    state.assurance.nextLevel = 'aal2'
    assert.equal((await api.POST(request({ userId: member, granted: true }))).status, 403)
    state.assurance.currentLevel = 'aal2'
    assert.equal((await api.POST(request({ userId: member, granted: 'true' }))).status, 400)
    assert.equal((await api.POST(request({ userId: member, granted: true }, 'https://evil.example'))).status, 403)
    assert.equal((await api.POST(request({ userId: member, granted: true }))).status, 200)
    assert.equal(state.accounts.get(member), 'user', 'Grant must never promote member')
    state.caller = member
    assert.equal((await api.requireNflAccess()).userId, member)
    assert.equal((await api.POST(request({ userId: member, granted: true }))).status, 403, 'Beta tester is not admin')
    state.error = true
    assert.equal((await api.requireNflAccess()).error.status, 503, 'Database failures fail closed')
    state.error = false
    state.caller = adminId
    assert.equal((await api.POST(request({ userId: member, granted: false }))).status, 200)
    state.caller = member
    assert.equal((await api.requireNflAccess()).error.status, 403, 'Revocation must not be cached')
    assert.equal(state.audit.length, 2)
  } finally { delete globals.__nflAccessTest }
})
