import assert from 'node:assert/strict'
import test from 'node:test'
import { isVerifiedNotificationRecipient } from '../src/lib/verifiedNotificationRecipient.ts'

function adminFor(user: unknown, error: unknown = null) {
  let calls = 0
  return {
    client: { auth: { admin: { getUserById: async () => { calls++; return { data: { user }, error } } } } },
    calls: () => calls,
  }
}

test('notification email must match the verified auth email for the exact account', async () => {
  const f = adminFor({ id: 'member', email: 'Member@Example.com', email_confirmed_at: '2026-01-01T00:00:00Z' })
  assert.equal(await isVerifiedNotificationRecipient(f.client as never, 'member', 'Member@Example.com'), true)
  assert.equal(await isVerifiedNotificationRecipient(f.client as never, 'member', 'member@example.com'), false)
  assert.equal(await isVerifiedNotificationRecipient(f.client as never, 'member', ' Member@Example.com '), false)
  assert.equal(await isVerifiedNotificationRecipient(f.client as never, 'member', 'old@example.com'), false)
  assert.equal(await isVerifiedNotificationRecipient(f.client as never, 'other', 'member@example.com'), false)
  assert.equal(f.calls(), 5)
})

test('unverified, missing, unavailable or malformed auth state fails closed', async () => {
  for (const user of [null, { id: 'member', email: 'member@example.com' }, { id: 'member', email: null, email_confirmed_at: 'yes' }]) {
    const f = adminFor(user)
    assert.equal(await isVerifiedNotificationRecipient(f.client as never, 'member', 'member@example.com'), false)
  }
  const error = adminFor({ id: 'member', email: 'member@example.com', email_confirmed_at: 'yes' }, { status: 503 })
  assert.equal(await isVerifiedNotificationRecipient(error.client as never, 'member', 'member@example.com'), false)
  const throwing = { auth: { admin: { getUserById: async () => { throw new Error('offline') } } } }
  assert.equal(await isVerifiedNotificationRecipient(throwing as never, 'member', 'member@example.com'), false)
  const none = adminFor(null)
  assert.equal(await isVerifiedNotificationRecipient(none.client as never, 'member', ''), false)
  assert.equal(none.calls(), 0)
})

test('a stalled auth lookup fails closed within the bounded deadline', async () => {
  const stalled = { auth: { admin: { getUserById: () => new Promise(() => {}) } } }
  const start = Date.now()
  assert.equal(await isVerifiedNotificationRecipient(stalled as never, 'member', 'member@example.com', 15), false)
  assert.ok(Date.now() - start < 1000)
})
