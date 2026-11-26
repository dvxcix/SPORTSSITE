import { applePlayerPortrait, appleProfileAvatar, type AppleImageArtwork } from './appleNotificationArtwork'
import { nativeNotificationArtwork } from './nativeNotificationArtwork'

type NotificationDetails = {
  hasActor: boolean
  actor?: { display_name?: string | null; username?: string | null; avatar_url?: string | null; is_private?: boolean | null } | null
  message?: string | null
  data?: Record<string, unknown> | null
}

const notificationText = (value: string, limit: number) => value.replace(/[\s\u0000-\u001f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim().slice(0, limit)

export function appleNotificationPayload(notificationId: string, type: string, details?: NotificationDetails) {
  let category = 'SLIPSURGE_ACTIVITY', thread = 'activity', body = 'You have new activity.'
  let artwork: AppleImageArtwork | undefined
  if (type === 'message') {
    category = 'SLIPSURGE_MESSAGE'
    thread = 'messages'
    body = 'You have a new message.'
  } else if (type === 'follow' && details?.hasActor && details.actor?.is_private === false) {
    const name = notificationText(details.actor.display_name || details.actor.username || '', 72)
    body = name ? `${name} followed you.` : 'You have a new follower.'
    const image = appleProfileAvatar(details.actor.avatar_url)
    if (image) artwork = { version: 1, kind: 'profile', image }
  } else if (type === 'lineup_confirmed' || type === 'pick_result') {
    if (type === 'lineup_confirmed') {
      category = 'SLIPSURGE_GAME'
      thread = 'games'
      body = details && !details.hasActor && details.message
        ? notificationText(details.message, 170) || 'A lineup update is ready.'
        : 'A lineup update is ready.'
    }
    if (details && !details.hasActor) {
      const image = (type === 'lineup_confirmed' ? applePlayerPortrait(details.data?.native_player_headshot) : null)
        ?? nativeNotificationArtwork(type, null, details.data?.avatar_url)
      if (image) artwork = { version: 1, kind: 'image', image }
    }
  }
  return {
    aps: { alert: { title: 'SlipSurge', body }, sound: 'default', category, 'thread-id': thread,
      ...(artwork ? { 'mutable-content': 1 } : {}) },
    notificationId,
    ...(artwork ? { artwork } : {}),
  }
}
