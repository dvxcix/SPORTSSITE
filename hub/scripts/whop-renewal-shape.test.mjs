import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'

const source = await readFile(new URL('../src/app/api/admin/whop-renewal-shape/route.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const accessSource = await readFile(new URL('../src/lib/whopMembershipAccess.ts', import.meta.url), 'utf8')
const accessOutput = ts.transpileModule(accessSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const access = {}
new Function('exports', accessOutput)(access)
const resolverSource = await readFile(new URL('../src/lib/whopRepricedUltimate.ts', import.meta.url), 'utf8')
const resolverOutput = ts.transpileModule(resolverSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const resolver = {}
new Function('require', 'exports', resolverOutput)(name => { assert.equal(name, '@/lib/whopMembershipAccess'); return access }, resolver)
const require = createRequire(import.meta.url)
const targetId = '123e4567-e89b-42d3-a456-426614174000'
const memberId = 'mem_test'
const planId = 'plan_test'
const target = { tier: 'ultimate', whop_plan_id: 'plan_tCrVAX62uKyEq', whop_membership_id: memberId }
const membership = { id: memberId, plan: { id: planId }, status: 'active', renewal_period_end: '2999-12-01T00:00:00Z', cancel_at_period_end: false, company: { id: 'biz_lQsa02bB46YIlL' }, product: { id: 'prod_7z1xwDKvVgpiE' }, private_field: 'private-personal-data' }
const plan = { id: planId, account: { id: 'biz_lQsa02bB46YIlL' }, product: { id: 'prod_7z1xwDKvVgpiE' }, plan_type: 'renewal', billing_period: 30, currency: 'usd', renewal_price: 19.99, visibility: 'hidden', metadata: { secret: 'do-not-expose' } }

function route(options = {}) {
  const calls = [], queries = [], rates = []
  const user = options.user === undefined ? { id: 'admin-user' } : options.user
  const accountType = options.accountType ?? 'admin'
  const targetRecord = options.target === undefined ? target : options.target
  const imports = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user }, error: options.userError }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: options.aal ?? 'aal2' }, error: options.mfaError }) } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_type: accountType }, error: options.profileError }) }) }) }),
    }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => ({ select: () => ({ eq: (key, value) => ({ maybeSingle: async () => { queries.push({ table, key, value }); return { data: targetRecord, error: options.targetError } } }) }) }) }) },
    '@/lib/serverRateLimit': { consumeServerRateLimit: async (...args) => { rates.push(args); return options.rate ?? { allowed: true, available: true } } },
    '@/lib/whopMembershipAccess': access,
    '@/lib/whopRepricedUltimate': resolver,
  }
  const compiled = { exports: {} }
  const fetcher = async (url, init) => {
    calls.push({ url, init })
    if (options.failAt === calls.length) throw new Error('private-upstream-detail')
    if (options.httpFailureAt === calls.length) return Response.json({ detail: 'private-provider-error' }, { status: 429 })
    return Response.json(calls.length === 1 ? (options.membership ?? membership) : (options.plan ?? plan))
  }
  new Function('require', 'exports', 'process', 'fetch', output)(name => { assert.ok(imports[name], name); return imports[name] }, compiled.exports, { env: { WHOP_API_KEY: options.noKey ? '' : 'secret-key' } }, fetcher)
  const post = (body = { targetUserId: targetId, expectedPlanId: planId }, headers = { origin: 'https://www.slipsurge.com', 'sec-fetch-site': 'same-origin' }) => compiled.exports.POST(new Request('https://www.slipsurge.com/api/admin/whop-renewal-shape', { method: 'POST', headers, body: JSON.stringify(body) }))
  return { post, calls, queries, rates }
}

test('only an authenticated AAL2 admin on the same origin may inspect', async () => {
  for (const [options, headers, expected] of [
    [{ user: null }, undefined, 401], [{ userError: true }, undefined, 401],
    [{ accountType: 'member' }, undefined, 403], [{ aal: 'aal1' }, undefined, 403],
    [{ mfaError: true }, undefined, 403], [{}, { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }, 403],
    [{}, { origin: 'https://www.slipsurge.com', 'sec-fetch-site': 'cross-site' }, 403],
  ]) {
    const { post, calls } = route(options)
    assert.equal((await post(undefined, headers)).status, expected)
    assert.equal(calls.length, 0)
  }
})

