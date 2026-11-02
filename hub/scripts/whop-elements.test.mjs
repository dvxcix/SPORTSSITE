import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import { contentSecurityPolicy } from '@whop/elements'

const source = await readFile(new URL('../src/app/api/whop/checkout-session/route.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const tiersSource = await readFile(new URL('../packages/core/src/tiers.ts', import.meta.url), 'utf8')
const tiersOutput = ts.transpileModule(tiersSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const tiers = {}
new Function('exports', tiersOutput)(tiers)
const ultimate = 'plan_2uISqRWL3Re5v'
const annual = 'plan_Brp4I5MDssXY0'
const addon = 'plan_Q1Ey6RMgjS9XQ'
const historicalPlans = [
  'plan_C0wvFkX0sqiPm', 'plan_3QSVT9Mr4cxVt', 'plan_3HbuZZv6vhNu9',
  'plan_tCrVAX62uKyEq', 'plan_1eWRTXv0XXTrI',
]
const freeProfile = { discord_advanced_claimed: false }

function route({ user = { id: 'member-123' }, allowed = true, available = true, response, failure, profile = freeProfile, profileError = null } = {}) {
  const calls = []
  const profileQueries = []
  const imports = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => ({ select: fields => ({ eq: (key, value) => ({ single: async () => {
      profileQueries.push({ table, fields, key, value })
      return { data: profile, error: profileError }
    } }) }) }) }) },
    '@slipsurge/core/tiers': tiers,
    '@/lib/platform': { PLATFORM_URL: 'https://www.slipsurge.com' },
    '@/lib/serverRateLimit': { consumeServerRateLimit: async () => ({ allowed, available }) },
    '@/lib/safeApiError': { safeApiError: (_tag, _error, message, status) => Response.json({ error: message }, { status }) },
    '@/lib/whopUrl': { isTrustedWhopUrl: url => typeof url === 'string' && new URL(url).hostname === 'whop.com' },
  }
  const compiled = { exports: {} }
  new Function('require', 'exports', 'process', 'fetch', outputText)(
    name => { assert.ok(imports[name], name); return imports[name] }, compiled.exports,
    { env: { WHOP_API_KEY: 'test-main-key', ADDON_WHOP_KEY: 'test-addon-key' } },
    async (url, init) => {
      calls.push({ url, ...init, body: JSON.parse(init.body) })
      if (failure) throw new Error('provider unavailable')
      return response ?? Response.json({ id: 'ch_test', purchase_url: 'https://whop.com/checkout/test' })
    },
  )
  return { calls, profileQueries, post: planId => compiled.exports.POST(new Request('https://www.slipsurge.com/api/whop/checkout-session', { method: 'POST', body: JSON.stringify({ planId, metadata: { internal_user_id: 'attacker' }, discord_advanced_claimed: true }) })) }
}

test('Elements configuration preserves server-authored membership attribution', async () => {
  for (const planId of [ultimate, annual]) {
    const { post, calls } = route()
    const response = await post(planId)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.equal((await response.json()).checkoutConfigurationId, 'ch_test')
    assert.equal(calls[0].url, 'https://api.whop.com/api/v1/checkout_configurations')
    assert.deepEqual(calls[0].body.metadata, { internal_user_id: 'member-123' })
    assert.equal(calls[0].body.plan_id, planId)
    assert.equal(calls[0].body.redirect_url, 'https://www.slipsurge.com/pricing')
    assert.equal(calls[0].headers.Authorization, 'Bearer test-main-key')
    assert.ok(calls[0].signal instanceof AbortSignal)
  }
})

test('anonymous, unknown-plan and rate-limited requests never reach Whop', async () => {
  for (const [options, plan, status] of [[{ user: null }, ultimate, 401], [{}, 'unknown', 400], [{}, '__proto__', 400], [{ allowed: false }, ultimate, 429], [{ available: false }, ultimate, 503]]) {
    const { post, calls } = route(options)
    assert.equal((await post(plan)).status, status)
    assert.equal(calls.length, 0)
  }
})

test('historical plans remain recognized but cannot create new checkouts', async () => {
  for (const planId of historicalPlans) {
    assert.ok(tiers.WHOP_PLANS[planId], planId)
    const { post, calls } = route()
    assert.equal((await post(planId)).status, 400, planId)
    assert.equal(calls.length, 0, planId)
  }
  assert.equal(tiers.checkoutApiKeyEnvFor('plan_Q1Ey6RMgjS9XQ'), 'ADDON_WHOP_KEY')
  assert.equal(tiers.checkoutApiKeyEnvFor(ultimate), 'WHOP_API_KEY')
})

test('qualified Discord claim creates an add-on checkout through its own Whop business', async () => {
  const { post, calls, profileQueries } = route({ profile: { ...freeProfile, discord_advanced_claimed: true } })
  assert.equal((await post(addon)).status, 200)
  assert.equal(calls[0].headers.Authorization, 'Bearer test-addon-key')
  assert.equal(calls[0].body.plan_id, addon)
  assert.equal(profileQueries[0].table, 'users')
  assert.equal(profileQueries[0].key, 'id')
  assert.equal(profileQueries[0].value, 'member-123')
})

test('add-on eligibility is checked server-side and fails closed on lookup failure', async () => {
  for (const [options, expected] of [[{ profile: freeProfile }, 403], [{ profile: null }, 503], [{ profileError: { message: 'unavailable' } }, 503]]) {
    const { post, calls } = route(options)
    assert.equal((await post(addon)).status, expected)
    assert.equal(calls.length, 0)
  }
})

test('provider failures and legacy or untrusted response shapes fail closed', async () => {
  for (const options of [{ failure: true }, { response: Response.json({}, { status: 403 }) }, { response: Response.json({ id: 'session_legacy', purchase_url: 'https://whop.com/checkout/test' }) }, { response: Response.json({ id: 'ch_test', purchase_url: 'https://example.com/' }) }]) {
    assert.equal((await route(options).post(ultimate)).status, 502)
  }
})

test('browser policy includes Elements frames and page-side wallet providers', () => {
  const policy = contentSecurityPolicy().merge("default-src 'self'; script-src 'self'; frame-src 'self'; connect-src 'self'")
  for (const origin of ['https://cdn.whop.com', 'https://api.whop.com', 'https://pay.google.com', 'https://applepay.cdn-apple.com', 'https://www.paypal.com', 'https://cdn.plaid.com']) assert.ok(policy.includes(origin), origin)
})
