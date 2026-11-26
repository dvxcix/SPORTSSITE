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
