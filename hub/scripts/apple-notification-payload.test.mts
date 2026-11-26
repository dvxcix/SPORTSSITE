import assert from 'node:assert/strict'
import test from 'node:test'
import { appleNotificationPayload } from '../src/lib/appleNotificationPayload.ts'

test('push categories group messages and games with only generic text and a row identifier', () => {
  const id = '091328d5-7fc0-412d-bcca-0a6db903d862'
  assert.deepEqual(appleNotificationPayload(id, 'message'), {
    aps: {
      alert: { title: 'SlipSurge', body: 'You have a new message.' },
      sound: 'default', category: 'SLIPSURGE_MESSAGE', 'thread-id': 'messages',
    },
    notificationId: id,
  })
  assert.equal(appleNotificationPayload(id, 'lineup_confirmed').aps.category, 'SLIPSURGE_GAME')
  const unknown = appleNotificationPayload(id, 'private example value')
  assert.equal(unknown.aps.category, 'SLIPSURGE_ACTIVITY')
  assert.doesNotMatch(JSON.stringify(unknown), /private example value/)
})

test('public follows carry their profile artwork and use native presentation', () => {
  const avatar = 'https://hkldweedwnxartkfhror.supabase.co/storage/v1/object/public/media/avatars/7d1a28d5-6011-412d-bcca-0a6db903d862/091328d5-7fc0-412d-bcca-0a6db903d862.png'
  const publicProfile = { display_name: '  Sports Fan ', avatar_url: avatar, is_private: false }
  const payload = appleNotificationPayload('follow-id', 'follow', { hasActor: true, actor: publicProfile })
  assert.equal(payload.aps.alert.body, 'Sports Fan followed you.')
  assert.equal(payload.aps['mutable-content'], 1)
  assert.deepEqual(payload.artwork, { version: 1, kind: 'profile', image: avatar })
  for (const value of [avatar + '?secret=example', avatar.replace('https:', 'http:'), 'https://a.espncdn.com/redirect.png']) {
    const rejected = appleNotificationPayload('follow-id', 'follow', { hasActor: true, actor: { ...publicProfile, avatar_url: value } })
    assert.equal(rejected.artwork, undefined)
    assert.equal(rejected.aps['mutable-content'], undefined)
  }
  for (const type of ['message', 'mention', 'group_invite']) {
    const privateContent = appleNotificationPayload('activity-id', type, {
      hasActor: true, actor: publicProfile, message: 'private text', data: { avatar_url: avatar },
    })
    assert.doesNotMatch(JSON.stringify(privateContent), /private text|Sports Fan|supabase/)
  }
  const privateFollow = appleNotificationPayload('follow-id', 'follow', { hasActor: true, actor: { ...publicProfile, is_private: true } })
  assert.equal(privateFollow.aps.alert.body, 'You have new activity.')
  assert.equal(privateFollow.artwork, undefined)
})

test('an established lineup replacement uses the official replacement portrait when present', () => {
  const logo = 'https://www.mlbstatic.com/team-logos/119.svg'
  const portrait = 'https://a.espncdn.com/i/headshots/mlb/players/full/39832.png'
  const data = { avatar_url: logo, native_player_headshot: portrait }
  const change = appleNotificationPayload('lineup-id', 'lineup_confirmed', {
    hasActor: false, message: 'Dodgers — lineup change', data,
  })
  assert.equal(change.aps.alert.body, 'Dodgers — lineup change')
  assert.equal(change.artwork?.image, portrait)
  const team = appleNotificationPayload('lineup-id', 'lineup_confirmed', {
    hasActor: false, data: { ...data, native_player_headshot: 'https://example.com/fake.png' },
  })
  assert.equal(team.artwork?.image, 'https://a.espncdn.com/i/teamlogos/mlb/500/lad.png')
})
