import assert from 'node:assert/strict'
import test from 'node:test'
import {
  shouldRevokeStoredWhopAccess,
  whopMembershipGrantsAccess,
} from '../src/lib/whopMembershipAccess.ts'

const NOW = Date.parse('2026-08-19T12:00:00Z')

test('provider lifecycle statuses are authoritative', () => {
  assert.equal(whopMembershipGrantsAccess({ status: 'active' }, NOW), true)
  assert.equal(whopMembershipGrantsAccess({ status: 'trialing' }, NOW), true)
  assert.equal(whopMembershipGrantsAccess({ status: 'canceling' }, NOW), true)
  assert.equal(whopMembershipGrantsAccess({ status: 'canceled' }, NOW), false)
  assert.equal(whopMembershipGrantsAccess({ status: 'expired' }, NOW), false)
})

test('explicit inactive provider records revoke stored access', () => {
  assert.equal(shouldRevokeStoredWhopAccess(
    { status: 'canceled' },
    { cancelAtPeriodEnd: false, periodEnd: null },
    NOW,
  ), true)
})

test('a canceled provider record keeps access only through its paid-through boundary', () => {
  assert.equal(shouldRevokeStoredWhopAccess(
    { status: 'canceled', cancel_at_period_end: true, renewal_period_end: '2026-08-20T00:00:00Z' },
    { cancelAtPeriodEnd: true, periodEnd: '2026-08-20T00:00:00Z' },
    NOW,
  ), false)
  assert.equal(shouldRevokeStoredWhopAccess(
    { status: 'canceled', cancel_at_period_end: true, renewal_period_end: '2026-08-10T00:00:00Z' },
    { cancelAtPeriodEnd: true, periodEnd: '2026-08-10T00:00:00Z' },
    NOW,
  ), true)
})

test('missing records revoke only after a known scheduled cancellation ends', () => {
  assert.equal(shouldRevokeStoredWhopAccess(
    undefined,
    { cancelAtPeriodEnd: true, periodEnd: '2026-08-10T00:00:00Z' },
    NOW,
  ), true)
  assert.equal(shouldRevokeStoredWhopAccess(
    undefined,
    { cancelAtPeriodEnd: true, periodEnd: '2026-08-20T00:00:00Z' },
    NOW,
  ), false)
  assert.equal(shouldRevokeStoredWhopAccess(
    undefined,
    { cancelAtPeriodEnd: false, periodEnd: '2026-08-10T00:00:00Z' },
    NOW,
  ), false)
})

test('an active provider record beats a stale local cancellation boundary', () => {
  assert.equal(shouldRevokeStoredWhopAccess(
    { status: 'active', renewal_period_end: '2026-09-10T00:00:00Z' },
    { cancelAtPeriodEnd: true, periodEnd: '2026-08-10T00:00:00Z' },
    NOW,
  ), false)
})
