import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function compile(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('require', 'exports', output)(name => {
    assert.ok(imports[name], name)
    return imports[name]
  }, exports)
  return exports
}

const access = await compile('../src/lib/whopMembershipAccess.ts')
const { resolveRepricedUltimatePlan } = await compile('../src/lib/whopRepricedUltimate.ts', { '@/lib/whopMembershipAccess': access })
const membershipId = 'mem_fixture'
const planId = 'plan_fixture'
const businessId = 'biz_lQsa02bB46YIlL'
const productId = 'prod_7z1xwDKvVgpiE'
const end = '2999-12-10T00:00:00.000Z'
const stored = { tier: 'ultimate', whop_plan_id: 'plan_tCrVAX62uKyEq', whop_membership_id: membershipId }
const input = { source: 'main', planId, membershipId, stored }
// Sanitized shape verified by the live read-only diagnostic: membership has
// a flat plan and scalar product; plan uses nested company and product IDs.
const membership = { id: membershipId, plan_id: planId, product: productId, status: 'active', renewal_period_end: end }
const plan = { id: planId, company: { id: businessId }, product: { id: productId }, plan_type: 'renewal', billing_period: 30, currency: 'usd', renewal_price: 19.99, visibility: 'hidden' }
function provider(member = membership, offer = plan) {
  let calls = 0
  return { get calls() { return calls }, fetcher: async url => { calls++; return Response.json(url.includes('/memberships/') ? member : offer) } }
}

test('real verified scalar membership product preserves exact original Ultimate entitlement', async () => {
  const p = provider()
  assert.deepEqual(await resolveRepricedUltimatePlan(input, 'secret', p.fetcher), { canonicalPlanId: stored.whop_plan_id, periodEnd: end })
  assert.equal(p.calls, 2)
})

test('matching company and product identities accept either scalar or nested forms', async () => {
  for (const member of [
    { ...membership, company: businessId },
    { ...membership, company: { id: businessId }, product: { id: productId } },
    { ...membership, company: businessId, product: { id: productId } },
  ]) {
    assert.deepEqual(await resolveRepricedUltimatePlan(input, 'secret', provider(member).fetcher), { canonicalPlanId: stored.whop_plan_id, periodEnd: end })
  }
})

test('wrong or malformed scalar and nested membership identities cannot grant access', async () => {
  for (const member of [
    { ...membership, product: 'prod_other' }, { ...membership, company: 'biz_other' },
    { ...membership, product: { id: 'prod_other' } }, { ...membership, company: { id: 'biz_other' } },
  ]) {
    const p = provider(member)
    assert.equal(await resolveRepricedUltimatePlan(input, 'secret', p.fetcher), null)
    assert.equal(p.calls, 1)
  }
  for (const member of [
    { ...membership, product: '' }, { ...membership, company: 4 },
    { ...membership, product: { id: 3 } }, { ...membership, company: [] },
  ]) {
    await assert.rejects(resolveRepricedUltimatePlan(input, 'secret', provider(member).fetcher), /identity unavailable/)
  }
})

test('scalar identity does not relax pinned membership, phase, or plan checks', async () => {
  for (const change of [{ id: 'mem_other' }, { plan_id: 'plan_other' }]) {
    await assert.rejects(resolveRepricedUltimatePlan(input, 'secret', provider({ ...membership, ...change }).fetcher), /not yet confirmed/)
  }
  for (const change of [{ renewal_price: 10 }, { currency: 'eur' }, { billing_period: 365 }, { visibility: 'visible' }, { product: { id: 'prod_other' } }]) {
    assert.equal(await resolveRepricedUltimatePlan(input, 'secret', provider(membership, { ...plan, ...change }).fetcher), null)
  }
  assert.equal(await resolveRepricedUltimatePlan({ ...input, stored: { ...stored, tier: 'basic' } }, 'secret', provider().fetcher), null)
})
