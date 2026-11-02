import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function compile(path, imports = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const mod = { exports: {} }
  new Function('require', 'exports', 'process', 'fetch', output)(name => {
    assert.ok(imports[name], name)
    return imports[name]
  }, mod.exports, globals.process ?? process, globals.fetch ?? fetch)
  return mod.exports
}

const membershipAccess = await compile('../src/lib/whopMembershipAccess.ts')
const helper = await compile('../src/lib/whopRepricedUltimate.ts', { '@/lib/whopMembershipAccess': membershipAccess })
const upgradeHelper = await compile('../src/lib/whopConcurrentUpgrade.ts', { '@/lib/whopMembershipAccess': membershipAccess })
const tiers = await compile('../packages/core/src/tiers.ts')
const planId = 'plan_changed'
const membershipId = 'mem_existing'
const previous = '2998-11-10T00:00:00.000Z'
const later = '2999-12-10T00:00:00.000Z'
const stored = { id: 'member-owner', tier: 'ultimate', whop_plan_id: 'plan_tCrVAX62uKyEq', whop_membership_id: membershipId, tier_current_period_end: previous, tier_cancel_at_period_end: true, tier_status: 'canceling' }
const plan = { id: planId, company: { id: 'biz_lQsa02bB46YIlL' }, product: { id: 'prod_7z1xwDKvVgpiE' }, billing_type: 'renewal', billing_period: 30, currency: 'usd', renewal_price: 19.99, visibility: 'hidden' }
const input = { source: 'main', planId, membershipId, stored }

function provider({ membership = { id: membershipId, plan: { id: planId }, status: 'active', renewal_period_end: later }, variant = plan, failure } = {}) {
  const calls = []
  const fetcher = async (url, init) => {
    calls.push({ url, init })
    if (failure) throw new Error('network timeout')
    return Response.json(url.includes('/memberships/') ? membership : variant)
  }
  return { calls, fetcher }
}

test('repriced plan requires pinned owner and authenticated membership and plan checks', async () => {
  const { calls, fetcher } = provider()
  assert.deepEqual(await helper.resolveRepricedUltimatePlan(input, 'secret', fetcher), { canonicalPlanId: stored.whop_plan_id, periodEnd: later })
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.init.headers.Authorization === 'Bearer secret'))
  assert.ok(calls.every(call => call.init.signal instanceof AbortSignal))
  for (const invalid of [
    { ...input, source: 'addon' }, { ...input, membershipId: 'mem_other' },
    { ...input, stored: { ...stored, tier: 'basic' } },
    { ...input, stored: { ...stored, tier: 'free' } },
    { ...input, stored: { ...stored, whop_plan_id: 'plan_3QSVT9Mr4cxVt' } },
    { ...input, planId: 'not-a-plan' },
  ]) {
    const blocked = provider()
    assert.equal(await helper.resolveRepricedUltimatePlan(invalid, 'secret', blocked.fetcher), null)
    assert.equal(blocked.calls.length, 0)
  }
})

test('wrong current provider membership or plan properties cannot grant access', async () => {
  const mismatches = [
    { membership: { id: membershipId, plan: { id: planId }, company: { id: 'biz_other' } } },
    { membership: { id: membershipId, plan: { id: planId }, product: { id: 'prod_other' } } },
    ...[
      { id: 'plan_other' }, { company: { id: 'biz_other' } }, { product: { id: 'prod_other' } },
      { billing_type: 'one_time' }, { billing_period: 365 }, { currency: 'eur' },
      { renewal_price: 10 }, { visibility: 'visible' },
    ].map(change => ({ variant: { ...plan, ...change } })),
  ]
  for (const mismatch of mismatches) {
    assert.equal(await helper.resolveRepricedUltimatePlan(input, 'secret', provider(mismatch).fetcher), null)
  }
})

