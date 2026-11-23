import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server.js'

function compile(path, imports = {}) {
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', source)(name => { if (name === 'server-only') return {}; assert.ok(name in imports, 'Unexpected import ' + name); return imports[name] }, module, module.exports)
  return module.exports
}
const display = compile('src/lib/creatorWallet.ts')
const ledger = { owner: { id: 'biz_owned' }, balances: [{ currency: 'usd', balance: 123.45, pending_balance: 24, reserve_balance: 10 }], payout_account_details: { email: 'private@example.test', address: 'private', business_representative: { date_of_birth: 'private' } } }
const payout = { id: 'wdrl_one', amount: '123.45', net_amount: '122.95', fee_amount: '0.25', markup_fee: '0.25', fee_paid_by: 'self', currency: 'usd', status: 'processing', created_at: '2026-11-20T10:00:00Z', estimated_arrival: null, payer_name: 'Private', trace_code: 'Private', payout_method: { account_number: 'Private' }, metadata: { secret: 'Private' } }
const history = { data: [payout], page_info: { has_next_page: true, end_cursor: 'next+cursor/==' } }
function provider(options = {}) {
  const calls = []
  const module = compile('src/lib/creatorWalletProvider.ts', {
    './creatorWallet': display,
    './creatorWhop': {
      getCreatorPaymentState: async account => { calls.push({ check: account }); if (options.wrongParent) throw Error('Wrong parent'); return { state: options.restricted ? 'restricted' : 'ready', canPayout: !options.noPayout } },
      creatorWhop: async (path, body) => {
        calls.push({ path, body })
        if (path.startsWith('/ledger_accounts/')) { if (options.balanceOutage) throw Error('Unavailable'); return options.ledger ?? ledger }
        if (path.startsWith('/payouts?')) { if (options.historyOutage) throw Error('Unavailable'); return options.history ?? history }
        if (path === '/access_tokens') return { token: 'scoped-test-token', expires_at: options.badExpiry ?? body.expires_at }
        throw Error('Unexpected provider operation')
      },
    },
  })
  return { module, calls }
}
test('balance serializer returns only display fields, never KYC or bank data', () => {
  assert.deepEqual(display.walletBalances(ledger, 'biz_owned'), [{ currency: 'usd', available: 123.45, pending: 24, reserved: 10 }])
  assert.ok(!JSON.stringify(display.walletBalances(ledger, 'biz_owned')).includes('private'))
})
test('other-account, missing, duplicate and nonfinite balances are unavailable, never zero-filled', () => {
  for (const value of [{ ...ledger, owner: { id: 'biz_other' } }, { owner: ledger.owner }, { ...ledger, balances: [{ currency: 'usd', balance: null }] }, { ...ledger, balances: [...ledger.balances, ...ledger.balances] }, { ...ledger, balances: [{ ...ledger.balances[0], balance: Infinity }] }]) assert.throws(() => display.walletBalances(value, 'biz_owned'))
  assert.deepEqual(display.walletBalances({ ...ledger, balances: [] }, 'biz_owned'), [])
})
test('payout serialization retains exact decimals and excludes destination, metadata and personal data', () => {
  const result = display.walletPayouts(history)
  assert.equal(result.payouts[0].amount, '123.45'); assert.equal(result.payouts[0].net, '122.95'); assert.equal(result.nextCursor, 'next+cursor/==')
  for (const key of ['payer_name', 'metadata', 'payout_method', 'trace_code']) assert.equal(Object.hasOwn(result.payouts[0], key), false)
})
test('invalid history, status, monetary values and pagination fail closed', () => {
  for (const row of [{ ...payout, amount: '' }, { ...payout, amount: '-12' }, { ...payout, amount: 'NaN' }, { ...payout, currency: 'invalid' }, { ...payout, status: '<script>' }, { ...payout, created_at: 'invalid' }]) assert.throws(() => display.walletPayouts({ ...history, data: [row] }))
  assert.throws(() => display.walletPayouts({ ...history, page_info: { has_next_page: true } }))
  assert.equal(display.walletPayouts({ ...history, page_info: { has_next_page: false, end_cursor: null } }).nextCursor, null)
})
test('revenue counts only known-currency successful payments in the requested UTC window', () => {
  const now = Date.parse('2026-11-23T12:00:00Z'), base = { id: 'one', event_type: 'payment.succeeded', amount: 24, currency: 'usd', status: 'succeeded', created_at: '2026-11-23T10:00:00Z' }
  const result = display.creatorRevenue([base, { ...base, currency: 'eur' }, { ...base, currency: null }, { ...base, amount: null }, { ...base, amount: -10 }, { ...base, status: 'failed' }, { ...base, event_type: 'payment.refunded' }, { ...base, created_at: '2026-11-23T23:00:00Z' }, { ...base, created_at: '2026-09-01T12:00:00Z' }], 'usd', 30, now)
  assert.equal(result.total, 24); assert.equal(result.count, 1); assert.equal(result.points.length, 30); assert.equal(result.points.at(-1).date, '2026-11-23')
})
test('read verifies the parent before provider reads and never creates a token or payout', async () => {
  const f = provider(), result = await f.module.readCreatorWallet('biz_owned', 'next+cursor/==')
  assert.equal(result.balances[0].available, 123.45)
  assert.equal(f.calls[0].check, 'biz_owned')
  const q = new URLSearchParams(f.calls.find(call => call.path?.startsWith('/payouts?')).path.split('?')[1])
  assert.equal(q.get('account_id'), 'biz_owned'); assert.equal(q.get('after'), 'next+cursor/=='); assert.equal(q.get('first'), '20')
  assert.ok(f.calls.every(call => !call.body)); assert.equal(f.calls.length, 3)
})
test('wrong parent prevents financial reads and token minting', async () => {
  for (const action of ['read', 'session']) {
    const f = provider({ wrongParent: true })
    await assert.rejects(action === 'read' ? f.module.readCreatorWallet('biz_owned', null) : f.module.createCreatorWalletSession('biz_owned', 'withdraw'))
    assert.equal(f.calls.filter(call => call.path).length, 0)
  }
})
test('one failed provider source does not invent balances or discard working payout history', async () => {
  const a = await provider({ balanceOutage: true }).module.readCreatorWallet('biz_owned', null)
  assert.equal(a.balances, null); assert.equal(a.balanceError, true); assert.equal(a.payouts.length, 1)
  const b = await provider({ historyOutage: true }).module.readCreatorWallet('biz_owned', null)
  assert.equal(b.payouts, null); assert.equal(b.historyError, true); assert.equal(b.balances[0].available, 123.45)
})
test('cross-account ledger response is never exposed', async () => {
  const result = await provider({ ledger: { ...ledger, owner: { id: 'biz_other' } } }).module.readCreatorWallet('biz_owned', null)
  assert.equal(result.balances, null); assert.equal(result.balanceError, true)
})
test('withdraw token is limited to owned account, explicit wallet permissions and ten minutes', async () => {
  const f = provider(), now = Date.parse('2026-11-23T12:00:00Z')
  const session = await f.module.createCreatorWalletSession('biz_owned', 'withdraw', now)
  const call = f.calls.find(row => row.path === '/access_tokens')
  assert.equal(call.body.account_id, 'biz_owned'); assert.equal(Object.hasOwn(call.body, 'user_id'), false)
  assert.deepEqual(call.body.scoped_actions, ['company:balance:read', 'payout:account:read', 'payout:withdraw_funds', 'payout:destination:read', 'payout:create_destination'])
  assert.equal(Date.parse(session.expiresAt) - now, 600000)
})
test('verification token has no wallet or payout permissions and works before payouts are enabled', async () => {
  const f = provider({ noPayout: true }); await f.module.createCreatorWalletSession('biz_owned', 'verification')
  assert.deepEqual(f.calls.find(row => row.path === '/access_tokens').body.scoped_actions, ['identity:read', 'identity:write'])
  const remediation = provider({ restricted: true }); await remediation.module.createCreatorWalletSession('biz_owned', 'verification')
  assert.deepEqual(remediation.calls.find(row => row.path === '/access_tokens').body.scoped_actions, ['identity:read', 'identity:write'])
})
test('restricted accounts and unavailable payout capability cannot mint withdrawal tokens', async () => {
  for (const options of [{ restricted: true }, { noPayout: true }]) {
    const f = provider(options); await assert.rejects(f.module.createCreatorWalletSession('biz_owned', 'withdraw'))
    assert.equal(f.calls.filter(call => call.path).length, 0)
  }
})
test('expired or overlong provider tokens are rejected', async () => {
  for (const badExpiry of ['invalid', '2000-01-01T00:00:00Z', '2099-01-01T00:00:00Z']) await assert.rejects(provider({ badExpiry }).module.createCreatorWalletSession('biz_owned', 'verification'))
})
function route(kind, options = {}) {
  const calls = []
  return { calls, module: compile(`src/app/api/creator/wallet/${kind === 'read' ? '' : 'session/'}route.ts`, {
    'next/server': { NextRequest, NextResponse },
    '@/lib/creatorWalletAuth': { creatorWalletAuth: async () => options.auth ?? { userId: 'owned-user', accountId: 'biz_owned', testAccount: !!options.testAccount } },
    '@/lib/serverRateLimit': { consumeServerRateLimit: async () => ({ available: options.available !== false, allowed: options.allowed !== false }) },
    '@/lib/creatorWalletProvider': { readCreatorWallet: async (...args) => { calls.push(args); return { balances: [] } }, createCreatorWalletSession: async (...args) => { calls.push(args); return { token: 'scoped-test-token' } } },
  }) }
}
const request = (path = '', body = { intent: 'withdraw' }, origin = 'https://www.slipsurge.com') => new NextRequest('https://www.slipsurge.com/api/creator/wallet' + path, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
test('session route rejects cross-origin and missing origin before authorizing', async () => {
  for (const origin of ['https://attacker.test', 'null', '']) { const f = route('session'); assert.equal((await f.module.POST(request('/session', undefined, origin))).status, 403); assert.equal(f.calls.length, 0) }
})
test('session route rejects test accounts, malformed input and client account identifiers', async () => {
  for (const body of [{ intent: 'withdraw', account_id: 'biz_other' }, { intent: 'read' }, { intent: ['withdraw'] }, 'bad json', 'x'.repeat(257)]) {
    const f = route('session'); const result = await f.module.POST(request('/session', body)); assert.equal(result.status, 400); assert.equal(f.calls.length, 0)
  }
  const f = route('session', { testAccount: true }); assert.equal((await f.module.POST(request('/session'))).status, 403); assert.equal(f.calls.length, 0)
})
test('authenticated scoped action uses only the server-resolved account and is not cached', async () => {
  const f = route('session'), result = await f.module.POST(request('/session'))
  assert.equal(result.status, 200); assert.deepEqual(f.calls, [['biz_owned', 'withdraw']]); assert.equal(result.headers.get('cache-control'), 'private, no-store')
})
test('rate-limit failures, anonymous sessions and MFA denial cause no provider action', async () => {
  for (const options of [{ allowed: false }, { available: false }, { auth: { status: 401, error: 'Sign in' } }, { auth: { status: 403, error: 'MFA required' } }]) for (const kind of ['read', 'session']) {
    const f = route(kind, options), result = kind === 'read' ? await f.module.GET(new NextRequest('https://www.slipsurge.com/api/creator/wallet')) : await f.module.POST(request('/session'))
    assert.ok(result.status >= 400); assert.equal(f.calls.length, 0); assert.equal(result.headers.get('cache-control'), 'private, no-store')
  }
})
test('read route rejects account selection and bad cursors; its provider operation is read-only', async () => {
  for (const query of ['?account_id=biz_other', '?after=', '?after=one&after=two', '?after=' + 'x'.repeat(513)]) { const f = route('read'); assert.equal((await f.module.GET(new NextRequest('https://www.slipsurge.com/api/creator/wallet' + query))).status, 400); assert.equal(f.calls.length, 0) }
  const f = route('read'); assert.equal((await f.module.GET(new NextRequest('https://www.slipsurge.com/api/creator/wallet?after=next'))).status, 200); assert.deepEqual(f.calls, [['biz_owned', 'next']])
})
test('wallet auth verifies identity and MFA before reading the exact signed-in profile', async () => {
  for (const option of ['anonymous', 'mfa', 'ok']) {
    const filters = []
    const query = { select() { return this }, eq(...args) { filters.push(args); return this }, async single() { return { data: { username: 'member', whop_connected_company_id: 'biz_owned' } } } }
    const module = compile('src/lib/creatorWalletAuth.ts', {
      './supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: option === 'anonymous' ? null : { id: 'owned-user' } } }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: option === 'mfa' ? 'aal2' : 'aal1' } }) } } }) },
      './supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    })
    const result = await module.creatorWalletAuth()
    if (option === 'ok') { assert.equal(result.accountId, 'biz_owned'); assert.deepEqual(filters, [['id', 'owned-user']]) } else { assert.ok(result.status >= 400); assert.equal(filters.length, 0) }
  }
})
