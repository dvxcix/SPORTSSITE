import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import test from 'node:test'
import { nativeHandoffKey, openNativeHandoff, sealNativeHandoff } from '../src/lib/nativeAuthHandoff'

const key = randomBytes(32)
const tokenHash = 'one-time-verifier-fixture'
const userId = 'b6f33dad-0276-41df-bca5-be5f3857a2b7'
const state = randomBytes(32).toString('base64url')
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const now = 1795569900000

test('handoff server key accepts only a canonical 32-byte base64url value', () => {
  assert.deepEqual(nativeHandoffKey(key.toString('base64url')), key)
  assert.equal(nativeHandoffKey('invalid'), null)
  assert.equal(nativeHandoffKey(key.toString('base64')), null)
})

test('callback handoff conceals the OTP and is only redeemable with its original proof and state', () => {
  const code = sealNativeHandoff(key, { state, challenge, tokenHash, userId }, now)
  assert.equal(Buffer.from(code, 'base64url').includes(tokenHash), false)
  assert.deepEqual(openNativeHandoff(key, code, state, verifier, now), { tokenHash, userId })
  assert.equal(openNativeHandoff(key, code, state, randomBytes(32).toString('base64url'), now), null)
  assert.equal(openNativeHandoff(key, code, randomBytes(32).toString('base64url'), verifier, now), null)
  assert.equal(openNativeHandoff(randomBytes(32), code, state, verifier, now), null)
  assert.equal(openNativeHandoff(key, code, state, verifier, now + 2 * 60 * 1000), null)
  const tampered = Buffer.from(code, 'base64url')
  tampered[0] ^= 1
  assert.equal(openNativeHandoff(key, tampered.toString('base64url'), state, verifier, now), null)
  assert.notEqual(sealNativeHandoff(key, { state, challenge, tokenHash, userId }, now), code)
})