test('SDK plan shape is accepted and conflicting provider business or cadence is rejected', async () => {
  const variant = { ...plan, account: plan.company, plan_type: 'renewal' }
  delete variant.company
  delete variant.billing_type
  assert.deepEqual(await helper.resolveRepricedUltimatePlan(input, 'secret', provider({ variant }).fetcher), { canonicalPlanId: stored.whop_plan_id, periodEnd: later })
  assert.equal(await helper.resolveRepricedUltimatePlan(input, 'secret', provider({ variant: { ...variant, company: { id: 'biz_other' } } }).fetcher), null)
  assert.equal(await helper.resolveRepricedUltimatePlan(input, 'secret', provider({ variant: { ...variant, billing_type: 'one_time' } }).fetcher), null)
})

test('provider outage and incomplete provider data remain retryable', async () => {
  for (const options of [{ failure: true }, { membership: { id: membershipId } }, { variant: { ...plan, company: null } }, { membership: { id: 'mem_other', plan: { id: planId } } }, { membership: { id: membershipId, plan: { id: 'plan_old' } } }]) {
    await assert.rejects(helper.resolveRepricedUltimatePlan(input, 'secret', provider(options).fetcher))
  }
  await assert.rejects(helper.resolveRepricedUltimatePlan(input, undefined, provider().fetcher))
})

function database(initial = stored, conflict = false, otherOwner = null) {
  const user = { ...initial }
  const receipts = new Map()
  const updates = []
  const db = { from(table) {
    let action = 'select', values, filters = []
    const builder = {
      select() { return builder },
      update(v) { action = 'update'; values = v; return builder },
      insert(v) { action = 'insert'; values = v; return builder },
      eq(key, value) { filters.push([key, value]); return builder },
      is(key, value) { filters.push([key, value]); return builder },
      async maybeSingle() {
        if (table === 'provider_webhook_events') return { data: receipts.get(filters.find(([key]) => key === 'provider_event_id')?.[1]) ?? null }
        if (table === 'users') {
          if (action === 'select' && otherOwner && filters.some(([key, value]) => key === 'whop_membership_id' && value === otherOwner.membershipId)) {
            return { data: { id: otherOwner.userId }, error: null }
          }
          const matches = !conflict && filters.every(([key, value]) => (user[key] ?? null) === value)
          if (action === 'update') {
            updates.push({ filters, values })
            if (matches) Object.assign(user, values)
            return { data: matches ? { id: user.id } : null, error: null }
          }
          return { data: filters.every(([key, value]) => user[key] === value) ? { ...user } : null }
        }
        throw new Error(`unexpected read ${table}`)
      },
      then(resolve, reject) {
        try {
          if (table === 'provider_webhook_events') {
            if (action === 'insert') receipts.set(values.provider_event_id, { ...values, id: 1 })
            if (action === 'update') {
              const id = filters.find(([key]) => key === 'provider_event_id')?.[1]
              if (id && receipts.has(id)) Object.assign(receipts.get(id), values)
            }
          } else if (table === 'users' && action === 'update') {
            if (filters.every(([key, value]) => (user[key] ?? null) === value)) Object.assign(user, values)
            updates.push({ filters, values })
          } else throw new Error(`unexpected write ${table}`)
          resolve({ error: null, data: null })
        } catch (error) { reject(error) }
      },
    }
    return builder
  } }
  return { db, user, receipts, updates }
}

