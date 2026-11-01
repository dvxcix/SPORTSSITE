import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { profileMetadata } from '../src/lib/profileMetadata.ts'

const base = { username: 'member', display_name: 'Member', bio: 'Public bio', avatar_url: 'https://example.test/avatar.png', pick_record: { wins: 12, losses: 3, pushes: 1 } }

test('public profile metadata retains permitted records and public identity', () => {
  const result = profileMetadata({ ...base, is_private: false, hide_win_rate: false })
  assert.equal(result.description, '12-3-1 record. Public bio')
  assert.equal(result.openGraph?.description, result.description)
  assert.equal(result.twitter?.description, result.description)
  assert.equal(result.title, 'Member (@member) · SlipSurge')
})

test('private, hidden and unknown privacy settings never expose records in any metadata', () => {
  for (const flags of [
    { is_private: true, hide_win_rate: false },
    { is_private: false, hide_win_rate: true },
    { is_private: true, hide_win_rate: true },
    { is_private: null, hide_win_rate: false },
    { is_private: false, hide_win_rate: null },
    {},
  ]) {
    const result = profileMetadata({ ...base, ...flags })
    assert.equal(result.description, 'Public bio')
    assert.equal(result.openGraph?.description, 'Public bio')
    assert.equal(result.twitter?.description, 'Public bio')
    assert.ok(!JSON.stringify(result).includes('12-3-1'))
  }
})

test('profile route delegates all share metadata to the privacy-aware projection', async () => {
  const source = await readFile(new URL('../src/app/profile/[username]/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /return profileMetadata\(profile\)/)
  assert.ok(!source.slice(source.indexOf('export async function generateMetadata'), source.indexOf('const TABS')).includes('profile.pick_record'))
  assert.deepEqual(profileMetadata(null), {})
})
