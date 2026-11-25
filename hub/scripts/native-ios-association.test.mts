import assert from 'node:assert/strict'
import test from 'node:test'
import { GET } from '../src/app/.well-known/apple-app-site-association/route'

test('iOS association only advertises explicitly configured bundle IDs and supported content routes', async () => {
  const previous = process.env.SLIPSURGE_IOS_APP_IDS
  try {
    delete process.env.SLIPSURGE_IOS_APP_IDS
    assert.equal(GET().status, 404)
    process.env.SLIPSURGE_IOS_APP_IDS = 'ABCDEFGHI1.com.slipsurge.test, unconfigured'
    assert.equal(GET().status, 404)

    process.env.SLIPSURGE_IOS_APP_IDS = 'ABCDEFGHI1.com.slipsurge.test, ABCDEFGHI1.com.slipsurge.test, ZYXWVUTSRQ.com.slipsurge.release'
    const response = GET()
    const association = await response.json()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Location'), null)
    assert.deepEqual(association.applinks.details[0].appIDs, ['ABCDEFGHI1.com.slipsurge.test', 'ZYXWVUTSRQ.com.slipsurge.release'])
    const rules: Array<{ '/'?: string; '#'?: string; exclude?: boolean }> = association.applinks.details[0].components
    assert.deepEqual(rules[0], { '#': 'no_universal_links', exclude: true })
    const allowed = rules.filter(rule => !rule.exclude).map(rule => rule['/'] ?? '')
    assert.ok(['/posts/*', '/the-paint', '/the-sideline', '/notifications', '/sports/nba/*'].every(path => allowed.includes(path)))
    assert.ok(!allowed.some(path => path === '/*' || /^\/(auth|api|admin)(\/|$)/.test(path) || path.startsWith('/creators/access/')))
  } finally {
    if (previous === undefined) delete process.env.SLIPSURGE_IOS_APP_IDS
    else process.env.SLIPSURGE_IOS_APP_IDS = previous
  }
})