test('request is rate-limited and can only target a linked original monthly Ultimate account', async () => {
  for (const [options, body, expected] of [
    [{}, { targetUserId: 'not-a-uuid', expectedPlanId: planId }, 400], [{}, { targetUserId: 'x'.repeat(300), expectedPlanId: planId }, 400],
    [{}, { targetUserId: targetId, expectedPlanId: 'plan_../../bad' }, 400],
    [{ rate: { available: false, allowed: false } }, undefined, 503],
    [{ rate: { available: true, allowed: false } }, undefined, 429],
    [{ target: null }, undefined, 404], [{ target: { ...target, tier: 'basic' } }, undefined, 404],
    [{ target: { ...target, whop_plan_id: 'plan_other' } }, undefined, 404],
    [{ target: { ...target, whop_membership_id: 'mem_../../bad' } }, undefined, 404],
    [{ noKey: true }, undefined, 503],
  ]) {
    const { post, calls } = route(options)
    assert.equal((await post(body)).status, expected)
    assert.equal(calls.length, 0)
  }
})

test('two bounded reads produce only fixed booleans and no account or provider data', async () => {
  const { post, calls, queries, rates } = route()
  const response = await post()
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.init.signal instanceof AbortSignal))
  assert.ok(calls.every(call => call.init.headers.Authorization === 'Bearer secret-key'))
  assert.deepEqual(queries, [{ table: 'users', key: 'id', value: targetId }])
  assert.deepEqual(rates, [['admin-user', 'whop_renewal_shape', 4, 600]])
  assert.ok(Object.values(result).every(value => typeof value === 'boolean'))
  assert.equal(result.ok, true)
  for (const key of ['membershipIdMatches', 'membershipPlanNested', 'membershipPlanMatchesExpected', 'membershipGrantsAccess', 'membershipPeriodValid', 'planAccountMatches', 'planProductMatches', 'planTypeRenewal', 'planBillingPeriod30', 'planCurrencyUsd', 'planRenewal1999', 'planHidden', 'runtimeWouldAccept']) assert.equal(result[key], true, key)
  for (const secret of [targetId, memberId, planId, 'secret-key', 'private-personal-data', 'do-not-expose']) assert.equal(JSON.stringify(result).includes(secret), false)
})

test('a mismatched provider member never triggers a lookup of another user plan', async () => {
  const { post, calls } = route({ membership: { ...membership, id: 'mem_someone_else' } })
  const result = await (await post()).json()
  assert.equal(result.membershipIdMatches, false)
  assert.equal(result.planRead, false)
  assert.equal(calls.length, 1)
})

test('a plan other than the expected repriced plan is not looked up', async () => {
  const { post, calls } = route({ membership: { ...membership, plan: { id: 'plan_other' } } })
  const result = await (await post()).json()
  assert.equal(result.membershipPlanMatchesExpected, false)
  assert.equal(result.planRead, false)
  assert.equal(calls.length, 1)
})

test('provider failures and timeouts return fixed booleans and no raw error details', async () => {
  for (const options of [{ failAt: 1 }, { failAt: 2 }, { httpFailureAt: 1 }, { httpFailureAt: 2 }]) {
    const { post, calls } = route(options)
    const response = await post()
    const result = await response.json()
    assert.equal(response.status, 200)
    assert.ok(Object.values(result).every(value => typeof value === 'boolean'))
    assert.ok(calls.length <= 2)
    assert.equal(JSON.stringify(result).includes('private'), false)
    assert.equal(result.planRead, false)
    assert.equal(result.runtimeWouldAccept, false)
    assert.equal(result.ok, false)
  }
})

