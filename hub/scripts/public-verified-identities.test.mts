import assert from 'node:assert/strict'
import test from 'node:test'
import { publicVerifiedIdentities } from '../src/lib/publicVerifiedIdentities.ts'

test('projects only supported public handles and profile links', () => {
  const projected = publicVerifiedIdentities({
    discord: { handle: 'Test name', profileUrl: 'https://discord.com/users/123456789012345678', token: 'SECRET' },
    x: { handle: '@person', profileUrl: 'https://x.com/person', refresh_token: 'SECRET' },
    whop: { handle: 'person', profileUrl: 'https://whop.com/@person', email: 'SECRET' },
    other: { handle: 'person', profileUrl: 'https://example.com/person' },
  })
  assert.deepEqual(projected, {
    discord: { handle: 'Test name', profileUrl: 'https://discord.com/users/123456789012345678' },
    x: { handle: '@person', profileUrl: 'https://x.com/person' },
    whop: { handle: 'person', profileUrl: 'https://whop.com/@person' },
  })
  assert.ok(!JSON.stringify(projected).includes('SECRET'))
})

test('drops malformed, untrusted and token-bearing URLs without inventing links', () => {
  for (const url of ['http://x.com/person', 'https://evil.test/person', 'https://x.com/person?token=SECRET', 'https://x.com/person#SECRET', 'https://name:SECRET@x.com/person', 'https://x.com:8443/person', 'javascript:alert(1)', 'https://x.com/a/b']) {
    assert.deepEqual(publicVerifiedIdentities({ x: { handle: '@person', profileUrl: url } }), {})
  }
  assert.deepEqual(publicVerifiedIdentities({ discord: { handle: '', profileUrl: 'https://discord.com' }, whop: { handle: 'x\nSECRET', profileUrl: 'https://whop.com' } }), {})
  assert.deepEqual(publicVerifiedIdentities(null), {})
})
