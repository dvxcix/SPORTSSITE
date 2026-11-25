import assert from 'node:assert/strict'
import test from 'node:test'
import { nativePublicSocialLinks, nativeSocialTemplate, type NativeSocialPlatform } from '../src/lib/nativeSocialPlatforms'

const platform = (key: string, url_template: string | null): NativeSocialPlatform => ({
  id: key, key, name: key, icon_url: `https://assets.example.invalid/${key}.png`, url_template, sort_order: 0,
})

test('ported badges prioritize the verified provider and preserve manual and badge-only platforms', () => {
  const links = nativePublicSocialLinks([platform('x_twitter', 'https://x.com/{handle}'),
    platform('pikkit', 'https://pikkit.example.invalid/u/{handle}'), platform('discord', null), platform('unknown', null)],
  { x_twitter: '@old_name', pikkit: '@fan #1', discord: 'fixture', stale: 'excluded' },
  { x: { handle: '@new_name', profileUrl: 'https://x.com/new_name', authKey: 'hidden' } })
  assert.deepEqual(links.map(item => [item.id, item.handle, item.href, item.verified]), [
    ['x_twitter', '@new_name', 'https://x.com/new_name', true],
    ['pikkit', '@fan #1', 'https://pikkit.example.invalid/u/fan%20%231', false],
    ['discord', 'fixture', null, false],
  ])
  assert.ok(!JSON.stringify(links).includes('authKey'))
})

test('templates cannot change host or produce executable or credential-bearing URLs', () => {
  assert.equal(nativeSocialTemplate(''), true)
  assert.equal(nativeSocialTemplate('https://example.invalid/profile?handle={handle}'), true)
  for (const template of ['javascript:alert({handle})', 'https://{handle}.example.invalid', 'https://name:pass@example.invalid/{handle}']) {
    assert.equal(nativeSocialTemplate(template), false)
    const [badge] = nativePublicSocialLinks([platform('fixture', template)], { fixture: 'member' }, {})
    assert.equal(badge.href, null)
  }
})
