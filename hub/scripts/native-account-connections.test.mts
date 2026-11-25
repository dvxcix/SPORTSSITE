import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { nativeConnectionRedirect } from '../src/lib/nativeConnectionRedirect'
import { readWhopLinkProof, readWhopLinkRequest, sealWhopLink } from '../src/lib/nativeWhopLink'

const now = 1_800_000_000_000
const userId = '11cf2265-0121-48e8-8dc0-70ef4490f6d8'
const state = randomBytes(32).toString('base64url')
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const key = randomBytes(32)

test('Whop connection requests expire independently of link proof', () => {
  const request = { userId, state, challenge }
  const context = sealWhopLink(key, 'request', request, now)
  assert.deepEqual(readWhopLinkRequest(key, context, now + 100), request)
  assert.equal(readWhopLinkRequest(key, context, now + 600_000), null)
  assert.equal(readWhopLinkProof(key, context, { userId, state, verifier }, now), null)
  assert.equal(readWhopLinkRequest(randomBytes(32), context, now), null)
})

test('Whop identity proof requires the same authenticated account and unfinished native attempt', () => {
  const whop = { sub: 'user_sample', preferred_username: 'sample' }
  const proof = sealWhopLink(key, 'proof', { userId, state, challenge, whop, discordAccess: true }, now)
  const expected = { userId, state, verifier }
  assert.deepEqual(readWhopLinkProof(key, proof, expected, now + 3_000), { whop, discordAccess: true })
  assert.equal(readWhopLinkProof(key, proof, { ...expected, userId: 'a2a158bb-4aa6-48d3-a465-84af054a511f' }, now), null)
  assert.equal(readWhopLinkProof(key, proof, { ...expected, verifier: state }, now), null)
  assert.equal(readWhopLinkProof(key, proof, { ...expected, state: verifier }, now), null)
  assert.equal(readWhopLinkProof(key, proof, expected, now + 120_000), null)
  assert.equal(readWhopLinkRequest(key, proof, now), null)
})

test('connection callbacks use a fixed app path without a cache or referral', () => {
  const response = nativeConnectionRedirect(state, 'error', 'connection_failed')
  assert.equal(response.status, 303)
  const callback = new URL(response.headers.get('location')!)
  assert.equal(callback.protocol, 'slipsurge-ios:')
  assert.equal(callback.host, 'auth')
  assert.equal(callback.pathname, '/connection')
  assert.equal(callback.searchParams.get('state'), state)
  assert.equal(callback.searchParams.get('error'), 'connection_failed')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
})
