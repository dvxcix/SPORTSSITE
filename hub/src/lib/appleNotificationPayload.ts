function categoryFor(type: string) {
  switch (type) {
    case 'message': return { category: 'SLIPSURGE_MESSAGE', thread: 'messages', body: 'You have a new message.' }
    case 'lineup_confirmed': return { category: 'SLIPSURGE_GAME', thread: 'games', body: 'A lineup update is ready.' }
    default: return { category: 'SLIPSURGE_ACTIVITY', thread: 'activity', body: 'You have new activity.' }
  }
}

export function appleNotificationPayload(notificationId: string, type: string) {
  const { category, thread, body } = categoryFor(type)
  return {
    aps: { alert: { title: 'SlipSurge', body }, sound: 'default', category, 'thread-id': thread },
    notificationId,
  }
}