async function webhook({ providerOptions, owner, source = 'main', eventType = 'payment.succeeded', eventPlan = planId, eventMembership = membershipId, metadataUser = 'member-owner', eventPeriodEnd = later, conflict = false, replay = false, otherOwner = null, upgradeMember = null, upgradeFailure = false } = {}) {
  const state = database(owner, conflict, otherOwner)
  const remote = provider(providerOptions)
  const alerts = []
  const imports = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) }, after: () => {} },
    crypto: await import('node:crypto'),
    '@/lib/supabase/admin': { createAdminClient: () => state.db },
    '@slipsurge/core/tiers': tiers,
    '@/lib/tierBadges': { syncTierBadge: async () => {} },
    '@/lib/xConversion': { sendXConversion: async () => {} },
    '@/lib/discord': { syncDiscordRoleForUser: async () => {} },
    '@/lib/billingAlert': { alertUnexpectedChargeAfterCancel: async (_db, value) => { alerts.push(value) }, alertPaymentOnCancelingMembership: async (_db, value) => { alerts.push(value) } },
    '@/lib/whopMembershipAccess': { whopCancellationKeepsAccess: () => false, whopMembershipPeriodEnd: () => eventPeriodEnd },
    '@/lib/whopRepricedUltimate': { resolveRepricedUltimatePlan: (args, key) => helper.resolveRepricedUltimatePlan(args, key, remote.fetcher) },
    '@/lib/whopConcurrentUpgrade': { verifyConcurrentUpgrade: (args, key) => upgradeHelper.verifyConcurrentUpgrade(args, key, async () => {
      if (upgradeFailure) throw new Error('provider unavailable')
      return Response.json(upgradeMember ?? { id: eventMembership, plan_id: eventPlan, status: 'active', cancel_at_period_end: false,
        renewal_period_end: later, metadata: { internal_user_id: metadataUser } })
    }) },
  }
  const mod = await compile('../src/lib/whopWebhook.ts', imports, { process: { env: { WHOP_API_KEY: 'secret', ADDON_WHOP_KEY: 'addon-secret' } } })
  const payload = JSON.stringify({ action: eventType, data: { plan_id: eventPlan, membership: eventMembership, metadata: { internal_user_id: metadataUser } } })
  const timestamp = '12345', id = 'evt_test', secret = 'secret-webhook'
  const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest('base64')
  const request = () => new Request('https://example.test', { method: 'POST', body: payload, headers: { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` } })
  const response = await mod.handleWhopWebhookRequest(request(), secret, source)
  const replayResponse = replay ? await mod.handleWhopWebhookRequest(request(), secret, source) : null
  return { response, replayResponse, ...state, providerCalls: remote.calls, alerts }
}

test('signed renewal updates only the pinned period end and preserves cancellation and canonical plan', async () => {
  const result = await webhook()
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier_current_period_end, later)
  assert.equal(result.user.tier_cancel_at_period_end, true)
  assert.equal(result.user.tier_status, 'canceling')
  assert.equal(result.user.whop_plan_id, stored.whop_plan_id)
  assert.equal(tiers.WHOP_PLANS[result.user.whop_plan_id].tier, 'ultimate')
  assert.deepEqual(result.updates.map(update => update.values), [{ tier_current_period_end: later }])
  assert.ok(result.updates[0].filters.some(([key, value]) => key === 'tier_cancel_at_period_end' && value === true))
  assert.equal(result.alerts.length, 1)
  assert.equal(result.alerts[0].membershipId, membershipId)
})

test('activation and noncanceling accounts do not send charge alerts', async () => {
  for (const args of [
    { eventType: 'membership.activated' },
    { eventType: 'membership.went_valid' },
    { owner: { ...stored, tier_cancel_at_period_end: false } },
  ]) {
    const result = await webhook(args)
    assert.equal(result.response.status, 200)
    assert.equal(result.alerts.length, 0)
  }
})

test('a canceling member payment alerts even if lifecycle events already advanced the boundary or the payment omits it', async () => {
  for (const args of [
    { owner: { ...stored, tier_current_period_end: later } },
    { eventPeriodEnd: null },
    { eventPeriodEnd: '2020-01-01T00:00:00.000Z' },
  ]) {
    const result = await webhook(args)
    assert.equal(result.response.status, 200)
    assert.equal(result.alerts.length, 1)
    assert.equal(result.alerts[0].membershipId, membershipId)
  }
})

test('same signed event replay is deduplicated before sending another cancellation alert', async () => {
  const result = await webhook({ replay: true, eventPeriodEnd: null })
  assert.equal(result.response.status, 200)
  assert.equal(result.replayResponse.status, 200)
  assert.equal((await result.replayResponse.json()).duplicate, true)
  assert.equal(result.alerts.length, 1)
})

test('signed unknown plan cannot change another owner or cross business boundaries', async () => {
  for (const args of [{ metadataUser: 'other' }, { eventMembership: 'mem_other' }, { source: 'addon' }, { owner: { ...stored, tier: 'basic' } }, { providerOptions: { variant: { ...plan, product: { id: 'prod_other' } } } }]) {
    const result = await webhook(args)
    assert.equal(result.response.status, args.metadataUser === 'other' ? 500 : 200)
    assert.equal(result.updates.length, 0)
  }
})

test('an unrelated product event without a membership is acknowledged without changing access', async () => {
  const result = await webhook({ eventPlan: 'plan_unrelated', eventMembership: '' })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.updates.length, 0)
})

test('signed renewal lookup timeout reports a retryable failure without touching access', async () => {
  const result = await webhook({ providerOptions: { failure: true } })
  assert.equal(result.response.status, 500)
  assert.equal(result.updates.length, 0)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.receipts.get('evt_test').status, 'failed')
})

test('provider plan propagation lag is retryable and does not acknowledge the renewal', async () => {
  const result = await webhook({ providerOptions: { membership: { id: membershipId, plan: { id: 'plan_old' } } } })
  assert.equal(result.response.status, 500)
  assert.equal(result.receipts.get('evt_test').status, 'failed')
  assert.equal(result.updates.length, 0)
})

test('a concurrent membership change cannot be silently acknowledged', async () => {
  const result = await webhook({ conflict: true })
  assert.equal(result.response.status, 500)
  assert.equal(result.receipts.get('evt_test').status, 'failed')
  assert.equal(result.user.tier_current_period_end, previous)
  assert.equal(result.alerts.length, 0)
})

test('older repriced renewals do not move the paid-through boundary backwards', async () => {
  const result = await webhook({ eventPeriodEnd: '2026-10-01T00:00:00.000Z', providerOptions: { membership: { id: membershipId, plan: { id: planId }, status: 'active', renewal_period_end: previous } } })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier_current_period_end, previous)
  assert.equal(result.updates.length, 0)
})

test('provider lifecycle and paid-through boundary remain authoritative during cancellation', async () => {
  const providerOptions = { membership: { id: membershipId, plan: { id: planId }, status: 'canceling', cancel_at_period_end: true, renewal_period_end: previous } }
  const result = await webhook({ providerOptions })
  assert.equal(result.response.status, 500)
  assert.equal(result.user.tier_current_period_end, previous)
  assert.equal(result.user.tier_cancel_at_period_end, true)
  assert.equal(result.receipts.get('evt_test').status, 'failed')
  const inactive = await webhook({ providerOptions: { membership: { id: membershipId, plan: { id: planId }, status: 'expired', renewal_period_end: previous } } })
  assert.equal(inactive.user.tier_current_period_end, previous)
  assert.equal(inactive.updates.length, 0)
})

test('cancellation still operates on the pinned membership and canonical business', async () => {
  const result = await webhook({ eventType: 'membership.deactivated', eventPeriodEnd: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.user.tier_status, 'canceling')
  assert.equal(result.user.tier_cancel_at_period_end, true)
  assert.equal(result.user.whop_plan_id, stored.whop_plan_id)
  assert.equal(result.providerCalls.length, 0)
  const wrongSource = await webhook({ source: 'addon', eventType: 'membership.deactivated', eventPeriodEnd: '2999-01-01T00:00:00.000Z' })
  assert.equal(wrongSource.updates.length, 0)
})

test('a lower-tier payment cannot replace a linked Ultimate membership, even if canceling or same-id', async () => {
  for (const args of [
    { eventMembership: 'mem_other', owner: { ...stored, tier_cancel_at_period_end: false } },
    { eventMembership: 'mem_other', owner: stored },
    { eventMembership: membershipId, owner: stored },
  ]) {
    const result = await webhook({ ...args, eventPlan: 'plan_C0wvFkX0sqiPm' })
    assert.equal(result.response.status, 500)
    assert.equal(result.receipts.get('evt_test').status, 'failed')
    assert.equal(result.user.tier, 'ultimate')
    assert.equal(result.user.whop_membership_id, membershipId)
    assert.equal(result.user.whop_plan_id, stored.whop_plan_id)
    assert.equal(result.user.tier_cancel_at_period_end, args.owner.tier_cancel_at_period_end)
    assert.equal(result.updates.length, 0)
  }
})

test('a regular same-tier renewal is compare-and-set against the original access state', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  const result = await webhook({ owner: original, eventPlan: 'plan_C0wvFkX0sqiPm' })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'basic')
  assert.equal(result.user.whop_membership_id, membershipId)
  assert.deepEqual(result.updates[0].filters.filter(([key]) => key !== 'id').map(([key]) => key).sort(), [
    'tier', 'tier_cancel_at_period_end', 'tier_current_period_end', 'tier_purchased_at', 'tier_status', 'whop_membership_id', 'whop_plan_id', 'whop_user_id',
  ])
})

test('a concurrent membership change makes a regular positive webhook retry without overwriting access', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  const result = await webhook({ owner: original, eventPlan: 'plan_C0wvFkX0sqiPm', conflict: true })
  assert.equal(result.response.status, 500)
  assert.equal(result.receipts.get('evt_test').status, 'failed')
  assert.equal(result.user.tier, 'basic')
  assert.equal(result.user.whop_membership_id, membershipId)
  assert.equal(result.user.tier_current_period_end, previous)
})

test('a same-tier different membership is held rather than overwriting a cancellation', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: true }
  const result = await webhook({ owner: original, eventPlan: 'plan_C0wvFkX0sqiPm', eventMembership: 'mem_other' })
  assert.equal(result.response.status, 500)
  assert.equal(result.user.whop_membership_id, membershipId)
  assert.equal(result.user.tier_cancel_at_period_end, true)
  assert.equal(result.alerts.length, 0)
})

test('a legitimate Basic to Ultimate event for a new membership still grants Ultimate', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  const result = await webhook({ owner: original, eventPlan: 'plan_tCrVAX62uKyEq', eventMembership: 'mem_new' })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.user.whop_membership_id, 'mem_new')
  assert.equal(result.alerts.length, 0)
})

test('a Discord add-on upgrade keeps the existing signed-event path without a new provider read', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  const result = await webhook({ owner: original, source: 'addon', eventPlan: 'plan_Q1Ey6RMgjS9XQ', eventMembership: 'mem_new', upgradeFailure: true })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.user.whop_membership_id, 'mem_new')
})

test('an add-on purchase still grants when a separate Ultimate membership is linked', async () => {
  const result = await webhook({ owner: stored, source: 'addon', eventPlan: 'plan_Q1Ey6RMgjS9XQ', eventMembership: 'mem_new', upgradeFailure: true })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.user.whop_membership_id, 'mem_new')
  assert.equal(result.alerts.length, 0)
})

test('a provider outage leaves a new upgrade retryable and preserves existing access', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  const result = await webhook({ owner: original, eventPlan: 'plan_tCrVAX62uKyEq', eventMembership: 'mem_new', upgradeFailure: true })
  assert.equal(result.response.status, 500)
  assert.equal(result.user.tier, 'basic')
  assert.equal(result.user.whop_membership_id, membershipId)
  assert.equal(result.receipts.get('evt_test').status, 'failed')
})

test('a stale or conflicting new Ultimate membership is not granted over existing Basic', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  const valid = { id: 'mem_new', plan_id: 'plan_tCrVAX62uKyEq', status: 'active', cancel_at_period_end: false, renewal_period_end: later, metadata: { internal_user_id: 'member-owner' } }
  for (const change of [
    { status: 'expired' }, { renewal_period_end: '2020-01-01T00:00:00.000Z' }, { id: 'mem_other' },
    { plan_id: 'plan_C0wvFkX0sqiPm' }, { metadata: { internal_user_id: 'other' } },
    { metadata: {} }, { cancel_at_period_end: null }, { company: 'biz_other' }, { product: 'prod_other' },
    { plan: { id: 'plan_other' } }, { valid: false }, { status: 'canceling', cancel_at_period_end: false },
  ]) {
    const result = await webhook({ owner: original, eventPlan: 'plan_tCrVAX62uKyEq', eventMembership: 'mem_new', upgradeMember: { ...valid, ...change } })
    assert.equal(result.response.status, 500)
    assert.equal(result.user.tier, 'basic')
    assert.equal(result.user.whop_membership_id, membershipId)
    assert.equal(result.updates.length, 0)
  }
})

test('an authenticated higher-tier cancellation retains its real future boundary and cancellation flag', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  const upgradeMember = { id: 'mem_new', plan_id: 'plan_tCrVAX62uKyEq', status: 'canceling', cancel_at_period_end: true, renewal_period_end: later, metadata: { internal_user_id: 'member-owner' } }
  const result = await webhook({ owner: original, eventPlan: 'plan_tCrVAX62uKyEq', eventMembership: 'mem_new', upgradeMember })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.user.tier_cancel_at_period_end, true)
  assert.equal(result.user.tier_status, 'canceling')
  assert.equal(result.user.tier_current_period_end, later)
})

test('a same-member canceled renewal preserves cancellation and does not move its boundary backwards', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: true }
  const result = await webhook({ owner: original, eventPlan: 'plan_C0wvFkX0sqiPm', eventPeriodEnd: '2020-01-01T00:00:00.000Z' })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier_status, 'canceling')
  assert.equal(result.user.tier_cancel_at_period_end, true)
  assert.equal(result.user.tier_current_period_end, previous)
  assert.equal(result.alerts.length, 1)
})

test('activation is not a payment alert for a same-member cancellation', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: true }
  const result = await webhook({ owner: original, eventPlan: 'plan_C0wvFkX0sqiPm', eventType: 'membership.activated' })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier_cancel_at_period_end, true)
  assert.equal(result.alerts.length, 0)
})

test('a missing membership ID or a link belonging to another user cannot modify access', async () => {
  const original = { ...stored, tier: 'basic', whop_plan_id: 'plan_C0wvFkX0sqiPm', tier_cancel_at_period_end: false }
  for (const input of [
    { eventMembership: '' },
    { eventMembership: 'mem_new', otherOwner: { membershipId: 'mem_new', userId: 'other-owner' } },
  ]) {
    const result = await webhook({ owner: original, eventPlan: 'plan_tCrVAX62uKyEq', ...input })
    assert.equal(result.response.status, 500)
    assert.equal(result.user.tier, 'basic')
    assert.equal(result.user.whop_membership_id, membershipId)
    assert.equal(result.updates.length, 0)
  }
})

test('a concurrent membership switch prevents a stale deactivation from revoking access', async () => {
  const result = await webhook({ eventType: 'membership.deactivated', eventPeriodEnd: null, conflict: true })
  assert.equal(result.response.status, 500)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.receipts.get('evt_test').status, 'failed')
})

test('an older cancellation event cannot shorten the already stored paid-through date', async () => {
  const result = await webhook({ eventType: 'membership.deactivated', eventPeriodEnd: '2020-01-01T00:00:00.000Z' })
  assert.equal(result.response.status, 200)
  assert.equal(result.user.tier, 'ultimate')
  assert.equal(result.user.tier_current_period_end, previous)
  assert.equal(result.user.tier_cancel_at_period_end, true)
})