test('runtime compatibility stays false for permissive-looking but unusable data', async () => {
  for (const options of [
    { plan: { ...plan, account: 'biz_lQsa02bB46YIlL' } },
    { membership: { ...membership, status: 'expired', renewal_period_end: '2020-01-01T00:00:00Z' } },
    { membership: { ...membership, renewal_period_end: 'not-a-date' } },
    { plan: { ...plan, plan_type: 'one_time' } },
  ]) {
    const { post, calls } = route(options)
    const result = await (await post()).json()
    assert.equal(calls.length, 2)
    assert.equal(result.runtimeWouldAccept, false)
    assert.equal(result.ok, false)
  }
})

test('private diagnostic confirms verified scalar product identity without exposing data', async () => {
  const { post } = route({ membership: { ...membership, product: 'prod_7z1xwDKvVgpiE', company: null } })
  const result = await (await post()).json()
  assert.equal(result.membershipProductMatches, true)
  assert.equal(result.membershipProductScalar, true)
  assert.equal(result.membershipProductObject, false)
  assert.equal(result.membershipBusinessMissing, true)
  assert.equal(result.runtimeMembershipIdentityUnavailable, false)
  assert.equal(result.runtimeWouldAccept, true)
  assert.equal(result.ok, true)
  assert.equal(result.runtimeOtherError, false)
  assert.ok(Object.values(result).every(value => typeof value === 'boolean'))
  assert.equal(JSON.stringify(result).includes('prod_7z1xwDKvVgpiE'), false)
})

test('private diagnostic distinguishes incomplete plan from a confirmed conflicting plan', async () => {
  const scalarPlan = await (await route({ plan: { ...plan, account: 'biz_lQsa02bB46YIlL' } }).post()).json()
  assert.equal(scalarPlan.planAccountScalar, true)
  assert.equal(scalarPlan.runtimePlanIncomplete, true)
  assert.equal(scalarPlan.runtimeWouldAccept, false)
  const conflictingPlan = await (await route({ plan: { ...plan, billing_type: 'one_time' } }).post()).json()
  assert.equal(conflictingPlan.planBillingTypeConflict, true)
  assert.equal(conflictingPlan.runtimeReturnedNoMatch, true)
  assert.equal(conflictingPlan.runtimeWouldAccept, false)
})

test('the unlinked admin page requires an authenticated AAL2 admin', async () => {
  const pageSource = await readFile(new URL('../src/app/admin/whop-renewal-shape/page.tsx', import.meta.url), 'utf8')
  const pageOutput = ts.transpileModule(pageSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  for (const [user, accountType, level, expected] of [
    [null, 'admin', 'aal2', '/auth/login?next=/admin/whop-renewal-shape'],
    [{ id: 'admin' }, 'member', 'aal2', '/'],
    [{ id: 'admin' }, 'admin', 'aal1', '/settings/security?next=/admin/whop-renewal-shape'],
  ]) {
    const imports = {
      'react/jsx-runtime': require('react/jsx-runtime'),
      'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`) } },
      '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: level } }) } }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_type: accountType } }) }) }) }) }) },
      './RenewalShapeForm': { default: () => null },
    }
    const page = { exports: {} }
    new Function('require', 'exports', pageOutput)(name => { assert.ok(imports[name], name); return imports[name] }, page.exports)
    await assert.rejects(page.exports.default(), error => error.message === `redirect:${expected}`)
  }
})

test('admin form presents labeled inputs and posts identifiers only in the request body', async () => {
  const formSource = await readFile(new URL('../src/app/admin/whop-renewal-shape/RenewalShapeForm.tsx', import.meta.url), 'utf8')
  const formOutput = ts.transpileModule(formSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const form = { exports: {} }
  new Function('require', 'exports', formOutput)(name => require(name), form.exports)
  const html = renderToStaticMarkup(React.createElement(form.exports.default))
  assert.match(html, /Account ID/)
  assert.match(html, /Expected plan ID/)
  assert.match(html, /Check membership/)
  assert.match(formSource, /fetch\('\/api\/admin\/whop-renewal-shape'/)
  assert.match(formSource, /JSON\.stringify\(\{ targetUserId:/)
  assert.doesNotMatch(formSource, /console\.|localStorage|sessionStorage|URLSearchParams/)
})
